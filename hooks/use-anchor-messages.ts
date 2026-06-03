'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * 切锚时拉取后端窗口消息（≤20 条）。
 * 已经在 store.messages[anchorId] 里的，跳过远程拉取（聊天中本地写入的消息是权威态）。
 * 失败静默——切到一个空锚点视为正常起始。
 */
export function useAnchorMessages() {
  const anchorId = useStore((s) => s.currentAnchorId)
  const setMessages = useStore((s) => s.setMessages)

  useEffect(() => {
    if (!anchorId) return
    const cached = useStore.getState().messages[anchorId]
    if (cached && cached.length > 0) return

    let cancelled = false
    ;(async () => {
      try {
        const backendMsgs = await api.getMessages(anchorId)
        if (cancelled) return
        const msgs = backendMsgs.map((m, i) => ({
          // 由 anchorId + 序号派生的确定性 id——同锚点重拉时 React key 稳定
          id: `${anchorId}-h${i}`,
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          // 防御性剥离——后端已过滤，此处兜底
          content: (m.content ?? '').replace(/<!--mood:[^>]+?-->/g, ''),
          thinking: '',
          thinkingExpanded: false,
          toolCalls: [],
          isStreaming: false,
          isError: false,
        }))
        setMessages(anchorId, msgs)
      } catch (err) {
        if (!cancelled) console.warn('useAnchorMessages fetch failed', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [anchorId, setMessages])
}
