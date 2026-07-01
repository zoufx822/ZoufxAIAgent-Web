'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { parseCommitment } from '@/lib/parse-commitment'

/**
 * LookBack 回望浮层——overlay 全屏 modal，两栏并排展示完整列表。
 * 入口在承诺 section 底部「回顾全部」按钮；ESC 或点遮罩关闭。
 */
export function LookBackModal() {
  const open = useStore((s) => s.lookbackOpen)
  const setOpen = useStore((s) => s.setLookbackOpen)
  const { data: events } = useMemoryHot('significant-event')
  const { data: commitments } = useMemoryHot('commitment')
  const { data: impression } = useMemoryHot('user-impression')
  const userName = impression?.username?.trim()

  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // 打开时保存触发元素并聚焦 modal，关闭后焦点归还触发元素
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      requestAnimationFrame(() => modalRef.current?.focus())
    } else {
      ;(triggerRef.current as HTMLElement | null)?.focus()
    }
  }, [open])

  // ESC 关闭 + Tab focus trap
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key !== 'Tab') return
      const modal = modalRef.current
      if (!modal) return
      const focusables = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.closest('[aria-hidden]'))
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const eventArr = Object.entries(events || {}).filter(([, v]) => v?.trim())
  const commitArr = Object.entries(commitments || {}).filter(([, v]) => v?.trim())

  return (
    <div className="lb-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={modalRef}
        className="lb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="回望记录"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lb-head">
          <div>
            <div className="lb-head-tt">Look back · 回顾</div>
            <div className="lb-head-t">你与我之间</div>
          </div>
          <button className="lb-close" onClick={() => setOpen(false)} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="lb-body">
          <div>
            <div className="lb-col-h">
              <span>重要经历 · significant events</span>
              <span className="ct">{eventArr.length}</span>
            </div>
            {eventArr.length === 0 ? (
              <div className="lb-empty">还没有共同记下的事。</div>
            ) : (
              eventArr.map(([uuid, text]) => (
                <div key={uuid} className="lb-event">{text}</div>
              ))
            )}
          </div>
          <div>
            <div className="lb-col-h">
              <span>承诺 · commitments</span>
              <span className="ct">{commitArr.length}</span>
            </div>
            {commitArr.length === 0 ? (
              <div className="lb-empty">还没立下约定。</div>
            ) : (
              commitArr.map(([uuid, text]) => {
                const p = parseCommitment(text)
                const arrow = p.dir === 'ai' ? '→' : p.dir === 'user' ? '←' : '↔'
                const meta =
                  p.dir === 'ai'
                    ? '我（AI）→ ' + (p.who || userName || '对方')
                    : p.dir === 'user'
                      ? (p.who || userName || '对方') + ' → 我'
                      : '我们 ↔ 一起'
                return (
                  <div key={uuid} className="lb-commit">
                    <span className={`commit-arrow ${p.dir}`}>{arrow}</span>
                    <div className="commit-body">
                      <div className="commit-meta">{meta}</div>
                      <div>{p.body}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
