'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { HotMemoryPanel } from './state-panel/hot-memory'
import { MemoryAnchorsPanel } from './state-panel/memory-anchors'
import { EventsPanel } from './state-panel/events'
import { CommitmentsPanel } from './state-panel/commitments'

/**
 * 右栏 280px 状态面板（v0.145）。
 *
 * Section 顺序（自上而下）：
 *   1. 用户印象  ──  Hot Memory user-impression 双区
 *   2. 记忆锚点  ──  near/mid/far 三层衰减
 *   3. 值得记下  ──  Hot Memory significant-event（叙事便签）
 *   4. 彼此承诺  ──  Hot Memory commitment（带方向箭头）
 *   底部「回望」按钮 → LookBackModal
 *
 * 旧的「当前状态」「近期工具调用」「记忆片段」section 已下线——
 * 状态由顶部 PresenceSticky 承载，工具调用回归气泡内的 ReAct 渲染。
 */
export function StatePanel() {
  const isLoading = useStore((s) => s.isLoading)
  const setLookbackOpen = useStore((s) => s.setLookbackOpen)

  const { data: hot, mutate: mutateHot } = useMemoryHot('user-impression')
  const { data: events, mutate: mutateEvents } = useMemoryHot('significant-event')
  const { data: commitments, mutate: mutateCommitments } = useMemoryHot('commitment')

  // 流结束时刷新三类 Hot Memory
  useEffect(() => {
    if (!isLoading) {
      mutateHot()
      mutateEvents()
      mutateCommitments()
    }
  }, [isLoading, mutateHot, mutateEvents, mutateCommitments])

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 280,
        background: 'var(--sidebar)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 12px 12px' }}>
        <Section title="用户印象">
          <HotMemoryPanel data={hot} />
        </Section>

        <Section title="记忆锚点">
          <MemoryAnchorsPanel />
        </Section>

        <Section title="值得记下">
          <EventsPanel data={events} />
        </Section>

        <Section title="彼此承诺">
          <CommitmentsPanel data={commitments} />
        </Section>
      </div>

      <button
        onClick={() => setLookbackOpen(true)}
        className="mono"
        style={{
          borderTop: '1px solid var(--border-lt)',
          padding: '12px 16px',
          background: 'transparent',
          color: 'var(--t2)',
          fontSize: 11,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'color .18s, background-color .18s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--t1)'
          e.currentTarget.style.background = 'var(--surf-hov)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--t2)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        回望 · LOOKBACK ↗
      </button>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        className="mono"
        style={{
          padding: '6px 4px 8px',
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--t3)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          border: '1px solid var(--border-lt)',
          borderRadius: 8,
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
