'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import type { EyesContext } from './eyes'
import { Eyes } from './eyes'

interface PresenceFloatProps {
  context: EyesContext
  lookDown?: boolean
  waking?: boolean
}

export function PresenceFloat({ context, lookDown = false, waking = false }: PresenceFloatProps) {
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood   = useStore((s) => s.currentMood)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const moodVisible = !!currentMood && !MOOD_HIDDEN_STATUSES.has(currentStatus)

  // mood 变化时递增 glowKey，重挂载光晕重播绽放动画
  const prevMoodRef = useRef(currentMood)
  const [glowKey, setGlowKey] = useState(0)

  useEffect(() => {
    if (prevMoodRef.current !== null && currentMood !== prevMoodRef.current) {
      setGlowKey((k) => k + 1)
    }
    prevMoodRef.current = currentMood
  }, [currentMood])

  return (
    <div
      className="presence-float"
      data-mood={currentStatus}
      data-emotion={currentMood ?? undefined}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap">
        {glowKey > 0 && (
          <Fragment key={glowKey}>
            <div className="mood-glow" />
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
          lookDown={lookDown}
          waking={waking}
        />
      </div>
      <div className="presence-label">
        <span className="presence-dot" />
        <span className="presence-status">
          <span className="status-zh">{label.zh}</span>
          <span className="status-en">{label.en}</span>
        </span>
        {moodVisible && (
          <>
            <span className="presence-sep">·</span>
            <span
              key={currentMood}
              className="presence-mood"
              style={{ color: 'var(--emotion-color)' }}
            >
              {currentMood}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
