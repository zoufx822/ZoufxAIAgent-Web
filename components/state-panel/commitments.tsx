'use client'

import { parseCommitment } from '@/lib/parse-commitment'

/**
 * Commitment 承诺面板——按三种方向解析展示。
 * 数据来自 GET /ai/memory/hot?type=commitment，后端已按写入时间倒序（最新在前），
 * 故直接取前 3 条即最近 3 条。
 */
export function CommitmentsPanel({
  data,
  onOpenLookback,
}: {
  data: Record<string, string>
  onOpenLookback?: () => void
}) {
  const entries = Object.entries(data).filter(([, v]) => v?.trim())
  if (entries.length === 0) {
    return <div className="sp-empty">还没立下约定。</div>
  }

  return (
    <>
      {entries.slice(0, 3).map(([k, v]) => {
        const p = parseCommitment(v)
        const arrow = p.dir === 'ai' ? '→' : p.dir === 'user' ? '←' : '↔'
        const meta =
          p.dir === 'ai'
            ? '我承诺'
            : p.dir === 'user'
              ? `${p.who}承诺`
              : '双方约定'
        return (
          <div key={k} className="sp-card sp-commit">
            <span className={`commit-arrow ${p.dir}`}>{arrow}</span>
            <div className="commit-body">
              <div className="commit-meta">{meta}</div>
              <div className="commit-text">{p.body}</div>
            </div>
          </div>
        )
      })}
      {onOpenLookback && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="lookback-btn" onClick={onOpenLookback}>
            回顾全部
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
