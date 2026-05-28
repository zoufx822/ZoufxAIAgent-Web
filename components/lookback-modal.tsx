'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useMemoryHot } from '@/hooks/use-memory-hot'
import { EventsPanel } from './state-panel/events'
import { CommitmentsPanel } from './state-panel/commitments'

/**
 * LookBack 回望面板——overlay 全屏 modal，两栏并排：significant-event 叙事 + commitment 列表。
 * 入口在右栏底部「回望」按钮；ESC 或点遮罩关闭。
 */
export function LookBackModal() {
  const open = useStore((s) => s.lookbackOpen)
  const setOpen = useStore((s) => s.setLookbackOpen)
  const { data: events } = useMemoryHot('significant-event')
  const { data: commitments } = useMemoryHot('commitment')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="lookback-overlay" onClick={() => setOpen(false)}>
      <div className="lookback-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lookback-head">
          <span className="lookback-title">回望 · LookBack</span>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--t2)', fontSize: 18, padding: '0 4px', lineHeight: 1,
            }}
            aria-label="关闭"
          >×</button>
        </div>
        <div className="lookback-body">
          <div className="lookback-col">
            <div className="lookback-col-h">值得记下的瞬间</div>
            <EventsPanel data={events} />
          </div>
          <div className="lookback-col">
            <div className="lookback-col-h">彼此的承诺</div>
            <CommitmentsPanel data={commitments} />
          </div>
        </div>
      </div>
    </div>
  )
}
