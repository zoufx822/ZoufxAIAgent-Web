'use client'

/**
 * Significant Event 叙事便签——append-only 列表，最新在上。
 * 数据来自 GET /ai/memory/hot?type=significant-event，K 通常是时间戳。
 */
export function EventsPanel({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v?.trim())
    .sort(([a], [b]) => (a < b ? 1 : -1))

  if (entries.length === 0) {
    return (
      <div className="event-note" style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
        还没有值得记下的瞬间。
      </div>
    )
  }

  return (
    <div>
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="event-note">
          <div className="event-note-time">{fmtKey(k)}</div>
          <div>{v}</div>
        </div>
      ))}
    </div>
  )
}

function fmtKey(k: string): string {
  // 优先识别 ISO / 时间戳格式
  const n = Number(k)
  if (!isNaN(n) && n > 1_000_000_000) {
    const ts = n > 1e12 ? n : n * 1000
    return new Date(ts).toISOString().slice(0, 10)
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(k)) return k.slice(0, 10)
  return k
}
