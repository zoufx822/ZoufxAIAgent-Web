'use client'

import { useCallback, useEffect, useRef } from 'react'

export function useSmartScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)

  const shouldAutoScrollRef = useRef(true)
  const pendingScrollEventsRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const touchStartYRef = useRef(0)
  const bottomThreshold = 24

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el || !shouldAutoScrollRef.current) return
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    shouldAutoScrollRef.current = true
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        shouldAutoScrollRef.current = false
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0].clientY > touchStartYRef.current) {
        shouldAutoScrollRef.current = false
      }
    }

    const onScroll = () => {
      if (pendingScrollEventsRef.current > 0) {
        pendingScrollEventsRef.current--
        lastScrollTopRef.current = el.scrollTop
        return
      }

      const { scrollTop, scrollHeight, clientHeight } = el
      const dist = scrollHeight - scrollTop - clientHeight

      if (dist <= bottomThreshold) {
        shouldAutoScrollRef.current = true
      } else if (scrollTop < lastScrollTopRef.current) {
        shouldAutoScrollRef.current = false
      }

      lastScrollTopRef.current = scrollTop
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  return {
    scrollRef,
    scrollToBottom,
    forceScrollToBottom,
  }
}
