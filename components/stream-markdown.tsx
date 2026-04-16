'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as smd from 'streaming-markdown'
import { codeToHtml } from 'shiki'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  isStreaming: boolean
  onScrollNeeded?: () => void
}

// 打字机速度：25ms/字符
const TW_INTERVAL = 25

export function StreamMarkdown({ content, isStreaming, onScrollNeeded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const parserRef = useRef<ReturnType<typeof smd.parser> | null>(null)
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
        return Math.min(prev + 1, currentFull.length)
      })
    }, TW_INTERVAL)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [content, isStreaming, mounted])

  // 渲染 Markdown
  useEffect(() => {
    if (!mounted) return

    const el = containerRef.current
    if (!el) return

    // 清除之前的内容
    el.innerHTML = ''

    try {
      // 每次创建新的解析器
      const renderer = smd.default_renderer(el)
      const p = smd.parser(renderer)
      parserRef.current = p

      // 写入当前显示的内容
      const toRender = content.slice(0, displayedLen)
      if (toRender) {
        smd.parser_write(p, toRender)
      }

      // 如果流结束了，完成解析并应用 Shiki
      if (!isStreaming) {
        smd.parser_end(p)
        // 延迟执行 Shiki
        setTimeout(() => {
          if (containerRef.current) {
            applyShiki(containerRef.current)
          }
        }, 100)
      }
    } catch (e) {
      console.error('StreamMarkdown render error:', e)
      // 回退：直接显示文本
      el.textContent = content.slice(0, displayedLen)
    }
  }, [content, displayedLen, isStreaming, mounted])

  // 滚动通知
  useEffect(() => {
    if (displayedLen > 0) {
      onScrollNeeded?.()
    }
  }, [displayedLen, onScrollNeeded])

  if (!mounted) {
    return (
      <div className={cn('prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed')}>
        {content}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed',
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