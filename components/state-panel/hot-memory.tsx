'use client'

/**
 * Hot Memory 双区面板：档案（outer）+ 印象（inner）。
 *
 * - 档案 outer：display_name / role / language / timezone / interests，K-V 横排
 * - 印象 inner：personality / communication_style / habits / values / hobbies，斜体段落
 *
 * 数据来自 user-impression type 的 Hot Memory；未填字段直接跳过。
 */

const HOT_OUTER: { key: string; label: string }[] = [
  { key: 'display_name', label: '称呼' },
  { key: 'role',         label: '职业' },
  { key: 'language',     label: '语言' },
  { key: 'timezone',     label: '时区' },
  { key: 'interests',    label: '兴趣' },
]

const HOT_INNER: { key: string; label: string }[] = [
  { key: 'personality',         label: '性格' },
  { key: 'communication_style', label: '沟通风格' },
  { key: 'habits',              label: '习惯' },
  { key: 'values',              label: '在意' },
  { key: 'hobbies',             label: '爱好' },
]

export function HotMemoryPanel({ data }: { data: Record<string, string> }) {
  const outer = HOT_OUTER.filter((f) => data[f.key]?.trim())
  const inner = HOT_INNER.filter((f) => data[f.key]?.trim())
  if (outer.length === 0 && inner.length === 0) {
    return <div className="imp-zone" style={{ color: 'var(--t3)', fontSize: 12 }}>尚未识别</div>
  }

  return (
    <div>
      {outer.length > 0 && (
        <div className="imp-zone">
          <div className="imp-zone-h">档案 · profile</div>
          {outer.map((f) => (
            <div key={f.key} className="imp-outer-row">
              <span className="imp-k">{f.label}</span>
              <span className="imp-v">{data[f.key]}</span>
            </div>
          ))}
        </div>
      )}
      {inner.length > 0 && (
        <div className="imp-zone">
          <div className="imp-zone-h">印象 · impression</div>
          {inner.map((f) => (
            <div key={f.key} className="imp-inner-block">
              <div className="imp-inner-k">{f.label}</div>
              <div className="imp-inner-v">{data[f.key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
