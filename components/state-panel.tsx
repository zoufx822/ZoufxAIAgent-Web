'use client'

import {useEffect} from 'react'
import {useStore} from '@/lib/store'
import {useMemoryHot} from '@/hooks/use-memory-hot'
import {useMemoryStream} from '@/hooks/use-memory-stream'

/**
 * 右侧 280px 状态面板（v1.1 重做版）。
 *
 * 四个 section（自上而下）：
 *   - 对话目标：useMemoryHot.display_name，未识别时显示「尚未识别」
 *   - 当前任务：根据 isLoading + 最后用户消息推断
 *   - 近期工具调用：聚合本会话所有 toolCalls
 *   - 记忆片段：useMemoryStream 最近 5 条，每次流结束后 invalidate 刷新
 */
export function StatePanel() {
  const {anchors, currentAnchorId, isLoading} = useStore()
  const currentAnchor = anchors.find((a) => a.id === currentAnchorId)
  const messages = currentAnchor?.messages ?? []

  const {data: hot, mutate: mutateHot} = useMemoryHot()
  const {data: stream, mutate: mutateStream} = useMemoryStream(5)

  // 流结束时刷新 hot / stream（profile 可能被 update_user_profile 写入，stream 新加 2 行）
  useEffect(() => {
    if (!isLoading) {
      mutateHot()
      mutateStream()
    }
  }, [isLoading, mutateHot, mutateStream])

  const displayName = hot.display_name

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
      <div style={{flex: 1, overflow: 'auto', padding: '18px 16px 16px'}}>
        <Section title="对话目标">
          <Card>{displayName || '尚未识别'}</Card>
        </Section>

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
              <ToolMini key={t.id} name={t.toolDisplay} status={t.status} />
            ))
          )}
        </Section>

        <Section title="记忆片段" count={stream.length}>
          {stream.length === 0 ? (
            <Empty>还没有交集。</Empty>
          ) : (
            stream.map((e) => (
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
