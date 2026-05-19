'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/chat-stream'

export function useChatStream() {
  const {
    userId,
    anchors,
    currentAnchorId,
    isLoading,
    addMessage,
    updateLastAssistantMessage,
    removeLastMessage,
    updateAnchorTitle,
    appendToolCall,
    updateLastRunningToolCall,
    markRunningToolCallsFailed,
    setLoading,
    setStatus,
    setMood,
  } = useStore()

  const currentAnchor = anchors.find((a) => a.id === currentAnchorId)
  const messages = currentAnchor?.messages ?? []

  const ctrlRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (text: string, thinking: boolean) => {
      if (!text.trim() || isLoading) return

      const anchorId = currentAnchorId
      ctrlRef.current = new AbortController()
      setLoading(true)
      // 初始 status：发出请求等首字节，先点 thinking（thinking 事件来时仍 thinking；
      // 跳过 thinking 直接 content 时下面 onContent 会切到 writing）
      setStatus('thinking')

      // 用户消息
      addMessage(anchorId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        isStreaming: false,
      })

      updateAnchorTitle(anchorId, text)

      // AI 占位消息
      addMessage(anchorId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        isStreaming: true,
      })

      await streamChat({
        message: text,
        userId,
        thinking,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          setStatus('thinking')
          useStore.setState((state) => ({
            anchors: state.anchors.map((a) => {
              if (a.id !== anchorId) return a
              const msgs = [...a.messages]
              const last = msgs[msgs.length - 1]
              if (!last || last.role !== 'assistant') return a
              const isFirst = !last.thinking
              msgs[msgs.length - 1] = {
                ...last,
                thinking: last.thinking + chunk,
                thinkingExpanded: isFirst ? true : last.thinkingExpanded,
              }
              return { ...a, messages: msgs }
            }),
          }))
        },

        onContent: (chunk) => {
          setStatus('writing')
          useStore.setState((state) => ({
            anchors: state.anchors.map((a) => {
              if (a.id !== anchorId) return a
              const msgs = [...a.messages]
              const last = msgs[msgs.length - 1]
              if (!last || last.role !== 'assistant') return a
              msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
              return { ...a, messages: msgs }
            }),
          }))
        },

        onToolCall: (payload) => {
          setStatus('tooling')
          appendToolCall(anchorId, {
            id: crypto.randomUUID(),
            tool: payload.tool,
            query: payload.query,
            status: 'running',
            expanded: false,
          })
        },

        onToolResult: (payload) => {
          // 工具完成后不主动改 status：保持 tooling 等下一个 tool_call 或 content 自然覆盖
          updateLastRunningToolCall(anchorId, {
            status: 'completed',
            count: payload.count,
            resultPreview: payload.resultPreview,
          })
        },

        onMood: (payload) => {
          // mood 不影响 status；只写 currentMood + lastMoodAt
          setMood(payload.keyword)
        },

        onComplete: () => {
          markRunningToolCallsFailed(anchorId)
          updateLastAssistantMessage(anchorId, { isStreaming: false })
          setStatus('idle')
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          markRunningToolCallsFailed(anchorId)
          // 移除空占位消息，用 toast 显示错误
          removeLastMessage(anchorId)
          toast.error(err.message || '请求出错，请稍后重试')
          setStatus('error')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [userId, currentAnchorId, isLoading, addMessage, updateLastAssistantMessage, removeLastMessage, updateAnchorTitle, appendToolCall, updateLastRunningToolCall, markRunningToolCallsFailed, setLoading, setStatus, setMood]
  )

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const anchorId = currentAnchorId
    markRunningToolCallsFailed(anchorId)
    updateLastAssistantMessage(anchorId, { isStreaming: false })
    setStatus('idle')
    setLoading(false)
  }, [currentAnchorId, markRunningToolCallsFailed, updateLastAssistantMessage, setLoading, setStatus])

  return { messages, isLoading, send, stop }
}
