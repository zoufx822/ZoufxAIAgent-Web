'use client'

import { useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useStore, type Message } from '@/lib/store'
import { streamChat, type ThinkingRequest } from '@/lib/chat-stream'

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
    updateAssistantMessageById,
    removeLastMessage,
    updateAnchorTitle,
    touchAnchor,
    appendToolCall,
    updateLastRunningToolCall,
    markRunningToolCallsFailed,
    resetAssistantMessageForRetry,
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
      updateAssistantMessageById: s.updateAssistantMessageById,
      removeLastMessage: s.removeLastMessage,
      updateAnchorTitle: s.updateAnchorTitle,
      touchAnchor: s.touchAnchor,
      appendToolCall: s.appendToolCall,
      updateLastRunningToolCall: s.updateLastRunningToolCall,
      markRunningToolCallsFailed: s.markRunningToolCallsFailed,
      resetAssistantMessageForRetry: s.resetAssistantMessageForRetry,
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
  /** 当前正在流式写入的助手消息 id——重生时目标可能在中段，stop 据此精确寻址而非取末尾 */
  const streamingMsgIdRef = useRef<string | null>(null)

  /**
   * thinking 配置（{enabled, effort}）双重职责：控制前端思考块展示 + 透传后端选择模型档位/深度。
   * enabled=true 走思考档、false 走快档；effort 仅在支持 effort 的 profile + enabled 时生效。
   */
  const send = useCallback(
    async (text: string, thinking: ThinkingRequest) => {
      if (!text.trim() || isLoading) return

      let anchorId: string | null = currentAnchorId
      // prevAnchorId 只在切锚后的首条消息发送一次，发完即清空
      const prevAnchorId =
        lastActiveAnchorId && lastActiveAnchorId !== anchorId ? lastActiveAnchorId : null
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
        isError: false,
        createdAt: Date.now(),
      })

      updateAnchorTitle(anchorId, text)
      touchAnchor(anchorId, Date.now())

      const assistantId = crypto.randomUUID()
      streamingMsgIdRef.current = assistantId
      addMessage(anchorId, {
        id: assistantId,
        role: 'assistant',
        content: '',
        thinking: '',
        thinkingExpanded: false,
        toolCalls: [],
        isStreaming: true,
        isError: false,
        createdAt: Date.now(),
      })

      await streamChat({
        message: text,
        anchorId,
        prevAnchorId,
        thinking,
        userId: useStore.getState().userId,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          if (!thinking.enabled) return
          setStatus('thinking')
          updateLastAssistantMessage(anchorId, (last) => ({
            thinking: last.thinking + chunk,
            // 首次出现思考内容时自动展开
            thinkingExpanded: last.thinking ? last.thinkingExpanded : true,
          }))
        },

        onContent: (chunk) => {
          // 情绪标记后端已在 content 流里剥离，这里直接追加即可
          setStatus('writing')
          updateLastAssistantMessage(anchorId, (last) => ({ content: last.content + chunk }))
        },

        onToolCall: (payload) => {
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
          streamingMsgIdRef.current = null
        },

        onError: (err) => {
          markRunningToolCallsFailed(anchorId)
          updateLastAssistantMessage(anchorId, { isError: true, isStreaming: false })
          toast.error(err.message || '请求出错，请稍后重试')
          setStatus('error')
          setLoading(false)
          ctrlRef.current = null
          streamingMsgIdRef.current = null
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
    ctrlRef.current?.abort()
    ctrlRef.current = null
    const anchorId = currentAnchorId
    const msgId = streamingMsgIdRef.current
    streamingMsgIdRef.current = null

    const msgs = useStore.getState().messages[anchorId as string] ?? []
    // 优先按正在流式的消息 id 寻址（重生目标可能在中段），无 id 时回退末尾
    const idx = msgId ? msgs.findIndex((m) => m.id === msgId) : msgs.length - 1
    const target = msgs[idx]
    if (target && target.role === 'assistant') {
      const isEmptyPlaceholder =
        !target.content && !target.thinking && target.toolCalls.length === 0
      if (isEmptyPlaceholder && idx === msgs.length - 1) {
        // 首发的空占位——整条移除；中段消息为空也不删，否则前置 user 轮成孤儿
        removeLastMessage(anchorId)
      } else {
        updateAssistantMessageById(anchorId, target.id, (m) => ({
          toolCalls: m.toolCalls.map((tc) =>
            tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
          ),
          isStreaming: false,
        }))
      }
    }
    setStatus('idle')
    setLoading(false)
  }, [
    currentAnchorId,
    updateAssistantMessageById,
    removeLastMessage,
    setLoading,
    setStatus,
  ])

  const regenerate = useCallback(
    async (assistantMsgId: string, thinking: ThinkingRequest) => {
      if (isLoading) return
      // let：首条消息在 anchor_created 前出错时 anchorId 为 null，重试会懒建锚点后回填
      let anchorId = currentAnchorId
      const msgs = useStore.getState().messages[anchorId as string] ?? []
      const assistantIdx = msgs.findIndex((m) => m.id === assistantMsgId)
      if (assistantIdx === -1) return
      const userMsg = [...msgs].slice(0, assistantIdx).reverse().find((m) => m.role === 'user')
      if (!userMsg) return

      // 全程按 id 精确写目标消息——重生的消息未必是末尾，不能用 updateLast*
      const patchMsg = (
        patch: Partial<Message> | ((m: Message) => Partial<Message>)
      ) => updateAssistantMessageById(anchorId, assistantMsgId, patch)

      resetAssistantMessageForRetry(anchorId, assistantMsgId)
      streamingMsgIdRef.current = assistantMsgId
      ctrlRef.current = new AbortController()
      setLoading(true)
      setStatus('thinking')

      await streamChat({
        message: userMsg.content,
        anchorId,
        prevAnchorId: null,
        thinking,
        userId: useStore.getState().userId,
        regenerate: true,
        signal: ctrlRef.current.signal,

        onThinking: (chunk) => {
          if (!thinking.enabled) return
          setStatus('thinking')
          patchMsg((m) => ({
            thinking: m.thinking + chunk,
            thinkingExpanded: m.thinking ? m.thinkingExpanded : true,
          }))
        },

        onContent: (chunk) => {
          setStatus('writing')
          patchMsg((m) => ({ content: m.content + chunk }))
        },

        onToolCall: (payload) => {
          setStatus('tooling')
          patchMsg((m) => ({
            content: '',
            toolCalls: [
              ...m.toolCalls,
              {
                id: crypto.randomUUID(),
                tool: payload.tool,
                toolDisplay: payload.toolDisplay,
                query: payload.query,
                status: 'running' as const,
                expanded: false,
              },
            ],
          }))
        },

        onToolResult: (payload) => {
          patchMsg((m) => {
            const tcs = [...m.toolCalls]
            for (let i = tcs.length - 1; i >= 0; i--) {
              if (tcs[i].status === 'running') {
                tcs[i] = { ...tcs[i], status: 'completed', count: payload.count, resultPreview: payload.resultPreview }
                break
              }
            }
            return { toolCalls: tcs }
          })
        },

        onMood: (payload) => { setMood(payload.keyword) },

        // 常态重生 anchor 已存在不会触发；仅当首条消息 pre-claim 出错后重试，
        // 后端懒建锚点 → 迁移 "null" 桶（消息 id 不变）并把后续写入重定向到真实 id
        onAnchorCreated: (realId) => {
          if (anchorId == null) {
            claimAnchor(realId)
            anchorId = realId
          }
        },

        onComplete: () => {
          patchMsg((m) => ({
            toolCalls: m.toolCalls.map((tc) =>
              tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
            ),
          }))
          // 与 send 一致：流正常结束但全空 → 视为后端静默错误，置错误态可重试
          const msg = useStore.getState().messages[anchorId as string]?.find((m) => m.id === assistantMsgId)
          if (msg && !msg.content && !msg.thinking && msg.toolCalls.length === 0) {
            patchMsg({ isError: true, isStreaming: false })
            setStatus('error')
          } else {
            patchMsg({ isStreaming: false })
            setStatus('idle')
            bumpFocusInput()
          }
          touchAnchor(anchorId, Date.now())
          bumpHotMemoryVersion()
          setLoading(false)
          ctrlRef.current = null
          streamingMsgIdRef.current = null
        },

        onError: (err) => {
          patchMsg((m) => ({
            toolCalls: m.toolCalls.map((tc) =>
              tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
            ),
            isError: true,
            isStreaming: false,
          }))
          toast.error(err.message || '请求出错，请稍后重试')
          setStatus('error')
          setLoading(false)
          ctrlRef.current = null
          streamingMsgIdRef.current = null
        },
      })
    },
    [
      isLoading,
      currentAnchorId,
      resetAssistantMessageForRetry,
      updateAssistantMessageById,
      claimAnchor,
      setLoading,
      setStatus,
      setMood,
      bumpHotMemoryVersion,
      bumpFocusInput,
      touchAnchor,
    ]
  )

  return { messages, isLoading, send, stop, regenerate }
}
