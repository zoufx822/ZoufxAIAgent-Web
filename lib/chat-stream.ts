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

export interface StreamChatOptions {
  message: string
  /** 当前对话锚点 id，对应后端 anchor_memory.id。后端据此解析 userId 并加载窗口消息。 */
  anchorId: string
  /** 切锚前的上一个锚点 id，触发后端旧锚总结。null 表示首条/无切换。 */
  prevAnchorId?: string | null
  thinking: boolean
  /** 用于后端懒创建：anchorId 尚未入库时，后端用此 userId 自动建立 anchor 行。 */
  userId: string
  signal?: AbortSignal
  onThinking?: (chunk: string) => void
  onContent?: (chunk: string) => void
  onToolCall?: (payload: ToolCallPayload) => void
  onToolResult?: (payload: ToolResultPayload) => void
  /** mood 情感词事件——后端在 content 流尾部剥离 <!--mood:KEYWORD--> 后独立发送。一轮 0~1 次。 */
  onMood?: (payload: MoodPayload) => void
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
  const { onThinking, onContent, onToolCall, onToolResult, onMood, onError } = opts
  if (event === 'thinking') {
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
  const { message, anchorId, prevAnchorId, thinking, userId, signal, onComplete, onError } = opts

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        prompt: message,
        anchorId,
        prevAnchorId: prevAnchorId ?? null,
        thinking,
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
    const IDLE_TIMEOUT = 90000

    while (true) {
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      const idle = new Promise<never>((_, reject) => {
        idleTimer = setTimeout(() => {
          reader.cancel().catch(() => {})
          reject(new Error('流式输出超时，请稍后重试'))
        }, IDLE_TIMEOUT)
      })

      let result: Awaited<ReturnType<typeof reader.read>>
      try {
        result = await Promise.race([reader.read(), idle])
      } finally {
        clearTimeout(idleTimer)
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
