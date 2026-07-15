'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

/**
 * 顶部胶囊 toast——失败/停止把消息放回输入框时的轻提示（fixed 顶部居中，role=status）。
 * 由 store.topToast 的 key 上升沿驱动，3.2s 自动消失。
 */
export function TopToast() {
  const topToast = useStore((s) => s.topToast)
  const setTopToast = useStore((s) => s.setTopToast)

  useEffect(() => {
    if (!topToast) return
    const t = setTimeout(() => setTopToast(null), 3200)
    return () => clearTimeout(t)
  }, [topToast, setTopToast])

  if (!topToast) return null

  return (
    <div className="top-toast" key={topToast.key} role="status" aria-live="polite">
      <span className="tt-dot" />
      <span>{topToast.text}</span>
    </div>
  )
}
