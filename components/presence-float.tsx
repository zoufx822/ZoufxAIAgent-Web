'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { STATUS_LABELS, MOOD_HIDDEN_STATUSES } from '@/lib/status-labels'
import { usePresence } from '@/hooks/use-presence'
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

/**
 * 输入框上方的存在感指示器——眼睛贴住打字/阅读焦点，不再占页面顶部。
 * 只在后端发 presence 时变脸；强度驱动 spotlight 的缩放与停留时长。
 */
export function PresenceFloat({
  context,
  lookDown = false,
  waking = false,
  flyFrom = null,
}: PresenceFloatProps) {
  const currentStatus = useStore((s) => s.currentStatus)
  const presence = useStore((s) => s.presence)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const { expression, intensity, spotlight, beatKey } = usePresence(presence)
  const moodVisible = !!expression && !MOOD_HIDDEN_STATUSES.has(currentStatus)

  // 思考中 = 系统处于思考/调用工具态；spotlight 期间让位给表情
  const thinkingState = currentStatus === 'thinking' || currentStatus === 'tooling'
  const showThinking = thinkingState && !spotlight

  // error 系统态上升沿触发一次摇头（errorKey 驱动 Eyes）
  const [errKey, setErrKey] = useState(0)
  const prevErrRef = useRef(false)
  useEffect(() => {
    const isErr = currentStatus === 'error'
    if (isErr && !prevErrRef.current) setErrKey((k) => k + 1)
    prevErrRef.current = isErr
  }, [currentStatus])

  // 起始页→聊天页：眼睛从起始页中央位置连续飞到输入框上方并缩小。
  const eyesWrapRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (flyFrom && eyesWrapRef.current) runFlip(eyesWrapRef.current, flyFrom, { scale: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`presence-float${spotlight ? ' spotlight' : ''}`}
      data-mood={currentStatus}
      data-emotion={expression ?? undefined}
      style={{ ['--presence-i' as string]: String(intensity / 5) } as React.CSSProperties}
      role="status"
      aria-live="polite"
    >
      <div className="presence-eyes-wrap" ref={eyesWrapRef}>
        <div className={`mood-ambient${moodVisible ? ' on' : ''}`} />
        <Eyes
          size={40}
          busy={currentStatus === 'writing'}
          mood={expression}
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
            <span key={expression} className="presence-mood">
              {expression}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
