'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Plus, Sparkles, Square } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Eyes } from '@/components/eyes'
import { MessageItem } from '@/components/message-item'
import { PresenceSticky } from '@/components/presence-sticky'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useSmartScroll } from '@/hooks/use-smart-scroll'
import { useStore } from '@/lib/store'
import { useAnchorMessages } from '@/hooks/use-anchor-messages'
import { useContextDetector } from '@/hooks/use-context-detector'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { useIntimacy } from '@/hooks/use-intimacy'
import { useAsleepDetector } from '@/hooks/use-asleep-detector'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  idle:     { zh: '等待交互', en: 'IDLE' },
  thinking: { zh: '思考中',   en: 'THINKING' },
  tooling:  { zh: '使用工具', en: 'TOOLING' },
  writing:  { zh: '回复中',   en: 'WRITING' },
  error:    { zh: '出错了',   en: 'ERROR' },
  asleep:   { zh: '打盹中',   en: 'ASLEEP' },
}
const HOME_MOOD_HIDE = new Set(['error', 'asleep'])

const SUGGESTIONS_BY_INTIMACY: Record<string, string[]> = {
  stranger:     ['你想聊点什么？', '你怎么称呼自己', '介绍一下你自己'],
  'half-known': ['帮我梳理一个方案', '把这段写得更好', '解释一个复杂概念'],
  'fully-known':['帮我梳理一个方案', '把这段写得更好', '解释一个复杂概念', '深度分析'],
}

const INTIMACY_GREET: Record<string, string> = {
  stranger:     '我们才刚认识。先随便聊聊？',
  'half-known': '继续聊吧——我还在慢慢认识你。',
}

function timeGreet(): string {
  const h = new Date().getHours()
  if (h < 5)  return '还醒着？我陪你。'
  if (h < 9)  return '今天打算干点什么？'
  if (h < 12) return '早上的脑子最清楚，开始吧。'
  if (h < 14) return '吃过了吗？吃过我们就继续。'
  if (h < 18) return '下午容易走神，需要我提醒你聚焦吗？'
  if (h < 22) return '今天怎么样？想聊点什么？'
  return '夜深了。别熬太晚，我也是。'
}

function ChatInput({
  input,
  setInput,
  isLoading,
  thinkingEnabled,
  setThinkingEnabled,
  onSend,
  onStop,
  textareaRef,
}: {
  input: string
  setInput: (v: string) => void
  isLoading: boolean
  thinkingEnabled: boolean
  setThinkingEnabled: (fn: (v: boolean) => boolean) => void
  onSend: () => void
  onStop: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        if (!isLoading) onSend()
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
  const [focused, setFocused] = useState(false)

  return (
    <div
      className="transition-all duration-200"
      style={{
        backgroundColor: 'var(--surface)',
        border: `1px solid ${focused ? 'var(--t1)' : 'var(--border)'}`,
        borderRadius: '16px',
        boxShadow: focused ? 'none' : 'var(--shadow)',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="尽管问..."
        rows={1}
        className="relative z-10 min-h-[58px] max-h-[160px] resize-none border-0 bg-transparent px-6 pt-5 pb-2 text-base leading-relaxed shadow-none focus-visible:ring-0 focus-visible:border-0 outline-none placeholder:text-muted-foreground/58"
      />

      <div className="relative z-10 flex items-center gap-1.5 px-5 pb-4">
        <Menu.Root>
          <Tooltip>
            <TooltipTrigger
              render={
                <Menu.Trigger
                  disabled={isLoading}
                  aria-label="更多选项"
                  className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent/55 hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                />
              }
            >
              <Plus className="size-4" strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent side="top">更多选项</TooltipContent>
          </Tooltip>
          <Menu.Portal>
            <Menu.Positioner side="top" align="start" sideOffset={10} className="isolate z-50">
              <Menu.Popup
                className="min-w-[180px] rounded-xl border p-1.5 text-sm shadow-lg origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
                style={{
                  backgroundColor: 'var(--surface)',
                  borderColor: 'var(--border)',
                }}
              >
                <Menu.Item
                  onClick={() => setThinkingEnabled((v) => !v)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 outline-none transition-colors',
                    'data-[highlighted]:bg-accent/55',
                    thinkingEnabled && 'text-primary'
                  )}
                >
                  <Sparkles className="size-4" strokeWidth={2} />
                  <span className="flex-1">思考</span>
                  {thinkingEnabled && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        {thinkingEnabled && (
          <Tooltip>
            <TooltipTrigger
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
              style={{
                color: 'var(--accent)',
                backgroundColor: 'var(--accent-s)',
              }}
              onClick={() => setThinkingEnabled((v) => !v)}
              disabled={isLoading}
            >
              <Sparkles className="size-3.5" strokeWidth={2} />
              <span>思考</span>
            </TooltipTrigger>
            <TooltipContent side="top">点击关闭显示思考过程</TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        <button
          className={cn(
            'inline-flex items-center justify-center rounded-full transition-all',
            isLoading
              ? 'hover:opacity-80'
              : canSend
                ? 'hover:opacity-90'
                : 'cursor-not-allowed'
          )}
          style={{
            width: '30px',
            height: '30px',
            background: isLoading ? 'var(--t1)' : canSend ? 'var(--accent)' : 'var(--border)',
            boxShadow: canSend && !isLoading ? '0 2px 8px var(--accent-s)' : 'none',
            flexShrink: 0,
          }}
          onClick={isLoading ? onStop : onSend}
          disabled={!isLoading && !canSend}
        >
          {isLoading ? (
            <Square className="size-3 fill-current" style={{ color: 'var(--bg)' }} />
          ) : (
            <ArrowUp className="size-3.5" strokeWidth={2.5} style={{ color: canSend ? 'var(--bg)' : 'var(--t3)' }} />
          )}
        </button>
      </div>
    </div>
  )
}

export function ChatWindow() {
  useAnchorMessages()
  useAsleepDetector()

  const { messages, isLoading, send, stop } = useChatStream()
  const { currentAnchorId, toggleThinking, toggleToolCallExpanded } = useStore()
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood = useStore((s) => s.currentMood)
  const context = useContextDetector()
  const eyesBusy = currentStatus === 'thinking' || currentStatus === 'tooling' || currentStatus === 'writing'

  const { data: hot } = useMemoryHot('user-impression')
  const intimacy = useIntimacy(hot)

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { scrollRef, scrollToBottom, forceScrollToBottom } = useSmartScroll()

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => {
    forceScrollToBottom()
    textareaRef.current?.focus()
  }, [currentAnchorId, forceScrollToBottom])

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

  const greeting = useMemo(() => INTIMACY_GREET[intimacy] ?? timeGreet(), [intimacy])

  const statusLabel = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const showMood = !HOME_MOOD_HIDE.has(currentStatus) && !!currentMood

  const suggestions = SUGGESTIONS_BY_INTIMACY[intimacy] ?? SUGGESTIONS_BY_INTIMACY.stranger

  return (
    <div className="flex h-full flex-col">
      {isEmpty ? (
        <div
          className="page-enter flex flex-1 flex-col items-center justify-center"
          style={{ padding: '0 48px' }}
        >
          <div style={{ width: '100%', maxWidth: 620 }}>
            <div className="home-nameplate" data-mood={currentStatus}>
              <div className="home-eyes">
                <Eyes size={80} busy={eyesBusy} mood={currentMood} context={context} color="var(--accent)" pupil="var(--bg)" />
              </div>
              <div className="home-sig">
                <span className="home-sig-rule"></span>
                <span className="home-sig-name">小&thinsp;Z</span>
                <span className="home-sig-rule"></span>
              </div>
              <div className="home-status">
                <span className="home-status-dot"></span>
                <span className="home-status-zh">{statusLabel.zh}</span>
                <span className="home-status-en mono">{statusLabel.en}</span>
                {showMood && (
                  <>
                    <span className="home-status-sep">·</span>
                    <span key={currentMood ?? ''} className="home-status-mood">{currentMood}</span>
                  </>
                )}
              </div>
              <div className="home-line">{greeting}</div>
            </div>

            <div className="mb-4">
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
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  disabled={isLoading}
                  className="rounded-full transition-colors duration-150"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '100px',
                    padding: '6px 15px',
                    fontSize: '12px',
                    color: 'var(--t2)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--t1)'
                    e.currentTarget.style.color = 'var(--t1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--t2)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <PresenceSticky />
          <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: '36px clamp(16px, 5vw, 56px)' }}>
            <div className="mx-auto" style={{ maxWidth: '720px' }}>
              {messages.map((msg, i) => (
                <MessageItem
                  key={msg.id ?? i}
                  message={msg}
                  isNew={i >= messages.length - 2}
                  onToggleThinking={() => toggleThinking(currentAnchorId)}
                  onToggleToolCall={(toolCallId) => toggleToolCallExpanded(currentAnchorId, toolCallId)}
                  onScrollNeeded={scrollToBottom}
                />
              ))}
              <div className="h-4" />
            </div>
          </div>

          <div className="flex-shrink-0" style={{ padding: '0 clamp(16px, 5vw, 56px) 24px' }}>
            <div className="mx-auto" style={{ maxWidth: '720px' }}>
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
            </div>
          </div>
        </>
      )}
    </div>
  )
}
