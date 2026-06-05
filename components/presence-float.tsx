'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import { useMoodPresence } from '@/hooks/use-mood-presence'
import { runFlip, type FlipRect } from '@/lib/flip'
import type { EyesContext } from './eyes'
import { Eyes } from './eyes'

interface PresenceFloatProps {
  context: EyesContext
  lookDown?: boolean
  waking?: boolean
  /** 起始页眼睛旧位置/尺寸——非空时挂载瞬间从该处 FLIP 飞入（仅首条消息那次） */
  flyFrom?: FlipRect | null
}

export function PresenceFloat({
  context,
  lookDown = false,
  waking = false,
  flyFrom = null,
}: PresenceFloatProps) {
  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood   = useStore((s) => s.currentMood)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const moodVisible = !!currentMood && !MOOD_HIDDEN_STATUSES.has(currentStatus)

  // 情绪连发 → 光晕池叠加 + 第一反应节拍 + 最小播放锁
  const { glowEls, beatKey, moodLocked } = useMoodPresence(currentMood)
  // 思考中 = 系统处于思考/调用工具态（与 LLM 情绪正交）；锁内情绪优先，故思考让位
  const thinkingState = currentStatus === 'thinking' || currentStatus === 'tooling'
  const showThinking = thinkingState && !moodLocked

  // error 系统态上升沿触发一次摇头（errorKey 驱动 Eyes）
  const [errKey, setErrKey] = useState(0)
  const prevErrRef = useRef(false)
  useEffect(() => {
    const isErr = currentStatus === 'error'
    if (isErr && !prevErrRef.current) setErrKey((k) => k + 1)
    prevErrRef.current = isErr
  }, [currentStatus])

  // 起始页→聊天页：眼睛从起始页中央位置连续飞到顶部并缩小（80→60），无"先消失再出现"。
  // 仅挂载时跑一次（PresenceFloat 在首条消息时才挂载，chat→chat 不重挂载）。
  const eyesWrapRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (flyFrom && eyesWrapRef.current) runFlip(eyesWrapRef.current, flyFrom, { scale: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="presence-float"
      data-mood={currentStatus}
      data-emotion={currentMood ?? undefined}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap" ref={eyesWrapRef}>
        <div className={`mood-ambient${moodVisible ? ' on' : ''}`} />
        {glowEls}
        <Eyes
          size={60}
          busy={currentStatus === 'writing'}
          mood={currentMood}
          context={context}
          color="var(--accent)"
          pupil="var(--bg)"
          asleep={currentStatus === 'asleep'}
          drifting={currentStatus === 'drifting'}
          thinking={showThinking}
          lookDown={lookDown}
          waking={waking}
          beatKey={beatKey}
          errorKey={errKey}
        />
        {showThinking && (
          <span className="think-dots">
            <i />
            <i />
            <i />
          </span>
        )}
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
