'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/chat-stream'

export function useChatStream() {
  const {
    userId,
    sessions,
    currentSessionId,
    isLoading,
    addMessage,
    updateLastAssistantMessage,
    removeLastMessage,
    updateSessionTitle,
    appendToolCall,
    updateLastRunningToolCall,
    markRunningToolCallsFailed,
    setLoading,
  } = useStore()

  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const messages = currentSession?.messages ?? []

  const ctrlRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (text: string, thinking: boolean) => {
      if (!text.trim() || isLoading) return

      const sessionId = currentSessionId
      ctrlRef.current = new AbortController()
      setLoading(true)

      // 用户消息
      addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        isStreaming: false,
      })

      updateSessionTitle(sessionId, text)

      // AI 占位消息
      addMessage(sessionId, {
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
            sessions: state.sessions.map((s) => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (!last || last.role !== 'assistant') return s
              const isFirst = !last.thinking
              msgs[msgs.length - 1] = {
                ...last,
                thinking: last.thinking + chunk,
                thinkingExpanded: isFirst ? true : last.thinkingExpanded,
              }
              return { ...s, messages: msgs }
            }),
          }))
        },

        onContent: (chunk) => {
          useStore.setState((state) => ({
            sessions: state.sessions.map((s) => {
              if (s.id !== sessionId) return s
              const msgs = [...s.messages]
              const last = msgs[msgs.length - 1]
              if (!last || last.role !== 'assistant') return s
              msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
              return { ...s, messages: msgs }
            }),
          }))
        },

        onToolCall: (payload) => {
          appendToolCall(sessionId, {
            id: crypto.randomUUID(),
            tool: payload.tool,
            query: payload.query,
            status: 'running',
            expanded: false,
          })
        },

        onToolResult: (payload) => {
          updateLastRunningToolCall(sessionId, {
            status: 'completed',
            count: payload.count,
            resultPreview: payload.resultPreview,
          })
        },

        onComplete: () => {
          markRunningToolCallsFailed(sessionId)
          updateLastAssistantMessage(sessionId, { isStreaming: false })
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          markRunningToolCallsFailed(sessionId)
          // 移除空占位消息，用 toast 显示错误
          removeLastMessage(sessionId)
          toast.error(err.message || '请求出错，请稍后重试')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [userId, currentSessionId, isLoading, addMessage, updateLastAssistantMessage, removeLastMessage, updateSessionTitle, appendToolCall, updateLastRunningToolCall, markRunningToolCallsFailed, setLoading]
  )

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const sessionId = currentSessionId
    markRunningToolCallsFailed(sessionId)
    updateLastAssistantMessage(sessionId, { isStreaming: false })
    setLoading(false)
  }, [currentSessionId, markRunningToolCallsFailed, updateLastAssistantMessage, setLoading])

  return { messages, isLoading, send, stop }
}
