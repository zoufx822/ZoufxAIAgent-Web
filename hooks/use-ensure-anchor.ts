'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * 挂载时拉后端 anchor 列表，确保 store.currentAnchorId 指向真实存在的锚点。
 *
 * 触发场景：
 *  - 首次访问：本地 store 自带一个伪 anchorId（initialAnchor），后端不认识 → 创建一个真锚点
 *  - 刷新页面：本地持久化的 currentAnchorId 通常是真锚点；setAnchors 内会做 fallback
 *  - 后端有锚点但本地为空：用后端 list 覆盖
 *
 * userId 没就绪时静默——拿到 userId 后再跑一次。
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
          useStore.getState().setAnchors(list.map((a) => ({
            id: a.id,
            title: a.title ?? '新对话',
            lastActiveAt: a.lastActiveAt,
            createdAt: a.createdAt,
          })))
          return
        }
        // 后端为空：创建一条真锚点替换本地伪锚点
        const created = await api.createAnchor(userId)
        useStore.setState({
          anchors: [{
            id: created.id,
            title: created.title ?? '新对话',
            lastActiveAt: created.lastActiveAt,
            createdAt: created.createdAt,
          }],
          currentAnchorId: created.id,
          lastActiveAnchorId: null,
        })
      } catch (err) {
        console.warn('useEnsureAnchor failed', err)
        ensuredRef.current = false
      }
    })()
  }, [userId])
}
