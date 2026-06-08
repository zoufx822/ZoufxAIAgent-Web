/**
 * 解析承诺文本——按三种方向返回结构化数据。
 * 格式：
 *   - 我（AI）答应X：...      → dir=ai
 *   - X答应我：...            → dir=user
 *   - 我们约定/说好：...       → dir=mutual
 */
export type ParsedCommitment = { dir: 'ai' | 'user' | 'mutual'; who?: string; body: string }

export function parseCommitment(text: string): ParsedCommitment {
  let m = text.match(/^我（AI）答应([^：:]+)[：:]\s*(.+)$/)
  if (m) return { dir: 'ai', who: m[1].trim(), body: m[2].trim() }
  m = text.match(/^我\(AI\)答应([^：:]+)[：:]\s*(.+)$/)
  if (m) return { dir: 'ai', who: m[1].trim(), body: m[2].trim() }
  m = text.match(/^([^：:]{1,12})答应我[：:]\s*(.+)$/)
  if (m) return { dir: 'user', who: m[1].trim(), body: m[2].trim() }
  m = text.match(/^我们(约定|说好)[：:]\s*(.+)$/)
  if (m) return { dir: 'mutual', body: m[2].trim() }
  return { dir: 'mutual', body: text }
}
