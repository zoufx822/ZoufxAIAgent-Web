'use client'

import {useStore} from '@/lib/store'

/**
 * 右侧 280px 状态面板。
 *
 * 三个 section：
 *   - 当前任务：根据 isLoading + 最后用户消息推断
 *   - 近期工具调用：聚合本会话所有 toolCalls，按时序倒序
 *   - 记忆片段：v2 接后端 Hot Memory + Memory Stream 后展示；阶段 A 留空占位
 */
export function StatePanel() {
  const {anchors, currentAnchorId, isLoading} = useStore()
  const currentAnchor = anchors.find((a) => a.id === currentAnchorId)
  const messages = currentAnchor?.messages ?? []

  // 当前任务：取最后一条 user 消息 prompt 截断
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const currentTask = isLoading && lastUserMsg ? truncate(lastUserMsg.content, 60) : ''

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
      {/* Header */}
      <div
        className="mono"
        style={{
          height: 48,
          padding: '0 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
        }}
      >
        状态 / state
      </div>

      {/* Body */}
      <div style={{flex: 1, overflow: 'auto', padding: 16}}>
        <Section title="当前任务">
          {currentTask ? (
            <Card label="task">{currentTask}</Card>
          ) : (
            <Empty>小Z 处于空闲状态。</Empty>
          )}
        </Section>

        <Section title="近期工具调用" count={recentTools.length}>
          {recentTools.length === 0 ? (
            <Empty>未有调用记录。</Empty>
          ) : (
            recentTools.map((t) => (
              <ToolMini key={t.id} name={t.tool} status={t.status} />
            ))
          )}
        </Section>

        <Section title="记忆片段" placeholder>
          <Empty>v2 阶段开放——届时会展示对方的关键事实与近期经历。</Empty>
        </Section>
      </div>
    </aside>
  )
}

function Section({
  title,
  count,
  placeholder,
  children,
}: {
  title: string
  count?: number
  placeholder?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{marginBottom: 20}}>
      <div
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: placeholder ? 'var(--t3)' : 'var(--t2)',
          marginBottom: 8,
        }}
      >
        <span>{title}</span>
        {count !== undefined && <span style={{color: 'var(--t3)'}}>{count}</span>}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>{children}</div>
    </div>
  )
}

function Card({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--t1)',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
          marginRight: 8,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function Empty({children}: {children: React.ReactNode}) {
  return (
    <div style={{fontSize: 12, color: 'var(--t3)', lineHeight: 1.5, padding: '4px 0'}}>
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
        padding: '6px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        fontSize: 11,
      }}
    >
      <span style={{width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0}} />
      <span style={{flex: 1, color: 'var(--t1)'}}>{name}</span>
      <span style={{color: 'var(--t3)', fontSize: 10}}>{status}</span>
    </div>
  )
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n) + '…'
}
