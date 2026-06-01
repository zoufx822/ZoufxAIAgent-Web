'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { api, type AnchorContextView, type AnchorSummary } from '@/lib/api'

/**
 * 当前锚点的「其他锚点」三层衰减视图：
 *  - near：full card，默认展示 2 条，「展开剩余」按钮显示其余
 *  - mid：紧凑行（默认折叠）
 *  - far：仅显示数量
 *
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
      <div className="anchor-tier" style={{ color: 'var(--t3)', fontSize: 12 }}>
        —
      </div>
    )

  const total = view.near.length + view.mid.length + view.far.count
  if (total === 0) {
    return (
      <div
        className="anchor-tier"
        style={{ color: 'var(--t3)', fontSize: 11.5, fontStyle: 'italic' }}
      >
        这是我们的第一次对话。
      </div>
    )
  }

  const nearShown = nearAll ? view.near : view.near.slice(0, 2)
  const nearRest = view.near.length - nearShown.length

  return (
    <div>
      {view.near.length > 0 && (
        <div className="anchor-tier">
          <div className="anchor-tier-h">near · 最近</div>
          {nearShown.map((a) => (
            <NearCard key={a.id} anchor={a} onClick={() => switchAnchor(a.id)} />
          ))}
          {nearRest > 0 && (
            <button className="anchor-expand-btn" onClick={() => setNearAll(true)}>
              展开剩余 {nearRest} 条
            </button>
          )}
        </div>
      )}

      {view.mid.length > 0 && (
        <div className="anchor-tier">
          <button
            className="anchor-tier-h"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              width: '100%',
              textAlign: 'left',
            }}
            onClick={() => setMidOpen((v) => !v)}
          >
            mid · 中期 ({view.mid.length}){' '}
            <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{midOpen ? '▾' : '▸'}</span>
          </button>
          {midOpen &&
            view.mid.map((a) => (
              <div key={a.id} className="anchor-row-mid" onClick={() => switchAnchor(a.id)}>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {a.title ?? '未命名'}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
                  {fmtAge(a.lastActiveAt)}
                </span>
              </div>
            ))}
        </div>
      )}

      {view.far.count > 0 && (
        <div className="anchor-tier">
          <div className="anchor-far">{view.far.count} 个更早的对话</div>
        </div>
      )}
    </div>
  )
}

function NearCard({ anchor, onClick }: { anchor: AnchorSummary; onClick: () => void }) {
  return (
    <div className="anchor-card" onClick={onClick}>
      <div className="anchor-card-title">{anchor.title ?? '未命名'}</div>
      {anchor.body && (
        <div style={{ fontSize: 11.5, color: 'var(--t2)', margin: '3px 0 4px', lineHeight: 1.5 }}>
          {truncate(anchor.body, 60)}
        </div>
      )}
      <div className="anchor-card-meta">
        {fmtAge(anchor.lastActiveAt)}
        {anchor.mood && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· {anchor.mood}</span>}
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
