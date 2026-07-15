'use client'

import { useEffect } from 'react'
import { useStore, type Message } from '@/lib/store'
import { api, type PendingTurn } from '@/lib/api'
import { pollPendingTurn } from '@/lib/pending-poll'

function blankMessage(id: string, role: 'user' | 'assistant', content: string, extra?: Partial<Message>): Message {
  return {
    id,
    role,
    content,
    thinking: '',
    thinkingExpanded: false,
    toolCalls: [],
    isStreaming: false,
    isError: false,
    ...extra,
  }
}

/**
 * 切锚时拉取后端窗口消息（≤20 条），并检查该锚点是否有在建轮（consumeStream 脱离连接后仍挂着）。
 * 有在建轮 → 在历史后补「问题气泡 + 生成中占位」并轮询 loadMessages 等落库回复（"空 → 问题 → 完整"）。
 * 已在 store.messages[anchorId] 里的跳过远程拉取（聊天中本地写入的消息是权威态）。失败静默。
 */
export function useAnchorMessages() {
  const anchorId = useStore((s) => s.currentAnchorId)
  const setMessages = useStore((s) => s.setMessages)

  useEffect(() => {
    if (!anchorId) return
    const cached = useStore.getState().messages[anchorId]
    const hasCache = !!cached && cached.length > 0

    let cancelled = false
    ;(async () => {
      try {
        const history: Message[] = hasCache
          ? cached
          : (await api.getMessages(anchorId)).map((m, i) =>
              blankMessage(`${anchorId}-h${i}`, m.role === 'user' ? 'user' : 'assistant', m.content ?? '')
            )
        if (cancelled) return

        // 本地正在生成 / 已在跟踪某在建轮 → 不做「打开有在建轮」的补占位（避免与本地流重复）
        const st = useStore.getState()
        if (st.isLoading || st.pendingTurn) {
          if (!hasCache) setMessages(anchorId, history)
          return
        }

        const pending: PendingTurn = await api.getPending(anchorId).catch(() => ({}))
        if (cancelled) return

        if (pending.turnId && pending.prompt) {
          const userMsgId = `${anchorId}-p-${pending.turnId}-u`
          const assistantId = `${anchorId}-p-${pending.turnId}-a`
          const withPending = history.some((m) => m.id === userMsgId)
            ? history
            : [
                ...history,
                blankMessage(userMsgId, 'user', pending.prompt),
                blankMessage(assistantId, 'assistant', '', { isPending: true }),
              ]
          setMessages(anchorId, withPending)
          useStore.getState().setPendingTurn({ turnId: pending.turnId, prompt: pending.prompt, anchorId })
          // 其他端/刷新端：告吹时只落错误态、不回填（原发送端可能在别处）
          pollPendingTurn({ anchorId, userMsgId, assistantId, prompt: pending.prompt, refillOnFail: false })
        } else if (!hasCache) {
          setMessages(anchorId, history)
        }
      } catch (err) {
        if (!cancelled) console.warn('useAnchorMessages fetch failed', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [anchorId, setMessages])
}
