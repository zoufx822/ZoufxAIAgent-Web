'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * 挂载时拉后端 anchor 列表同步到 store。
 * 后端有记录则用后端数据覆盖本地；后端为空则保留本地 UUID（锚点会在首次发消息时懒创建入库）。
 */
export function useEnsureAnchor() {
  const userId = useStore((s) => s.userId)
  const ensuredRef = useRef(false)

  useEffect(() => {
    if (!userId || ensuredRef.current) return
    ensuredRef.current = true
    ;(async () => {
      try {
        const list = await api.listAnchors(userId)
        if (list.length > 0) {
          useStore.getState().setAnchors(
            list.map((a) => ({
              id: a.id,
              title: a.title ?? '新对话',
              lastActiveAt: a.lastActiveAt,
              createdAt: a.createdAt,
            }))
          )
        }
        // 后端为空时不创建——保留本地伪锚点，首次发消息时后端懒创建
      } catch (err) {
        console.warn('useEnsureAnchor failed', err)
        ensuredRef.current = false
      }
    })()
  }, [userId])
}
