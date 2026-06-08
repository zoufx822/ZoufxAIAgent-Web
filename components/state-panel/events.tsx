'use client'

/**
 * Significant Event 叙事便签——append-only 列表。
 * 数据来自 GET /ai/memory/hot?type=significant-event，后端已按写入时间倒序（最新在前），
 * key 是无时间语义的 UUID，故前端不再排序，直接取前 3 条即最近 3 条。
 */
export function EventsPanel({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, v]) => v?.trim())

  if (entries.length === 0) {
    return <div className="sp-empty">还没共同的事。</div>
  }

  return (
    <div>
      {entries.slice(0, 3).map(([k, v]) => (
        <div key={k} className="sp-card sp-event">
          <span className="sp-event-mark" />
          <span>{v}</span>
        </div>
      ))}
    </div>
  )
}
