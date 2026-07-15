/** 解析 SSE buffer，返回完整事件列表和剩余未处理数据 */
function parseSSE(buffer: string) {
  const items: { event: string; data: string }[] = []
  const blocks = buffer.split(/\r?\n\r?\n/)
  const remaining = blocks.pop() ?? ''

  for (const block of blocks) {
    if (!block.trim()) continue
    let event = 'content'
    const dataLines: string[] = []

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5))
      }
    }

    if (dataLines.length > 0) {
      const data = dataLines.join('\n')
      if (data !== '') items.push({ event, data })
    }
  }

  return { items, remaining }
}

export interface ToolCallPayload {
  tool: string
  toolDisplay: string
  query: string
}

export interface ToolResultPayload {
  tool: string
  toolDisplay: string
  count: number
  resultPreview: string
}

export interface MoodPayload {
  keyword: string
}

/**
 * 思考配置：enabled=是否开启思考；effort=思考深度档（normal/high/max，仅 enabled 时有意义）。
 * effort 省略（undefined）= 后端用默认档；enabled=false 时后端忽略 effort。
 */
export interface ThinkingRequest {
  enabled: boolean
  effort?: string
}

export interface StreamChatOptions {
  message: string
  /** 当前对话锚点 id。null 表示新对话，后端创建后通过 anchor_created 事件返回。 */
  anchorId: string | null
  /** 思考配置对象（是否开启 + 思考深度）。后端 ChatRequest.thinking 为 {enabled, effort}。 */
  thinking: ThinkingRequest
  /** 用于后端懒创建：anchorId 尚未入库时，后端用此 userId 自动建立 anchor 行。 */
  userId: string
  signal?: AbortSignal
  /** 每轮首个 SSE 事件 `turn_started`——携后端本轮 turnId（早于 anchor_created），前端存下供停止/轮询定位。 */
  onTurn?: (turnId: string) => void
  onThinking?: (chunk: string) => void
  onContent?: (chunk: string) => void
  onToolCall?: (payload: ToolCallPayload) => void
  onToolResult?: (payload: ToolResultPayload) => void
  /**
   * mood 情感词事件——后端从 content 流剥离 ⟦mood:KEYWORD⟧ 标记后独立发送。
   * 一轮 1~N 次：开头必有一个（第一反应），情绪转折处再追加；相同情绪连发前端会去重不变脸。
   */
  onMood?: (payload: MoodPayload) => void
  /** 后端创建锚点后返回新 anchorId——新对话首条消息的第一个 SSE 事件。 */
  onAnchorCreated?: (anchorId: string) => void
  /**
   * 无数据活动 watchdog 超时——consumeStream 下「断连≠失败」：连接可能死了但服务端大概率仍在生成。
   * 触发时 reader 已 cancel，交由上层标「生成中」+ 轮询 loadMessages，而非当失败。不再走 onError。
   */
  onIdleTimeout?: () => void
  onComplete?: () => void
  onError?: (err: Error) => void
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/ai/chat`

/** 解析后端 error 事件的 data，提取用户友好文案 */
function parseErrorData(data: string): Error {
  try {
    const obj = JSON.parse(data)
    const msg = obj?.error?.message ?? obj?.message ?? data
    return new Error(msg)
  } catch {
    return new Error(data)
  }
}

/**
 * 从非 2xx 响应里尝试提取后端的友好 message。
 *
 * 后端 GlobalExceptionHandler 返回 {error, message, timestamp} 形态的 JSON。
 * 由于 controller 在 produces=text/event-stream 下，部分 4xx 响应可能仍被 SSE 包装
 * 同时兼容裸 JSON 和 SSE 包装两种格式（历史遗留）。
 */
async function readBackendErrorMessage(res: Response): Promise<string | null> {
  try {
    const text = await res.text()
    if (!text) return null
    // 兼容 SSE 包装：从 "data:{...}" 中剥离前缀
    const jsonPart = text.startsWith('data:') ? text.slice(5).trim() : text.trim()
    const obj = JSON.parse(jsonPart)
    return obj?.message ?? obj?.error?.message ?? null
  } catch {
    return null
  }
}

function dispatchEvent(
  event: string,
  data: string,
  opts: StreamChatOptions
): 'continue' | 'terminated' {
  const { onTurn, onThinking, onContent, onToolCall, onToolResult, onMood, onAnchorCreated, onError } = opts
  if (event === 'turn_started') {
    onTurn?.(data)
  } else if (event === 'anchor_created') {
    onAnchorCreated?.(data)
  } else if (event === 'thinking') {
    onThinking?.(data)
  } else if (event === 'tool_call') {
    try {
      onToolCall?.(JSON.parse(data) as ToolCallPayload)
    } catch (e) {
      console.warn('tool_call parse failed', e, data)
    }
  } else if (event === 'tool_result') {
    try {
      onToolResult?.(JSON.parse(data) as ToolResultPayload)
    } catch (e) {
      console.warn('tool_result parse failed', e, data)
    }
  } else if (event === 'mood') {
    try {
      onMood?.(JSON.parse(data) as MoodPayload)
    } catch (e) {
      console.warn('mood parse failed', e, data)
    }
  } else if (event === 'error') {
    onError?.(parseErrorData(data))
    return 'terminated'
  } else {
    onContent?.(data)
  }
  return 'continue'
}

export async function streamChat(opts: StreamChatOptions) {
  const { message, anchorId, thinking, userId, signal, onComplete, onError, onIdleTimeout } = opts

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        prompt: message,
        anchorId,
        // 后端 ChatRequest.thinking = { enabled, effort }；effort 为 undefined 时 JSON.stringify 自动省略
        thinking: { enabled: thinking.enabled, effort: thinking.effort },
        userId,
      }),
      signal,
    })

    if (!res.ok) {
      // 优先读后端返回的 JSON message（如 GlobalExceptionHandler 的 VALIDATION_FAILED），
      // 失败时回退到按 status code 的兜底文案
      const backendMsg = await readBackendErrorMessage(res)
      if (backendMsg) throw new Error(backendMsg)

      const statusMap: Record<number, string> = {
        401: '认证失败，请刷新页面重试',
        403: '认证失败，请刷新页面重试',
        404: '请求的资源不存在',
        429: '请求过于频繁，请稍后重试',
      }
      const msg =
        statusMap[res.status] ??
        (res.status >= 500 ? `服务器内部错误 (${res.status})` : `请求失败 (${res.status})`)
      throw new Error(msg)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // 无数据活动 watchdog：每次 read 与定时器 race，IDLE_TIMEOUT 内无数据即判定挂起。
    // 阈值须 > 后端单次工具调用最坏阻塞（Tavily 重试 ~60s），否则会误杀合法工具调用。
    // consumeStream：超时不当失败——cancel 连接后交上层轮询（生成大概率仍在服务端跑）。
    const IDLE_TIMEOUT = 90000
    const IDLE = Symbol('idle')

    while (true) {
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const idle = new Promise<typeof IDLE>((resolve) => {
        idleTimer = setTimeout(() => {
          reader.cancel().catch(() => {})
          resolve(IDLE)
        }, IDLE_TIMEOUT)
      })

      let result: Awaited<ReturnType<typeof reader.read>> | typeof IDLE
      try {
        result = await Promise.race([reader.read(), idle])
      } finally {
        clearTimeout(idleTimer)
      }

      // 超时挂起：非失败，交上层标「生成中」+ 轮询；不触发 onComplete/onError
      if (result === IDLE) {
        onIdleTimeout?.()
        return
      }

      const { done, value } = result
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const { items, remaining } = parseSSE(buffer)
      buffer = remaining
      for (const { event, data } of items) {
        if (dispatchEvent(event, data, opts) === 'terminated') return
      }
    }

    // 处理末尾残留数据
    if (buffer.trim()) {
      // 确保末尾有分隔符以正确解析最后一条消息
      const normalized = buffer.endsWith('\n\n') ? buffer : buffer + '\n\n'
      const { items } = parseSSE(normalized)
      for (const { event, data } of items) {
        if (dispatchEvent(event, data, opts) === 'terminated') return
      }
    }

    onComplete?.()
  } catch (err) {
    const e = err as Error
    if (e.name === 'AbortError' || (err instanceof DOMException && e.name === 'AbortError')) {
      onComplete?.()
      return
    }
    let msg = e.message || '请求出错'
    if (e.name === 'TypeError' && e.message.includes('fetch')) msg = '网络连接失败，请检查网络连接'
    onError?.(new Error(msg))
  }
}
