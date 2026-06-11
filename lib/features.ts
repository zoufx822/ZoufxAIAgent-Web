/**
 * LLM 能力声明——后端 GET /ai/features 返回的契约。
 * 前端启动时拉一次缓存，profile 切换需后端重启 + 前端刷新。
 */
import { create } from 'zustand'

export interface Features {
  profile: string
  thinkingToggle: boolean
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/ai/features`

interface FeaturesStore {
  /** null 表示尚未加载完成；loaded 后即使后端切换 profile 也保持上一次拉取的值，直到刷新页面 */
  features: Features | null
  fetch: () => Promise<void>
}

/**
 * 兜底能力声明：网络失败 / 后端未就绪时使用——三项能力全 false 与降级方案一致，
 * 不至于让 UI 误以为有"控 LLM"的本领。
 */
const FALLBACK_FEATURES: Features = {
  profile: 'unknown',
  thinkingToggle: false,
}

export const useFeaturesStore = create<FeaturesStore>((set) => ({
  features: null,

  fetch: async () => {
    try {
      const res = await fetch(API_URL, { method: 'GET' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Features
      set({ features: data })
    } catch (err) {
      console.warn('[features] fetch failed, using fallback:', err)
      set({ features: FALLBACK_FEATURES })
    }
  },
}))
