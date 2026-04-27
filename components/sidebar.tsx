'use client'

import {useEffect, useRef, useState} from 'react'
import {useStore} from '@/lib/store'

function relativeTime(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

interface SessionItemProps {
  session: any
  active: boolean
  compact: boolean
  onSelect: () => void
  onDelete: () => void
}

function SessionItem({ session, active, compact, onSelect, onDelete }: SessionItemProps) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleRename = () => {
    const v = val.trim()
    if (v) {
      // Update session title in store if needed
    }
    setEditing(false)
  }

  if (compact) {
    return (
      <div
        onClick={onSelect}
        className="flex items-center justify-center py-2.25 px-1.25 rounded-lg cursor-pointer mb-0.5 transition-colors"
        style={{
          backgroundColor: active ? 'var(--surf-hov)' : 'transparent',
          borderLeftWidth: '2px',
          borderLeftColor: active ? 'var(--accent)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = 'var(--surf-hov)'
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.7">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={active ? 'var(--accent)' : 'var(--t3)'} />
        </svg>
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !editing && onSelect()}
      onDoubleClick={() => setEditing(true)}
      className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors relative"
      style={{
        backgroundColor: active ? 'var(--surf-hov)' : 'transparent',
        borderLeftWidth: '2px',
        borderLeftColor: active ? 'var(--accent)' : 'transparent',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" className="flex-shrink-0">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke={active ? 'var(--accent)' : 'var(--t3)'} />
      </svg>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent border-none outline-none text-xs"
            style={{
              color: 'var(--t1)',
              fontFamily: 'Space Grotesk, Noto Sans SC, sans-serif',
            }}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setVal(session.title)
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div
              className="text-xs truncate"
              style={{
                color: active ? 'var(--t1)' : 'var(--t2)',
              }}
            >
              {session.title}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>
              {relativeTime(session.createdAt)}
            </div>
          </>
        )}
      </div>
      {hovered && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            color: 'var(--t3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--t1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--t3)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

interface AppSidebarProps {
  compact?: boolean
  onToggleCompact?: () => void
}

export function AppSidebar({ compact = false, onToggleCompact }: AppSidebarProps) {
  const { sessions, currentSessionId, isLoading, createSession, switchSession, deleteSession } = useStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300"
      style={{
        width: compact ? '52px' : '224px',
        backgroundColor: 'var(--sidebar)',
        borderRight: '1px solid',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header with logo */}
      <div
        className={`flex items-center gap-2 border-b flex-shrink-0 ${compact ? 'justify-center' : 'justify-between'}`}
        style={{
          height: '58px',
          padding: compact ? '0 12px' : '0 16px 0 18px',
          borderColor: 'var(--border)',
        }}
      >
        {!compact && (
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: 'var(--t1)',
                color: 'var(--bg)',
                width: '28px',
                height: '28px',
                fontSize: '11px',
                letterSpacing: '-0.02em',
              }}
            >
              Z
            </div>
            <span className="text-base font-semibold tracking-[-0.02em] truncate" style={{ color: 'var(--t1)' }}>
              Zoufx
            </span>
          </div>
        )}
        <button
          onClick={onToggleCompact}
          className="p-1 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
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
            {compact ? (
              <>
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* New session button */}
      <div
        className="flex-shrink-0"
        style={{
          padding: compact ? '12px 9px 6px' : '12px 12px 6px',
        }}
      >
        <button
          onClick={createSession}
          disabled={isLoading}
          className="w-full flex items-center rounded-lg border transition-colors duration-150"
          style={{
            justifyContent: compact ? 'center' : 'flex-start',
            gap: '7px',
            padding: compact ? '9px 0' : '8px 12px',
            borderColor: 'var(--border)',
            color: 'var(--t2)',
            fontSize: '12px',
            backgroundColor: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--t2)'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {!compact && '新对话'}
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: compact ? '0 6px' : '0 8px' }}>
        {!compact && (
          <div className="text-[10px] px-2 py-2.5 font-semibold uppercase tracking-widest" style={{ color: 'var(--t3)' }}>
            历史
          </div>
        )}
        {mounted && sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            active={currentSessionId === session.id}
            compact={compact || false}
            onSelect={() => !isLoading && switchSession(session.id)}
            onDelete={() => !isLoading && deleteSession(session.id)}
          />
        ))}
      </div>

      {/* User area */}
      <div
        className="flex-shrink-0 border-t"
        style={{
          padding: compact ? '10px 9px' : '10px 14px',
          borderColor: 'var(--border)',
        }}
      >
        {compact ? (
          <div className="flex justify-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border"
              style={{
                backgroundColor: 'var(--surf-hov)',
                color: 'var(--accent)',
                borderColor: 'var(--border)',
                cursor: 'pointer',
              }}
            >
              U
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border flex-shrink-0"
              style={{
                backgroundColor: 'var(--surf-hov)',
                color: 'var(--accent)',
                borderColor: 'var(--border)',
                cursor: 'pointer',
              }}
            >
              U
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium" style={{ color: 'var(--t1)' }}>
                用户
              </div>
              <div className="text-[10px] truncate" style={{ color: 'var(--t3)' }}>
                zoufx@example.com
              </div>
            </div>
            <button
              className="p-1 rounded flex items-center flex-shrink-0 transition-colors"
              style={{
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
        )}
      </div>
    </div>
  )
}
