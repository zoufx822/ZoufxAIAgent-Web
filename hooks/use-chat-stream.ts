'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/lib/store'
import { streamChat, type ThinkingRequest } from '@/lib/chat-stream'
import { api } from '@/lib/api'
import { pollPendingTurn, clearPendingPoll } from '@/lib/pending-poll'

const EMPTY_MESSAGES: never[] = []

export function useChatStream() {
  const {
    currentAnchorId,
    isLoading,
    addMessage,
    updateLastAssistantMessage,
    updateAssistantMessageById,
    removeMessages,
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
    setPrefill,
    setPendingTurn,
    setTopToast,
  } = useStore(
    useShallow((s) => ({
      currentAnchorId: s.currentAnchorId,
      isLoading: s.isLoading,
      addMessage: s.addMessage,
      updateLastAssistantMessage: s.updateLastAssistantMessage,
      updateAssistantMessageById: s.updateAssistantMessageById,
      removeMessages: s.removeMessages,
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
      setPrefill: s.setPrefill,
      setPendingTurn: s.setPendingTurn,
      setTopToast: s.setTopToast,
    }))
  )

  // selector 必须返回稳定引用——空 anchor 用模块级空数组兜底，避免无限循环。
  const rawMessages = useStore((s) => s.messages[s.currentAnchorId as string])
  const messages = useMemo(() => rawMessages ?? EMPTY_MESSAGES, [rawMessages])

  const ctrlRef = useRef<AbortController | null>(null)
  /** 本轮 turnId（后端 SSE `turn` 首帧下发）——停止/轮询据此定位。 */
  const turnIdRef = useRef<string | null>(null)
  /** 本轮消息 id + 原文（供停止/回填精确寻址；anchorId 在懒建锚后回填真实 id）。 */
  const activeTurnRef = useRef<{ anchorId: string | null; userMsgId: string; assistantId: string; prompt: string } | null>(null)
  /** turnId 未到就点了停止 → 记待停止，turnId 一到补发。 */
  const pendingStopRef = useRef(false)
  /** 停止请求在途去重。 */
  const stopReqRef = useRef(false)
  /** 停止 / 超时接管后，忽略 streamChat 收尾回调（onComplete/onError 不再插手）。 */
  const takeoverRef = useRef(false)
  /** turnId 是否已到——停止按钮据此在收到前禁用。 */
  const [turnReady, setTurnReady] = useState(false)

  /** 摇头 1.6s 后函数式守卫复位：用户已在此间重发（status 已变）则不打回。 */
  const scheduleErrorReset = useCallback(() => {
    setTimeout(() => {
      if (useStore.getState().currentStatus === 'error') setStatus('idle')
    }, 1600)
  }, [setStatus])

  const stop = useCallback(async () => {
    const turnId = turnIdRef.current
    if (!turnId) {
      // turnId 未到（按钮本应禁用，兜底）：记待停止，turnId 一到补发
      pendingStopRef.current = true
      return
    }
    if (stopReqRef.current) return
    stopReqRef.current = true
    let stopped = false
    try {
      stopped = (await api.stopTurn(turnId)).stopped
    } catch {
      // 停止请求本身失败：留给流自然收尾，不动本轮
    }
    stopReqRef.current = false
    if (!stopped) {
      // 生成刚好已完成落库 → 保留该轮不动（否则删掉已存的成功轮，刷新又冒出来）
      setTopToast({ text: '生成刚好已完成，本条已保留', key: Date.now() })
      return
    }
    // stopped:true → 掐本地连接 + 移除本轮 + 回填（中性提示，不摇头，不动 currentAnchorId）
    takeoverRef.current = true
    ctrlRef.current?.abort()
    ctrlRef.current = null
    clearPendingPoll()
    const active = activeTurnRef.current
    if (active) {
      removeMessages(active.anchorId, [active.userMsgId, active.assistantId])
      setPrefill({ text: active.prompt, key: Date.now() })
    }
    setPendingTurn(null)
    setStatus('idle')
    setLoading(false)
    setTurnReady(false)
    turnIdRef.current = null
    setTopToast({ text: '已停止，消息已放回输入框', key: Date.now() })
  }, [removeMessages, setPrefill, setPendingTurn, setStatus, setLoading, setTopToast])

  const send = useCallback(
    async (text: string, thinking: ThinkingRequest) => {
      if (!text.trim() || isLoading) return

      let anchorId: string | null = currentAnchorId
      // 同锚并发约束：该锚点有在建轮（consumeStream 脱离连接后仍挂着）→ 禁发
      const pt = useStore.getState().pendingTurn
      if (pt && pt.anchorId === anchorId) {
        setTopToast({ text: '上一条还在生成中', key: Date.now() })
        return
      }
      // 新一轮：清上次失败/停止的回填残留 + 重置本轮状态
      setPrefill(null)
      clearPendingPoll()
      turnIdRef.current = null
      pendingStopRef.current = false
      takeoverRef.current = false
      stopReqRef.current = false
      setTurnReady(false)

      ctrlRef.current = new AbortController()
      setLoading(true)
      setStatus('thinking')

      const userMsgId = crypto.randomUUID()
      addMessage(anchorId, {
        id: userMsgId,
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
      activeTurnRef.current = { anchorId, userMsgId, assistantId, prompt: text }
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

      // 失败 = 后端 error 事件 / 静默空完成：移除本轮 + 回填输入框 + 报错 toast + 摇头
      const failRefill = () => {
        takeoverRef.current = true
        clearPendingPoll()
        removeMessages(anchorId, [userMsgId, assistantId])
        setPrefill({ text, key: Date.now() })
        setTopToast({ text: '发送失败，消息已放回输入框，可修改后重发', key: Date.now() })
        setStatus('error')
        scheduleErrorReset()
        setPendingTurn(null)
        setLoading(false)
        setTurnReady(false)
        ctrlRef.current = null
        turnIdRef.current = null
      }

      await streamChat({
        message: text,
        anchorId,
        thinking,
        userId: useStore.getState().userId,
        signal: ctrlRef.current.signal,

        onTurn: (id) => {
          turnIdRef.current = id
          setTurnReady(true)
          // turnId 到达前点了停止 → 现在补发
          if (pendingStopRef.current) {
            pendingStopRef.current = false
            void stop()
          }
        },

        onThinking: (chunk) => {
          if (!thinking.enabled) return
          setStatus('thinking')
          updateLastAssistantMessage(anchorId, (last) => ({
            thinking: last.thinking + chunk,
            thinkingExpanded: last.thinking ? last.thinkingExpanded : true,
          }))
        },

        onContent: (chunk) => {
          setStatus('writing')
          updateLastAssistantMessage(anchorId, (last) => ({ content: last.content + chunk }))
        },

        onToolCall: (payload) => {
          setStatus('tooling')
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
          if (activeTurnRef.current) activeTurnRef.current.anchorId = realId
        },

        // watchdog 超时：断连≠失败——标「生成中」+ 轮询服务端落库结果
        onIdleTimeout: () => {
          takeoverRef.current = true
          ctrlRef.current = null // 连接已被 reader.cancel 关闭
          const turnId = turnIdRef.current
          if (!turnId) {
            // 没 turnId 无从轮询 → 按失败回填
            failRefill()
            return
          }
          updateAssistantMessageById(anchorId, assistantId, { isPending: true, isStreaming: false })
          setPendingTurn({ turnId, prompt: text, anchorId: anchorId as string })
          setStatus('idle')
          setLoading(false)
          setTurnReady(false)
          pollPendingTurn({ anchorId: anchorId as string, userMsgId, assistantId, prompt: text, refillOnFail: true })
        },

        onComplete: () => {
          if (takeoverRef.current) return
          markRunningToolCallsFailed(anchorId)
          const lastMsg = useStore.getState().messages[anchorId as string]?.at(-1)
          const empty =
            lastMsg &&
            lastMsg.role === 'assistant' &&
            !lastMsg.content &&
            !lastMsg.thinking &&
            lastMsg.toolCalls.length === 0
          if (empty) {
            // 流正常结束但全空 → 后端静默错误，按失败回填
            failRefill()
            return
          }
          updateLastAssistantMessage(anchorId, { isStreaming: false })
          setStatus('idle')
          bumpFocusInput()
          touchAnchor(anchorId, Date.now())
          bumpHotMemoryVersion()
          setLoading(false)
          setTurnReady(false)
          ctrlRef.current = null
          turnIdRef.current = null
        },

        onError: () => {
          if (takeoverRef.current) return
          failRefill()
        },
      })
    },
    [
      currentAnchorId,
      isLoading,
      addMessage,
      updateLastAssistantMessage,
      updateAssistantMessageById,
      removeMessages,
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
      setPrefill,
      setPendingTurn,
      setTopToast,
      scheduleErrorReset,
      stop,
    ]
  )

  return { messages, isLoading, send, stop, turnReady }
}
