'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/chat-stream'

export function useChatStream() {
  const {
    sessions,
    currentSessionId,
    isLoading,
    addMessage,
    updateLastAssistantMessage,
    removeLastMessage,
    updateSessionTitle,
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
        isStreaming: true,
      })

      await streamChat({
        message: text,
        sessionId,
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

        onComplete: () => {
          updateLastAssistantMessage(sessionId, { isStreaming: false })
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          // 移除空占位消息，用 toast 显示错误
          removeLastMessage(sessionId)
          toast.error(err.message || '请求出错，请稍后重试')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [currentSessionId, isLoading, addMessage, updateLastAssistantMessage, removeLastMessage, updateSessionTitle, setLoading]
  )

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const sessionId = currentSessionId
    updateLastAssistantMessage(sessionId, { isStreaming: false })
    setLoading(false)
  }, [currentSessionId, updateLastAssistantMessage, setLoading])

  return { messages, isLoading, send, stop }
}
