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

export function StreamMarkdown({ content, isStreaming, onScrollNeeded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const parserRef    = useRef<ReturnType<typeof smd.parser> | null>(null)
  const lastLenRef   = useRef(0)
  const doneRef      = useRef(false)
  const [mounted, setMounted] = useState(false)

  // 客户端挂载后再初始化
  useEffect(() => {
    setMounted(true)
  }, [])

  // 挂载：初始化解析器；历史消息直接喂完整内容
  useEffect(() => {
    if (!mounted) return
    const el = containerRef.current
    if (!el) return

    try {
      const renderer = smd.default_renderer(el)
      const p = smd.parser(renderer)
      parserRef.current = p

      if (content) {
        smd.parser_write(p, content)
        lastLenRef.current = content.length
      }
      if (!isStreaming) {
        doneRef.current = true
        smd.parser_end(p)
        void applyShiki(el)
      }
    } catch (e) {
      console.error('StreamMarkdown init error:', e)
    }
  }, [mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  // 更新：喂增量字符；流结束时收尾
  useEffect(() => {
    if (!mounted) return
    const p  = parserRef.current
    const el = containerRef.current
    if (!p || !el) return

    try {
      const delta = content.slice(lastLenRef.current)
      if (delta) {
        smd.parser_write(p, delta)
        lastLenRef.current = content.length
        onScrollNeeded?.()
      }
      if (!isStreaming && content.length > 0 && !doneRef.current) {
        doneRef.current = true
        smd.parser_end(p)
        void applyShiki(el)
      }
    } catch (e) {
      console.error('StreamMarkdown update error:', e)
    }
  }, [content, isStreaming, onScrollNeeded, mounted])

  if (!mounted) {
    return (
      <div
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed'
        )}
      >
        {content}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed',
        isStreaming && 'streaming-cursor'
      )}
    />
  )
}

async function applyShiki(container: HTMLElement) {
  try {
    const blocks = container.querySelectorAll<HTMLElement>('pre > code')
    for (const code of Array.from(blocks)) {
      const lang = code.className.match(/language-(\w+)/)?.[1] ?? 'text'
      const raw  = code.textContent ?? ''
      try {
        const html = await codeToHtml(raw, { lang, theme: 'github-dark' })
        const tmp  = document.createElement('div')
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