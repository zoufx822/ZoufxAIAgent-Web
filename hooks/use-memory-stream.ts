'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

export interface StreamEntry {
  id: number
  role: string
  content: string
  createdAt: number
}

/**
 * 拉最近 N 条经历流：GET /user/{userId}/memory/stream?limit=N
 *
 * 默认 limit=5。返回 created_at DESC（最新在前）。
 * 通过 `mutate()` 在 onComplete / send 后手动刷新。
 */
export function useMemoryStream(limit: number = 5) {
  const userId = useStore((s) => s.userId)
  const [data, setData] = useState<StreamEntry[]>([])
  const [loading, setLoading] = useState(false)

  const mutate = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const url = `${API_BASE}/user/${encodeURIComponent(userId)}/memory/stream?limit=${limit}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as StreamEntry[]
      setData(Array.isArray(json) ? json : [])
    } catch (err) {
      console.warn('useMemoryStream fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [userId, limit])

  useEffect(() => {
    if (userId) mutate()
  }, [userId, mutate])

  return { data, loading, mutate }
}
