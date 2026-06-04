'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 情绪呈现节律——把一轮内连发的 mood（瞬时 + 行内转折）化成可叠加的视觉。
 *
 * 一轮对话两个情绪来源：瞬时 mood（早于正文 ~1.1s）+ 行内转折（可多次）。
 * 每次情绪变化 push 一束光晕（冻结当时情绪色），上限 3 束，播完自移除——上一束没散完时
 * 新束叠加接管，不闪烁。仅"第一反应"（与上次间隔 > 600ms）抬 beatKey，触发眼睛专属节拍。
 */

// 情绪色查表，与 CSS [data-emotion] token 对齐（亮暗各一套），供光晕冻结颜色。
const EMOTION_HEX: Record<'light' | 'dark', Record<string, string>> = {
  light: { 平静: '#94a3b8', 好奇: '#06b6d4', 兴奋: '#f59e0b', 困惑: '#a855f7', 难过: '#5b80c0', 愤怒: '#ef4444' },
  dark: { 平静: '#94a3b8', 好奇: '#22d3ee', 兴奋: '#fbbf24', 困惑: '#c084fc', 难过: '#7d9fde', 愤怒: '#f87171' },
}

function emotionHex(mood: string): string {
  // next-themes attribute="class"：暗色 = html.dark
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const table = dark ? EMOTION_HEX.dark : EMOTION_HEX.light
  return table[mood] ?? '#94a3b8'
}

let _glowCounter = 0

export function useMoodPresence(mood: string | null) {
  const [glows, setGlows] = useState<{ id: number; c: string }[]>([])
  const [beatKey, setBeatKey] = useState(0)
  const lastFire = useRef(0)
  const prevMood = useRef(mood)

  const fire = useCallback((m: string) => {
    const now = performance.now()
    const gap = now - lastFire.current
    if (gap < 40) return // 同一事件双触发去重
    lastFire.current = now
    const id = ++_glowCounter
    setGlows((g) => [...g.slice(-2), { id, c: emotionHex(m) }]) // 池上限 3
    if (gap > 600) setBeatKey((k) => k + 1) // 仅"第一反应"起节拍
  }, [])

  useEffect(() => {
    if (prevMood.current !== null && mood !== null && mood !== prevMood.current) fire(mood)
    prevMood.current = mood
  }, [mood, fire]) // 行内连发也会逐次触发

  const glowEls = glows.map((g) => (
    <div
      className="mood-glow"
      key={g.id}
      style={{ ['--glow-c' as string]: g.c } as React.CSSProperties}
      onAnimationEnd={() => setGlows((gg) => gg.filter((x) => x.id !== g.id))}
    />
  ))

  return { glowEls, beatKey }
}
