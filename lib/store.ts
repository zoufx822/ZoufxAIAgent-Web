import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface ToolCall {
  id: string
  tool: string
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

/**
 * 记忆锚点：UI 层的"对话分组"概念。底层后端按 userId 串成连续 Memory Stream，
 * 锚点只是视觉/操作层面的切片——所以前后端都不再有 session 概念。
 */
export interface MemoryAnchor {
  id: string
  title: string
  messages: Message[]
  createdAt: number
}

/**
 * 情绪 status（v1.1）—— 状态机层，6 态由 SSE 事件 + idle timer 推导。
 * 详见 v1.1 文档 4.1.3 节。
 */
export type Status = 'idle' | 'thinking' | 'tooling' | 'writing' | 'error' | 'asleep'

interface Store {
  /** 后端记忆分区键。所有锚点共享同一记忆池，与 drawer 的记忆锚点解耦。 */
  userId: string
  anchors: MemoryAnchor[]
  currentAnchorId: string
  isLoading: boolean

  /** 情绪 status：当前运行态（6 态）。不持久化——前端瞬态字段。 */
  currentStatus: Status
  /** 情绪 mood：LLM 顺带输出的情感词；null 表示未发或已过期。不持久化。 */
  currentMood: string | null
  /** mood 设置时的 epoch ms。用于过期淡出（>5min stale / >15min 隐藏）。 */
  lastMoodAt: number | null

  createAnchor: () => void
  switchAnchor: (id: string) => void
  deleteAnchor: (id: string) => void
  updateAnchorTitle: (id: string, title: string, force?: boolean) => void

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
}

function genId() {
  return crypto.randomUUID()
}

function makeWelcomeMessage(): Message {
  return {
    id: genId(),
    role: 'assistant',
    content: '你好！我是小Z，有什么可以帮助你的吗？',
    thinking: '',
    thinkingExpanded: false,
    toolCalls: [],
    isStreaming: false,
  }
}

function makeAnchor(): MemoryAnchor {
  return {
    id: genId(),
    title: '新对话',
    messages: [makeWelcomeMessage()],
    createdAt: Date.now(),
  }
}

const initialAnchor = makeAnchor()

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      userId: '',
      anchors: [initialAnchor],
      currentAnchorId: initialAnchor.id,
      isLoading: false,
      currentStatus: 'idle',
      currentMood: null,
      lastMoodAt: null,

      createAnchor: () => {
        const a = makeAnchor()
        set((state) => ({
          anchors: [a, ...state.anchors],
          currentAnchorId: a.id,
        }))
      },

      switchAnchor: (id) => {
        if (id !== get().currentAnchorId) {
          set({ currentAnchorId: id })
        }
      },

      deleteAnchor: (id) => {
        const { anchors, currentAnchorId } = get()
        if (anchors.length === 1) return
        const idx = anchors.findIndex((a) => a.id === id)
        if (idx === -1) return
        const next = anchors.filter((a) => a.id !== id)
        set({
          anchors: next,
          currentAnchorId:
            currentAnchorId === id
              ? next[Math.min(idx, next.length - 1)].id
              : currentAnchorId,
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

      addMessage: (anchorId, msg) => {
        set((state) => ({
          anchors: state.anchors.map((a) =>
            a.id === anchorId ? { ...a, messages: [...a.messages, msg] } : a
          ),
        }))
      },

      updateLastAssistantMessage: (anchorId, patch) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const messages = [...a.messages]
            const last = messages[messages.length - 1]
            if (!last || last.role !== 'assistant') return a
            messages[messages.length - 1] = { ...last, ...patch }
            return { ...a, messages }
          }),
        }))
      },

      removeLastMessage: (anchorId) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            return { ...a, messages: a.messages.slice(0, -1) }
          }),
        }))
      },

      toggleThinking: (anchorId) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const msgs = [...a.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return a
            msgs[msgs.length - 1] = { ...last, thinkingExpanded: !last.thinkingExpanded }
            return { ...a, messages: msgs }
          }),
        }))
      },

      appendToolCall: (anchorId, toolCall) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const msgs = [...a.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return a
            msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] }
            return { ...a, messages: msgs }
          }),
        }))
      },

      updateLastRunningToolCall: (anchorId, patch) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const msgs = [...a.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return a
            const idx = last.toolCalls.findIndex((tc) => tc.status === 'running')
            if (idx === -1) return a
            const next = [...last.toolCalls]
            next[idx] = { ...next[idx], ...patch }
            msgs[msgs.length - 1] = { ...last, toolCalls: next }
            return { ...a, messages: msgs }
          }),
        }))
      },

      toggleToolCallExpanded: (anchorId, toolCallId) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const messages = a.messages.map((m) => {
              if (m.role !== 'assistant') return m
              const idx = m.toolCalls.findIndex((tc) => tc.id === toolCallId)
              if (idx === -1) return m
              const next = [...m.toolCalls]
              next[idx] = { ...next[idx], expanded: !next[idx].expanded }
              return { ...m, toolCalls: next }
            })
            return { ...a, messages }
          }),
        }))
      },

      markRunningToolCallsFailed: (anchorId) => {
        set((state) => ({
          anchors: state.anchors.map((a) => {
            if (a.id !== anchorId) return a
            const msgs = [...a.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return a
            const hasRunning = last.toolCalls.some((tc) => tc.status === 'running')
            if (!hasRunning) return a
            const next = last.toolCalls.map((tc) =>
              tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
            )
            msgs[msgs.length - 1] = { ...last, toolCalls: next }
            return { ...a, messages: msgs }
          }),
        }))
      },

      setLoading: (v) => set({ isLoading: v }),

      setStatus: (s) => {
        if (get().currentStatus !== s) set({ currentStatus: s })
      },

      setMood: (keyword) => {
        // null 表示清空；否则带 keyword + 时间戳，过期判定按 lastMoodAt 算
        if (keyword === null) {
          set({ currentMood: null, lastMoodAt: null })
        } else {
          set({ currentMood: keyword, lastMoodAt: Date.now() })
        }
      },
    }),
    {
      name: 'zoufx-chat-sessions', // 持久化 key 保留，避免老用户数据丢失（值内字段已 migrate）
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userId: state.userId,
        anchors: state.anchors,
        currentAnchorId: state.currentAnchorId,
      }),
      // v1→v2: 补 userId；v2→v3: sessions/currentSessionId → anchors/currentAnchorId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (persistedState: any, version: number) => {
        if (persistedState && !persistedState.userId) {
          persistedState.userId = crypto.randomUUID()
        }
        if (version < 3 && persistedState) {
          if ('sessions' in persistedState) {
            persistedState.anchors = persistedState.sessions
            delete persistedState.sessions
          }
          if ('currentSessionId' in persistedState) {
            persistedState.currentAnchorId = persistedState.currentSessionId
            delete persistedState.currentSessionId
          }
        }
        return persistedState
      },
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (!state.userId) {
          state.userId = crypto.randomUUID()
        }
        state.anchors = state.anchors.map((a) => ({
          ...a,
          messages: a.messages.map((m) => {
            const toolCalls = (m.toolCalls ?? []).map((tc) =>
              tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
            )
            return { ...m, isStreaming: false, toolCalls }
          }),
        }))
      },
    }
  )
)
