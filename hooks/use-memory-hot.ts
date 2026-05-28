'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * 拉 Hot Memory snapshot——GET /ai/memory/hot?userId=X&type=Y。
 * 挂载时拉一次，通过返回的 mutate() 手动刷新。失败静默，不影响主对话流。
 */
export function useMemoryHot(type: string = 'user-impression') {
  const userId = useStore((s) => s.userId)
  const hotMemoryVersion = useStore((s) => s.hotMemoryVersion)
  const [data, setData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const mutate = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const json = await api.getHotMemory(userId, type)
      setData(json ?? {})
    } catch (err) {
      console.warn('useMemoryHot fetch failed', err)
    } finally {
      setLoading(false)
    }
  }, [userId, type])

  useEffect(() => {
    if (userId) mutate()
  }, [userId, mutate, hotMemoryVersion])

  return { data, loading, mutate }
}
