'use client'

import { useEffect, useRef, useState } from 'react'
import * as smd from 'streaming-markdown'
import { codeToHtml } from 'shiki'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  isStreaming: boolean
  onScrollNeeded?: () => void
}

// 打字机速度：16ms/帧，每帧推进 3 字符 ≈ 187 字符/秒
const TW_INTERVAL = 16
const TW_STEP = 3

export function StreamMarkdown({ content, isStreaming, onScrollNeeded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const parserRef = useRef<ReturnType<typeof smd.parser> | null>(null)
  const writtenLenRef = useRef(0)
  const [mounted, setMounted] = useState(false)

  // 打字机状态
  const [displayedLen, setDisplayedLen] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullContentRef = useRef('')
  const isStreamingRef = useRef(false)

  // 同步最新值
  fullContentRef.current = content
  isStreamingRef.current = isStreaming

  // 客户端挂载后再初始化
  useEffect(() => {
    setMounted(true)
  }, [])

  // 打字机效果
  useEffect(() => {
    if (!mounted) return

    // 流结束后，清除计时器并显示全部
    if (!isStreaming) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setDisplayedLen(content.length)
      return
    }

    // 流式进行中
    if (displayedLen >= content.length) return

    timerRef.current = setInterval(() => {
      setDisplayedLen((prev) => {
        const currentFull = fullContentRef.current
        const currentStreaming = isStreamingRef.current

        if (prev >= currentFull.length) {
          if (!currentStreaming) {
            clearInterval(timerRef.current!)
            timerRef.current = null
            return currentFull.length
          }
          return prev
        }
        return Math.min(prev + TW_STEP, currentFull.length)
      })
    }, TW_INTERVAL)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [content, isStreaming, mounted])

  // 初始化 parser（仅在 mounted 时创建一次）
  useEffect(() => {
    if (!mounted) return
    const el = containerRef.current
    if (!el) return

    el.innerHTML = ''
    writtenLenRef.current = 0
    const renderer = smd.default_renderer(el)
    parserRef.current = smd.parser(renderer)

    return () => {
      parserRef.current = null
    }
  }, [mounted])

  // 增量写入新字符到 parser
  useEffect(() => {
    if (!mounted) return
    const p = parserRef.current
    if (!p) return

    const newChars = content.slice(writtenLenRef.current, displayedLen)
    if (newChars) {
      try {
        smd.parser_write(p, newChars)
      } catch (e) {
        console.error('StreamMarkdown incremental write error:', e)
      }
      writtenLenRef.current = displayedLen
    }
  }, [displayedLen, content, mounted])

  // 流结束时：结束 parser + 应用 Shiki
  useEffect(() => {
    if (!mounted || isStreaming) return
    if (displayedLen < content.length) return

    const p = parserRef.current
    if (!p) return

    try {
      smd.parser_end(p)
    } catch {
      // parser 可能已结束
    }

    requestAnimationFrame(() => {
      if (containerRef.current) {
        applyShiki(containerRef.current)
      }
    })
  }, [isStreaming, displayedLen, content.length, mounted])

  // 滚动通知
  useEffect(() => {
    if (displayedLen > 0) {
      onScrollNeeded?.()
    }
  }, [displayedLen, onScrollNeeded])

  if (!mounted) {
    return (
      <div className={cn('prose prose-sm prose-zoufx dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/92')}>
        {content}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'prose prose-sm prose-zoufx dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/92',
        isStreaming && displayedLen < content.length && 'streaming-cursor'
      )}
    />
  )
}

async function applyShiki(container: HTMLElement) {
  try {
    const blocks = container.querySelectorAll<HTMLElement>('pre > code')
    for (const code of Array.from(blocks)) {
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? 'text'
      const raw = code.textContent ?? ''
      try {
        const html = await codeToHtml(raw, { lang, theme: 'github-dark' })
        const tmp = document.createElement('div')
        tmp.innerHTML = html
        code.parentElement!.replaceWith(tmp.firstElementChild!)
      } catch {
        // 未知语言，保持原样
      }
    }
  } catch (e) {
    console.error('Shiki error:', e)
  }
}
