'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { Send, Square, Brain, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageItem } from '@/components/message-item'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '用 Python 写一个快速排序，附带注释',
  '解释一下 React useEffect 的工作原理',
  '帮我写一首关于秋天的短诗',
  '推荐几本经典科幻小说，并说明理由',
]

export function ChatWindow() {
  const { messages, isLoading, send, stop } = useChatStream()
  const { currentSessionId } = useStore()

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── SmartScroll 状态（与原版 SmartScroll.js 完全对应） ──────────────────
  const isPausedRef = useRef(false)
  const pendingScrollEventsRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const touchStartYRef = useRef(0)

  /** 若未暂停则滚到底部（流式/打字机每帧调用） */
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el || isPausedRef.current) return
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  /** 强制滚到底并恢复跟随（发送新消息 / 切换会话调用） */
  const forceScrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isPausedRef.current = false
    const before = el.scrollTop
    el.scrollTop = el.scrollHeight
    if (el.scrollTop !== before) pendingScrollEventsRef.current++
  }, [])

  // ── 挂载 SmartScroll 事件监听 ──────────────────────────────────────────
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
      // programmatic 触发的 scroll event：消费计数后返回
      if (pendingScrollEventsRef.current > 0) {
        pendingScrollEventsRef.current--
        lastScrollTopRef.current = el.scrollTop
        return
      }
      // 用户主动 scroll
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

  // SSE 新 chunk 到达时滚动（消息内容变化驱动）
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // 切换会话：强制滚底 + 聚焦输入框
  useEffect(() => {
    forceScrollToBottom()
    textareaRef.current?.focus()
  }, [currentSessionId, forceScrollToBottom])

  // 自动高度 textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        handleSend()
      } else if (e.key === 'Escape' && isLoading) {
        e.preventDefault()
        stop()
      }
    },
    [handleSend, isLoading, stop]
  )

  const handleToggleThinking = useCallback(
    (sessionId: string) => {
      useStore.setState((state) => ({
        sessions: state.sessions.map((s) => {
          if (s.id !== sessionId) return s
          const msgs = [...s.messages]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return s
          msgs[msgs.length - 1] = { ...last, thinkingExpanded: !last.thinkingExpanded }
          return { ...s, messages: msgs }
        }),
      }))
    },
    []
  )

  return (
    <div className="flex h-full flex-col">
      {/* 消息列表 / 空状态 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-8"
      >
        <div className="mx-auto max-w-3xl">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 py-12">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-semibold">你好，有什么可以帮你？</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  可以提问、写代码、做分析，或者聊任何你感兴趣的话题。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    disabled={isLoading}
                    className="rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-left text-sm text-foreground/80 hover:bg-muted hover:border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageItem
                key={msg.id ?? i}
                message={msg}
                onToggleThinking={() => handleToggleThinking(currentSessionId)}
                onScrollNeeded={scrollToBottom}
              />
            ))
          )}
          <div className="h-4" />
        </div>
      </div>

      {/* 输入区 */}
      <div className="border-t border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-background/95 px-1 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Tooltip>
              <TooltipTrigger
                className={cn(
                  'h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full border border-border/40 transition-all disabled:opacity-50',
                  thinkingEnabled
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'hover:bg-muted hover:border-border'
                )}
                onClick={() => setThinkingEnabled((v) => !v)}
                disabled={isLoading}
              >
                <Brain className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="top">
                {thinkingEnabled ? '关闭思考模式' : '开启思考模式'}
              </TooltipContent>
            </Tooltip>

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题… (Enter 发送，Shift+Enter 换行)"
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-sm leading-relaxed min-h-[32px] max-h-[160px]"
            />

            <Button
              size="icon"
              className={cn(
                'h-9 w-9 shrink-0 rounded-full transition-all hover:translate-y-[-1px]',
                isLoading && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
              )}
              onClick={isLoading ? stop : handleSend}
              disabled={!isLoading && !input.trim()}
            >
              {isLoading ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <p className="mt-1.5 text-center text-xs text-muted-foreground/50">
            AI 可能会犯错，请核实重要信息
          </p>
        </div>
      </div>
    </div>
  )
}
