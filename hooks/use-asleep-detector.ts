'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

/**
 * ASLEEP 状态派生——idle + 本地时间 23:00~5:00 时自动切换为 asleep。
 * 任何流活动会将 status 切回 thinking/writing/tooling，自然脱离。
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
