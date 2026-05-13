'use client'

import {useEffect, useRef, useState} from 'react'
import {useStore} from '@/lib/store'
import type {MemoryAnchor} from '@/lib/store'

function relativeTime(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  return `${Math.floor(diff / 86400)}天前`
}

interface AnchorItemProps {
  anchor: MemoryAnchor
  active: boolean
  onSelect: () => void
  onDelete: () => void
}

function AnchorItem({anchor, active, onSelect, onDelete}: AnchorItemProps) {
  const {updateAnchorTitle} = useStore()
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(anchor.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setVal(anchor.title)
  }, [anchor.title, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleRename = () => {
    const v = val.trim() || anchor.title
    setVal(v)
    if (v !== anchor.title) updateAnchorTitle(anchor.id, v, true)
    setEditing(false)
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !editing && onSelect()}
      onDoubleClick={() => setEditing(true)}
      className="flex items-center cursor-pointer transition-colors"
      style={{
        gap: 8,
        padding: '8px 10px',
        marginBottom: 2,
        borderRadius: 7,
        background: active ? 'var(--surf-hov)' : 'transparent',
        borderLeft: active ? '2px solid var(--t1)' : '2px solid transparent',
        position: 'relative',
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1.7"
        stroke={active ? 'var(--t1)' : 'var(--t3)'}
        style={{flexShrink: 0}}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <div style={{flex: 1, minWidth: 0}}>
        {editing ? (
          <input
            ref={inputRef}
            className="w-full border-none outline-none"
            style={{
              background: 'transparent',
              fontSize: 12,
              color: 'var(--t1)',
              fontFamily: 'inherit',
            }}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setVal(anchor.title)
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="truncate" style={{fontSize: 12, color: active ? 'var(--t1)' : 'var(--t2)'}}>
              {anchor.title}
            </div>
            <div style={{fontSize: 10, color: 'var(--t3)', marginTop: 2}}>
              {relativeTime(anchor.createdAt)}
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
          className="flex items-center justify-center transition-colors"
          style={{
            width: 18,
            height: 18,
            border: 'none',
            background: 'transparent',
            color: 'var(--t3)',
            cursor: 'pointer',
            borderRadius: 4,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}

interface DrawerProps {
  open: boolean
  onClose: () => void
}

/**
 * 记忆锚点抽屉。从 Rail 右侧（left: 56）滑出 260px。
 * 替代旧 sidebar 的会话列表功能；底部固定一行小字强调"底层连续，分组只是视觉"。
 */
export function MemoryAnchorDrawer({open, onClose}: DrawerProps) {
  const {anchors, currentAnchorId, createAnchor, switchAnchor, deleteAnchor, isLoading} = useStore()

  if (!open) return null

  const handleNew = () => {
    if (isLoading) return
    createAnchor()
    onClose()
  }

  return (
    <>
      {/* 透明遮罩，点击外部关闭 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          background: 'transparent',
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 56,
          width: 260,
          zIndex: 80,
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'drawerIn 0.22s ease both',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--t3)',
            }}
          >
            记忆锚点
          </span>
          <button
            onClick={handleNew}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 7,
              padding: '3px 10px',
              fontSize: 11,
              color: 'var(--t2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--t1)'
              e.currentTarget.style.color = 'var(--t1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--t2)'
            }}
          >
            + 新
          </button>
        </div>

        {/* Anchors list */}
        <div style={{flex: 1, overflow: 'auto', padding: '0 10px 12px'}}>
          {anchors.map((a) => (
            <AnchorItem
              key={a.id}
              anchor={a}
              active={currentAnchorId === a.id}
              onSelect={() => {
                if (isLoading) return
                switchAnchor(a.id)
                onClose()
              }}
              onDelete={() => !isLoading && deleteAnchor(a.id)}
            />
          ))}
        </div>

        {/* Footer：强调"底层连续" */}
        <div
          className="mono"
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--t3)',
            letterSpacing: '0.08em',
            lineHeight: 1.5,
          }}
        >
          底层为连续记忆流，上方仅为分组。
        </div>
      </div>
    </>
  )
}
