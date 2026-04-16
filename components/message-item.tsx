'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ChevronDown, ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/store'

// 打字机速度：25ms/字符 ≈ 40 字符/秒
const TW_INTERVAL = 25
const TW_CHARS = 1

interface Props {
  message: Message
  onToggleThinking: () => void
  onScrollNeeded?: () => void
}

export function MessageItem({ message, onToggleThinking, onScrollNeeded }: Props) {
  const isUser = message.role === 'user'

  // Interval 读取的 ref（每次渲染自动同步最新值）
  const fullContentRef = useRef(message.content)
  const isStreamingRef = useRef(message.isStreaming)
  const onScrollNeededRef = useRef(onScrollNeeded)
  fullContentRef.current = message.content
  isStreamingRef.current = message.isStreaming
  onScrollNeededRef.current = onScrollNeeded

  // 打字机位置（字符数）
  const posRef = useRef(message.isStreaming ? 0 : message.content.length)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 当前显示的文字（打字机输出）
  const [displayed, setDisplayed] = useState(
    message.isStreaming ? '' : message.content
  )
  // 动画是否结束（结束后才渲染 Markdown）
  const [animationDone, setAnimationDone] = useState(!message.isStreaming)

  useEffect(() => {
    // 非流式消息（历史记录）：跳过打字机
    if (!message.isStreaming && posRef.current >= message.content.length) return

    timerRef.current = setInterval(() => {
      if (posRef.current >= fullContentRef.current.length) {
        // 已显示完所有已收到的内容
        if (!isStreamingRef.current) {
          // 流结束且打字机追上 → 完成
          clearInterval(timerRef.current!)
          timerRef.current = null
          setDisplayed(fullContentRef.current)
          setAnimationDone(true)
        }
        // 流仍在进行中，等待更多内容
        return
      }
      posRef.current = Math.min(posRef.current + TW_CHARS, fullContentRef.current.length)
      setDisplayed(fullContentRef.current.slice(0, posRef.current))
      onScrollNeededRef.current?.()
    }, TW_INTERVAL)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 仅挂载时启动，interval 通过 ref 读取最新值

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full gap-3 py-4', isUser && 'justify-end')}
    >
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
          AI
        </div>
      )}

      <div className={cn('flex max-w-[80%] flex-col gap-2', isUser && 'items-end')}>
        {/* 用户消息气泡 */}
        {isUser && (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap">
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
                  <Brain className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                  <span className="font-medium">思考过程</span>
                  <span className="ml-auto text-muted-foreground/60">
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
            {message.isStreaming && !displayed && !message.thinking && (
              <div className="flex items-center gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-2 w-2 rounded-full bg-primary/40 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}

            {/* 消息正文 */}
            {displayed && (
              <div
                className={cn(
                  'text-sm leading-relaxed rounded-lg',
                  !animationDone && 'streaming-cursor'
                )}
              >
                {animationDone ? (
                  // 流结束后渲染完整 Markdown
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-lg prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-code:before:content-none prose-code:after:content-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {displayed}
                    </ReactMarkdown>
                  </div>
                ) : (
                  // 打字机阶段：纯文本，保留换行
                  <span className="whitespace-pre-wrap">{displayed}</span>
                )}
              </div>
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
