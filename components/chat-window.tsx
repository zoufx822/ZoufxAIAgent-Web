'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { ArrowUp, Square, Brain } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageItem } from '@/components/message-item'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '用 Python 写一个快速排序',
  '解释 React useEffect',
  '写一首关于秋天的短诗',
  '推荐几本经典科幻小说',
]

/* ── 输入框组件（Kimi 风格两行布局） ── */
function ChatInput({
  input,
  setInput,
  isLoading,
  thinkingEnabled,
  setThinkingEnabled,
  onSend,
  onStop,
  textareaRef,
  className,
}: {
  input: string
  setInput: (v: string) => void
  isLoading: boolean
  thinkingEnabled: boolean
  setThinkingEnabled: (fn: (v: boolean) => boolean) => void
  onSend: () => void
  onStop: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  className?: string
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        onSend()
      } else if (e.key === 'Escape' && isLoading) {
        e.preventDefault()
        onStop()
      }
    },
    [onSend, isLoading, onStop]
  )

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input, textareaRef])

  const canSend = input.trim().length > 0

  return (
    <div className={cn('rounded-2xl border border-border bg-background shadow-sm transition-colors focus-within:border-foreground/20', className)}>
      {/* 上层：textarea */}
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="尽管问..."
        disabled={isLoading}
        rows={1}
        className="resize-none border-0 bg-transparent px-4 pt-3 pb-2 shadow-none focus-visible:ring-0 text-sm leading-relaxed min-h-[44px] max-h-[160px] placeholder:text-muted-foreground/50"
      />

      {/* 下层：工具栏 */}
      <div className="flex items-center gap-1 px-3 pb-2.5">
        <Tooltip>
          <TooltipTrigger
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all disabled:opacity-50',
              thinkingEnabled
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            onClick={() => setThinkingEnabled((v) => !v)}
            disabled={isLoading}
          >
            <Brain className="size-3.5" />
            <span>思考</span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {thinkingEnabled ? '关闭思考模式' : '开启思考模式'}
          </TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* 发送 / 停止 */}
        <button
          className={cn(
            'size-8 inline-flex items-center justify-center rounded-full transition-all',
            isLoading
              ? 'bg-foreground text-background hover:opacity-80'
              : canSend
                ? 'bg-foreground text-background hover:opacity-80'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
          onClick={isLoading ? onStop : onSend}
          disabled={!isLoading && !canSend}
        >
          {isLoading ? (
            <Square className="size-3.5 fill-current" />
          ) : (
            <ArrowUp className="size-4" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  )
}

/* ── 主组件 ── */
export function ChatWindow() {
  const { messages, isLoading, send, stop } = useChatStream()
  const { currentSessionId, toggleThinking } = useStore()

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── SmartScroll ──
  const isPausedRef = useRef(false)
  const pendingScrollEventsRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const touchStartYRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el || isPausedRef.current) return
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isPausedRef.current = false
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    lastScrollTopRef.current = el.scrollTop

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) isPausedRef.current = true
    }
    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0].clientY > touchStartYRef.current) isPausedRef.current = true
    }
    const onScroll = () => {
      if (pendingScrollEventsRef.current > 0) {
        pendingScrollEventsRef.current--
        lastScrollTopRef.current = el.scrollTop
        return
      }
      const { scrollTop, scrollHeight, clientHeight } = el
      const scrollingDown = scrollTop > lastScrollTopRef.current
      const dist = scrollHeight - scrollTop - clientHeight
      if (isPausedRef.current && scrollingDown && dist <= 5) {
        isPausedRef.current = false
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

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => {
    forceScrollToBottom()
    textareaRef.current?.focus()
  }, [currentSessionId, forceScrollToBottom])

  const isEmpty = messages.length <= 1

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    forceScrollToBottom()
    send(text, thinkingEnabled)
  }, [input, isLoading, send, thinkingEnabled, forceScrollToBottom])

  const handleSuggestion = useCallback(
    (text: string) => {
      if (isLoading) return
      forceScrollToBottom()
      send(text, thinkingEnabled)
    },
    [isLoading, send, thinkingEnabled, forceScrollToBottom]
  )

  return (
    <div className="flex h-full flex-col">
      {isEmpty ? (
        /* ── 空状态：居中布局 ── */
        <div className="flex flex-1 flex-col items-center justify-center px-4 md:px-8">
          <div className="w-full max-w-2xl">
            {/* 大标题 */}
            <h1 className="text-center text-4xl font-bold tracking-tight mb-8">
              Zoufx AI
            </h1>

            {/* 输入框 */}
            <ChatInput
              input={input}
              setInput={setInput}
              isLoading={isLoading}
              thinkingEnabled={thinkingEnabled}
              setThinkingEnabled={setThinkingEnabled}
              onSend={handleSend}
              onStop={stop}
              textareaRef={textareaRef}
            />

            {/* 建议 */}
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  disabled={isLoading}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-auto pb-4 text-center text-[11px] text-muted-foreground/60">
            AI 可能会犯错，请核实重要信息
          </p>
        </div>
      ) : (
        /* ── 对话状态 ── */
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8">
            <div className="mx-auto max-w-3xl">
              {messages.map((msg, i) => (
                <MessageItem
                  key={msg.id ?? i}
                  message={msg}
                  onToggleThinking={() => toggleThinking(currentSessionId)}
                  onScrollNeeded={scrollToBottom}
                />
              ))}
              <div className="h-4" />
            </div>
          </div>

          {/* 底部输入 */}
          <div className="px-4 py-3 md:px-8">
            <div className="mx-auto max-w-3xl">
              <ChatInput
                input={input}
                setInput={setInput}
                isLoading={isLoading}
                thinkingEnabled={thinkingEnabled}
                setThinkingEnabled={setThinkingEnabled}
                onSend={handleSend}
                onStop={stop}
                textareaRef={textareaRef}
              />
              <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
                AI 可能会犯错，请核实重要信息
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
