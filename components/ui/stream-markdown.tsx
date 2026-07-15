'use client'

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import * as smd from 'streaming-markdown'

interface Props {
  content: string
  isStreaming: boolean
  onScrollNeeded?: () => void
}

const PROSE_CLASS =
  'prose prose-sm prose-zoufx dark:prose-invert max-w-none text-[15px] leading-7 text-foreground/92'

/** 揭示引擎的可变状态——rAF 追赶游标（revealed）与 parser 写入位（written）解耦。 */
interface EngineState {
  parser: ReturnType<typeof smd.parser> | null
  written: number
  revealed: number
  ended: boolean
  raf: number
  lastFeed: number
  text: string
  streaming: boolean
  obs: MutationObserver | null
}

/**
 * 块级淡入揭示引擎：smd 直接操作容器 DOM（绕过 React reconcile），文本增量喂 parser；
 * rAF 按剩余比例追赶缓冲（step = max(4, ceil(remaining*0.16)) 节流 ~32ms），不绑字符计数器——
 * 无论 token 多快到达都不闪屏。bloom 只在新块级元素（段落/列项/标题）出现时触发一次（MutationObserver
 * 加 .sc-in），代码块跳过交给 shiki。历史/落库回复（挂载即非流式）一次性整条揭示。
 */
function createEngine(
  sRef: MutableRefObject<EngineState>,
  elRef: RefObject<HTMLDivElement | null>,
  onScrollRef: MutableRefObject<(() => void) | undefined>
) {
  const animateAdded = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.nodeType !== 1) continue
      const el = n as Element
      if (el.closest?.('pre')) continue // 代码块交给 shiki，不 bloom
      el.classList.add('sc-in')
    }
  }

  const ensureParser = () => {
    const el = elRef.current
    const s = sRef.current
    if (!el) return false
    if (!s.parser) {
      el.innerHTML = ''
      s.parser = smd.parser(smd.default_renderer(el))
      s.written = 0
      if (!s.obs) {
        s.obs = new MutationObserver((muts) => {
          const added: Node[] = []
          for (const m of muts) m.addedNodes.forEach((n) => added.push(n))
          if (added.length) animateAdded(added)
        })
        s.obs.observe(el, { childList: true, subtree: true })
      }
    }
    return true
  }

  const feed = (n: number) => {
    const s = sRef.current
    if (!ensureParser() || !s.parser) return
    if (n > s.written) {
      try {
        smd.parser_write(s.parser, s.text.slice(s.written, n))
      } catch (e) {
        console.error('StreamMarkdown write error:', e)
      }
      s.written = n
      onScrollRef.current?.()
    }
  }

  const finish = () => {
    const s = sRef.current
    if (!s.parser || s.ended) return
    if (s.text.length > s.written) {
      try {
        smd.parser_write(s.parser, s.text.slice(s.written))
      } catch {
        // parser 可能已结束
      }
      s.written = s.text.length
    }
    try {
      smd.parser_end(s.parser)
    } catch {
      // parser 可能已结束
    }
    s.parser = null
    s.ended = true
    if (s.obs) {
      s.obs.disconnect()
      s.obs = null
    }
    if (elRef.current) void applyShiki(elRef.current)
  }

  const reset = () => {
    const s = sRef.current
    if (s.raf) {
      cancelAnimationFrame(s.raf)
      s.raf = 0
    }
    if (s.obs) {
      s.obs.disconnect()
      s.obs = null
    }
    if (elRef.current) elRef.current.innerHTML = ''
    s.parser = null
    s.written = 0
    s.revealed = 0
    s.ended = false
    s.lastFeed = 0
  }

  const tick: FrameRequestCallback = (now) => {
    const s = sRef.current
    s.raf = 0
    const target = s.text.length
    if (now - s.lastFeed >= 32) {
      if (s.revealed < target) {
        const remaining = target - s.revealed
        const step = Math.max(4, Math.ceil(remaining * 0.16))
        s.revealed = Math.min(target, s.revealed + step)
        feed(s.revealed)
      }
      s.lastFeed = now
    }
    if (s.revealed < target) s.raf = requestAnimationFrame(tick)
    else if (!s.streaming) finish()
  }

  const kick = () => {
    const s = sRef.current
    if (s.revealed < s.text.length) {
      if (!s.raf) s.raf = requestAnimationFrame(tick)
    } else if (!s.streaming) {
      finish()
    }
  }

  /** 历史/落库回复：整条一次性揭示（各块同时淡入，不逐块追赶）。 */
  const revealAll = () => {
    const s = sRef.current
    s.revealed = s.text.length
    feed(s.text.length)
    finish()
  }

  const onVisible = () => {
    const s = sRef.current
    if (!document.hidden && s.revealed < s.text.length && !s.raf) s.raf = requestAnimationFrame(tick)
  }

  const cleanup = () => {
    const s = sRef.current
    if (s.raf) cancelAnimationFrame(s.raf)
    if (s.obs) {
      s.obs.disconnect()
      s.obs = null
    }
    if (s.parser) {
      try {
        smd.parser_end(s.parser)
      } catch {
        // parser 可能已结束
      }
      s.parser = null
    }
  }

  return { kick, reset, revealAll, onVisible, cleanup }
}

export function StreamMarkdown({ content, isStreaming, onScrollNeeded }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const sRef = useRef<EngineState>({
    parser: null,
    written: 0,
    revealed: 0,
    ended: false,
    raf: 0,
    lastFeed: 0,
    text: content,
    streaming: isStreaming,
    obs: null,
  })
  const onScrollRef = useRef(onScrollNeeded)
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    onScrollRef.current = onScrollNeeded
  }, [onScrollNeeded])

  useEffect(() => {
    setMounted(true)
  }, [])

  // 揭示推进：内容回退（被替换/清空，长度缩短）→ 重置解析器；历史/落库（挂载即非流式）整条即时揭示；流式则 rAF 追赶
  useEffect(() => {
    if (!mounted) return
    if (!engineRef.current) engineRef.current = createEngine(sRef, elRef, onScrollRef)
    const engine = engineRef.current
    const s = sRef.current
    if (content.length < s.written) engine.reset()
    s.text = content
    s.streaming = isStreaming
    if (!isStreaming && s.written === 0 && s.revealed === 0) {
      engine.revealAll()
    } else {
      engine.kick()
    }
  }, [content, isStreaming, mounted])

  // 标签页恢复可见续跑 rAF（隐藏期间自然暂停）+ 卸载清理
  useEffect(() => {
    if (!mounted) return
    const engine = engineRef.current
    const onVis = () => engine?.onVisible()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      engine?.cleanup()
    }
  }, [mounted])

  if (!mounted) {
    return <div className={PROSE_CLASS}>{content}</div>
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest('a')
    if (anchor?.href) {
      e.preventDefault()
      window.open(anchor.href, '_blank', 'noopener,noreferrer')
    }
  }

  return <div ref={elRef} onClick={handleClick} className={PROSE_CLASS} />
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
