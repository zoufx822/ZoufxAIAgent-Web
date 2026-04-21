'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { ArrowUp, Square, Sparkles } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MessageItem } from '@/components/message-item'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useSmartScroll } from '@/hooks/use-smart-scroll'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '帮我梳理一个方案',
  '把这段内容写得更好',
  '解释一个复杂概念',
  '开始一次深度分析',
]

/* ── 输入框组件 ── */
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
    <div
      className={cn(
        'surface-line relative overflow-hidden rounded-[2rem] bg-card transition-colors focus-within:border-primary/25 focus-within:shadow-[0_18px_36px_oklch(0.25_0.01_256_/_0.08)]',
        isLoading && 'bg-muted/80',
        className
      )}
    >
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-muted/55" />
      )}

      {/* 上层：textarea */}
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="尽管问..."
        disabled={isLoading}
        rows={1}
        className={cn(
          'relative z-10 min-h-[58px] max-h-[160px] resize-none border-0 bg-transparent px-6 pt-5 pb-2 text-base leading-relaxed shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/58 disabled:bg-transparent disabled:opacity-100',
          isLoading && 'opacity-60'
        )}
      />

      {/* 下层：工具栏 */}
      <div
        className={cn(
          'relative z-10 flex items-center gap-2 px-5 pb-4',
          isLoading && 'opacity-60'
        )}
      >
        <Tooltip>
          <TooltipTrigger
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all disabled:opacity-50',
              thinkingEnabled
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground'
            )}
            onClick={() => setThinkingEnabled((v) => !v)}
            disabled={isLoading}
          >
            <Sparkles className="size-3.5" strokeWidth={2} />
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
            'mb-0.5 mr-0.5 inline-flex size-10 items-center justify-center rounded-full transition-all',
            isLoading
              ? 'bg-foreground text-background hover:opacity-80'
              : canSend
                ? 'bg-foreground text-background shadow-[0_10px_24px_oklch(0.25_0.01_256_/_0.16)] hover:opacity-90'
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
  const { currentSessionId, toggleThinking, toggleToolCallExpanded } = useStore()

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { scrollRef, scrollToBottom, forceScrollToBottom } = useSmartScroll()

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
        <div className="relative flex flex-1 flex-col items-center justify-center px-4 md:px-8">
          <div className="w-full max-w-3xl -translate-y-6">
            <div className="mb-8 text-left">
              <p className="text-[1.9rem] font-medium tracking-tight text-foreground/88 md:text-[2.35rem]">
                你好，
              </p>
              <h2 className="mt-1 text-4xl font-medium tracking-tight text-foreground md:text-6xl">
                需要我为你做些什么？
              </h2>
            </div>

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
            <div className="mt-6 flex flex-wrap gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  disabled={isLoading}
                  className="surface-line rounded-full bg-card px-4 py-2.5 text-sm text-foreground/72 transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-auto pb-5 text-center text-[11px] text-muted-foreground/60">
            AI 可能会犯错，请核实重要信息
          </p>
        </div>
      ) : (
        /* ── 对话状态 ── */
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-3 md:px-8 md:pt-4">
            <div className="mx-auto max-w-4xl">
              {messages.map((msg, i) => (
                <MessageItem
                  key={msg.id ?? i}
                  message={msg}
                  onToggleThinking={() => toggleThinking(currentSessionId)}
                  onToggleToolCall={(toolCallId) => toggleToolCallExpanded(currentSessionId, toolCallId)}
                  onScrollNeeded={scrollToBottom}
                />
              ))}
              <div className="h-4" />
            </div>
          </div>

          {/* 底部输入 */}
          <div className="px-4 py-4 md:px-8">
            <div className="mx-auto max-w-4xl">
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
