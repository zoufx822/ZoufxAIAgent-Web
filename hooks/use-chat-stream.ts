'use client'

import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { useCapabilityStore } from '@/lib/capability'
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
        thinking: sendThinking,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          // 按钮 OFF 时丢弃 thinking chunk（后端仍可能推送，纯前端过滤）
          if (!showThinking) return
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
          // ReAct 渲染：tool_call 触发时清空之前累积的 content（LLM preamble），
          // 让 tool 后的最终回复重新累积。避免 LLM 在 silent tool（如 update_user_impression）
          // 前后重复输出相同内容时，前端串接出"双份回复"。
          useStore.setState((state) => ({
            anchors: state.anchors.map((a) => {
              if (a.id !== anchorId) return a
              const msgs = [...a.messages]
              const last = msgs[msgs.length - 1]
              if (!last || last.role !== 'assistant' || !last.content) return a
              msgs[msgs.length - 1] = { ...last, content: '' }
              return { ...a, messages: msgs }
            }),
          }))
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
          // 与 stop 对称：流完成时若 assistant 占位完全空（无 content / thinking / toolCalls），
          // 删除占位避免留下"仅头像无内容"的幽灵气泡（后端只发 mood/metadata 就结束的边缘场景）。
          const lastMsg = useStore.getState().anchors.find((a) => a.id === anchorId)?.messages.at(-1)
          if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content && !lastMsg.thinking && lastMsg.toolCalls.length === 0) {
            removeLastMessage(anchorId)
          } else {
            updateLastAssistantMessage(anchorId, { isStreaming: false })
          }
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
    // 首字节前停止：若 assistant 占位完全空（无 content / thinking / toolCalls），
    // 删除占位避免留下"仅头像无内容"的幽灵气泡
    const lastMsg = useStore.getState().anchors.find((a) => a.id === anchorId)?.messages.at(-1)
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
