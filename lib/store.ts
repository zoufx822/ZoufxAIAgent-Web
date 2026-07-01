import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface ToolCall {
  id: string
  tool: string
  toolDisplay: string
  query: string
  status: 'running' | 'completed' | 'failed'
  count?: number
  resultPreview?: string
  expanded: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking: string
  thinkingExpanded: boolean
  toolCalls: ToolCall[]
  isStreaming: boolean
  isError: boolean
  createdAt?: number
}

/** 记忆锚点元数据——不含消息，消息按需从后端加载。 */
export interface MemoryAnchor {
  id: string
  title: string
  lastActiveAt: number
  createdAt: number
}

export type Status = 'idle' | 'thinking' | 'tooling' | 'writing' | 'error' | 'asleep' | 'drifting'

interface Store {
  userId: string

  // 锚点元数据列表（后端权威，本地缓存）
  anchors: MemoryAnchor[]
  currentAnchorId: string | null
  /** 上一个活跃锚点 id，切换时传给后端 prevAnchorId 触发压缩 */
  lastActiveAnchorId: string | null

  // 消息（按 anchorId 索引，非持久化）
  messages: Record<string, Message[]>

  isLoading: boolean

  // 情绪状态（非持久化）
  currentStatus: Status
  currentMood: string | null

  // UI 状态（非持久化）
  lookbackOpen: boolean
  /** 对话完成后递增，useMemoryHot 监听此值触发重拉印象 */
  hotMemoryVersion: number
  /** 回复流式真正结束时递增（上升沿驱动输入框自动 refocus）；错误/中止不递增 */
  focusInputSignal: number

  // ── anchor actions ──
  setAnchors: (anchors: MemoryAnchor[]) => void
  addAnchor: () => void
  switchAnchor: (id: string) => void
  /** 后端创建锚点后调用——迁移 pending 消息 + 写入新锚点 */
  claimAnchor: (id: string) => void
  updateAnchorTitle: (id: string | null, title: string, force?: boolean) => void
  touchAnchor: (id: string | null, lastActiveAt: number) => void

  // ── message actions ──
  // anchorId 允许 null：新对话尚未入库时消息暂存于 "null" 桶，claimAnchor 后迁移到真实 id。
  setMessages: (anchorId: string, msgs: Message[]) => void
  addMessage: (anchorId: string | null, msg: Message) => void
  updateLastAssistantMessage: (
    anchorId: string | null,
    patch: Partial<Message> | ((last: Message) => Partial<Message>)
  ) => void
  /** 按 id 精确写入助手消息——重生（regenerate）专用，目标可能不是末尾消息。 */
  updateAssistantMessageById: (
    anchorId: string | null,
    msgId: string,
    patch: Partial<Message> | ((m: Message) => Partial<Message>)
  ) => void
  removeLastMessage: (anchorId: string | null) => void
  toggleThinking: (anchorId: string | null) => void
  appendToolCall: (anchorId: string | null, toolCall: ToolCall) => void
  updateLastRunningToolCall: (anchorId: string | null, patch: Partial<ToolCall>) => void
  toggleToolCallExpanded: (anchorId: string | null, toolCallId: string) => void
  markRunningToolCallsFailed: (anchorId: string | null) => void
  resetAssistantMessageForRetry: (anchorId: string | null, msgId: string) => void

  setLoading: (v: boolean) => void
  setStatus: (s: Status) => void
  setMood: (keyword: string | null) => void
  setLookbackOpen: (v: boolean) => void
  bumpHotMemoryVersion: () => void
  bumpFocusInput: () => void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      userId: '',
      anchors: [],
      currentAnchorId: null,
      lastActiveAnchorId: null,
      messages: {},
      isLoading: false,
      currentStatus: 'idle',
      currentMood: '平静',
      lookbackOpen: false,
      hotMemoryVersion: 0,
      focusInputSignal: 0,

      setAnchors: (anchors) => {
        const cur = get().currentAnchorId
        const exists = cur != null && anchors.some((a) => a.id === cur)
        set({
          anchors,
          currentAnchorId: exists ? cur : (anchors[0]?.id ?? null),
        })
      },

      addAnchor: () => {
        const { currentAnchorId } = get()
        set({ currentAnchorId: null, lastActiveAnchorId: currentAnchorId })
      },

      claimAnchor: (id) => {
        const now = Date.now()
        set((state) => {
          // 将 null key 下的 pending 消息迁移到真实 anchorId
          const newMessages = { ...state.messages }
          const pending = state.messages[null as unknown as string]
          if (pending) delete newMessages[null as unknown as string]
          return {
            currentAnchorId: id,
            messages: pending ? { ...newMessages, [id]: pending } : newMessages,
            anchors: [{ id, title: '新对话', lastActiveAt: now, createdAt: now }, ...state.anchors],
          }
        })
      },

      switchAnchor: (id) => {
        const { currentAnchorId } = get()
        if (id === currentAnchorId) return
        set({ lastActiveAnchorId: currentAnchorId, currentAnchorId: id })
      },

      updateAnchorTitle: (id, title, force = false) => {
        if (id == null) return
        set((state) => ({
          anchors: state.anchors.map((a) =>
            a.id === id && (force || a.title === '新对话') ? { ...a, title: title.slice(0, 20) } : a
          ),
        }))
      },

      touchAnchor: (id, lastActiveAt) => {
        if (id == null) return
        set((state) => ({
          anchors: state.anchors.map((a) => (a.id === id ? { ...a, lastActiveAt } : a)),
        }))
      },

      setMessages: (anchorId, msgs) => {
        set((state) => ({ messages: { ...state.messages, [anchorId]: msgs } }))
      },

      addMessage: (anchorId, msg) => {
        const key = anchorId as unknown as string // null → "null" 桶，claimAnchor 时迁移到真实 id
        set((state) => ({
          messages: {
            ...state.messages,
            [key]: [...(state.messages[key] ?? []), msg],
          },
        }))
      },

      updateLastAssistantMessage: (anchorId, patch) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶（与 addMessage 一致）
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          const resolved = typeof patch === 'function' ? patch(last) : patch
          msgs[msgs.length - 1] = { ...last, ...resolved }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      updateAssistantMessageById: (anchorId, msgId, patch) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const idx = msgs.findIndex((m) => m.id === msgId)
          if (idx === -1 || msgs[idx].role !== 'assistant') return state
          const resolved = typeof patch === 'function' ? patch(msgs[idx]) : patch
          msgs[idx] = { ...msgs[idx], ...resolved }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      removeLastMessage: (anchorId) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = state.messages[key]
          if (!msgs?.length) return state
          return { messages: { ...state.messages, [key]: msgs.slice(0, -1) } }
        })
      },

      toggleThinking: (anchorId) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          msgs[msgs.length - 1] = { ...last, thinkingExpanded: !last.thinkingExpanded }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      appendToolCall: (anchorId, toolCall) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      updateLastRunningToolCall: (anchorId, patch) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          const idx = last.toolCalls.findIndex((tc) => tc.status === 'running')
          if (idx === -1) return state
          const next = [...last.toolCalls]
          next[idx] = { ...next[idx], ...patch }
          msgs[msgs.length - 1] = { ...last, toolCalls: next }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      toggleToolCallExpanded: (anchorId, toolCallId) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = (state.messages[key] ?? []).map((m) => {
            if (m.role !== 'assistant') return m
            const idx = m.toolCalls.findIndex((tc) => tc.id === toolCallId)
            if (idx === -1) return m
            const next = [...m.toolCalls]
            next[idx] = { ...next[idx], expanded: !next[idx].expanded }
            return { ...m, toolCalls: next }
          })
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      markRunningToolCallsFailed: (anchorId) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          const hasRunning = last.toolCalls.some((tc) => tc.status === 'running')
          if (!hasRunning) return state
          const next = last.toolCalls.map((tc) =>
            tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
          )
          msgs[msgs.length - 1] = { ...last, toolCalls: next }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      resetAssistantMessageForRetry: (anchorId, msgId) => {
        const key = anchorId as unknown as string // null → "null" 暂存桶
        set((state) => {
          const msgs = [...(state.messages[key] ?? [])]
          const idx = msgs.findIndex((m) => m.id === msgId)
          if (idx === -1) return state
          msgs[idx] = { ...msgs[idx], isError: false, isStreaming: true, content: '', thinking: '', toolCalls: [] }
          return { messages: { ...state.messages, [key]: msgs } }
        })
      },

      setLoading: (v) => set({ isLoading: v }),

      setStatus: (s) => {
        if (get().currentStatus !== s) set({ currentStatus: s })
      },

      setMood: (keyword) => {
        set({ currentMood: keyword })
      },

      setLookbackOpen: (v) => set({ lookbackOpen: v }),

      bumpHotMemoryVersion: () => set((s) => ({ hotMemoryVersion: s.hotMemoryVersion + 1 })),
      bumpFocusInput: () => set((s) => ({ focusInputSignal: s.focusInputSignal + 1 })),
    }),
    {
      name: 'zoufx-chat-sessions',
      version: 5,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userId: state.userId,
        anchors: state.anchors,
        currentAnchorId: state.currentAnchorId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const s = persisted as Record<string, unknown>
        if (!s) return s
        if (!s.userId) s.userId = crypto.randomUUID()
        // v1→v2: sessions → anchors
        if (version < 3 && s.sessions) {
          s.anchors = s.sessions
          delete s.sessions
        }
        if (version < 3 && s.currentSessionId) {
          s.currentAnchorId = s.currentSessionId
          delete s.currentSessionId
        }
        // v3→v4: 从 anchor 里剥离 messages 字段
        if (version < 4 && Array.isArray(s.anchors)) {
          s.anchors = (s.anchors as Record<string, unknown>[]).map((a) => {
            const { messages: _m, ...meta } = a
            if (!meta.lastActiveAt) meta.lastActiveAt = meta.createdAt ?? Date.now()
            return meta
          })
        }
        // v4→v5: currentAnchorId 允许 null（锚点创建上移到后端）
        if (typeof s.currentAnchorId === 'string' && !Array.isArray(s.anchors)) {
          // 兼容旧格式：如果有 currentAnchorId 但 anchors 是旧 sessions 格式，保留
        }
        return s
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!state.userId) state.userId = crypto.randomUUID()
      },
    }
  )
)

// 消费方应通过 `useStore((s) => s.messages[s.currentAnchorId])` 直接读取，
// 并以模块级 EMPTY 数组兜底——禁止在 selector 内合成新数组，否则触发无限循环。
