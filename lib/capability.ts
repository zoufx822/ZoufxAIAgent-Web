/**
 * LLM 能力声明（v0.135）—— 后端 GET /ai/capabilities 返回的契约。
 * 与后端 chat/api/LlmCapabilities.java 字段对齐。
 *
 * 前端启动时拉一次缓存，profile 切换需要后端重启 + 前端刷新。
 */
import { create } from 'zustand'

export interface LlmCapabilities {
  profile: string
  thinkingToggle: boolean
  thinkingBudget: boolean
  reasoningEffort: boolean
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/ai/capabilities`

interface CapabilityStore {
  /** null 表示尚未加载完成；loaded 后即使后端切换 profile 也保持上一次拉取的值，直到刷新页面 */
  capabilities: LlmCapabilities | null
  fetch: () => Promise<void>
}

/**
 * 兜底能力声明：网络失败 / 后端未就绪时使用——三项能力全 false 与降级方案一致，
 * 不至于让 UI 误以为有"控 LLM"的本领。
 */
const FALLBACK_CAPABILITIES: LlmCapabilities = {
  profile: 'unknown',
  thinkingToggle: false,
  thinkingBudget: false,
  reasoningEffort: false,
}

export const useCapabilityStore = create<CapabilityStore>((set) => ({
  capabilities: null,

  fetch: async () => {
    try {
      const res = await fetch(API_URL, { method: 'GET' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as LlmCapabilities
      set({ capabilities: data })
    } catch (err) {
      console.warn('[capability] fetch failed, using fallback:', err)
      set({ capabilities: FALLBACK_CAPABILITIES })
    }
  },
}))
