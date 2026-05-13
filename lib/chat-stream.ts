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
  query: string
}

export interface ToolResultPayload {
  tool: string
  count: number
  resultPreview: string
}

export interface StreamChatOptions {
  message: string
  /** 后端记忆分区键。所有聊天共享同一记忆池，前端 drawer 的记忆锚点 id 仅作 UI 分组不发送。 */
  userId: string
  thinking: boolean
  signal?: AbortSignal
  onThinking?: (chunk: string) => void
  onContent?: (chunk: string) => void
  onToolCall?: (payload: ToolCallPayload) => void
  onToolResult?: (payload: ToolResultPayload) => void
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
 * （historical: 后端 v0 修复前的状态），所以同时兼容裸 JSON 和 SSE 包装两种格式。
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
  opts: StreamChatOptions,
): 'continue' | 'terminated' {
  const { onThinking, onContent, onToolCall, onToolResult, onError } = opts
  if (event === 'thinking') {
    onThinking?.(data)
  } else if (event === 'tool_call') {
    try { onToolCall?.(JSON.parse(data) as ToolCallPayload) }
    catch (e) { console.warn('tool_call parse failed', e, data) }
  } else if (event === 'tool_result') {
    try { onToolResult?.(JSON.parse(data) as ToolResultPayload) }
    catch (e) { console.warn('tool_result parse failed', e, data) }
  } else if (event === 'error') {
    onError?.(parseErrorData(data))
    return 'terminated'
  } else {
    onContent?.(data)
  }
  return 'continue'
}

export async function streamChat(opts: StreamChatOptions) {
  const { message, userId, thinking, signal, onComplete, onError } = opts

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ prompt: message, userId, thinking }),
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
      const msg = statusMap[res.status] ?? (res.status >= 500 ? `服务器内部错误 (${res.status})` : `请求失败 (${res.status})`)
      throw new Error(msg)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastEventTime = Date.now()
    const STREAM_TIMEOUT = 60000 // 60 秒超时

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      lastEventTime = Date.now()
      buffer += decoder.decode(value, { stream: true })
      const { items, remaining } = parseSSE(buffer)
      buffer = remaining
      for (const { event, data } of items) {
        if (dispatchEvent(event, data, opts) === 'terminated') return
      }

      // 检查流超时（如果 30 秒没收到数据）
      if (Date.now() - lastEventTime > 30000 && !done) {
        throw new Error('流式输出超时，请稍后重试')
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
