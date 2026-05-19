'use client'

import {useTheme} from 'next-themes'
import {useEffect, useState} from 'react'

interface RailProps {
  memoryOpen: boolean
  onMemoryClick: () => void
  onNewAnchor: () => void
}

/**
 * 左侧 56px 固定图标栏。
 * 与设计一致：Z logo + 记忆锚点切换 + 新对话 + 主题切换。
 */
export function Rail({memoryOpen, onMemoryClick, onNewAnchor}: RailProps) {
  const {theme, setTheme} = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div
      className="flex flex-col items-center flex-shrink-0"
      style={{
        width: 56,
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        padding: '14px 0',
        gap: 6,
      }}
    >
      {/* v1.1 设计稿：左上角 Z 方块标已去除（小Z 形象由 Home Eyes + 消息头像 Eyes 承担） */}

      {/* 记忆锚点 */}
      <RailBtn active={memoryOpen} onClick={onMemoryClick} title="记忆锚点">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 2v6m0 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 0v0M8 22h8m-4-2v2" />
        </svg>
      </RailBtn>

      {/* 新对话 */}
      <RailBtn onClick={onNewAnchor} title="新对话">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </RailBtn>

      <div style={{flex: 1}} />

      {/* 主题切换 */}
      {mounted && (
        <RailBtn
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? '切换到亮色' : '切换到深色'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </RailBtn>
      )}
    </div>
  )
}

function RailBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick?: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="transition-colors"
      style={{
        width: 32,
        height: 32,
        borderRadius: 7,
        background: active ? 'var(--surf-hov)' : 'transparent',
        color: active ? 'var(--t1)' : 'var(--t3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--surf-hov)'
          e.currentTarget.style.color = 'var(--t1)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--t3)'
        }
      }}
    >
      {children}
    </button>
  )
}
