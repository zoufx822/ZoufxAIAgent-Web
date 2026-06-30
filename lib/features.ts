/**
 * LLM 能力声明——后端 GET /ai/features 返回的契约。
 *
 * 含 profile 标识与「思考深度（effort）」能力：能逐请求调节的 profile（OpenAI 协议，如 deepseek-v4）
 * 声明 supported + 档位 options + 默认档；不能的（Anthropic 协议，如 MiniMax）声明 supported=false。
 * 前端据此差异化渲染思考深度选择器，档位全部遍历 options 动态生成、不硬编码。
 */
import { create } from 'zustand'

/** 单个思考深度档位：value 传给后端，label 直接显示。 */
export interface EffortOption {
  value: string
  label: string
}

/** 思考深度能力声明。supported=false 时 options 为空、defaultValue 为 null。 */
export interface ThinkEffort {
  supported: boolean
  defaultValue: string | null
  options: EffortOption[]
}

export interface Features {
  profile: string
  effort: ThinkEffort
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/ai/features`

interface FeaturesStore {
  /** null 表示尚未加载完成；loaded 后即使后端切换 profile 也保持上一次拉取的值，直到刷新页面 */
  features: Features | null
  fetch: () => Promise<void>
}

/** 兜底声明：网络失败 / 后端未就绪时使用——按「不支持 effort」降级，前端隐藏选择器。 */
const FALLBACK_FEATURES: Features = {
  profile: 'unknown',
  effort: { supported: false, defaultValue: null, options: [] },
}

export const useFeaturesStore = create<FeaturesStore>((set) => ({
  features: null,

  fetch: async () => {
    try {
      const res = await fetch(API_URL, { method: 'GET' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Features
      // 后端旧版本可能不带 effort 字段——缺失时按不支持降级，保证前端不崩
      if (!data.effort) data.effort = { supported: false, defaultValue: null, options: [] }
      set({ features: data })
    } catch (err) {
      console.warn('[features] fetch failed, using fallback:', err)
      set({ features: FALLBACK_FEATURES })
    }
  },
}))
