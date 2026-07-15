const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface AnchorEntry {
  id: string
  userId: string
  title: string | null
  summary: string | null
  lastMood: string | null
  lastActiveAt: number
  createdAt: number
}

export interface AnchorContextView {
  near: AnchorSummary[]
  mid: AnchorSummary[]
  far: { count: number; summary?: string }
}

export interface AnchorSummary {
  id: string
  title: string | null
  body: string | null
  mood: string | null
  lastActiveAt: number
}

export interface BackendMessage {
  role: string
  content: string
}

/** GET /ai/anchors/{id}/pending 响应：有在建轮则含 turnId+prompt，无则空对象。 */
export interface PendingTurn {
  turnId?: string
  prompt?: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  listAnchors: (userId: string) =>
    fetch(`${BASE}/ai/anchors?userId=${encodeURIComponent(userId)}`).then((r) =>
      json<AnchorEntry[]>(r)
    ),

  getMessages: (anchorId: string) =>
    fetch(`${BASE}/ai/anchors/${encodeURIComponent(anchorId)}/messages`).then((r) =>
      json<BackendMessage[]>(r)
    ),

  /** 主动停止一轮：{stopped:true}=已掐断不落库；false=该轮已完成落库/已停，前端保留不删。 */
  stopTurn: (turnId: string) =>
    fetch(`${BASE}/ai/chat/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnId }),
    }).then((r) => json<{ stopped: boolean }>(r)),

  /** 查该锚点当前的在建轮（consumeStream 下生成脱离连接，write-back 期间 loadMessages 看不到该轮）。 */
  getPending: (anchorId: string) =>
    fetch(`${BASE}/ai/anchors/${encodeURIComponent(anchorId)}/pending`).then((r) =>
      json<PendingTurn>(r)
    ),

  getContext: (anchorId: string) =>
    fetch(`${BASE}/ai/anchors/${encodeURIComponent(anchorId)}/context`).then((r) =>
      json<AnchorContextView>(r)
    ),

  renameAnchor: (anchorId: string, title: string) =>
    fetch(`${BASE}/ai/anchors/${encodeURIComponent(anchorId)}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    }),

  getHotMemory: (userId: string, type: string) =>
    fetch(
      `${BASE}/ai/memory/hot?userId=${encodeURIComponent(userId)}&type=${encodeURIComponent(type)}`
    ).then((r) => json<Record<string, string>>(r)),
}
