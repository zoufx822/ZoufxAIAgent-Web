'use client'

import { cn } from '@/lib/utils'
import type { EffortOption } from '@/lib/features'

/**
 * 思考深度选择器——无状态展示组件，档位全部遍历 options 动态生成、label 直接取接口。
 * 是否渲染（supported / thinkingEnabled）由调用方 gate；此处仅负责把传入的 options 画成分段控件。
 */
export function EffortPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: EffortOption[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  if (options.length === 0) return null
  return (
    <div
      role="radiogroup"
      aria-label="思考深度"
      className="inline-flex items-center gap-0.5 rounded-full p-0.5"
      style={{ backgroundColor: 'var(--accent-s)' }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all disabled:opacity-50 disabled:pointer-events-none',
              !active && 'hover:opacity-80'
            )}
            style={
              active
                ? { backgroundColor: 'var(--accent)', color: 'var(--bg)' }
                : { backgroundColor: 'transparent', color: 'var(--accent)' }
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
