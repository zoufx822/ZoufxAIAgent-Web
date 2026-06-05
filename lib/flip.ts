/** FLIP 转场源矩形——发送瞬间在起始页量取，作为目标元素的"放回"起点。 */
export interface FlipRect {
  left: number
  top: number
  width: number
  height: number
}

interface RunFlipOptions {
  /** true：按宽度比缩放（眼睛 80→60）；false：仅平移（输入框，避免圆角变形）。 */
  scale?: boolean
  dur?: number
}

/**
 * destination-FLIP：把目标元素 el 从 fromRect（起始页旧位置/尺寸）"放回"，再补间回原位。
 * 起始页→聊天页时，眼睛 / 输入框看起来是同一元素在连续移动，而非先消失再出现。
 * 必须在目标元素挂载后的 layout 阶段（paint 前）调用，否则会先在终点 paint 出现闪烁。
 * reduced-motion 下直接跳过，元素在终点原位出现。
 */
export function runFlip(
  el: HTMLElement | null,
  fromRect: FlipRect | null,
  { scale = true, dur = 0.46 }: RunFlipOptions = {}
): void {
  if (!el || !fromRect) return
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = el.getBoundingClientRect()
  if (!to.width || !to.height) return
  const fcx = fromRect.left + fromRect.width / 2
  const fcy = fromRect.top + fromRect.height / 2
  const tcx = to.left + to.width / 2
  const tcy = to.top + to.height / 2
  const dx = fcx - tcx
  const dy = fcy - tcy
  const s = scale ? fromRect.width / to.width : 1
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(s - 1) < 0.01) return
  el.style.transformOrigin = 'center center'
  el.style.transition = 'none'
  el.style.transform = `translate(${dx}px,${dy}px) scale(${s})`
  void el.offsetWidth // 强制回流，让初始 transform 立即生效
  requestAnimationFrame(() => {
    el.style.transition = `transform ${dur}s cubic-bezier(.4,0,.2,1)`
    el.style.transform = 'translate(0,0) scale(1)'
    const cleanup = () => {
      el.style.transition = ''
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.willChange = ''
      el.removeEventListener('transitionend', cleanup)
    }
    el.addEventListener('transitionend', cleanup)
  })
}
