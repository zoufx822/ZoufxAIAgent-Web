'use client'

import {useEffect} from 'react'
import {AnimatePresence, motion} from 'motion/react'
import {ChevronDown, ChevronRight} from 'lucide-react'
import {cn} from '@/lib/utils'
import type {Message, ToolCall} from '@/lib/store'
import {StreamMarkdown} from '@/components/ui/stream-markdown'

interface Props {
  message: Message
  isNew?: boolean
  onToggleThinking: () => void
  onToggleToolCall?: (toolCallId: string) => void
  onScrollNeeded?: () => void
}

/**
 * Thinking 块：mono 字体 + 左侧 1px 细线 + 整体 char-in 渐入。
 * 视觉气质：像代码块的注释，让人停下来阅读。
 */
function ThinkingBlock({
  thinking,
  expanded,
  onToggle,
}: {
  thinking: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{
        borderLeft: '1px solid var(--border)',
        paddingLeft: 14,
      }}
    >
      <button
        onClick={onToggle}
        className="mono flex w-full items-center gap-2 transition-colors"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
          cursor: 'pointer',
          marginBottom: 6,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)' }}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="h-3 w-3" strokeWidth={1.8} />
        )}
        <span>thinking</span>
        <span style={{color: 'var(--t3)', opacity: 0.6}}>·</span>
        <span style={{fontFeatureSettings: '"tnum"'}}>{thinking.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="thinking-body"
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.2, ease: 'easeInOut'}}
            style={{overflow: 'hidden'}}
          >
            <div
              className="mono think-char whitespace-pre-wrap"
              style={{
                fontSize: 12.5,
                lineHeight: 1.7,
                color: 'var(--t2)',
                letterSpacing: '0.005em',
                paddingTop: 4,
              }}
            >
              {thinking}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Tool call 卡片：精密仪器感。
 * - Header: mono 字体 [tool] · status · meta
 * - Running 时底部 1px tool-runbar 横向脉动
 * - Completed 状态可折叠 resultPreview
 */
function ToolCallCard({
  toolCall,
  onToggle,
}: {
  toolCall: ToolCall
  onToggle?: () => void
}) {
  const {status, tool, query, count, resultPreview, expanded} = toolCall
  const displayTool = tool === 'search_web' ? 'search_web' : tool
  const canExpand = status === 'completed' && !!resultPreview

  const statusLabel =
    status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'done'
  const statusColor =
    status === 'running' ? 'var(--t1)' : status === 'failed' ? '#dc2626' : 'var(--t2)'

  const meta = (() => {
    if (status === 'running') return query ? `query=${query}` : 'pending…'
    if (status === 'failed') return query ? `query=${query} · aborted` : 'aborted'
    return `${count ?? 0} results${query ? ` · query=${query}` : ''}`
  })()

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        className="mono flex w-full items-center"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '8px 12px',
          gap: 10,
          fontSize: 11,
          letterSpacing: '0.02em',
          color: 'var(--t2)',
          cursor: canExpand ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            ...(status === 'running' ? {animation: 'pulse-dot 1.4s ease infinite'} : {}),
          }}
        />
        <span style={{color: 'var(--t1)', fontWeight: 500}}>{displayTool}</span>
        <span style={{color: 'var(--t3)'}}>·</span>
        <span style={{color: statusColor}}>{statusLabel}</span>
        <span style={{color: 'var(--t3)'}}>·</span>
        <span style={{flex: 1, color: 'var(--t3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
          {meta}
        </span>
        {canExpand && (
          <span style={{color: 'var(--t3)', flexShrink: 0}}>
            {expanded ? <ChevronDown className="h-3 w-3" strokeWidth={1.8} /> : <ChevronRight className="h-3 w-3" strokeWidth={1.8} />}
          </span>
        )}
      </button>

      {/* Running 时的脉动 runbar */}
      {status === 'running' && <div className="tool-runbar" />}

      {/* 完成态可折叠 result preview */}
      <AnimatePresence initial={false}>
        {canExpand && expanded && (
          <motion.div
            key="tool-result"
            initial={{height: 0, opacity: 0}}
            animate={{height: 'auto', opacity: 1}}
            exit={{height: 0, opacity: 0}}
            transition={{duration: 0.2, ease: 'easeInOut'}}
            style={{overflow: 'hidden'}}
          >
            <div
              className="mono whitespace-pre-wrap"
              style={{
                borderTop: '1px solid var(--border)',
                padding: '10px 12px',
                fontSize: 11.5,
                lineHeight: 1.65,
                color: 'var(--t2)',
              }}
            >
              {resultPreview}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MessageItem({message, isNew = false, onToggleThinking, onToggleToolCall, onScrollNeeded}: Props) {
  const isUser = message.role === 'user'

  // 工具卡片数量或状态变化时触发滚动
  const toolSignature = message.toolCalls.map((tc) => `${tc.id}:${tc.status}`).join('|')
  useEffect(() => {
    if (toolSignature) onScrollNeeded?.()
  }, [toolSignature, onScrollNeeded])

  return (
    <motion.div
      initial={isNew ? {opacity: 0, y: 6} : {opacity: 1, y: 0}}
      animate={{opacity: 1, y: 0}}
      transition={isNew ? {duration: 0.18, ease: 'easeOut'} : {duration: 0}}
      className={cn('flex w-full gap-3', isUser && 'justify-end')}
      style={{marginBottom: '26px'}}
    >
      {!isUser && (
        <div
          className="mono mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg flex-shrink-0"
          style={{
            backgroundColor: 'var(--t1)',
            color: 'var(--bg)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Z
        </div>
      )}

      <div className={cn('flex max-w-[72%] flex-col gap-2.5', isUser && 'items-end')}>
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
            {/* 思考过程 */}
            {message.thinking && (
              <ThinkingBlock
                thinking={message.thinking}
                expanded={message.thinkingExpanded}
                onToggle={onToggleThinking}
              />
            )}

            {/* 工具调用卡片 */}
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                onToggle={() => onToggleToolCall?.(tc.id)}
              />
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
      </div>
    </motion.div>
  )
}
