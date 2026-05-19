'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

/**
 * ASLEEP 状态前端派生（v1.1）。
 *
 * 触发条件（来自 emotion-system.md）：
 *   `idle` 且本地时间 ≥23:00 或 <5:00 → 派生为 `asleep`
 *
 * 这里实现宽松版：只要 currentStatus === 'idle' 且在深夜时段，就主动切到 'asleep'。
 * 一旦有任何流活动（onThinking/onContent/onToolCall 把 status 切回 thinking/writing/tooling），
 * 自然脱离 ASLEEP。
 *
 * 仅在挂载到顶层组件一次（例如 Heartbeat）即可，无需多实例。
 */
export function useAsleepDetector(options?: { intervalMs?: number }) {
  const intervalMs = options?.intervalMs ?? 30_000
  const setStatus = useStore((s) => s.setStatus)
  const currentStatus = useStore((s) => s.currentStatus)

  useEffect(() => {
    const tick = () => {
      // 只在 idle / asleep 之间切换；其他态由 chat 流自己负责
      const s = useStore.getState().currentStatus
      if (s !== 'idle' && s !== 'asleep') return
      const hour = new Date().getHours()
      const isNight = hour >= 23 || hour < 5
      if (isNight && s !== 'asleep') setStatus('asleep')
      else if (!isNight && s !== 'idle') setStatus('idle')
    }
    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
    // currentStatus 不需要进依赖——getState() 总取最新；写依赖只是为了 useEffect 在外部切换时重跑一次
  }, [intervalMs, setStatus, currentStatus])
}
