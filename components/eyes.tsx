'use client'

import { useMemo } from 'react'

/**
 * Eyes 字标——替代 "小Z" / "Z" 字标的 SVG 组件（v1.1）。
 *
 * 视觉规范：design_handoff_zoufx_ai/{emotion,mood}-system.md
 * - viewBox 100×44，两椭圆 + 两瞳孔
 * - 三段动画（CSS 在 globals.css）：eye-blink / pupil-glance / eye-busy
 * - mood 微表情：10 个 mood 各对应一组像素级几何参数（pr/pdy/esy/pdxR/prR/blink）
 *   ==仅 size ≥ 40 启用==——小头像看不清反而抖
 * - 多实例去同步：blinkDelay 由调用方传入随机 3-9s
 *
 * busy 优先于 mood：当 busy=true 时眨眼变成半眯（emotion-system 第三节），
 * mood 映射的 blink 周期被覆盖。
 */

interface Expr {
  pr: number
  pdy: number
  esy: number
  pdxR?: number
  prR?: number
  blink: number
}

const MOOD_EXPR: Record<string, Expr> = {
  '好奇':   { pr: 3.6, pdy: -0.6, esy: 1.00, pdxR: 0,    blink: 6 },
  '温和':   { pr: 3.2, pdy:  0.0, esy: 0.95, pdxR: 0,    blink: 7 },
  '严肃':   { pr: 2.8, pdy:  0.0, esy: 1.00, pdxR: 0,    blink: 8 },
  '平静':   { pr: 3.2, pdy:  0.0, esy: 1.00, pdxR: 0,    blink: 6 },
  '共情':   { pr: 3.6, pdy:  0.4, esy: 0.95, pdxR: 0,    blink: 7 },
  '戏谑':   { pr: 3.2, pdy: -0.3, esy: 1.00, pdxR: 1.2,  blink: 5 },
  '困惑':   { pr: 3.0, pdy:  0.0, esy: 1.00, pdxR: -1.0, blink: 5, prR: 3.6 },
  '疲惫':   { pr: 3.0, pdy:  0.5, esy: 0.70, pdxR: 0,    blink: 9 },
  '兴奋':   { pr: 3.8, pdy: -0.4, esy: 1.00, pdxR: 0,    blink: 3.5 },
  '挫败':   { pr: 2.8, pdy:  0.3, esy: 0.85, pdxR: 0,    blink: 7 },
}

const DEFAULT_EXPR: Expr = { pr: 3.2, pdy: 0, esy: 1.0, pdxR: 0, blink: 6 }
/** mood 微表情仅在大尺寸启用——头像太小时几何抖动反而吵 */
const MOOD_EXPR_MIN_SIZE = 40

interface EyesProps {
  /** 渲染高度 px，宽度 ≈ 2.2 × size */
  size?: number
  /** status busy：thinking/tooling/writing 时为 true，眨眼变半眯 */
  busy?: boolean
  /** 眼睛填色，默认 currentColor */
  color?: string
  /** 瞳孔填色，默认 var(--bg) */
  pupil?: string
  /** mood 词（10 词之一）；仅 size ≥ 40 时驱动几何微调 */
  mood?: string | null
  /** 多实例眨眼去同步：3-9s 随机；不传则用默认 3s */
  blinkDelay?: string
}

export function Eyes({ size = 64, busy = false, color, pupil, mood, blinkDelay }: EyesProps) {
  const w = Math.round(size * 2.2)
  const h = size
  const fill = color ?? 'currentColor'
  const pp = pupil ?? 'var(--bg)'

  // 小尺寸不启用 mood 微表情
  const expr = useMemo(() => {
    if (size < MOOD_EXPR_MIN_SIZE) return DEFAULT_EXPR
    if (mood && MOOD_EXPR[mood]) return MOOD_EXPR[mood]
    return DEFAULT_EXPR
  }, [mood, size])

  const ry = (17 * expr.esy).toFixed(2)
  const prL = expr.pr
  const prR = expr.prR ?? expr.pr
  const cyL = 22 + expr.pdy
  const cyR = 22 + expr.pdy
  const cxR = 72 + (expr.pdxR ?? 0)

  // CSS 变量在 React 类型里不被识别，用 Record<string,string> 中转再 cast
  const cssVars: Record<string, string> = { '--blink-dur': `${expr.blink}s` }
  if (blinkDelay) cssVars['--blink-delay'] = blinkDelay
  const style = cssVars as React.CSSProperties

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
      <g className="eye eye-l">
        <ellipse cx="28" cy="22" rx="13" ry={ry} fill={fill} />
        <circle className="pupil pupil-l" cx="28" cy={cyL} r={prL} fill={pp} />
      </g>
      <g className="eye eye-r">
        <ellipse cx="72" cy="22" rx="13" ry={ry} fill={fill} />
        <circle className="pupil pupil-r" cx={cxR} cy={cyR} r={prR} fill={pp} />
      </g>
    </svg>
  )
}
