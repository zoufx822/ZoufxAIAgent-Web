'use client'

import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { useCapabilityStore } from '@/lib/capability'
import { streamChat } from '@/lib/chat-stream'

const EMPTY_MESSAGES: never[] = []

export function useChatStream() {
  const {
    currentAnchorId,
    lastActiveAnchorId,
    isLoading,
    addMessage,
    updateLastAssistantMessage,
    removeLastMessage,
    updateAnchorTitle,
    touchAnchor,
    appendToolCall,
    updateLastRunningToolCall,
    markRunningToolCallsFailed,
    setLoading,
    setStatus,
    setMood,
  } = useStore()

  // selector 必须返回稳定引用——空 anchor 用模块级空数组兜底，避免无限循环。
  const rawMessages = useStore((s) => s.messages[s.currentAnchorId])
  const messages = useMemo(() => rawMessages ?? EMPTY_MESSAGES, [rawMessages])

  const ctrlRef = useRef<AbortController | null>(null)

  /**
   * 第二参数 showThinking 控制前端是否展示思考块。
   * 是否真让 LLM 思考由 capability.thinkingToggle 决定——支持时透传按钮状态给后端；
   * 不支持时（如 deepseek-v4、降级现状的 minimax）始终传 false，LLM 行为不受按钮影响。
   */
  const send = useCallback(
    async (text: string, showThinking: boolean) => {
      if (!text.trim() || isLoading) return

      const capabilities = useCapabilityStore.getState().capabilities
      const sendThinking = capabilities?.thinkingToggle ? showThinking : false

      const anchorId = currentAnchorId
      // prevAnchorId 只在切锚后的首条消息发送一次，发完即清空
      const prevAnchorId = lastActiveAnchorId && lastActiveAnchorId !== anchorId ? lastActiveAnchorId : null
      if (prevAnchorId) useStore.setState({ lastActiveAnchorId: null })

      ctrlRef.current = new AbortController()
      setLoading(true)
      setStatus('thinking')

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
      touchAnchor(anchorId, Date.now())

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
        anchorId,
        prevAnchorId,
        thinking: sendThinking,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          if (!showThinking) return
          setStatus('thinking')
          useStore.setState((state) => {
            const msgs = [...(state.messages[anchorId] ?? [])]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return state
            const isFirst = !last.thinking
            msgs[msgs.length - 1] = {
              ...last,
              thinking: last.thinking + chunk,
              thinkingExpanded: isFirst ? true : last.thinkingExpanded,
            }
            return { messages: { ...state.messages, [anchorId]: msgs } }
          })
        },

        onContent: (chunk) => {
          setStatus('writing')
          useStore.setState((state) => {
            const msgs = [...(state.messages[anchorId] ?? [])]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return state
            msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
            return { messages: { ...state.messages, [anchorId]: msgs } }
          })
        },

        onToolCall: (payload) => {
          setStatus('tooling')
          // ReAct 渲染：tool_call 触发时清空之前累积的 content（LLM preamble），
          // 让 tool 后的最终回复重新累积。避免 silent tool 前后双份回复。
          useStore.setState((state) => {
            const msgs = [...(state.messages[anchorId] ?? [])]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant' || !last.content) return state
            msgs[msgs.length - 1] = { ...last, content: '' }
            return { messages: { ...state.messages, [anchorId]: msgs } }
          })
          appendToolCall(anchorId, {
            id: crypto.randomUUID(),
            tool: payload.tool,
            toolDisplay: payload.toolDisplay,
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

        onMood: (payload) => {
          setMood(payload.keyword)
          useStore.getState().triggerSpotlight()
        },

        onComplete: () => {
          markRunningToolCallsFailed(anchorId)
          const lastMsg = useStore.getState().messages[anchorId]?.at(-1)
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.thinking && lastMsg.toolCalls.length === 0) {
            removeLastMessage(anchorId)
          } else {
            updateLastAssistantMessage(anchorId, { isStreaming: false })
          }
          touchAnchor(anchorId, Date.now())
          setStatus('idle')
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          markRunningToolCallsFailed(anchorId)
          removeLastMessage(anchorId)
          toast.error(err.message || '请求出错，请稍后重试')
          setStatus('error')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [currentAnchorId, lastActiveAnchorId, isLoading, addMessage, updateLastAssistantMessage, removeLastMessage, updateAnchorTitle, touchAnchor, appendToolCall, updateLastRunningToolCall, markRunningToolCallsFailed, setLoading, setStatus, setMood]
  )

  const stop = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const anchorId = currentAnchorId
    markRunningToolCallsFailed(anchorId)
    const lastMsg = useStore.getState().messages[anchorId]?.at(-1)
    if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.thinking && lastMsg.toolCalls.length === 0) {
      removeLastMessage(anchorId)
    } else {
      updateLastAssistantMessage(anchorId, { isStreaming: false })
    }
    setStatus('idle')
    setLoading(false)
  }, [currentAnchorId, markRunningToolCallsFailed, updateLastAssistantMessage, removeLastMessage, setLoading, setStatus])

  return { messages, isLoading, send, stop }
}
