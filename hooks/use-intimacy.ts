'use client'

import { useMemo } from 'react'

export type Intimacy = 'stranger' | 'half-known' | 'fully-known'

const HOT_MEMORY_KEYS = [
  'username',
  'role',
  'language',
  'tone',
  'interests',
  'personality',
  'communication_style',
  'habits',
  'values',
  'hobbies',
]

/**
 * 由 user-impression Hot Memory 的填充率反推亲密度。
 * <30% 陌生，30~70% 半熟，>=70% 熟络。
 */
export function useIntimacy(hot: Record<string, string>): Intimacy {
  return useMemo(() => {
    const filled = HOT_MEMORY_KEYS.filter((k) => hot[k] && String(hot[k]).trim()).length
    const r = filled / HOT_MEMORY_KEYS.length
    if (r < 0.3) return 'stranger'
    if (r < 0.7) return 'half-known'
    return 'fully-known'
  }, [hot])
}
