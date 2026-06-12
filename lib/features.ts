/**
 * LLM 能力声明——后端 GET /ai/features 返回的契约。
 * 当前仅含 profile 标识，前端不依据它做任何行为；端点与本 store 保留作为
 * 能力自适应的扩展点（LC4J 尚不支持 per-call 参数覆盖，动态能力声明暂无意义）。
 */
import { create } from 'zustand'

export interface Features {
  profile: string
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/ai/features`

interface FeaturesStore {
  /** null 表示尚未加载完成；loaded 后即使后端切换 profile 也保持上一次拉取的值，直到刷新页面 */
  features: Features | null
  fetch: () => Promise<void>
}

/** 兜底声明：网络失败 / 后端未就绪时使用 */
const FALLBACK_FEATURES: Features = {
  profile: 'unknown',
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
