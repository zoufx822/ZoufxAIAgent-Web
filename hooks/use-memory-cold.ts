'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface ColdMemoryEntry {
  id: number
  role: string
  content: string
  createdAt: number
}

/**
 * 拉最近 N 条冷记忆：GET /ai/memory/cold/{userId}?limit=N
 *
 * 默认 limit=5。返回 created_at DESC（最新在前）。
 * 通过 `mutate()` 在 onComplete / send 后手动刷新。
 */
export function useMemoryCold(limit: number = 5) {
  const userId = useStore((s) => s.userId)
  const [data, setData] = useState<ColdMemoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const mutate = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const url = `${API_BASE}/ai/memory/cold/${encodeURIComponent(userId)}?limit=${limit}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ColdMemoryEntry[]
      setData(Array.isArray(json) ? json : [])
    } catch (err) {
      console.warn('useMemoryCold fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [userId, limit])

  useEffect(() => {
    if (userId) mutate()
  }, [userId, mutate])

  return { data, loading, mutate }
}
