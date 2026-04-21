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

export interface Session {
  id: string
  title: string
  messages: Message[]
  createdAt: number
}

interface Store {
  sessions: Session[]
  currentSessionId: string
  isLoading: boolean

  createSession: () => void
  switchSession: (id: string) => void
  deleteSession: (id: string) => void
  updateSessionTitle: (id: string, title: string) => void

  addMessage: (sessionId: string, msg: Message) => void
  updateLastAssistantMessage: (sessionId: string, patch: Partial<Message>) => void
  removeLastMessage: (sessionId: string) => void
  toggleThinking: (sessionId: string) => void
  appendToolCall: (sessionId: string, toolCall: ToolCall) => void
  updateLastRunningToolCall: (sessionId: string, patch: Partial<ToolCall>) => void
  toggleToolCallExpanded: (sessionId: string, toolCallId: string) => void
  markRunningToolCallsFailed: (sessionId: string) => void
  setLoading: (v: boolean) => void
}

function genId() {
  return crypto.randomUUID()
}

function makeWelcomeMessage(): Message {
  return {
    id: genId(),
    role: 'assistant',
    content: '你好！我是 AI 助手，有什么可以帮助你的吗？',
    thinking: '',
    thinkingExpanded: false,
    toolCalls: [],
    isStreaming: false,
  }
}

function makeSession(): Session {
  return {
    id: genId(),
    title: '新对话',
    messages: [makeWelcomeMessage()],
    createdAt: Date.now(),
  }
}

const initialSession = makeSession()

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      sessions: [initialSession],
      currentSessionId: initialSession.id,
      isLoading: false,

      createSession: () => {
        const s = makeSession()
        set((state) => ({
          sessions: [s, ...state.sessions],
          currentSessionId: s.id,
        }))
      },

      switchSession: (id) => {
        if (id !== get().currentSessionId) {
          set({ currentSessionId: id })
        }
      },

      deleteSession: (id) => {
        const { sessions, currentSessionId } = get()
        if (sessions.length === 1) return
        const idx = sessions.findIndex((s) => s.id === id)
        if (idx === -1) return
        const next = sessions.filter((s) => s.id !== id)
        set({
          sessions: next,
          currentSessionId:
            currentSessionId === id
              ? next[Math.min(idx, next.length - 1)].id
              : currentSessionId,
        })
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id && s.title === '新对话'
              ? { ...s, title: title.slice(0, 20) }
              : s
          ),
        }))
      },

      addMessage: (sessionId, msg) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages: [...s.messages, msg] } : s
          ),
        }))
      },

      updateLastAssistantMessage: (sessionId, patch) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const messages = [...s.messages]
            const last = messages[messages.length - 1]
            if (!last || last.role !== 'assistant') return s
            messages[messages.length - 1] = { ...last, ...patch }
            return { ...s, messages }
          }),
        }))
      },

      removeLastMessage: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            return { ...s, messages: s.messages.slice(0, -1) }
          }),
        }))
      },

      toggleThinking: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return s
            msgs[msgs.length - 1] = { ...last, thinkingExpanded: !last.thinkingExpanded }
            return { ...s, messages: msgs }
          }),
        }))
      },

      appendToolCall: (sessionId, toolCall) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return s
            msgs[msgs.length - 1] = { ...last, toolCalls: [...last.toolCalls, toolCall] }
            return { ...s, messages: msgs }
          }),
        }))
      },

      updateLastRunningToolCall: (sessionId, patch) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return s
            const idx = last.toolCalls.findIndex((tc) => tc.status === 'running')
            if (idx === -1) return s
            const next = [...last.toolCalls]
            next[idx] = { ...next[idx], ...patch }
            msgs[msgs.length - 1] = { ...last, toolCalls: next }
            return { ...s, messages: msgs }
          }),
        }))
      },

      toggleToolCallExpanded: (sessionId, toolCallId) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const messages = s.messages.map((m) => {
              if (m.role !== 'assistant') return m
              const idx = m.toolCalls.findIndex((tc) => tc.id === toolCallId)
              if (idx === -1) return m
              const next = [...m.toolCalls]
              next[idx] = { ...next[idx], expanded: !next[idx].expanded }
              return { ...m, toolCalls: next }
            })
            return { ...s, messages }
          }),
        }))
      },

      markRunningToolCallsFailed: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== sessionId) return s
            const msgs = [...s.messages]
            const last = msgs[msgs.length - 1]
            if (!last || last.role !== 'assistant') return s
            const hasRunning = last.toolCalls.some((tc) => tc.status === 'running')
            if (!hasRunning) return s
            const next = last.toolCalls.map((tc) =>
              tc.status === 'running' ? { ...tc, status: 'failed' as const } : tc
            )
            msgs[msgs.length - 1] = { ...last, toolCalls: next }
            return { ...s, messages: msgs }
          }),
        }))
      },

      setLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: 'zoufx-chat-sessions',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // 修复因标签页关闭导致的 isStreaming: true 残留；兼容旧数据补 toolCalls
        state.sessions = state.sessions.map((s) => ({
          ...s,
          messages: s.messages.map((m) => {
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
