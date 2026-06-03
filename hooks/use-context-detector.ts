'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

export type UserContext = 'normal' | 'long-silence' | 'high-intensity'

/**
 * 由用户消息节奏推断 context，驱动 Eyes 的次级表现层（applyContext）。
 *
 * - long-silence：距离最近一次用户消息超过 SILENCE_MS
 * - high-intensity：最近 BURST_WINDOW 内用户消息数 ≥ BURST_THRESHOLD
 * - normal：默认
 *
 * 由于 Message 当前没有 timestamp 字段，hook 内部维护一份 "本会话内消息时间戳" 副本，
 * 切锚或刷新时归零——不持久化，足够驱动表现层。
 */
const SILENCE_MS = 3 * 60 * 1000
const BURST_WINDOW = 60 * 1000
const BURST_THRESHOLD = 3

export function useContextDetector(): UserContext {
  const anchorId = useStore((s) => s.currentAnchorId)
  // 注意：selector 必须返回稳定引用，不能写 `?? []`——空 anchor 会每次新建空数组触发无限循环。
  const messages = useStore((s) => s.messages[anchorId])
  const [ctx, setCtx] = useState<UserContext>('normal')

  const userTsRef = useRef<number[]>([])
  const lastUserCountRef = useRef(0)

  useEffect(() => {
    // 切锚归零
    userTsRef.current = []
    lastUserCountRef.current = 0
  }, [anchorId])

  useEffect(() => {
    const userCount = (messages ?? []).filter((m) => m.role === 'user').length
    if (userCount > lastUserCountRef.current) {
      userTsRef.current.push(Date.now())
      lastUserCountRef.current = userCount
    }
  }, [messages])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const ts = userTsRef.current
      const lastTs = ts[ts.length - 1]
      const recent = ts.filter((t) => now - t < BURST_WINDOW).length
      if (recent >= BURST_THRESHOLD) {
        setCtx('high-intensity')
      } else if (lastTs && now - lastTs > SILENCE_MS) {
        setCtx('long-silence')
      } else {
        setCtx('normal')
      }
    }
    tick()
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [anchorId])

  return ctx
}
