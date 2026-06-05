'use client'

import { useEffect, useMemo, useRef, useState, useId } from 'react'

/**
 * Eyes SVG 字标——v0.14 rev7（设计同步）。
 *
 * 六词情绪谱：平静 / 好奇 / 兴奋 / 困惑 / 难过 / 愤怒。
 * 几何驱动：pr 瞳孔半径，pdy 瞳孔下移，esy 眼眶纵向缩放，blink 眨眼周期，
 *           liddy 上睑下垂，lidty 下睑上抬，lidSlant 上眼睑斜率（愤怒 angry brow），
 *           pdx 瞳孔水平偏移，sparkle 兴奋星芒，question 困惑问号。
 * 右眼专用属性 prR / esyR / liddyR / pdxR：左右不等时单独覆盖右眼，缺省回落左眼值——困惑的不对称发懵靠它。
 * 系统态 thinking（与情绪正交）：瞳孔上抬出神，由 CSS .thinking 驱动游移，跳过 applyContext 保持形态干净。
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
  esyR?: number
  liddyR?: number
  sparkle?: boolean
  question?: boolean
}

const MOOD_EXPR: Record<string, Expr> = {
  平静: { pr: 3.2, pdy: 0.0,  esy: 1.0,  blink: 6,   liddy: 0,   lidty: 0 },
  好奇: { pr: 5.0, pdy: -3.2, esy: 1.0,  blink: 3.0, liddy: 0,   lidty: 0 },
  兴奋: { pr: 6.2, pdy: -2.6, esy: 1.0,  blink: 1.8, liddy: 0,   lidty: 0, sparkle: true },
  困惑: { pr: 3.6, prR: 2.7, pdy: 0.0, esy: 1.02, esyR: 0.60, blink: 5.0, liddy: 0, lidty: 0, liddyR: 2.2, question: true },
  难过: { pr: 3.0, pdy: 1.8,  esy: 0.85, blink: 8,   liddy: 1.0, lidty: 6.0 },
  愤怒: { pr: 2.2, pdy: 0.0,  esy: 0.85, blink: 7,   liddy: 5.0, lidty: 2.0, lidSlant: 8.0 },
}

const DEFAULT_EXPR: Expr = { pr: 3.2, pdy: 0, esy: 1.0, blink: 6, liddy: 0, lidty: 0 }
const ASLEEP_EXPR: Expr  = { pr: 2.0, pdy: 2.4, esy: 0.26, blink: 8, liddy: 0, lidty: 0 }
// 思考中：瞳孔上抬、眼睛略放松——系统态占位脸，CSS .thinking 再叠加出神游移。
const THINKING_EXPR: Expr = { pr: 3.0, pdy: -1.4, esy: 0.95, blink: 5, liddy: 0, lidty: 0, lidSlant: 0 }
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
  /** 系统态「思考中」占位脸（正在思考/调用工具），与 LLM 情绪正交；优先级低于已落定情绪 */
  thinking?: boolean
  /** 打字时瞳孔向下注视：好奇/兴奋 +7px，其余 +4.5px；睡眠/唤醒时屏蔽 */
  lookDown?: boolean
  /** 深夜 + 打字时触发唤醒动画：esy 从 0.26 插值到目标情绪值（1.4s） */
  waking?: boolean
  /** 「第一反应」节拍信号：递增即播一次快眨 + 瞳孔收放（读脸高光时刻），760ms 后自还原 */
  beatKey?: number
  /** error 摇头信号：递增即播一次水平轻抖（出错身体语言），640ms 后自还原 */
  errorKey?: number
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
  thinking = false,
  lookDown = false,
  waking = false,
  beatKey = 0,
  errorKey = 0,
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

  // 实际渲染用表情——形态优先级：waking → asleep → thinking → mood。
  // thinking 返回原始 THINKING_EXPR（不叠 applyContext），形态干净。
  const expr = useMemo(() => {
    if (asleep && !waking) return ASLEEP_EXPR
    if (thinking) return THINKING_EXPR
    return targetExpr
  }, [asleep, waking, thinking, targetExpr])

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

  // ── 第一反应节拍：beatKey 变化时加 .first-react 播一次，760ms 后移除 ──
  const [beating, setBeating] = useState(false)
  const beatTimer = useRef<number | undefined>(undefined)
  const prevBeat = useRef(beatKey)
  useEffect(() => {
    if (beatKey > 0 && beatKey !== prevBeat.current) {
      setBeating(true)
      clearTimeout(beatTimer.current)
      beatTimer.current = window.setTimeout(() => setBeating(false), 760)
    }
    prevBeat.current = beatKey
    return () => clearTimeout(beatTimer.current)
  }, [beatKey])

  // ── error 摇头节拍：errorKey 变化时加 .error-shake 播一次，640ms 后移除 ──
  const [shaking, setShaking] = useState(false)
  const shakeTimer = useRef<number | undefined>(undefined)
  const prevErr = useRef(errorKey)
  useEffect(() => {
    if (errorKey > 0 && errorKey !== prevErr.current) {
      setShaking(true)
      clearTimeout(shakeTimer.current)
      shakeTimer.current = window.setTimeout(() => setShaking(false), 640)
    }
    prevErr.current = errorKey
    return () => clearTimeout(shakeTimer.current)
  }, [errorKey])

  // ── 几何计算 ── 左右眼独立：右眼缺省回落左眼值，有 esyR/liddyR 时不对称（困惑发懵）。
  // waking 只动整体 esy，不引入左右差异。
  const esyL = waking && wakingEsy !== null ? wakingEsy : expr.esy
  const esyR = waking && wakingEsy !== null ? wakingEsy : (expr.esyR ?? expr.esy)
  const ryL = (17 * esyL).toFixed(2)
  const ryR = (17 * esyR).toFixed(2)

  // 动态 clip 边界：防止任何 esy 截顶/截底，左右各算一套
  const ryNumL  = 17 * esyL
  const ryNumR  = 17 * esyR
  const eyeTopL = Math.min(5,  22 - ryNumL)
  const eyeBotL = Math.max(39, 22 + ryNumL)
  const eyeTopR = Math.min(5,  22 - ryNumR)
  const eyeBotR = Math.max(39, 22 + ryNumR)

  const prL = expr.pr
  const prR = expr.prR ?? expr.pr

  // lookDown：睡眠/唤醒/思考态屏蔽；好奇/兴奋 +7px 抵消其负 pdy
  const lookDownOffset = lookDown && !asleep && !waking && !thinking
    ? (mood === '好奇' || mood === '兴奋') ? 7.0 : 4.5
    : 0

  const cyL = 22 + expr.pdy + lookDownOffset
  const cyR = 22 + expr.pdy + lookDownOffset
  const cxL = 28 + (expr.pdx ?? 0)
  const cxR = 72 + (expr.pdxR ?? 0) + (expr.pdx ?? 0)

  const liddyL = expr.liddy ?? 0
  const liddyR = expr.liddyR ?? expr.liddy ?? 0
  const lidtyL = expr.lidty ?? 0
  const lidtyR = expr.lidty ?? 0
  const slant  = expr.lidSlant ?? 0

  // clipPath 多边形：动态 eyeTop/eyeBot 替代硬编码的 5/39，左右各用自己的边界
  const polyL = `14,${eyeTopL + liddyL} 42,${eyeTopL + liddyL + slant} 42,${eyeBotL - lidtyL} 14,${eyeBotL - lidtyL}`
  const polyR = `58,${eyeTopR + liddyR + slant} 86,${eyeTopR + liddyR} 86,${eyeBotR - lidtyR} 58,${eyeBotR - lidtyR}`

  const cssVars: Record<string, string> = { '--blink-dur': `${expr.blink}s` }
  if (blinkDelay) cssVars['--blink-delay'] = blinkDelay
  const style = cssVars as React.CSSProperties

  const clipLId = `eye-clip-l-${uid}`
  const clipRId = `eye-clip-r-${uid}`

  // CSS class 控制瞳孔动效
  const calmDrift = mood === '平静' && !busy && !asleep && !waking && !thinking && !lookDown && !drifting
  const sadSway   = mood === '难过' && !asleep && !waking && !thinking && !lookDown

  const classes = ['eyes-z']
  if (asleep && !waking) classes.push('asleep')  // waking 期间去掉 asleep class，防止 eye-flutter 压制
  if (thinking)          classes.push('thinking')
  if (drifting)          classes.push('drifting')
  if (calmDrift)         classes.push('calm')
  if (sadSway)           classes.push('sad')
  if (beating)           classes.push('first-react')
  if (shaking)           classes.push('error-shake')

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
        <ellipse cx="28" cy="22" rx="13" ry={ryL} fill={fill} />
        <circle className="pupil pupil-l" cx={cxL} cy={cyL} r={prL} fill={pp} />
      </g>
      <g className="eye eye-r" clipPath={`url(#${clipRId})`}>
        <ellipse cx="72" cy="22" rx="13" ry={ryR} fill={fill} />
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
