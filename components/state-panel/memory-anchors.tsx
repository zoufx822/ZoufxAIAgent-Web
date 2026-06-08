'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { api, type AnchorContextView, type AnchorSummary } from '@/lib/api'

/**
 * 记忆锚点：near/mid/far 三层衰减摘要。
 * 自带 section header（标题 + 总计数），与 Claude Design 对齐。
 * 数据来自 GET /ai/anchors/{anchorId}/context；isLoading 收尾后 refresh。
 */
export function MemoryAnchorsPanel() {
  const anchorId = useStore((s) => s.currentAnchorId)
  const isLoading = useStore((s) => s.isLoading)
  const switchAnchor = useStore((s) => s.switchAnchor)
  const [view, setView] = useState<AnchorContextView | null>(null)
  const [midOpen, setMidOpen] = useState(false)
  const [nearAll, setNearAll] = useState(false)

  useEffect(() => {
    if (!anchorId) return
    let cancelled = false
    api
      .getContext(anchorId)
      .then((v) => {
        if (!cancelled) setView(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [anchorId, isLoading])

  if (!view)
    return (
      <div>
        <div className="sp-section-h">
          <span>记忆锚点</span>
        </div>
        <div className="anchor-empty">—</div>
      </div>
    )

  const total = view.near.length + view.mid.length + view.far.count

  if (total === 0) {
    return (
      <div>
        <div className="sp-section-h">
          <span>记忆锚点</span>
        </div>
        <div className="anchor-empty">这是我们的第一次对话。</div>
      </div>
    )
  }

  const nearShown = nearAll ? view.near : view.near.slice(0, 2)
  const nearRest = view.near.length - nearShown.length

  return (
    <div>
      <div className="sp-section-h">
        <span>记忆锚点</span>
        <span className="count">{total}</span>
      </div>

      {view.near.length > 0 && (
        <div className="anchor-tier">
          <div className="anchor-tier-h">
            <span>近记忆 · recent</span>
            <span className="anchor-tier-count">{view.near.length}</span>
          </div>
          {nearShown.map((a) => (
            <NearCard key={a.id} anchor={a} onClick={() => switchAnchor(a.id)} />
          ))}
          {nearRest > 0 && (
            <button className="anchor-near-toggle" onClick={() => setNearAll(true)}>
              展开剩余 {nearRest} 条
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {nearAll && view.near.length > 2 && (
            <button className="anchor-near-toggle" onClick={() => setNearAll(false)}>
              收起
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
          )}
        </div>
      )}

      {view.mid.length > 0 && (
        <div className="anchor-tier">
          <div
            className={`anchor-tier-h clickable${midOpen ? ' open' : ''}`}
            onClick={() => setMidOpen((o) => !o)}
          >
            <span className="anchor-chev">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span>中记忆 · earlier</span>
            <span className="anchor-tier-count">{view.mid.length}</span>
          </div>
          {midOpen &&
            view.mid.map((a) => (
              <div key={a.id} className="anchor-mid-row" onClick={() => switchAnchor(a.id)}>
                <span className="anchor-mid-title">{a.title ?? '新对话'}</span>
                {a.mood && <span className="anchor-mid-mood" title={a.mood} />}
                <span className="anchor-mid-time">{fmtAge(a.lastActiveAt)}</span>
              </div>
            ))}
        </div>
      )}

      {view.far.count > 0 && (
        <div className="anchor-tier">
          <div className="anchor-tier-h">
            <span>远记忆 · distant</span>
          </div>
          <div className="anchor-far-row">
            <span className="anchor-far-count">{view.far.count}</span>
            个更早的对话
            {view.far.summary && <span style={{ marginLeft: 4 }}>· {view.far.summary}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function NearCard({ anchor, onClick }: { anchor: AnchorSummary; onClick: () => void }) {
  return (
    <div className="sp-card anchor-near-card" onClick={onClick}>
      <div className="anchor-title">{anchor.title ?? '新对话'}</div>
      {anchor.body && <div className="anchor-body">{truncate(anchor.body, 60)}</div>}
      <div className="anchor-meta">
        <span>{fmtAge(anchor.lastActiveAt)}</span>
        {anchor.mood && (
          <>
            <span>·</span>
            <span className="anchor-meta-mood">{anchor.mood}</span>
          </>
        )}
      </div>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

function fmtAge(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd'
  return new Date(ts).toISOString().slice(5, 10)
}
