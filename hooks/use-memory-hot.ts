'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/**
 * 拉 Hot Memory snapshot：GET /user/{userId}/memory/hot
 *
 * 用法：组件挂载时拉一次；通过返回的 `mutate()` 在 use-chat-stream.onComplete 之后手动刷新
 * （避免轮询）。失败静默——记忆 API 失败不影响主对话流，沿用 v0.11 第十章风险表 #8。
 */
export function useMemoryHot() {
  const userId = useStore((s) => s.userId)
  const [data, setData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const mutate = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/user/${encodeURIComponent(userId)}/memory/hot`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as Record<string, string>
      setData(json ?? {})
    } catch (err) {
      console.warn('useMemoryHot fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId) mutate()
  }, [userId, mutate])

  return { data, loading, mutate }
}
