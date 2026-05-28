'use client'

import { useMemo, useId } from 'react'

/**
 * Eyes SVG 字标——v0.14 rev6。
 *
 * 六词情绪谱：平静 / 好奇 / 兴奋 / 困惑 / 难过 / 愤怒。
 * 几何驱动：pr 瞳孔半径，pdy 瞳孔下移，esy 眼眶纵向缩放，blink 眨眼周期，
 *           liddy 上睑下垂，lidty 下睑上抬，lidSlant 上眼睑斜率（愤怒 angry brow），
 *           pdx 瞳孔水平偏移（困惑 askew），sparkle 兴奋星芒，question 困惑问号。
 * 次级 context（applyContext）：long-silence 半闭眼放慢眨眼；high-intensity 瞳孔放大、眨眼加快。
 * 眼睑用 clipPath 多边形遮罩——SVG 上不能改 ellipse 边缘，只能切。
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
  '平静': { pr: 3.2, pdy:  0.0, esy: 1.00, blink: 6,   liddy: 0,   lidty: 0 },
  '好奇': { pr: 5.0, pdy: -3.2, esy: 1.00, blink: 3.0, liddy: 0,   lidty: 0 },
  '兴奋': { pr: 5.4, pdy: -3.0, esy: 1.08, blink: 2.0, liddy: 0,   lidty: 0, sparkle: true },
  '困惑': { pr: 3.2, pdy:  0.0, esy: 1.00, blink: 5.0, liddy: 0,   lidty: 0, pdx: 1.8, question: true },
  '难过': { pr: 3.0, pdy:  1.8, esy: 0.85, blink: 8,   liddy: 1.0, lidty: 6.0 },
  '愤怒': { pr: 2.2, pdy:  0.0, esy: 0.85, blink: 7,   liddy: 5.0, lidty: 2.0, lidSlant: 8.0 },
}

const DEFAULT_EXPR: Expr = { pr: 3.2, pdy: 0, esy: 1.0, blink: 6, liddy: 0, lidty: 0 }
const MOOD_EXPR_MIN_SIZE = 28

export type EyesContext = 'normal' | 'long-silence' | 'high-intensity'

function applyContext(e: Expr, ctx?: EyesContext): Expr {
  if (ctx === 'long-silence') {
    return {
      ...e,
      blink: e.blink * 1.5,
      pdy: (e.pdy ?? 0) + 0.6,
      esy: Math.max(0.35, e.esy * 0.78),
      liddy: (e.liddy ?? 0) + 2.4,
    }
  }
  if (ctx === 'high-intensity') {
    return {
      ...e,
      blink: e.blink * 0.6,
      pr: e.pr * 1.08,
      prR: (e.prR ?? e.pr) * 1.08,
      esy: Math.min(1.15, e.esy * 1.02),
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
}

export function Eyes({ size = 64, busy = false, color, pupil, mood, context, blinkDelay }: EyesProps) {
  const uid = useId().replace(/:/g, '')
  const w = Math.round(size * 2.2)
  const h = size
  const fill = color ?? 'currentColor'
  const pp = pupil ?? 'var(--bg)'

  const expr = useMemo(() => {
    const base = (size >= MOOD_EXPR_MIN_SIZE && mood && MOOD_EXPR[mood]) ? MOOD_EXPR[mood] : DEFAULT_EXPR
    return applyContext(base, context)
  }, [mood, size, context])

  const ry = (17 * expr.esy).toFixed(2)
  const prL = expr.pr
  const prR = expr.prR ?? expr.pr
  const cyL = 22 + expr.pdy
  const cyR = 22 + expr.pdy
  const cxL = 28 + (expr.pdx ?? 0)
  const cxR = 72 + (expr.pdxR ?? 0) + (expr.pdx ?? 0)

  const liddyL = expr.liddy ?? 0
  const liddyR = expr.liddy ?? 0
  const lidtyL = expr.lidty ?? 0
  const lidtyR = expr.lidty ?? 0
  const slant = expr.lidSlant ?? 0

  // clipPath 多边形：左眼上沿带正斜率（外低内高），右眼镜像
  const polyL = `14,${5 + liddyL} 42,${5 + liddyL + slant} 42,${39 - lidtyL} 14,${39 - lidtyL}`
  const polyR = `58,${5 + liddyR + slant} 86,${5 + liddyR} 86,${39 - lidtyR} 58,${39 - lidtyR}`

  const cssVars: Record<string, string> = { '--blink-dur': `${expr.blink}s` }
  if (blinkDelay) cssVars['--blink-delay'] = blinkDelay
  const style = cssVars as React.CSSProperties

  const clipLId = `eye-clip-l-${uid}`
  const clipRId = `eye-clip-r-${uid}`

  return (
    <svg
      className={`eyes-z${busy ? ' busy' : ''}`}
      width={w}
      height={h}
      viewBox="0 0 100 44"
      fill="none"
      role="img"
      aria-label={`小Z${mood ? '·' + mood : ''}`}
      style={style}
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
        <text className="eyes-question" x="50" y="14" textAnchor="middle" fill={fill}
              fontSize="11" fontFamily="ui-serif, Georgia, serif">?</text>
      )}
    </svg>
  )
}
