'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message, ToolCall } from '@/lib/store'
import { StreamMarkdown } from './stream-markdown'

interface Props {
  message: Message
  onToggleThinking: () => void
  onToggleToolCall?: (toolCallId: string) => void
  onScrollNeeded?: () => void
}

function ToolCallCard({
  toolCall,
  onToggle,
}: {
  toolCall: ToolCall
  onToggle?: () => void
}) {
  const { status, tool, query, count, resultPreview, expanded } = toolCall
  const displayTool = tool === 'search_web' ? '网络检索' : tool
  const canExpand = status === 'completed' && !!resultPreview

  if (status === 'running') {
    return (
      <div className="surface-line flex w-full items-center gap-2 rounded-[1.25rem] bg-primary/10 px-4 py-3 text-xs text-primary">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} />
        <span className="font-medium">{displayTool}</span>
        <span className="text-primary/70">·</span>
        <span className="truncate text-primary/80">正在搜索：{query || '…'}</span>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="surface-line flex w-full items-center gap-2 rounded-[1.25rem] bg-destructive/10 px-4 py-3 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span className="font-medium">{displayTool}</span>
        <span className="text-destructive/70">·</span>
        <span className="truncate">搜索被中断：{query || '（无关键词）'}</span>
      </div>
    )
  }

  return (
    <div className="surface-line w-full overflow-hidden rounded-[1.25rem] bg-card">
      <button
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-3 text-xs text-muted-foreground transition-colors',
          canExpand && 'hover:text-foreground'
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
        <span className="font-medium text-foreground/85">{displayTool}</span>
        <span className="text-muted-foreground/70">·</span>
        <span className="truncate">
          已检索 {count ?? 0} 条{query && `：${query}`}
        </span>
        {canExpand && (
          <span className="ml-auto">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {canExpand && expanded && (
          <motion.div
            key="tool-result-preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50 px-4 pb-4 pt-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {resultPreview}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MessageItem({ message, onToggleThinking, onToggleToolCall, onScrollNeeded }: Props) {
  const isUser = message.role === 'user'

  // 工具卡片数量或状态变化时触发滚动
  const toolSignature = message.toolCalls.map((tc) => `${tc.id}:${tc.status}`).join('|')
  useEffect(() => {
    if (toolSignature) onScrollNeeded?.()
  }, [toolSignature, onScrollNeeded])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full gap-3 py-5', isUser && 'justify-end')}
    >
      {!isUser && (
        <div className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
          AI
        </div>
      )}

      <div className={cn('flex max-w-[88%] flex-col gap-2.5', isUser && 'items-end')}>
        {/* 用户消息气泡 */}
        {isUser && (
          <div className="rounded-[1.6rem] rounded-br-md bg-foreground px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-background shadow-[0_12px_28px_oklch(0.25_0.01_256_/_0.14)]">
            {message.content}
          </div>
        )}

        {/* AI 消息 */}
        {!isUser && (
          <>
            {/* 思考过程（可折叠） */}
            {message.thinking && (
              <div className="surface-line w-full overflow-hidden rounded-[1.25rem] bg-card">
                <button
                  onClick={onToggleThinking}
                  className="flex w-full items-center gap-2 px-4 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
                  <span className="font-medium">思考过程</span>
                  <span className="ml-auto text-muted-foreground/70">
                    {message.thinking.length} 字
                  </span>
                  {message.thinkingExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {message.thinkingExpanded && (
                    <motion.div
                      key="thinking-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/50 px-4 pb-4 pt-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                        {message.thinking}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
            {message.isStreaming && !message.content && !message.thinking && message.toolCalls.length === 0 && (
              <div className="flex items-center gap-1.5 py-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse"
                    style={{ animationDelay: `${i * 0.2}s`, animationDuration: '1.2s' }}
                  />
                ))}
              </div>
            )}

            {/* 消息正文 */}
            {message.content && (
              <div className="px-5 py-4 md:px-6">
                <StreamMarkdown
                  content={message.content}
                  isStreaming={message.isStreaming}
                  onScrollNeeded={onScrollNeeded}
                />
              </div>
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
          我
        </div>
      )}
    </motion.div>
  )
}
