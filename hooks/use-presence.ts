'use client'

import { useEffect, useRef, useState } from 'react'
import type { Presence } from '@/lib/store'

/** 两次可见表情变化的最小间隔——保证每个表情至少停留这么久。 */
const MIN_INTERVAL_MS = 3000

/**
 * presence 呈现节律——把后端"一轮最多一次"的 presence 变成稳定、不抢戏的视觉。
 *
 * <p>后端只在高信号时发事件；这里再兜一层：变化间隔 ≥3s、只保留最新一条待播、
 * spotlight 时长随强度（1–5）从 1.8s 拉到 3s。
 */
export function usePresence(presence: Presence | null) {
  const [shown, setShown] = useState<Presence | null>(presence)
  const [spotlight, setSpotlight] = useState(false)
  const [beatKey, setBeatKey] = useState(0)

  const lastApplied = useRef(0)
  const pending = useRef<Presence | null>(null)
  const applyTimer = useRef<number | null>(null)
  const spotTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!presence) {
      setShown(null)
      setSpotlight(false)
      return
    }
    pending.current = presence
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastApplied.current))
    if (applyTimer.current) window.clearTimeout(applyTimer.current)
    applyTimer.current = window.setTimeout(() => {
      const next = pending.current
      if (!next) return
      pending.current = null
      setShown(next)
      const strong = next.intensity >= 3
      if (strong) setBeatKey((k) => k + 1)
      lastApplied.current = Date.now()
      setSpotlight(strong)
      if (spotTimer.current) window.clearTimeout(spotTimer.current)
      if (strong) {
        spotTimer.current = window.setTimeout(() => setSpotlight(false), 1600 + next.intensity * 280)
      }
    }, wait)
    return () => {
      if (applyTimer.current) window.clearTimeout(applyTimer.current)
    }
  }, [presence])

  useEffect(
    () => () => {
      if (applyTimer.current) window.clearTimeout(applyTimer.current)
      if (spotTimer.current) window.clearTimeout(spotTimer.current)
    },
    []
  )

  return {
    expression: shown?.expression ?? null,
    intensity: shown?.intensity ?? 0,
    spotlight,
    beatKey,
  }
}
