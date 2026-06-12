'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { streamChat } from '@/lib/chat-stream'

const EMPTY_MESSAGES: never[] = []

export function useChatStream() {
  // useShallow：actions 是稳定引用，仅 currentAnchorId/lastActiveAnchorId/isLoading 变化才重渲，
  // mood/status/spotlight 等无关 state 变更不再触发本 hook 重跑。
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
    claimAnchor,
    bumpHotMemoryVersion,
    bumpFocusInput,
  } = useStore(
    useShallow((s) => ({
      currentAnchorId: s.currentAnchorId,
      lastActiveAnchorId: s.lastActiveAnchorId,
      isLoading: s.isLoading,
      addMessage: s.addMessage,
      updateLastAssistantMessage: s.updateLastAssistantMessage,
      removeLastMessage: s.removeLastMessage,
      updateAnchorTitle: s.updateAnchorTitle,
      touchAnchor: s.touchAnchor,
      appendToolCall: s.appendToolCall,
      updateLastRunningToolCall: s.updateLastRunningToolCall,
      markRunningToolCallsFailed: s.markRunningToolCallsFailed,
      setLoading: s.setLoading,
      setStatus: s.setStatus,
      setMood: s.setMood,
      claimAnchor: s.claimAnchor,
      bumpHotMemoryVersion: s.bumpHotMemoryVersion,
      bumpFocusInput: s.bumpFocusInput,
    }))
  )

  // selector 必须返回稳定引用——空 anchor 用模块级空数组兜底，避免无限循环。
  const rawMessages = useStore((s) => s.messages[s.currentAnchorId as string])
  const messages = useMemo(() => rawMessages ?? EMPTY_MESSAGES, [rawMessages])

  const ctrlRef = useRef<AbortController | null>(null)
  /** tail buffer：保留末尾 50 字符不 emit，防止跨 chunk 的 <!--mood:...--> 逃脱前端过滤 */
  const tailRef = useRef('')

  /**
   * showThinking 双重职责：控制前端思考块展示 + 透传后端选择模型档位
   * （true 走思考档、false 走快档；档位内 thinking 策略由后端 builder 期固定）。
   */
  const send = useCallback(
    async (text: string, showThinking: boolean) => {
      if (!text.trim() || isLoading) return

      let anchorId: string | null = currentAnchorId
      // prevAnchorId 只在切锚后的首条消息发送一次，发完即清空
      const prevAnchorId =
        lastActiveAnchorId && lastActiveAnchorId !== anchorId ? lastActiveAnchorId : null
      if (prevAnchorId) useStore.setState({ lastActiveAnchorId: null })

      ctrlRef.current = new AbortController()
      tailRef.current = ''
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
        isError: false,
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
        isError: false,
      })

      await streamChat({
        message: text,
        anchorId,
        prevAnchorId,
        thinking: showThinking,
        userId: useStore.getState().userId,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          if (!showThinking) return
          setStatus('thinking')
          updateLastAssistantMessage(anchorId, (last) => ({
            thinking: last.thinking + chunk,
            // 首次出现思考内容时自动展开
            thinkingExpanded: last.thinking ? last.thinkingExpanded : true,
          }))
        },

        onContent: (chunk) => {
          // tail buffer 防御：保留末尾 50 字符防止跨 chunk mood 标记逃脱
          tailRef.current += chunk
          const clean = tailRef.current.replace(/<!--\s*mood\s*:\s*[^>]*?-->/gi, '')
          const emitLen = Math.max(0, clean.length - 50)
          if (emitLen > 0) {
            const emit = clean.substring(0, emitLen)
            tailRef.current = clean.substring(emitLen)
            setStatus('writing')
            updateLastAssistantMessage(anchorId, (last) => ({ content: last.content + emit }))
          }
        },

        onToolCall: (payload) => {
          tailRef.current = '' // tool_call 边界清空
          setStatus('tooling')
          // ReAct 渲染：tool_call 触发时清空之前累积的 content（LLM preamble），
          // 让 tool 后的最终回复重新累积。避免 silent tool 前后双份回复。
          updateLastAssistantMessage(anchorId, { content: '' })
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
        },

        onAnchorCreated: (realId) => {
          claimAnchor(realId)
          anchorId = realId
        },

        onComplete: () => {
          // flush tail buffer 残留
          if (tailRef.current) {
            const clean = tailRef.current.replace(/<!--\s*mood\s*:\s*[^>]*?-->/gi, '')
            if (clean) {
              updateLastAssistantMessage(anchorId, (last) => ({ content: last.content + clean }))
            }
            tailRef.current = ''
          }
          markRunningToolCallsFailed(anchorId)
          const lastMsg = useStore.getState().messages[anchorId as string]?.at(-1)
          if (
            lastMsg &&
            lastMsg.role === 'assistant' &&
            !lastMsg.content &&
            !lastMsg.thinking &&
            lastMsg.toolCalls.length === 0
          ) {
            // 流正常结束但无内容——后端发生了静默错误（如 RST_STREAM error event 未送达）
            updateLastAssistantMessage(anchorId, { isError: true, isStreaming: false })
            setStatus('error')
          } else {
            updateLastAssistantMessage(anchorId, { isStreaming: false })
            setStatus('idle')
            // 回复真正完成——自动把焦点还给输入框（错误/静默错误分支不触发）
            bumpFocusInput()
          }
          touchAnchor(anchorId, Date.now())
          bumpHotMemoryVersion()
          setLoading(false)
          ctrlRef.current = null
        },

        onError: (err) => {
          tailRef.current = ''
          markRunningToolCallsFailed(anchorId)
          updateLastAssistantMessage(anchorId, { isError: true, isStreaming: false })
          toast.error(err.message || '请求出错，请稍后重试')
          setStatus('error')
          setLoading(false)
          ctrlRef.current = null
        },
      })
    },
    [
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
      bumpHotMemoryVersion,
      bumpFocusInput,
    ]
  )

  const stop = useCallback(() => {
    tailRef.current = ''
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const anchorId = currentAnchorId
    markRunningToolCallsFailed(anchorId)
    const lastMsg = useStore.getState().messages[anchorId as string]?.at(-1)
    if (
      lastMsg &&
      lastMsg.role === 'assistant' &&
      !lastMsg.content &&
      !lastMsg.thinking &&
      lastMsg.toolCalls.length === 0
    ) {
      removeLastMessage(anchorId)
    } else {
      updateLastAssistantMessage(anchorId, { isStreaming: false })
    }
    setStatus('idle')
    setLoading(false)
  }, [
    currentAnchorId,
    markRunningToolCallsFailed,
    updateLastAssistantMessage,
    removeLastMessage,
    setLoading,
    setStatus,
  ])

  return { messages, isLoading, send, stop }
}
