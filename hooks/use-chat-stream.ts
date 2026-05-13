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
          appendToolCall(anchorId, {
            id: crypto.randomUUID(),
            tool: payload.tool,
            query: payload.query,
            status: 'running',
            expanded: false,
          })
        },

        onToolResult: (payload) => {
          updateLastRunningToolCall(anchorId, {
            status: 'completed',
            count: payload.count,
            resultPreview: payload.resultPreview,
          })
        },

        onComplete: () => {
          markRunningToolCallsFailed(anchorId)
          updateLastAssistantMessage(anchorId, { isStreaming: false })
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          markRunningToolCallsFailed(anchorId)
          // 移除空占位消息，用 toast 显示错误
          removeLastMessage(anchorId)
          toast.error(err.message || '请求出错，请稍后重试')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [userId, currentAnchorId, isLoading, addMessage, updateLastAssistantMessage, removeLastMessage, updateAnchorTitle, appendToolCall, updateLastRunningToolCall, markRunningToolCallsFailed, setLoading]
  )

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const anchorId = currentAnchorId
    markRunningToolCallsFailed(anchorId)
    updateLastAssistantMessage(anchorId, { isStreaming: false })
    setLoading(false)
  }, [currentAnchorId, markRunningToolCallsFailed, updateLastAssistantMessage, setLoading])

  return { messages, isLoading, send, stop }
}
