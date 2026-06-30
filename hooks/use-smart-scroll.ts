'use client'

import { useCallback, useRef, useState } from 'react'

const BOTTOM_THRESHOLD = 32
const INTENT_WINDOW_MS = 300
/** 「回到底部」平滑滚动期间屏蔽 onScroll 位置重置的窗口（平滑动画比单次滚轮长） */
const SMOOTH_GUARD_MS = 700

export function useSmartScroll() {
  const elRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScrollRef = useRef(true)
  const cleanupRef = useRef<(() => void) | null>(null)
  const intentUntilRef = useRef(0)
  /** 响应式贴底标志——驱动「回到底部」钮的显隐（ref 不触发渲染，故另用 state） */
  const [atBottom, setAtBottom] = useState(true)

  // 跟随状态收口：ref（同步、供 scrollToBottom 即时判断）与 state（异步、驱动按钮）一起更新。
  // setState 传同值会被 React bail，故仅在跨阈值时才真正重渲。
  const setFollow = useCallback((v: boolean) => {
    shouldAutoScrollRef.current = v
    setAtBottom(v)
  }, [])

  // 用 callback ref：聊天容器是条件渲染，useEffect([]) 会在节点还不存在时
  // early return，导致监听器永远挂不上——这才是"无法向上滚动"的根因。
  const scrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.()
      cleanupRef.current = null
      elRef.current = node
      if (!node) return

      // 用户明确向上：立即暂停自动跟随，必须同步抢在下一次 scrollToBottom 之前。
      // 并开一个"意图窗口"：浏览器平滑滚动会连发一串小幅 scroll 事件，
      // 若让 onScroll 立即按位置重置状态，单次滚轮会被误判为"仍在底部"而恢复跟随。
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          setFollow(false)
          intentUntilRef.current = performance.now() + INTENT_WINDOW_MS
        }
      }

      let touchStartY = 0
      const onTouchStart = (e: TouchEvent) => {
        touchStartY = e.touches[0].clientY
      }
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches[0].clientY - touchStartY > 4) {
          setFollow(false)
          intentUntilRef.current = performance.now() + INTENT_WINDOW_MS
        }
      }

      // 意图窗口内不按位置重置；窗口外再根据"是否贴底"维护状态，
      // 这样滚动条拖拽这种不走 wheel/touch 的路径也能正确处理。
      const onScroll = () => {
        if (performance.now() < intentUntilRef.current) return
        const dist = node.scrollHeight - node.scrollTop - node.clientHeight
        setFollow(dist <= BOTTOM_THRESHOLD)
      }

      node.addEventListener('wheel', onWheel, { passive: true })
      node.addEventListener('touchstart', onTouchStart, { passive: true })
      node.addEventListener('touchmove', onTouchMove, { passive: true })
      node.addEventListener('scroll', onScroll, { passive: true })

      cleanupRef.current = () => {
        node.removeEventListener('wheel', onWheel)
        node.removeEventListener('touchstart', onTouchStart)
        node.removeEventListener('touchmove', onTouchMove)
        node.removeEventListener('scroll', onScroll)
      }
    },
    [setFollow]
  )

  const scrollToBottom = useCallback(() => {
    const el = elRef.current
    if (!el || !shouldAutoScrollRef.current) return
    el.scrollTop = el.scrollHeight
  }, [])

  const forceScrollToBottom = useCallback(() => {
    const el = elRef.current
    if (!el) return
    setFollow(true)
    el.scrollTop = el.scrollHeight
  }, [setFollow])

  /** 「回到底部」钮：平滑归位并恢复跟随；动画期间用 guard 窗口屏蔽 onScroll 误判离底。 */
  const scrollToBottomSmooth = useCallback(() => {
    const el = elRef.current
    if (!el) return
    setFollow(true)
    intentUntilRef.current = performance.now() + SMOOTH_GUARD_MS
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [setFollow])

  return {
    scrollRef,
    scrollToBottom,
    forceScrollToBottom,
    scrollToBottomSmooth,
    atBottom,
  }
}
