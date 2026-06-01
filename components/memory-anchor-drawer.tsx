'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import type { MemoryAnchor } from '@/lib/store'
import { api } from '@/lib/api'

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
}

function AnchorItem({ anchor, active, onSelect }: AnchorItemProps) {
  const { updateAnchorTitle } = useStore()
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

  const handleRename = async () => {
    const v = val.trim() || anchor.title
    setVal(v)
    if (v !== anchor.title) {
      updateAnchorTitle(anchor.id, v, true)
      try {
        await api.renameAnchor(anchor.id, v)
      } catch (err) {
        console.warn('renameAnchor failed', err)
      }
    }
    setEditing(false)
  }

  return (
    <div
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
        style={{ flexShrink: 0 }}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
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
            <div
              className="truncate"
              style={{ fontSize: 12, color: active ? 'var(--t1)' : 'var(--t2)' }}
            >
              {anchor.title}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
              {relativeTime(anchor.lastActiveAt ?? anchor.createdAt)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface DrawerProps {
  open: boolean
  onClose: () => void
}

/**
 * 记忆锚点抽屉——v0.145：锚点 CRUD 走后端 API，本地 store 仅缓存最新列表。
 * 列表挂载时拉 /ai/anchors?userId=X，把 sidebar 当前活跃锚点同步进 store。
 */
export function MemoryAnchorDrawer({ open, onClose }: DrawerProps) {
  const userId = useStore((s) => s.userId)
  const anchors = useStore((s) => s.anchors)
  const currentAnchorId = useStore((s) => s.currentAnchorId)
  const isLoading = useStore((s) => s.isLoading)
  const setAnchors = useStore((s) => s.setAnchors)
  const addAnchor = useStore((s) => s.addAnchor)
  const switchAnchor = useStore((s) => s.switchAnchor)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    api
      .listAnchors(userId)
      .then((list) => {
        if (cancelled) return
        const mapped = list.map((a) => ({
          id: a.id,
          title: a.title ?? '新对话',
          lastActiveAt: a.lastActiveAt,
          createdAt: a.createdAt,
        }))
        if (mapped.length > 0) setAnchors(mapped)
      })
      .catch((err) => console.warn('listAnchors failed', err))
    return () => {
      cancelled = true
    }
  }, [open, userId, setAnchors])

  if (!open) return null

  const handleNew = async () => {
    if (isLoading || !userId) return
    try {
      const created = await api.createAnchor(userId)
      addAnchor({
        id: created.id,
        title: created.title ?? '新对话',
        lastActiveAt: created.lastActiveAt,
        createdAt: created.createdAt,
      })
      onClose()
    } catch (err) {
      console.warn('createAnchor failed', err)
      toast.error('新建对话失败，请稍后重试')
    }
  }

  return (
    <>
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

        <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 12px' }}>
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
            />
          ))}
        </div>

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
