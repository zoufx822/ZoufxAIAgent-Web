'use client'

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * 同一 (userId, type) 的并发请求去重——多个组件（ChatWindow / StatePanel / LookBackModal）
 * 各自挂载/刷新时会同时请求同一端点，共享 in-flight promise 把 N 次网络请求压成 1 次。
 */
const inflight = new Map<string, Promise<Record<string, string>>>()

function fetchHotMemory(userId: string, type: string): Promise<Record<string, string>> {
  const key = `${userId}::${type}`
  let p = inflight.get(key)
  if (!p) {
    p = api.getHotMemory(userId, type).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

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
      const json = await fetchHotMemory(userId, type)
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
