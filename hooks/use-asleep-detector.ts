'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

const DRIFT_THRESHOLD_MS = 90_000

/**
 * ASLEEP / DRIFTING 状态派生：
 * - idle + 深夜(23-5h) → asleep
 * - idle + 无输入超过 90s → drifting
 * - 任何流活动会将 status 切回 thinking/writing/tooling，自然脱离
 */
export function useAsleepDetector(options?: { intervalMs?: number; lastInputAt?: number }) {
  const intervalMs = options?.intervalMs ?? 10_000
  const lastInputAt = options?.lastInputAt ?? 0
  const setStatus = useStore((s) => s.setStatus)
  const currentStatus = useStore((s) => s.currentStatus)

  useEffect(() => {
    const tick = () => {
      const s = useStore.getState().currentStatus
      if (s !== 'idle' && s !== 'asleep' && s !== 'drifting') return
      const hour = new Date().getHours()
      const isNight = hour >= 23 || hour < 5
      const idleMs = lastInputAt > 0 ? Date.now() - lastInputAt : 0
      if (isNight) {
        if (s !== 'asleep') setStatus('asleep')
      } else if (idleMs > DRIFT_THRESHOLD_MS) {
        if (s !== 'drifting') setStatus('drifting')
      } else {
        if (s !== 'idle') setStatus('idle')
      }
    }
    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, lastInputAt, setStatus, currentStatus])
}
