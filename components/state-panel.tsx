'use client'

import {useEffect} from 'react'
import {useStore, type Status} from '@/lib/store'
import {useMemoryHot} from '@/hooks/use-memory-hot'
import {useMemoryCold} from '@/hooks/use-memory-cold'

// 状态中文 + 英文标识，与 heartbeat.tsx STATUS_LABELS 对齐
const STATUS_LABELS: Record<Status, {zh: string; en: string}> = {
  idle:     {zh: '等待交互', en: 'IDLE'},
  thinking: {zh: '思考中',   en: 'THINKING'},
  tooling:  {zh: '使用工具', en: 'TOOLING'},
  writing:  {zh: '回复中',   en: 'WRITING'},
  error:    {zh: '出错了',   en: 'ERROR'},
  asleep:   {zh: '打盹中',   en: 'ASLEEP'},
}

// Hot Memory 字段 → 中文标签
const HOT_LABELS: Record<string, string> = {
  username: '称呼',
  language: '语言',
  role: '职业',
  interests: '兴趣',
  tone: '风格',
}

/**
 * 当前状态卡片的渲染数据：与左上角 heartbeat 顶条结构对齐。
 * - mood 时效规则沿用 heartbeat：≥15min 隐藏；error/asleep 强制不显示
 * - reply 段仅活动态（thinking/tooling/writing）显示，追加在末尾
 */
function buildStateDetail(
  status: Status,
  mood: string | null,
  lastMoodAt: number | null,
  replyTo: string,
): {zh: string; en: string; mood: string; reply: string} {
  const label = STATUS_LABELS[status]
  const ageMin = lastMoodAt ? (Date.now() - lastMoodAt) / 60_000 : Infinity
  const showMood = mood && status !== 'error' && status !== 'asleep' && ageMin < 15
  const isActive = status === 'thinking' || status === 'tooling' || status === 'writing'
  return {
    zh: label.zh,
    en: label.en,
    mood: showMood ? mood! : '',
    reply: isActive && replyTo ? replyTo : '',
  }
}

/**
 * 右侧 280px 状态面板。
 *
 * 四个 section（自上而下）：
 *   - 用户印象：useMemoryHot 全部白名单字段，未识别时显示「尚未识别」
 *   - 当前状态：状态机 + 情绪 + 活动态时的回应内容
 *   - 近期工具调用：聚合本会话所有 toolCalls
 *   - 记忆片段：useMemoryCold 最近 5 条，每次流结束后 invalidate 刷新
 */
export function StatePanel() {
  const {anchors, currentAnchorId, isLoading, currentStatus, currentMood, lastMoodAt} = useStore()
  const currentAnchor = anchors.find((a) => a.id === currentAnchorId)
  const messages = currentAnchor?.messages ?? []

  const {data: hot, mutate: mutateHot} = useMemoryHot()
  const {data: cold, mutate: mutateCold} = useMemoryCold(5)

  // 流结束时刷新 hot / cold（hot_memory 可能被 update_hot_memory 写入，cold 新加 2 行）
  useEffect(() => {
    if (!isLoading) {
      mutateHot()
      mutateCold()
    }
  }, [isLoading, mutateHot, mutateCold])

  const hotEntries = Object.entries(hot).filter(([k, v]) => HOT_LABELS[k] && v)

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const replyTo = lastUserMsg ? truncate(lastUserMsg.content, 60) : ''
  const stateDetail = buildStateDetail(currentStatus, currentMood, lastMoodAt, replyTo)

  // 近期工具调用：聚合所有 messages 的 toolCalls
  const recentTools = messages
    .flatMap((m) => m.toolCalls ?? [])
    .slice(-6)
    .reverse()

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 280,
        background: 'var(--sidebar)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <div style={{flex: 1, overflow: 'auto', padding: '18px 16px 16px'}}>
        <Section title="用户印象">
          {hotEntries.length === 0 ? (
            <Card>尚未识别</Card>
          ) : (
            <Card>
              <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                {hotEntries.map(([k, v]) => (
                  <div key={k} style={{display: 'flex', gap: 8}}>
                    <span
                      style={{
                        color: 'var(--t3)',
                        width: 44,
                        flexShrink: 0,
                        fontSize: 11.5,
                      }}
                    >
                      {HOT_LABELS[k]}
                    </span>
                    <span style={{color: 'var(--t1)', flex: 1, minWidth: 0, wordBreak: 'break-word'}}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Section>

        <Section title="当前状态">
          <Card>
            <div style={{display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, rowGap: 2}}>
              <span style={{color: 'var(--t1)'}}>{stateDetail.zh}</span>
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: '.18em',
                  color: 'var(--t3)',
                  textTransform: 'uppercase',
                }}
              >
                {stateDetail.en}
              </span>
              {stateDetail.mood && (
                <>
                  <span style={{color: 'var(--t3)', opacity: 0.5}}>·</span>
                  <span style={{fontStyle: 'italic', color: 'var(--t2)', fontSize: 11.5}}>
                    {stateDetail.mood}
                  </span>
                </>
              )}
              {stateDetail.reply && (
                <span style={{color: 'var(--t2)'}}>{stateDetail.reply}</span>
              )}
            </div>
          </Card>
        </Section>

        <Section title="近期工具调用" count={recentTools.length}>
          {recentTools.length === 0 ? (
            <Empty>未有调用记录。</Empty>
          ) : (
            recentTools.map((t) => (
              <ToolMini key={t.id} name={t.toolDisplay || t.tool} status={t.status} />
            ))
          )}
        </Section>

        <Section title="记忆片段" count={cold.length}>
          {cold.length === 0 ? (
            <Empty>还没有交集。</Empty>
          ) : (
            cold.map((e) => (
              <Card key={e.id} label={e.role}>
                {truncate(e.content, 80)}
              </Card>
            ))
          )}
        </Section>
      </div>
    </aside>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div style={{marginBottom: 22}}>
      <div
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 4px',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
        }}
      >
        <span>{title}</span>
        {count !== undefined && <span style={{color: 'var(--t2)', fontSize: 10}}>{count}</span>}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>{children}</div>
    </div>
  )
}

function Card({label, children}: {label?: string; children: React.ReactNode}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        borderRadius: 8,
        padding: '11px 12px',
        fontSize: 12,
        color: 'var(--t1)',
        lineHeight: 1.65,
        letterSpacing: '-.005em',
        marginBottom: 6,
      }}
    >
      {label && (
        <span
          className="mono"
          style={{
            display: 'block',
            fontSize: 9.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--t3)',
            marginBottom: 4,
          }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

function Empty({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--t3)',
        padding: '8px 4px',
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </div>
  )
}

function ToolMini({name, status}: {name: string; status: string}) {
  const dotColor =
    status === 'running' ? 'var(--t1)' : status === 'failed' ? '#dc2626' : 'var(--t2)'
  return (
    <div
      className="mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 11,
        marginBottom: 6,
      }}
    >
      <span style={{width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0}} />
      <span style={{flex: 1, color: 'var(--t1)', fontWeight: 500}}>{name}</span>
      <span style={{color: 'var(--t3)', fontSize: 10}}>{status}</span>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '…'
}
