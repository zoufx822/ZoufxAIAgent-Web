'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowDown, ArrowUp, Plus, Sparkles, Square } from 'lucide-react'
import { Menu } from '@base-ui/react/menu'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Eyes } from '@/components/eyes'
import { EffortPicker } from '@/components/effort-picker'
import { MessageItem } from '@/components/message-item'
import { PresenceFloat } from '@/components/presence-float'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useSmartScroll } from '@/hooks/use-smart-scroll'
import { useStore } from '@/lib/store'
import { useFeaturesStore, type ThinkEffort } from '@/lib/features'
import type { ThinkingRequest } from '@/lib/chat-stream'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import { useAnchorMessages } from '@/hooks/use-anchor-messages'
import { useContextDetector } from '@/hooks/use-context-detector'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { useIntimacy } from '@/hooks/use-intimacy'
import { useAsleepDetector } from '@/hooks/use-asleep-detector'
import { useMoodPresence } from '@/hooks/use-mood-presence'
import { runFlip, type FlipRect } from '@/lib/flip'
import { cn } from '@/lib/utils'

const SUGGESTIONS_BY_INTIMACY: Record<string, string[]> = {
  stranger: ['你想聊点什么？', '你怎么称呼自己', '介绍一下你自己'],
  'half-known': ['帮我梳理一个方案', '把这段写得更好', '解释一个复杂概念'],
  'fully-known': ['帮我梳理一个方案', '把这段写得更好', '解释一个复杂概念', '深度分析'],
}

const INTIMACY_GREET: Record<string, string> = {
  stranger: '我们才刚认识。先随便聊聊？',
  'half-known': '继续聊吧——我还在慢慢认识你。',
}

function timeGreet(): string {
  const h = new Date().getHours()
  if (h < 5) return '还醒着？我陪你。'
  if (h < 9) return '今天打算干点什么？'
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
  effortCap,
  selectedEffort,
  setSelectedEffort,
  onSend,
  onStop,
  stopReady,
  sendBlocked,
  onTyping,
  textareaRef,
}: {
  input: string
  setInput: (v: string) => void
  isLoading: boolean
  thinkingEnabled: boolean
  setThinkingEnabled: (fn: (v: boolean) => boolean) => void
  /** 当前 profile 的思考深度能力声明（来自 /ai/features）；undefined=尚未加载 */
  effortCap?: ThinkEffort
  selectedEffort: string
  setSelectedEffort: (v: string) => void
  onSend: () => void
  onStop: () => void
  /** turnId 已到——停止按钮据此在收到前禁用（否则停止请求无 turnId 可发） */
  stopReady: boolean
  /** 同锚有在建轮 → 禁发（发送禁用 + Enter 无效 + placeholder 变化） */
  sendBlocked: boolean
  /** 打字时调用（仅 onChange 触发，不在 focus 时触发） */
  onTyping?: (active: boolean) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // P0：中文输入法候选未上屏（isComposing）时回车不发送，避免误触
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault()
        if (!isLoading && !sendBlocked) onSend()
      } else if (e.key === 'Escape' && isLoading && stopReady) {
        e.preventDefault()
        onStop()
      }
    },
    [onSend, isLoading, onStop, stopReady, sendBlocked]
  )

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [input, textareaRef])

  const canSend = input.trim().length > 0 && !sendBlocked
  const [focused, setFocused] = useState(false)

  // 打字停顿 1.2s 后归中
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
      onTyping?.(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => onTyping?.(false), 1200)
    },
    [setInput, onTyping]
  )
  const handleBlur = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    onTyping?.(false)
  }, [onTyping])

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
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={sendBlocked ? '上一条还在生成中…' : '尽管问...'}
        rows={1}
        className="relative z-10 min-h-[58px] max-h-[180px] resize-none border-0 bg-transparent px-6 pt-5 pb-2 text-base leading-relaxed shadow-none focus-visible:ring-0 focus-visible:border-0 outline-none placeholder:text-muted-foreground/58"
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
                  {thinkingEnabled && <span className="size-1.5 rounded-full bg-primary" />}
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
            <TooltipContent side="top">点击关闭思考</TooltipContent>
          </Tooltip>
        )}

        {thinkingEnabled && effortCap?.supported && (
          <EffortPicker
            options={effortCap.options}
            value={selectedEffort}
            onChange={setSelectedEffort}
            disabled={isLoading}
          />
        )}

        <div className="flex-1" />

        <button
          className={cn(
            'inline-flex items-center justify-center rounded-full transition-all',
            isLoading
              ? stopReady
                ? 'hover:opacity-80'
                : 'cursor-default'
              : canSend
                ? 'hover:opacity-90'
                : 'cursor-not-allowed'
          )}
          style={{
            width: '36px',
            height: '36px',
            // turnId 未到（!stopReady）时停止按钮呈禁用灰；否则流式=停止(t1)、可发=accent
            background: isLoading
              ? stopReady
                ? 'var(--t1)'
                : 'var(--border)'
              : canSend
                ? 'var(--accent)'
                : 'var(--border)',
            boxShadow: canSend && !isLoading ? '0 2px 8px var(--accent-s)' : 'none',
            flexShrink: 0,
          }}
          onClick={isLoading ? (stopReady ? onStop : undefined) : onSend}
          disabled={isLoading ? !stopReady : !canSend}
          title={isLoading ? (stopReady ? '停止生成' : '连接建立中…') : sendBlocked ? '上一条还在生成中' : '发送'}
        >
          {isLoading ? (
            <Square className="size-3.5 fill-current" style={{ color: 'var(--bg)' }} />
          ) : (
            <ArrowUp
              className="size-4"
              strokeWidth={2.5}
              style={{ color: canSend ? 'var(--bg)' : 'var(--t3)' }}
            />
          )}
        </button>
      </div>
    </div>
  )
}

export function ChatWindow() {
  useAnchorMessages()
  const [lastInputAt, setLastInputAt] = useState(() => Date.now())
  useAsleepDetector({ lastInputAt })

  // 打字注视状态
  const [typingActive, setTypingActive] = useState(false)
  const handleTypingStart = useCallback((active: boolean) => setTypingActive(active), [])

  // 全局交互监听——重置 lastInputAt，解除走神/更新 idle 时钟
  useEffect(() => {
    const reset = () => setLastInputAt(Date.now())
    window.addEventListener('mousemove', reset, { passive: true })
    window.addEventListener('keydown', reset, { passive: true })
    window.addEventListener('click', reset, { passive: true })
    return () => {
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
      window.removeEventListener('click', reset)
    }
  }, [])

  const { messages, isLoading, send, stop, turnReady } = useChatStream()
  const { currentAnchorId, toggleThinking, toggleToolCallExpanded } = useStore(
    useShallow((s) => ({
      currentAnchorId: s.currentAnchorId,
      toggleThinking: s.toggleThinking,
      toggleToolCallExpanded: s.toggleToolCallExpanded,
    }))
  )
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood = useStore((s) => s.currentMood)
  const prefill = useStore((s) => s.prefill)
  const pendingTurn = useStore((s) => s.pendingTurn)
  // 同锚有在建轮 → 禁发（consumeStream 放大了同锚并发边界）
  const sendBlocked = !!pendingTurn && pendingTurn.anchorId === currentAnchorId
  const context = useContextDetector()

  // 唤醒动画：深夜（asleep 态）+ 打字中
  const isWaking = typingActive && currentStatus === 'asleep'

  // 情绪连发 → home 页光晕池叠加 + 第一反应节拍 + 最小播放锁
  const { glowEls: homeGlowEls, beatKey: homeBeatKey, moodLocked } = useMoodPresence(currentMood)
  // 思考中 = 系统处于思考/调用工具态；锁内情绪优先于思考占位脸
  const showThinking = (currentStatus === 'thinking' || currentStatus === 'tooling') && !moodLocked

  const { data: hot } = useMemoryHot('user-impression')
  const intimacy = useIntimacy(hot)

  const [input, setInput] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)

  // 思考深度能力声明 + 当前选档。能力来自 /ai/features；选档初始化为接口默认值，
  // profile 切换（effortCap 变更）时重置——档位/默认值全部跟随接口，前端不硬编码。
  const effortCap = useFeaturesStore((s) => s.features?.effort)
  const [selectedEffort, setSelectedEffort] = useState('')
  useEffect(() => {
    if (effortCap?.supported && effortCap.defaultValue) setSelectedEffort(effortCap.defaultValue)
  }, [effortCap])

  /** 构造发往后端的思考配置：深度仅在「支持 effort + 开启思考」时附带，否则省略。 */
  const buildThinking = useCallback(
    (): ThinkingRequest => ({
      enabled: thinkingEnabled,
      effort:
        thinkingEnabled && effortCap?.supported && selectedEffort ? selectedEffort : undefined,
    }),
    [thinkingEnabled, effortCap, selectedEffort]
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { scrollRef, scrollToBottom, forceScrollToBottom, scrollToBottomSmooth, atBottom } =
    useSmartScroll()

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])
  useEffect(() => {
    forceScrollToBottom()
    textareaRef.current?.focus()
  }, [currentAnchorId, forceScrollToBottom])

  // ① 回复流式真正结束 → 自动 refocus 输入框（focusInputSignal 上升沿驱动；错误/中止不触发）
  const focusInputSignal = useStore((s) => s.focusInputSignal)
  const prevFocusSignalRef = useRef(focusInputSignal)
  useEffect(() => {
    if (focusInputSignal !== prevFocusSignalRef.current) {
      textareaRef.current?.focus()
      prevFocusSignalRef.current = focusInputSignal
    }
  }, [focusInputSignal])

  const isEmpty = messages.length <= 1

  // ② 起始页→聊天页 FLIP 转场：发送瞬间（DOM 仍是起始页）量取的眼睛/输入框旧 rect，
  //    挂载时由目标元素"放回"再补间，看起来同一双眼睛/输入框连续移动。chat→chat 不飞。
  // 眼睛 from-rect 走 state（渲染期作为 prop 透传给挂载的 PresenceFloat）；
  // 输入框 from-rect 走 ref（仅在 useLayoutEffect 内消费，不参与渲染）。
  const [flyEyesFrom, setFlyEyesFrom] = useState<FlipRect | null>(null)
  const pendingFlyInputRef = useRef<FlipRect | null>(null)
  const inputSlotRef = useRef<HTMLDivElement>(null)
  const [flying, setFlying] = useState(false)
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current)
    },
    []
  )

  // 聊天页输入框挂载（isEmpty true→false）时从起始页居中大框 FLIP 滑入（仅平移，避免圆角变形）
  useLayoutEffect(() => {
    if (!isEmpty && pendingFlyInputRef.current && inputSlotRef.current) {
      runFlip(inputSlotRef.current, pendingFlyInputRef.current, { scale: false })
      pendingFlyInputRef.current = null
    }
  }, [isEmpty])

  /** 起始页发送：量取眼睛/输入框旧 rect 触发 FLIP；chat→chat 写 null 不飞。须在切到聊天页前调用。 */
  const captureFlyOrigin = useCallback(() => {
    if (!isEmpty) {
      setFlyEyesFrom(null)
      pendingFlyInputRef.current = null
      return
    }
    const toRect = (el: Element | null): FlipRect | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    setFlyEyesFrom(toRect(document.querySelector('.home-eyes .eyes-z')))
    pendingFlyInputRef.current = toRect(document.querySelector('.home-input-slot'))
    setFlying(true)
    if (flyTimerRef.current) clearTimeout(flyTimerRef.current)
    flyTimerRef.current = setTimeout(() => setFlying(false), 520)
  }, [isEmpty])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isLoading) return
    captureFlyOrigin()
    setInput('')
    setLastInputAt(Date.now())
    forceScrollToBottom()
    send(text, buildThinking())
  }, [input, isLoading, send, buildThinking, forceScrollToBottom, captureFlyOrigin])

  // 失败/停止把原文放回输入框：监听 prefill.key 上升沿（每次都变化），回填 + 聚焦 + 光标置末尾。
  // prevPrefillKeyRef 初始化为挂载时 key，只响应挂载后的变化（避免残留旧回填在重挂载时重灌）。
  const prevPrefillKeyRef = useRef(prefill?.key ?? 0)
  useEffect(() => {
    if (!prefill || prefill.key === prevPrefillKeyRef.current) return
    prevPrefillKeyRef.current = prefill.key
    setInput(prefill.text)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(prefill.text.length, prefill.text.length)
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
    })
  }, [prefill])

  const handleSuggestion = useCallback(
    (text: string) => {
      if (isLoading) return
      captureFlyOrigin()
      setLastInputAt(Date.now())
      forceScrollToBottom()
      send(text, buildThinking())
    },
    [isLoading, send, buildThinking, forceScrollToBottom, captureFlyOrigin]
  )

  // 停止生成后把焦点还给输入框（不改 useChatStream 内部的中止/收尾逻辑）
  const handleStop = useCallback(() => {
    stop()
    textareaRef.current?.focus()
  }, [stop])

  const greeting = useMemo(() => INTIMACY_GREET[intimacy] ?? timeGreet(), [intimacy])

  const statusLabel = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const showMood = !MOOD_HIDDEN_STATUSES.has(currentStatus) && !!currentMood

  const suggestions = SUGGESTIONS_BY_INTIMACY[intimacy] ?? SUGGESTIONS_BY_INTIMACY.stranger

  // 稳定回调——配合 MessageItem 的 React.memo，避免每次渲染都给所有消息项换新引用
  const handleToggleThinking = useCallback(
    () => toggleThinking(currentAnchorId),
    [toggleThinking, currentAnchorId]
  )
  const handleToggleToolCall = useCallback(
    (toolCallId: string) => toggleToolCallExpanded(currentAnchorId, toolCallId),
    [toggleToolCallExpanded, currentAnchorId]
  )

  return (
    <div className={cn('flex h-full flex-col', flying && 'chat-flying')}>
      {isEmpty ? (
        <div
          className="page-enter flex flex-1 flex-col items-center justify-center"
          style={{ padding: '0 48px' }}
        >
          <div style={{ width: '100%', maxWidth: 620 }}>
            <div
              className="home-nameplate"
              data-mood={currentStatus}
              data-emotion={currentMood ?? undefined}
            >
              <div className="home-eyes">
                <div className={`mood-ambient${showMood ? ' on' : ''}`} />
                {homeGlowEls}
                <Eyes
                  size={80}
                  busy={currentStatus === 'writing'}
                  mood={currentMood}
                  context={context}
                  color="var(--accent)"
                  pupil="var(--bg)"
                  asleep={currentStatus === 'asleep'}
                  drifting={currentStatus === 'drifting'}
                  thinking={showThinking}
                  lookDown={typingActive}
                  waking={isWaking}
                  beatKey={homeBeatKey}
                />
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
                    <span key={currentMood ?? ''} className="home-status-mood">
                      {currentMood}
                    </span>
                  </>
                )}
              </div>
              <div className="home-line">{greeting}</div>
            </div>

            <div className="home-input-slot mb-4">
              <ChatInput
                input={input}
                setInput={setInput}
                isLoading={isLoading}
                thinkingEnabled={thinkingEnabled}
                setThinkingEnabled={setThinkingEnabled}
                effortCap={effortCap}
                selectedEffort={selectedEffort}
                setSelectedEffort={setSelectedEffort}
                onSend={handleSend}
                onStop={handleStop}
                stopReady={turnReady}
                sendBlocked={sendBlocked}
                onTyping={handleTypingStart}
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
                    padding: '9px 16px',
                    minHeight: '36px',
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
          <PresenceFloat
            context={context}
            lookDown={typingActive}
            waking={isWaking}
            flyFrom={flyEyesFrom}
          />
          <div
            ref={scrollRef}
            className="chat-scroll-area flex-1 overflow-y-auto"
            style={{ padding: '8px clamp(16px, 5vw, 56px) 36px' }}
          >
            <div className="mx-auto" style={{ maxWidth: '720px' }}>
              {(() => {
                const items: React.ReactNode[] = []
                let roundIdx = 0
                messages.forEach((msg, i) => {
                  const prev = messages[i - 1]
                  if (msg.role === 'user') roundIdx++
                  // 每 3 轮从第 4 轮起插呼吸分割线
                  if (msg.role === 'user' && roundIdx > 1 && (roundIdx - 1) % 3 === 0) {
                    const timeLabel = msg.createdAt
                      ? new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    items.push(
                      <div key={`br-${i}`} className="breath-divider">
                        <svg width="40" height="1">
                          <line x1="0" y1="0.5" x2="40" y2="0.5" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
                        </svg>
                        {timeLabel && <span className="breath-time">{timeLabel}</span>}
                        <svg width="40" height="1">
                          <line x1="0" y1="0.5" x2="40" y2="0.5" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
                        </svg>
                      </div>
                    )
                  }
                  const sameAuthor = prev && prev.role === msg.role
                  const crossAuthor = prev && prev.role !== msg.role
                  const mt = !prev ? 0 : crossAuthor ? 28 : sameAuthor ? 8 : 18
                  items.push(
                    <div key={msg.id} style={{ marginTop: mt }}>
                      <MessageItem
                        message={msg}
                        isNew={i >= messages.length - 2}
                        onToggleThinking={handleToggleThinking}
                        onToggleToolCall={handleToggleToolCall}
                        onScrollNeeded={scrollToBottom}
                      />
                    </div>
                  )
                })
                return items
              })()}
              <div className="h-4" />
            </div>
          </div>

          <div
            className="chat-input-area flex-shrink-0 relative"
            style={{ padding: '0 clamp(16px, 5vw, 56px) 24px' }}
          >
            {!atBottom && (
              <button
                type="button"
                aria-label="回到底部"
                onClick={scrollToBottomSmooth}
                className="absolute left-1/2 top-0 z-20 inline-flex size-8 -translate-x-1/2 -translate-y-[calc(100%+10px)] items-center justify-center rounded-full transition-all hover:opacity-90"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                  color: 'var(--t2)',
                }}
              >
                <ArrowDown className="size-4" strokeWidth={2} />
              </button>
            )}
            <div ref={inputSlotRef} className="mx-auto" style={{ maxWidth: '720px' }}>
              <ChatInput
                input={input}
                setInput={setInput}
                isLoading={isLoading}
                thinkingEnabled={thinkingEnabled}
                setThinkingEnabled={setThinkingEnabled}
                effortCap={effortCap}
                selectedEffort={selectedEffort}
                setSelectedEffort={setSelectedEffort}
                onSend={handleSend}
                onStop={handleStop}
                stopReady={turnReady}
                sendBlocked={sendBlocked}
                onTyping={handleTypingStart}
                textareaRef={textareaRef}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
