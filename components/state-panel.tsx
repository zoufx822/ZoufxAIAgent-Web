'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { HotMemoryPanel } from './state-panel/hot-memory'
import { MemoryAnchorsPanel } from './state-panel/memory-anchors'
import { EventsPanel } from './state-panel/events'
import { CommitmentsPanel } from './state-panel/commitments'

export function StatePanel() {
  const isLoading = useStore((s) => s.isLoading)
  const setLookbackOpen = useStore((s) => s.setLookbackOpen)

  const { data: hot, mutate: mutateHot } = useMemoryHot('user-impression')
  const { data: events, mutate: mutateEvents } = useMemoryHot('significant-event')
  const { data: commitments, mutate: mutateCommitments } = useMemoryHot('commitment')

  useEffect(() => {
    if (!isLoading) {
      mutateHot()
      mutateEvents()
      mutateCommitments()
    }
  }, [isLoading, mutateHot, mutateEvents, mutateCommitments])

  const hotFilled = Object.values(hot || {}).filter(v => v?.trim()).length
  const eventCount = Object.values(events || {}).filter(v => v?.trim()).length
  const commitCount = Object.values(commitments || {}).filter(v => v?.trim()).length

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 280,
        background: 'var(--sidebar)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 16px' }}>
        <div className="sp-h">小Z的记忆</div>
        <Section title="印象" card right={hotFilled < 3 ? <span className="imp-counter">{hotFilled}/10</span> : undefined}>
          <HotMemoryPanel data={hot} />
        </Section>

        <div style={{ marginBottom: 22 }}>
          <MemoryAnchorsPanel />
        </div>

        <Section title="经历" right={<span className="count">{eventCount}</span>}>
          <EventsPanel data={events} />
        </Section>

        <Section title="承诺" right={<span className="count">{commitCount}</span>}>
          <CommitmentsPanel data={commitments} onOpenLookback={() => setLookbackOpen(true)} />
        </Section>
      </div>
    </aside>
  )
}

function Section({
  title,
  right,
  card,
  children,
}: {
  title: string
  right?: React.ReactNode
  card?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="sp-section-h">
        <span>{title}</span>
        {right}
      </div>
      {card ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
