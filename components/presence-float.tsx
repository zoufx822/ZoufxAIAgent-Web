'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import type { EyesContext } from './eyes'
import { Eyes } from './eyes'

function moodVisible(
  status: string,
  mood: string | null,
  lastMoodAt: number | null
): { visible: boolean; stale: boolean } {
  if (!mood || MOOD_HIDDEN_STATUSES.has(status)) return { visible: false, stale: false }
  const ageMin = lastMoodAt ? (Date.now() - lastMoodAt) / 60_000 : Infinity
  if (ageMin >= 15) return { visible: false, stale: false }
  return { visible: true, stale: ageMin >= 5 }
}

export function PresenceFloat({ context }: { context: EyesContext }) {
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood = useStore((s) => s.currentMood)
  const lastMoodAt = useStore((s) => s.lastMoodAt)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const md = moodVisible(currentStatus, currentMood, lastMoodAt)

  // mood 变化（非首次、非从 null 浮现）时递增 ringKey，重挂载双环重播扩散动画
  const prevMoodRef = useRef(currentMood)
  const [ringKey, setRingKey] = useState(0)

  useEffect(() => {
    if (prevMoodRef.current !== null && currentMood !== prevMoodRef.current) {
      setRingKey((k) => k + 1)
    }
    prevMoodRef.current = currentMood
  }, [currentMood])

  return (
    <div
      className="presence-float"
      data-mood={currentStatus}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap">
        {ringKey > 0 && (
          <Fragment key={ringKey}>
            <div className="mood-ring" />
            <div className="mood-ring mood-ring-2" />
          </Fragment>
        )}
        <Eyes
          size={60}
          busy={
            currentStatus === 'thinking' ||
            currentStatus === 'tooling' ||
            currentStatus === 'writing'
          }
          mood={currentMood}
          context={context}
          color="var(--accent)"
          pupil="var(--bg)"
          asleep={currentStatus === 'asleep'}
          drifting={currentStatus === 'drifting'}
        />
      </div>
      <div className="presence-label">
        <span className="presence-dot" />
        <span className="presence-status">
          <span className="status-zh">{label.zh}</span>
          <span className="status-en">{label.en}</span>
        </span>
        {md.visible && (
          <>
            <span className="presence-sep">·</span>
            <span key={currentMood} className={`presence-mood${md.stale ? ' stale' : ''}`}>
              {currentMood}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
