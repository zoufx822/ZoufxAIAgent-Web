'use client'

import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatWindow } from '@/components/chat-window'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const [mounted, setMounted] = useState(false)
  const [sidebarMode, setSidebarMode] = useState<'full' | 'compact' | 'hidden'>('full')
  const [manualOverride, setManualOverride] = useState<'full' | 'compact' | 'hidden' | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 监听窗口大小变化，自动调整侧边栏模式
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width
      if (width < 560) {
        setSidebarMode('hidden')
      } else if (width < 860) {
        setSidebarMode('compact')
      } else {
        setSidebarMode('full')
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 自动模式改变时清除手动覆盖
  useEffect(() => {
    setManualOverride(null)
  }, [sidebarMode])

  const finalMode = manualOverride || sidebarMode
  const isCompact = finalMode === 'compact'
  const isHidden = finalMode === 'hidden'

  const toggleSidebar = () => {
    if (isHidden) {
      setMobileOpen(!mobileOpen)
    } else if (finalMode === 'full') {
      setManualOverride('compact')
    } else {
      setManualOverride('full')
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative flex h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* 移动端遮罩 */}
      {isHidden && mobileOpen && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-200"
          style={{
            backgroundColor: 'oklch(0 0 0 / 0.35)',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <div
        style={{
          position: isHidden ? 'fixed' : 'relative',
          left: isHidden ? (mobileOpen ? 0 : -240) : undefined,
          top: isHidden ? 0 : undefined,
          bottom: isHidden ? 0 : undefined,
          zIndex: isHidden ? 100 : undefined,
          transition: isHidden ? 'left 0.28s ease' : undefined,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <AppSidebar compact={isCompact} onToggleCompact={toggleSidebar} />
      </div>

      {/* 主内容区 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col" style={{ backgroundColor: 'var(--bg)' }}>
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            height: '58px',
            padding: '0 24px',
            borderBottom: '1px solid',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-2.5">
            {/* 汉堡菜单 */}
            {isHidden && (
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="p-0 w-7 h-7 rounded flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--t2)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--t1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--t2)'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* 主题切换和设置 */}
          <div className="flex items-center gap-1.5">
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex items-center gap-1.25 px-2.75 py-1 rounded-full border transition-colors duration-150"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--t3)',
                  fontSize: '11px',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--t3)'
                }}
              >
                {theme === 'light' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                )}
                {theme === 'light' ? '深色' : '亮色'}
              </button>
            )}

            <button
              className="p-0 w-[30px] h-[30px] rounded flex items-center justify-center transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--t3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--t1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--t3)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 聊天窗口 */}
        <div className="flex-1 min-h-0">
          <ChatWindow />
        </div>
      </div>
    </div>
  )
}
