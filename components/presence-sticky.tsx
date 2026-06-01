'use client'

import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import type { EyesContext } from './eyes'
import { Eyes } from './eyes'

/**
 * v0.145 顶部 Presence——替代 Heartbeat。
 *
 * 两态：
 * - 收起（默认 56px）：眼睛 28px + 心情 · 状态 单行
 * - Spotlight（170px）：mood 触发的高亮态，由 store.spotlight 持续 ~3s
 *
 * Spotlight 由 ChatStream onMood 通过 triggerSpotlight() 推送；纯 UI 反应。
 * context 由父级 ChatWindow 计算后下传——避免与 ChatWindow 各跑一份探测器。
 */

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

export function PresenceSticky({ context }: { context: EyesContext }) {
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood = useStore((s) => s.currentMood)
  const lastMoodAt = useStore((s) => s.lastMoodAt)
  const spotlight = useStore((s) => s.spotlight)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const md = moodVisible(currentStatus, currentMood, lastMoodAt)

  return (
    <div
      className={`presence-sticky${spotlight ? ' spotlight' : ''}`}
      data-mood={currentStatus}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap">
        <Eyes
          size={spotlight ? 88 : 32}
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
