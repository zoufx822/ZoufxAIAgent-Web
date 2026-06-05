'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Message, ToolCall } from '@/lib/store'
import { StreamMarkdown } from '@/components/ui/stream-markdown'

function fmtToolDur(ms: number) {
  return ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(2) + 's'
}

interface Props {
  message: Message
  isNew?: boolean
  onToggleThinking: () => void
  onToggleToolCall?: (toolCallId: string) => void
  onScrollNeeded?: () => void
}

/**
 * 思考块折叠的唯一数据源：流式中不折叠，流式结束 1.5s 折叠成单行。
 * 初值 !streaming —— 历史消息（一挂载即非流式）默认折叠成单行，可点开；与原型唯一的差异，
 * 避免切锚加载时大段历史思考全摊开。open 由组件自治（collapsed 基线 + userOpen 覆盖）。
 */
function useAutoCollapse(streaming: boolean, delay = 1500) {
  const [collapsed, setCollapsed] = useState(!streaming)
  const [userOpen, setUserOpen] = useState(false)
  const prevStream = useRef(streaming)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    if (prevStream.current && !streaming) {
      t = setTimeout(() => setCollapsed(true), delay)
    }
    prevStream.current = streaming
    return () => { if (t) clearTimeout(t) }
  }, [streaming, delay])
  return { open: !collapsed || userOpen, collapsible: !streaming, toggle: () => setUserOpen((o) => !o) }
}

function ThinkCaret({ open }: { open: boolean }) {
  return (
    <span className="think-caret-i" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  )
}

/** Thinking 块——mono 字体 + 左侧细线 + char-in 渐入。 */
function ThinkingBlock({
  thinking,
  isStreaming,
}: {
  thinking: string
  isStreaming?: boolean
}) {
  // 折叠唯一数据源：流式中不折叠，流式结束 1.5s 折叠成单行（贴合原型 ThinkingA）
  const streaming = isStreaming ?? false
  const { open, collapsible, toggle } = useAutoCollapse(streaming)

  // 折叠单行视图（仅流式结束后的折叠态可达）
  if (collapsible && !open) {
    const peek = (thinking || '').replace(/\s+/g, ' ').trim()
    return (
      <div className="think-a collapsed">
        <div className="think-collapsed-row" onClick={toggle}>
          <span className="think-head-label">思考过程</span>
          <span className="think-peek">{peek.length > 54 ? peek.slice(0, 54) + '…' : peek}</span>
          <ThinkCaret open={false} />
        </div>
      </div>
    )
  }

  return (
    <div className="think-a">
      <div
        className={`think-head${collapsible ? ' clickable' : ''}`}
        onClick={collapsible ? toggle : undefined}
      >
        {streaming && <span className="think-head-dot" />}
        <span>{streaming ? '思考中' : '思考过程'}</span>
        {collapsible && <ThinkCaret open={true} />}
      </div>
      {thinking}
    </div>
  )
}

/**
 * Tool call 卡片（贴合原型 Zoufx AI.html）：
 * - Header: tool-dot（running 脉冲）+ tool-name + 右簇 meta（中文状态 ｜ 耗时）+ caret
 * - running 实时计时，完成后定格；完成 0.4s 未展开 → 收扁（.flat）
 * - query/result 进可展开 body
 */
function ToolCallCard({ toolCall, onToggle }: { toolCall: ToolCall; onToggle?: () => void }) {
  const { status, tool, toolDisplay, query, resultPreview, expanded } = toolCall
  const canExpand = status === 'completed' && !!resultPreview

  // running 计时跳动：运行时实时累加，结束定格为最终耗时
  const [elapsed, setElapsed] = useState(0)
  const [finalDur, setFinalDur] = useState<string | undefined>(undefined)
  const t0Ref = useRef<number | null>(null)
  useEffect(() => {
    if (status !== 'running') return
    t0Ref.current = performance.now()
    setFinalDur(undefined)
    setElapsed(0)
    const iv = setInterval(() => setElapsed(performance.now() - t0Ref.current!), 70)
    return () => {
      clearInterval(iv)
      // 清理时定格最终耗时（不受 interval 粒度影响）
      if (t0Ref.current != null) setFinalDur(fmtToolDur(performance.now() - t0Ref.current))
      t0Ref.current = null
    }
  }, [status])
  const durText = status === 'running' ? fmtToolDur(elapsed) : finalDur

  // 完成 0.4s 后若未展开 → 收扁
  const [flat, setFlat] = useState(false)
  useEffect(() => {
    if ((status === 'completed' || status === 'failed') && !expanded) {
      const t = setTimeout(() => setFlat(true), 400)
      return () => clearTimeout(t)
    }
    setFlat(false)
  }, [status, expanded])

  const statusText = status === 'running' ? '运行中' : status === 'failed' ? '出错' : '完成'
  const dotClass = status === 'running' ? 'running' : status === 'failed' ? 'error' : 'done'
  const open = canExpand && expanded

  return (
    <div className={`tool${flat ? ' flat' : ''}`}>
      <div
        className={`tool-head${open ? '' : ' closed'}`}
        onClick={canExpand ? onToggle : undefined}
        style={canExpand ? undefined : { cursor: 'default' }}
      >
        <span className={`tool-dot ${dotClass}`} />
        <span className="tool-name">{toolDisplay || tool}</span>
        <span className="tool-meta">
          <span>{statusText}</span>
          {durText && (
            <>
              <span className="sep" />
              <span className="dur">{durText}</span>
            </>
          )}
        </span>
        {canExpand && (
          <span className={`tool-caret${expanded ? ' open' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        )}
      </div>

      {open && (
        <div className="tool-body">
          {query && (
            <>
              <span className="lbl">parameters</span>
              <div className="v">{query}</div>
            </>
          )}
          {resultPreview && (
            <>
              <span className="lbl">result</span>
              <div className="v">{resultPreview}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MessageItemBase({
  message,
  isNew = false,
  onToggleToolCall,
  onScrollNeeded,
}: Props) {
  const isUser = message.role === 'user'

  // 工具卡片数量或状态变化时触发滚动
  const toolSignature = message.toolCalls.map((tc) => `${tc.id}:${tc.status}`).join('|')
  useEffect(() => {
    if (toolSignature) onScrollNeeded?.()
  }, [toolSignature, onScrollNeeded])

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 6 } : { opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={isNew ? { duration: 0.18, ease: 'easeOut' } : { duration: 0 }}
      className={cn('flex w-full', isUser && 'justify-end')}
      style={{ marginBottom: '26px' }}
    >
      <div
        className={cn('flex flex-col gap-2.5 min-w-0', isUser ? 'max-w-[72%] items-end' : 'w-full')}
      >
        {/* 用户消息气泡 */}
        {isUser && (
          <div
            className="rounded-[18px] rounded-br-[5px] px-4 py-2.5 whitespace-pre-wrap"
            style={{
              backgroundColor: 'var(--accent-s)',
              borderColor: 'var(--accent-r)',
              borderWidth: '1px',
              color: 'var(--t1)',
              fontSize: '14.5px',
              lineHeight: 1.55,
              letterSpacing: '-0.005em',
            }}
          >
            {message.content}
          </div>
        )}

        {/* AI 消息 */}
        {!isUser && (
          <>
            {message.isError ? (
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--t3)', letterSpacing: '0.04em' }}
              >
                发送失败，请重试
              </span>
            ) : (
              <>
                {/* 思考过程 */}
                {message.thinking && (
                  <ThinkingBlock
                    thinking={message.thinking}
                    isStreaming={message.isStreaming}
                  />
                )}

                {/* 工具调用卡片 */}
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} onToggle={() => onToggleToolCall?.(tc.id)} />
                ))}

                {/* 等待首字节：弹跳加载点 */}
                {message.isStreaming &&
                  !message.content &&
                  !message.thinking &&
                  message.toolCalls.every((tc) => tc.status !== 'running') && (
                    <div className="flex items-center gap-1.5 py-2">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--t2)',
                            animation: `pulse-dot 1.2s ease ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  )}

                {/* 消息正文 */}
                {message.content && (
                  <StreamMarkdown
                    content={message.content}
                    isStreaming={message.isStreaming}
                    onScrollNeeded={onScrollNeeded}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

// memo：回调由 ChatWindow 以 useCallback 稳定，只有 message 引用变化的那一条会重渲，
// 流式期间其余历史消息不再被无谓重渲（含其内部 StreamMarkdown effect）。
export const MessageItem = memo(MessageItemBase)
