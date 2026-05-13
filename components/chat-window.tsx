'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {ArrowUp, Plus, Sparkles, Square} from 'lucide-react'
import {Menu} from '@base-ui/react/menu'
import {Textarea} from '@/components/ui/textarea'
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import {MessageItem} from '@/components/message-item'
import {useChatStream} from '@/hooks/use-chat-stream'
import {useSmartScroll} from '@/hooks/use-smart-scroll'
import {useStore} from '@/lib/store'
import {cn} from '@/lib/utils'

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
      {/* 上层：textarea */}
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="尽管问..."
        rows={1}
        className="relative z-10 min-h-[58px] max-h-[160px] resize-none border-0 bg-transparent px-6 pt-5 pb-2 text-base leading-relaxed shadow-none focus-visible:ring-0 focus-visible:border-0 outline-none placeholder:text-muted-foreground/58"
      />

      {/* 下层：工具栏 */}
      <div className="relative z-10 flex items-center gap-1.5 px-5 pb-4">
        {/* + 菜单触发 */}
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
                  <span className="flex-1">思考一下</span>
                  {thinkingEnabled && (
                    <span className="size-1.5 rounded-full bg-primary" />
                  )}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

        {/* 已激活芯片：点击关闭 */}
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
            <TooltipContent side="top">点击关闭思考模式</TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        {/* 发送 / 停止 */}
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

/* ── 主组件 ── */
export function ChatWindow() {
  const { messages, isLoading, send, stop } = useChatStream()
  const { currentAnchorId, toggleThinking, toggleToolCallExpanded } = useStore()

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  // 用户称呼：v1 仅从 localStorage 读，v2 接后端 Hot Memory.display_name
  const [userName, setUserName] = useState('')
  useEffect(() => {
    try { setUserName(localStorage.getItem('zUserName') || '') } catch { /* noop */ }
  }, [])

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

  return (
    <div className="flex h-full flex-col">
      {isEmpty ? (
        /* ── 空状态：居中布局 ── */
        <div
          className="relative flex flex-1 flex-col items-center justify-center px-12 py-24"
          style={{ animation: 'up 0.3s ease both' }}
        >
          <div className="w-full max-w-2xl">
            {/* 品牌名和副标题 */}
            <div className="text-center mb-11">
              <h1
                className="mono mb-3 leading-none"
                style={{
                  fontSize: '52px',
                  fontWeight: 600,
                  color: 'var(--t1)',
                  letterSpacing: '-0.04em',
                }}
              >
                小Z
              </h1>
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 400,
                  color: 'var(--t3)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.5,
                }}
              >
                {userName ? `你好，${userName}。` : '你好。我是小Z，该怎么称呼你？'}
              </p>
            </div>

            {/* 输入框 */}
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

            {/* 建议 chips */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
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

          {/* 免责文字 */}
          <div
            className="absolute bottom-5 text-xs"
            style={{ color: 'var(--t3)' }}
          >
            AI 可能会出错，请核实重要信息
          </div>
        </div>
      ) : (
        /* ── 对话状态 ── */
        <>
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

          {/* 底部输入 */}
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
