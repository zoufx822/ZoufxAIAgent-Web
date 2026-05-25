'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/**
 * 拉 Hot Memory snapshot——GET /ai/memory/hot/{userId}?type={type}。
 * 挂载时拉一次，通过返回的 mutate() 手动刷新。失败静默，不影响主对话流。
 */
export function useMemoryHot(type: string = 'user-impression') {
  const userId = useStore((s) => s.userId)
  const [data, setData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const mutate = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ai/memory/hot/${encodeURIComponent(userId)}?type=${encodeURIComponent(type)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Record<string, string>
      setData(json ?? {})
    } catch (err) {
      console.warn('useMemoryHot fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [userId, type])

  useEffect(() => {
    if (userId) mutate()
  }, [userId, mutate])

  return { data, loading, mutate }
}
