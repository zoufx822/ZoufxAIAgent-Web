'use client'

import { useEffect, useMemo, useRef, useState, useId } from 'react'

/**
 * Eyes SVG 字标——v0.14 rev7（设计同步）。
 *
 * 六词情绪谱：平静 / 好奇 / 兴奋 / 困惑 / 难过 / 愤怒。
 * 几何驱动：pr 瞳孔半径，pdy 瞳孔下移，esy 眼眶纵向缩放，blink 眨眼周期，
 *           liddy 上睑下垂，lidty 下睑上抬，lidSlant 上眼睑斜率（愤怒 angry brow），
 *           pdx 瞳孔水平偏移（困惑 askew），sparkle 兴奋星芒，question 困惑问号。
 * 次级 context（applyContext）：long-silence 半闭眼放慢眨眼；high-intensity 瞳孔放大、眨眼加快。
 * 眼睑用 clipPath 多边形遮罩——SVG 上不能改 ellipse 边缘，只能切。
 * 动态 clip 边界：eyeTop/eyeBot 根据 ry 实时计算，任何 esy 都不截顶/截底。
 */

interface Expr {
  pr: number
  pdy: number
  esy: number
  blink: number
  liddy: number
  lidty: number
  lidSlant?: number
  pdx?: number
  pdxR?: number
  prR?: number
  sparkle?: boolean
  question?: boolean
}

const MOOD_EXPR: Record<string, Expr> = {
  平静: { pr: 3.2, pdy: 0.0,  esy: 1.0,  blink: 6,   liddy: 0,   lidty: 0 },
  好奇: { pr: 5.0, pdy: -3.2, esy: 1.0,  blink: 3.0, liddy: 0,   lidty: 0 },
  兴奋: { pr: 6.2, pdy: -2.6, esy: 1.0,  blink: 1.8, liddy: 0,   lidty: 0, sparkle: true },
  困惑: { pr: 3.2, pdy: 0.0,  esy: 1.0,  blink: 5.0, liddy: 0,   lidty: 0, pdx: 1.8, question: true },
  难过: { pr: 3.0, pdy: 1.8,  esy: 0.85, blink: 8,   liddy: 1.0, lidty: 6.0 },
  愤怒: { pr: 2.2, pdy: 0.0,  esy: 0.85, blink: 7,   liddy: 5.0, lidty: 2.0, lidSlant: 8.0 },
}

const DEFAULT_EXPR: Expr = { pr: 3.2, pdy: 0, esy: 1.0, blink: 6, liddy: 0, lidty: 0 }
const ASLEEP_EXPR: Expr  = { pr: 2.0, pdy: 2.4, esy: 0.26, blink: 8, liddy: 0, lidty: 0 }
const MOOD_EXPR_MIN_SIZE = 28

export type EyesContext = 'normal' | 'long-silence' | 'high-intensity'

function applyContext(e: Expr, ctx?: EyesContext): Expr {
  if (ctx === 'long-silence') {
    return {
      ...e,
      blink:  e.blink * 1.5,
      pdy:    (e.pdy ?? 0) + 0.6,
      esy:    Math.max(0.35, e.esy * 0.78),
      liddy:  (e.liddy ?? 0) + 2.4,
    }
  }
  if (ctx === 'high-intensity') {
    return {
      ...e,
      blink: e.blink * 0.6,
      pr:    e.pr * 1.08,
      prR:   (e.prR ?? e.pr) * 1.08,
      esy:   Math.min(1.15, e.esy * 1.02),
    }
  }
  return e
}

interface EyesProps {
  size?: number
  busy?: boolean
  color?: string
  pupil?: string
  mood?: string | null
  context?: EyesContext
  blinkDelay?: string
  asleep?: boolean
  drifting?: boolean
  /** 打字时瞳孔向下注视：好奇/兴奋 +7px，其余 +4.5px；睡眠/唤醒时屏蔽 */
  lookDown?: boolean
  /** 深夜 + 打字时触发唤醒动画：esy 从 0.26 插值到目标情绪值（1.4s） */
  waking?: boolean
}

export function Eyes({
  size = 64,
  busy = false,
  color,
  pupil,
  mood,
  context,
  blinkDelay,
  asleep = false,
  drifting = false,
  lookDown = false,
  waking = false,
}: EyesProps) {
  const uid = useId().replace(/:/g, '')
  const w   = Math.round(size * 2.2)
  const h   = size
  const fill = color ?? 'currentColor'
  const pp   = pupil ?? 'var(--bg)'

  // 目标情绪表情（忽略 asleep）——waking 动画终点
  const targetExpr = useMemo(() => {
    const base =
      size >= MOOD_EXPR_MIN_SIZE && mood && MOOD_EXPR[mood] ? MOOD_EXPR[mood] : DEFAULT_EXPR
    return applyContext(base, context)
  }, [mood, size, context])

  // 实际渲染用表情
  const expr = useMemo(() => {
    if (asleep && !waking) return ASLEEP_EXPR
    return targetExpr
  }, [asleep, waking, targetExpr])

  // ── Waking RAF 动画 ──
  const [wakingEsy, setWakingEsy] = useState<number | null>(null)
  const wasWakingRef = useRef(false)
  const wakingRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (waking && !wasWakingRef.current) {
      wasWakingRef.current = true
      const startEsy = ASLEEP_EXPR.esy       // 0.26
      const endEsy   = targetExpr.esy        // 目标情绪
      const startTime = performance.now()
      const duration  = 1400

      const animate = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration)
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        setWakingEsy(startEsy + (endEsy - startEsy) * eased)
        if (t < 1) wakingRafRef.current = requestAnimationFrame(animate)
        // 动画完成后保留最终 esy，不清空，避免眼睛回缩
      }
      wakingRafRef.current = requestAnimationFrame(animate)
    }

    if (!waking) {
      wasWakingRef.current = false
      if (wakingRafRef.current) cancelAnimationFrame(wakingRafRef.current)
      setWakingEsy(null)
    }

    return () => {
      if (wakingRafRef.current) cancelAnimationFrame(wakingRafRef.current)
    }
  }, [waking, targetExpr.esy])

  // ── 几何计算 ──
  const esyValue = waking && wakingEsy !== null ? wakingEsy : expr.esy
  const ry = (17 * esyValue).toFixed(2)

  // 动态 clip 边界：防止任何 esy 截顶/截底
  const ryNum    = 17 * esyValue
  const eyeTop   = Math.min(5,  22 - ryNum)
  const eyeBot   = Math.max(39, 22 + ryNum)

  const prL = expr.pr
  const prR = expr.prR ?? expr.pr

  // lookDown：睡眠/唤醒态屏蔽；好奇/兴奋 +7px 抵消其负 pdy
  const lookDownOffset = lookDown && !asleep && !waking
    ? (mood === '好奇' || mood === '兴奋') ? 7.0 : 4.5
    : 0

  const cyL = 22 + expr.pdy + lookDownOffset
  const cyR = 22 + expr.pdy + lookDownOffset
  const cxL = 28 + (expr.pdx ?? 0)
  const cxR = 72 + (expr.pdxR ?? 0) + (expr.pdx ?? 0)

  const liddyL = expr.liddy ?? 0
  const liddyR = expr.liddy ?? 0
  const lidtyL = expr.lidty ?? 0
  const lidtyR = expr.lidty ?? 0
  const slant  = expr.lidSlant ?? 0

  // clipPath 多边形：动态 eyeTop/eyeBot 替代硬编码的 5/39
  const polyL = `14,${eyeTop + liddyL} 42,${eyeTop + liddyL + slant} 42,${eyeBot - lidtyL} 14,${eyeBot - lidtyL}`
  const polyR = `58,${eyeTop + liddyR + slant} 86,${eyeTop + liddyR} 86,${eyeBot - lidtyR} 58,${eyeBot - lidtyR}`

  const cssVars: Record<string, string> = { '--blink-dur': `${expr.blink}s` }
  if (blinkDelay) cssVars['--blink-delay'] = blinkDelay
  const style = cssVars as React.CSSProperties

  const clipLId = `eye-clip-l-${uid}`
  const clipRId = `eye-clip-r-${uid}`

  // CSS class 控制瞳孔动效
  const calmDrift = mood === '平静' && !busy && !asleep && !waking && !lookDown && !drifting
  const sadSway   = mood === '难过' && !asleep && !waking && !lookDown

  const classes = ['eyes-z']
  if (busy)              classes.push('busy')
  if (asleep && !waking) classes.push('asleep')  // waking 期间去掉 asleep class，防止 eye-flutter 压制
  if (drifting)          classes.push('drifting')
  if (calmDrift)         classes.push('calm')
  if (sadSway)           classes.push('sad')

  return (
    <svg
      className={classes.join(' ')}
      width={w}
      height={h}
      viewBox="0 0 100 44"
      fill="none"
      role="img"
      aria-label={`小Z${mood ? '·' + mood : ''}`}
      style={style}
      shapeRendering="geometricPrecision"
    >
      <defs>
        <clipPath id={clipLId}>
          <polygon points={polyL} />
        </clipPath>
        <clipPath id={clipRId}>
          <polygon points={polyR} />
        </clipPath>
      </defs>
      <g className="eye eye-l" clipPath={`url(#${clipLId})`}>
        <ellipse cx="28" cy="22" rx="13" ry={ry} fill={fill} />
        <circle className="pupil pupil-l" cx={cxL} cy={cyL} r={prL} fill={pp} />
      </g>
      <g className="eye eye-r" clipPath={`url(#${clipRId})`}>
        <ellipse cx="72" cy="22" rx="13" ry={ry} fill={fill} />
        <circle className="pupil pupil-r" cx={cxR} cy={cyR} r={prR} fill={pp} />
      </g>
      {expr.sparkle && (
        <g className="eyes-sparkle" fill={fill}>
          <circle cx="20" cy="9" r="1.2" />
          <circle cx="80" cy="9" r="1.2" />
        </g>
      )}
      {expr.question && (
        <text
          className="eyes-question"
          x="50"
          y="14"
          textAnchor="middle"
          fill={fill}
          fontSize="11"
          fontFamily="ui-serif, Georgia, serif"
        >
          ?
        </text>
      )}
    </svg>
  )
}
