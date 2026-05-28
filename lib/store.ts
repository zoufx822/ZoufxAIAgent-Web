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
}

/** 记忆锚点元数据——不含消息，消息按需从后端加载。 */
export interface MemoryAnchor {
  id: string
  title: string
  lastActiveAt: number
  createdAt: number
}

export type Status = 'idle' | 'thinking' | 'tooling' | 'writing' | 'error' | 'asleep'

interface Store {
  userId: string

  // 锚点元数据列表（后端权威，本地缓存）
  anchors: MemoryAnchor[]
  currentAnchorId: string
  /** 上一个活跃锚点 id，切换时传给后端 prevAnchorId 触发压缩 */
  lastActiveAnchorId: string | null

  // 消息（按 anchorId 索引，非持久化）
  messages: Record<string, Message[]>

  isLoading: boolean

  // 情绪状态（非持久化）
  currentStatus: Status
  currentMood: string | null
  lastMoodAt: number | null

  // UI 状态（非持久化）
  spotlight: boolean
  lookbackOpen: boolean
  /** 对话完成后递增，useMemoryHot 监听此值触发重拉印象 */
  hotMemoryVersion: number

  // ── anchor actions ──
  setAnchors: (anchors: MemoryAnchor[]) => void
  addAnchor: (anchor: MemoryAnchor) => void
  switchAnchor: (id: string) => void
  deleteAnchor: (id: string) => void
  updateAnchorTitle: (id: string, title: string, force?: boolean) => void
  touchAnchor: (id: string, lastActiveAt: number) => void

  // ── message actions ──
  setMessages: (anchorId: string, msgs: Message[]) => void
  addMessage: (anchorId: string, msg: Message) => void
  updateLastAssistantMessage: (anchorId: string, patch: Partial<Message>) => void
  removeLastMessage: (anchorId: string) => void
  toggleThinking: (anchorId: string) => void
  appendToolCall: (anchorId: string, toolCall: ToolCall) => void
  updateLastRunningToolCall: (anchorId: string, patch: Partial<ToolCall>) => void
  toggleToolCallExpanded: (anchorId: string, toolCallId: string) => void
  markRunningToolCallsFailed: (anchorId: string) => void

  setLoading: (v: boolean) => void
  setStatus: (s: Status) => void
  setMood: (keyword: string | null) => void
  triggerSpotlight: () => void
  setLookbackOpen: (v: boolean) => void
  bumpHotMemoryVersion: () => void
}

function genId() {
  return crypto.randomUUID()
}

function makeAnchorMeta(title = '新对话'): MemoryAnchor {
  return { id: genId(), title, lastActiveAt: Date.now(), createdAt: Date.now() }
}

const initialAnchor = makeAnchorMeta()

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      userId: '',
      anchors: [initialAnchor],
      currentAnchorId: initialAnchor.id,
      lastActiveAnchorId: null,
      messages: {},
      isLoading: false,
      currentStatus: 'idle',
      currentMood: '平静',
      lastMoodAt: Date.now(),
      spotlight: false,
      lookbackOpen: false,
      hotMemoryVersion: 0,

      setAnchors: (anchors) => {
        const cur = get().currentAnchorId
        const exists = anchors.some((a) => a.id === cur)
        set({
          anchors,
          currentAnchorId: exists ? cur : (anchors[0]?.id ?? cur),
        })
      },

      addAnchor: (anchor) => {
        set((state) => ({
          anchors: [anchor, ...state.anchors],
          currentAnchorId: anchor.id,
          lastActiveAnchorId: state.currentAnchorId,
        }))
      },

      switchAnchor: (id) => {
        const { currentAnchorId } = get()
        if (id === currentAnchorId) return
        set({ lastActiveAnchorId: currentAnchorId, currentAnchorId: id })
      },

      deleteAnchor: (id) => {
        const { anchors, currentAnchorId } = get()
        if (anchors.length === 1) return
        const idx = anchors.findIndex((a) => a.id === id)
        if (idx === -1) return
        const next = anchors.filter((a) => a.id !== id)
        set((state) => {
          const nextMessages = { ...state.messages }
          delete nextMessages[id]
          return {
            anchors: next,
            messages: nextMessages,
            currentAnchorId: currentAnchorId === id ? next[Math.min(idx, next.length - 1)].id : currentAnchorId,
          }
        })
      },

      updateAnchorTitle: (id, title, force = false) => {
        set((state) => ({
          anchors: state.anchors.map((a) =>
            a.id === id && (force || a.title === '新对话')
              ? { ...a, title: title.slice(0, 20) }
              : a
          ),
        }))
      },

      touchAnchor: (id, lastActiveAt) => {
        set((state) => ({
          anchors: state.anchors.map((a) => (a.id === id ? { ...a, lastActiveAt } : a)),
        }))
      },

      setMessages: (anchorId, msgs) => {
        set((state) => ({ messages: { ...state.messages, [anchorId]: msgs } }))
      },

      addMessage: (anchorId, msg) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [anchorId]: [...(state.messages[anchorId] ?? []), msg],
          },
        }))
      },

      updateLastAssistantMessage: (anchorId, patch) => {
        set((state) => {
          const msgs = [...(state.messages[anchorId] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          msgs[msgs.length - 1] = { ...last, ...patch }
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      removeLastMessage: (anchorId) => {
        set((state) => {
          const msgs = state.messages[anchorId]
          if (!msgs?.length) return state
          return { messages: { ...state.messages, [anchorId]: msgs.slice(0, -1) } }
        })
      },

      toggleThinking: (anchorId) => {
        set((state) => {
          const msgs = [...(state.messages[anchorId] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          msgs[msgs.length - 1] = { ...last, thinkingExpanded: !last.thinkingExpanded }
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      appendToolCall: (anchorId, toolCall) => {
        set((state) => {
          const msgs = [...(state.messages[anchorId] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] }
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      updateLastRunningToolCall: (anchorId, patch) => {
        set((state) => {
          const msgs = [...(state.messages[anchorId] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          const idx = last.toolCalls.findIndex((tc) => tc.status === 'running')
          if (idx === -1) return state
          const next = [...last.toolCalls]
          next[idx] = { ...next[idx], ...patch }
          msgs[msgs.length - 1] = { ...last, toolCalls: next }
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      toggleToolCallExpanded: (anchorId, toolCallId) => {
        set((state) => {
          const msgs = (state.messages[anchorId] ?? []).map((m) => {
            if (m.role !== 'assistant') return m
            const idx = m.toolCalls.findIndex((tc) => tc.id === toolCallId)
            if (idx === -1) return m
            const next = [...m.toolCalls]
            next[idx] = { ...next[idx], expanded: !next[idx].expanded }
            return { ...m, toolCalls: next }
          })
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      markRunningToolCallsFailed: (anchorId) => {
        set((state) => {
          const msgs = [...(state.messages[anchorId] ?? [])]
          const last = msgs[msgs.length - 1]
          if (!last || last.role !== 'assistant') return state
          const hasRunning = last.toolCalls.some((tc) => tc.status === 'running')
          if (!hasRunning) return state
          const next = last.toolCalls.map((tc) =>
            tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
          )
          msgs[msgs.length - 1] = { ...last, toolCalls: next }
          return { messages: { ...state.messages, [anchorId]: msgs } }
        })
      },

      setLoading: (v) => set({ isLoading: v }),

      setStatus: (s) => {
        if (get().currentStatus !== s) set({ currentStatus: s })
      },

      setMood: (keyword) => {
        if (keyword === null) {
          set({ currentMood: null, lastMoodAt: null })
        } else {
          set({ currentMood: keyword, lastMoodAt: Date.now() })
        }
      },

      triggerSpotlight: () => {
        set({ spotlight: true })
        setTimeout(() => set({ spotlight: false }), 3100)
      },

      setLookbackOpen: (v) => set({ lookbackOpen: v }),

      bumpHotMemoryVersion: () => set((s) => ({ hotMemoryVersion: s.hotMemoryVersion + 1 })),
    }),
    {
      name: 'zoufx-chat-sessions',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userId: state.userId,
        anchors: state.anchors,
        currentAnchorId: state.currentAnchorId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const s = persisted as Record<string, unknown>
        if (!s) return s
        // 补 userId
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
