'use client'

import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/store'
import { StreamMarkdown } from './stream-markdown'

interface Props {
  message: Message
  onToggleThinking: () => void
  onScrollNeeded?: () => void
}

export function MessageItem({ message, onToggleThinking, onScrollNeeded }: Props) {
  const isUser = message.role === 'user'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full gap-3 py-4', isUser && 'justify-end')}
    >
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-sm">
          AI
        </div>
      )}

      <div className={cn('flex max-w-[80%] flex-col gap-2', isUser && 'items-end')}>
        {/* 用户消息气泡 */}
        {isUser && (
          <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
            {message.content}
          </div>
        )}

        {/* AI 消息 */}
        {!isUser && (
          <>
            {/* 思考过程（可折叠） */}
            {message.thinking && (
              <div className="w-full rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
                <button
                  onClick={onToggleThinking}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Brain className="h-3.5 w-3.5 shrink-0 text-primary" />
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
                      <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap border-t border-border/40 pt-2">
                        {message.thinking}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* 等待首字节：弹跳加载点 */}
            {message.isStreaming && !message.content && !message.thinking && (
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
              <StreamMarkdown
                content={message.content}
                isStreaming={message.isStreaming}
                onScrollNeeded={onScrollNeeded}
              />
            )}
          </>
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-bold">
          我
        </div>
      )}
    </motion.div>
  )
}