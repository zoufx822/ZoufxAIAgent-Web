'use client'

/**
 * Commitment 承诺面板——按"我（AI）答应X / X答应我 / 我们约定"三种方向解析箭头展示。
 * 数据来自 GET /ai/memory/hot?type=commitment。
 */

type Parsed = { dir: 'ai' | 'user' | 'mutual'; who?: string; body: string }

function parseCommitment(text: string): Parsed {
  let m = text.match(/^我（AI）答应([^：:]+)[：:]\s*(.+)$/)
  if (m) return { dir: 'ai', who: m[1].trim(), body: m[2].trim() }
  m = text.match(/^([^：:]{1,12})答应我[：:]\s*(.+)$/)
  if (m) return { dir: 'user', who: m[1].trim(), body: m[2].trim() }
  m = text.match(/^我们(约定|说好)[：:]\s*(.+)$/)
  if (m) return { dir: 'mutual', body: m[2].trim() }
  return { dir: 'mutual', body: text }
}

const ARROW: Record<Parsed['dir'], string> = {
  ai: 'AI →',
  user: '→ AI',
  mutual: '↔',
}

export function CommitmentsPanel({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, v]) => v?.trim())
  if (entries.length === 0) {
    return (
      <div className="commitment-row" style={{ color: 'var(--t3)', fontStyle: 'italic' }}>
        暂无承诺。
      </div>
    )
  }

  return (
    <div>
      {entries.map(([k, v]) => {
        const p = parseCommitment(v)
        return (
          <div key={k} className="commitment-row">
            <span className="commitment-arrow">{ARROW[p.dir]}</span>
            {p.who && <span className="commitment-who">{p.who}</span>}
            <span className="commitment-body">{p.body}</span>
          </div>
        )
      })}
    </div>
  )
}
