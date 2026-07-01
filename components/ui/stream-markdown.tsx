'use client'

import { useEffect, useRef, useState } from 'react'
import * as smd from 'streaming-markdown'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  isStreaming: boolean
  onScrollNeeded?: () => void
}

// 目标打字速度（字符/秒），略慢于 LLM 输出速度以保持缓冲区非空
const CHARS_PER_SEC = 60

export function StreamMarkdown({ content, isStreaming, onScrollNeeded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const parserRef = useRef<ReturnType<typeof smd.parser> | null>(null)
  const writtenLenRef = useRef(0)
  const [mounted, setMounted] = useState(false)

  // 历史消息（挂载时已非流式）直接从完整长度开始，跳过打字机路径
  const [displayedLen, setDisplayedLenState] = useState(() => (isStreaming ? 0 : content.length))
  // ref 版本用于在 rAF 回调（非 React 渲染周期）中读取当前位置，避免闭包过期
  const displayedLenRef = useRef(isStreaming ? 0 : content.length)

  const setDisplayedLen = (v: number) => {
    displayedLenRef.current = v
    setDisplayedLenState(v)
  }

  const rafRef = useRef<number | null>(null)
  const fullContentRef = useRef(content)
  const isStreamingRef = useRef(isStreaming)
  const lastTimeRef = useRef<number | null>(null)
  const accumRef = useRef(0)

  fullContentRef.current = content
  isStreamingRef.current = isStreaming

  useEffect(() => {
    setMounted(true)
  }, [])

  // 打字机：基于时间戳均速推进，副作用全部在 rAF 回调中，不进入 setState updater
  useEffect(() => {
    if (!mounted) return

    if (!isStreaming) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      setDisplayedLen(content.length)
      return
    }

    if (displayedLenRef.current >= content.length) return

    lastTimeRef.current = null
    accumRef.current = 0

    const tick: FrameRequestCallback = (timestamp) => {
      const full = fullContentRef.current
      const streaming = isStreamingRef.current
      const prev = displayedLenRef.current

      // 已追上当前内容末尾，等待新内容（effect 依赖 content 会自动重启）
      if (prev >= full.length) {
        rafRef.current = null
        return
      }

      const elapsed =
        lastTimeRef.current !== null ? Math.min(timestamp - lastTimeRef.current, 100) : 16
      lastTimeRef.current = timestamp
      accumRef.current += (elapsed * CHARS_PER_SEC) / 1000
      const charsToAdd = Math.floor(accumRef.current)

      if (charsToAdd === 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      accumRef.current -= charsToAdd
      const next = Math.min(prev + charsToAdd, full.length)
      setDisplayedLen(next)

      if (next < full.length || streaming) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [content, isStreaming, mounted])

  // 初始化 parser
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
        console.error('StreamMarkdown write error:', e)
      }
      writtenLenRef.current = displayedLen
    }
  }, [displayedLen, content, mounted])

  // 流结束：关闭 parser，应用 Shiki 代码高亮
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

    let cancelled = false
    requestAnimationFrame(() => {
      if (!cancelled && containerRef.current) {
        applyShiki(containerRef.current)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isStreaming, displayedLen, content.length, mounted])

  // 滚动通知
  useEffect(() => {
    if (displayedLen > 0) onScrollNeeded?.()
  }, [displayedLen, onScrollNeeded])

  if (!mounted) {
    return (
      <div
        className={cn(
          'prose prose-sm prose-zoufx dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/92'
        )}
      >
        {content}
      </div>
    )
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (anchor?.href) {
      e.preventDefault()
      window.open(anchor.href, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="prose prose-sm prose-zoufx dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/92"
    />
  )
}

const LANG_DISPLAY: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  py: 'Python', python: 'Python', java: 'Java', go: 'Go',
  rust: 'Rust', cpp: 'C++', c: 'C', cs: 'C#', sh: 'Shell',
  bash: 'Bash', zsh: 'Shell', json: 'JSON', yaml: 'YAML',
  yml: 'YAML', html: 'HTML', css: 'CSS', md: 'Markdown',
  sql: 'SQL', xml: 'XML', kt: 'Kotlin', swift: 'Swift',
}

async function applyShiki(container: HTMLElement) {
  try {
    const blocks = container.querySelectorAll<HTMLElement>('pre > code')
    if (blocks.length === 0) return
    // 动态 import：把 shiki（含 oniguruma 引擎 + 语言语法）移出首屏 bundle，首个代码块渲染时才加载
    const { codeToHtml } = await import('shiki')
    for (const code of Array.from(blocks)) {
      // smd 输出裸类名（如 class="ts"），先尝试 language-xxx，退而取第一个 class token
      const langMatch = code.className.match(/language-([\w+#-]+)/)
      const rawLang = langMatch?.[1] ?? code.className.split(' ').find(Boolean) ?? ''
      const lang = rawLang || 'text'
      const displayName = LANG_DISPLAY[lang.toLowerCase()] ?? (rawLang ? rawLang.toUpperCase() : '代码')
      const raw = code.textContent ?? ''

      let shikiHtml: string
      try {
        shikiHtml = await codeToHtml(raw, { lang, themes: { light: 'github-light', dark: 'github-dark' } })
      } catch {
        shikiHtml = await codeToHtml(raw, { lang: 'text', themes: { light: 'github-light', dark: 'github-dark' } })
      }

      const tmp = document.createElement('div')
      tmp.innerHTML = shikiHtml
      const preEl = tmp.firstElementChild as HTMLElement | null
      if (!preEl) continue

      const toolbar = document.createElement('div')
      toolbar.className = 'code-toolbar'
      const langLabel = document.createElement('span')
      langLabel.className = 'code-lang-label'
      langLabel.textContent = displayName
      const copyBtn = document.createElement('button')
      copyBtn.className = 'code-copy-btn'
      copyBtn.textContent = '复制'
      copyBtn.addEventListener('click', () => copyCode(raw, copyBtn))
      toolbar.appendChild(langLabel)
      toolbar.appendChild(copyBtn)

      const wrap = document.createElement('div')
      wrap.className = 'code-block-wrap'
      wrap.appendChild(toolbar)
      wrap.appendChild(preEl)

      code.parentElement!.replaceWith(wrap)
    }
  } catch (e) {
    console.error('Shiki error:', e)
  }
}

async function copyCode(text: string, btn: HTMLButtonElement) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    btn.textContent = '已复制'
  } catch {
    btn.textContent = '复制失败'
  }
  setTimeout(() => { btn.textContent = '复制' }, 1400)
}
