'use client'

import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import { useMoodPresence } from '@/hooks/use-mood-presence'
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

  // 情绪连发 → 光晕池叠加 + 第一反应节拍
  const { glowEls, beatKey } = useMoodPresence(currentMood)

  return (
    <div
      className="presence-float"
      data-mood={currentStatus}
      data-emotion={currentMood ?? undefined}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap">
        <div className={`mood-ambient${moodVisible ? ' on' : ''}`} />
        {glowEls}
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
          beatKey={beatKey}
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
