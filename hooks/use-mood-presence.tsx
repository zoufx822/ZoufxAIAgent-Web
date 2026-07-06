'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 情绪呈现节律——把一轮内连发的 mood（开头第一反应 + 行内转折）化成可叠加的视觉。
 *
 * 一轮情绪均来自主模型正文标记：开头必有一个「第一反应」+ 情绪转折处追加（可多次）。
 * 每次情绪变化 push 一束光晕（冻结当时情绪色），上限 3 束，播完自移除——上一束没散完时
 * 新束叠加接管，不闪烁。仅"第一反应"（与上次间隔 > 600ms）抬 beatKey，触发眼睛专属节拍。
 *
 * 最小播放锁 moodLocked：情绪一到立即锁 {@link MOOD_MIN_MS}，锁内情绪优先于「思考中」占位脸；
 * 锁过期后渲染端再重新判系统态。覆盖"情绪在思考/工具途中提前到达"的边界。
 */

// 情绪最小播放时长：情绪事件一到立即播放并锁定这么久，锁内优先于思考中。
const MOOD_MIN_MS = 1500

// 情绪色查表，与 CSS [data-emotion] token 对齐（亮暗各一套），供光晕冻结颜色。
const EMOTION_HEX: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    平静: '#78b4a0',
    愉快: '#10b981',
    好奇: '#06b6d4',
    兴奋: '#f59e0b',
    困惑: '#a855f7',
    难过: '#5b80c0',
    愤怒: '#ef4444',
  },
  dark: {
    平静: '#8ecabc',
    愉快: '#34d399',
    好奇: '#22d3ee',
    兴奋: '#fbbf24',
    困惑: '#c084fc',
    难过: '#7d9fde',
    愤怒: '#f87171',
  },
}

function emotionHex(mood: string): string {
  // next-themes attribute="class"：暗色 = html.dark
  const dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const table = dark ? EMOTION_HEX.dark : EMOTION_HEX.light
  return table[mood] ?? '#94a3b8'
}

let _glowCounter = 0

export function useMoodPresence(mood: string | null) {
  const [glows, setGlows] = useState<{ id: number; c: string }[]>([])
  const [beatKey, setBeatKey] = useState(0)
  const [moodLocked, setMoodLocked] = useState(false)
  const lastFire = useRef(0)
  const prevMood = useRef(mood)
  const lockRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = useCallback((m: string) => {
    const now = performance.now()
    const gap = now - lastFire.current
    if (gap < 40) return // 同一事件双触发去重
    lastFire.current = now
    const id = ++_glowCounter
    setGlows((g) => [...g.slice(-2), { id, c: emotionHex(m) }]) // 池上限 3
    if (gap > 600) setBeatKey((k) => k + 1) // 仅"第一反应"起节拍
    // 情绪到达即锁：锁内优先于思考中，MOOD_MIN_MS 后释放
    setMoodLocked(true)
    if (lockRef.current) clearTimeout(lockRef.current)
    lockRef.current = setTimeout(() => setMoodLocked(false), MOOD_MIN_MS)
  }, [])

  useEffect(() => {
    if (prevMood.current !== null && mood !== null && mood !== prevMood.current) fire(mood)
    prevMood.current = mood
  }, [mood, fire]) // 行内连发也会逐次触发

  useEffect(
    () => () => {
      if (lockRef.current) clearTimeout(lockRef.current)
    },
    []
  )

  const glowEls = glows.map((g) => (
    <div
      className="mood-glow"
      key={g.id}
      style={{ ['--glow-c' as string]: g.c } as React.CSSProperties}
      onAnimationEnd={() => setGlows((gg) => gg.filter((x) => x.id !== g.id))}
    />
  ))

  return { glowEls, beatKey, moodLocked }
}
