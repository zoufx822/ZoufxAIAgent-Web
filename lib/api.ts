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
  far: { count: number }
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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  createAnchor: (userId: string, title?: string) =>
    fetch(`${BASE}/ai/anchors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title }),
    }).then((r) => json<AnchorEntry>(r)),

  listAnchors: (userId: string) =>
    fetch(`${BASE}/ai/anchors?userId=${encodeURIComponent(userId)}`).then((r) =>
      json<AnchorEntry[]>(r)
    ),

  getMessages: (anchorId: string) =>
    fetch(`${BASE}/ai/anchors/${encodeURIComponent(anchorId)}/messages`).then((r) =>
      json<BackendMessage[]>(r)
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
