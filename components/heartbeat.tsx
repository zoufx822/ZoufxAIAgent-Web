'use client'

import { useStore } from '@/lib/store'
import { useAsleepDetector } from '@/hooks/use-asleep-detector'

/**
 * 顶部 48px 情绪条（v1.1 重做版，按 design_handoff_zoufx_ai/{emotion,mood}-system.md）。
 *
 * 单行布局：● 色点 + 中文 status + EN mono · italic mood（可选）
 * 数据源：currentStatus / currentMood / lastMoodAt 全部从 zustand 读，由 use-chat-stream 写。
 * ASLEEP 派生：useAsleepDetector 内部 30s tick，按本机时间在 idle/asleep 间切换。
 */

const STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  idle:     { zh: '等待交互', en: 'IDLE' },
  thinking: { zh: '思考中',   en: 'THINKING' },
  tooling:  { zh: '使用工具', en: 'TOOLING' },
  writing:  { zh: '回复中',   en: 'WRITING' },
  error:    { zh: '出错了',   en: 'ERROR' },
  asleep:   { zh: '打盹中',   en: 'ASLEEP' },
}

/**
 * mood 显示纯函数（来自 mood-system.md 第四节）。
 *   - error/asleep 强制隐藏（语义冲突）
 *   - ≥15min 隐藏 / 5–15min stale 灰 / <5min 正常
 */
function getMoodDisplay(
  status: string,
  mood: string | null,
  lastMoodAt: number | null,
): { visible: boolean; stale: boolean; mood: string } {
  if (!mood || status === 'error' || status === 'asleep') {
    return { visible: false, stale: false, mood: '' }
  }
  const ageMin = lastMoodAt ? (Date.now() - lastMoodAt) / 60_000 : Infinity
  if (ageMin >= 15) return { visible: false, stale: false, mood: '' }
  return { visible: true, stale: ageMin >= 5, mood }
}

export function Heartbeat() {
  // ASLEEP 派生（顶层组件挂载一次即可）
  useAsleepDetector()

  const currentStatus = useStore((s) => s.currentStatus)
  const currentMood = useStore((s) => s.currentMood)
  const lastMoodAt = useStore((s) => s.lastMoodAt)

  const label = STATUS_LABELS[currentStatus] ?? STATUS_LABELS.idle
  const moodDisp = getMoodDisplay(currentStatus, currentMood, lastMoodAt)

  return (
    <div
      className="hb flex items-center flex-shrink-0"
      data-mood={currentStatus}
      role="status"
      aria-live="polite"
      style={{
        height: 48,
        padding: '0 28px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <span
          className="hb-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--mood, #22c55e)',
            boxShadow: '0 0 0 0 var(--mood-glow, #22c55e60)',
            animation: 'hbPulse var(--mood-dur, 2.4s) ease-in-out infinite',
            flexShrink: 0,
            alignSelf: 'center',
            transition: 'background-color .22s ease',
          }}
        />
        <span
          style={{
            fontFamily: "'Space Grotesk', 'Noto Sans SC', sans-serif",
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--mood, var(--t1))',
            letterSpacing: '-.005em',
            transition: 'color .22s ease',
          }}
        >
          {label.zh}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '.18em',
            color: 'var(--mood, var(--t3))',
            opacity: 0.55,
            textTransform: 'uppercase',
            transition: 'color .22s ease',
          }}
        >
          {label.en}
        </span>
        {moodDisp.visible && (
          <>
            <span
              className="mono"
              style={{
                color: 'var(--t3)',
                opacity: 0.5,
                fontSize: 11,
                margin: '0 8px',
                alignSelf: 'center',
              }}
            >
              ·
            </span>
            <span
              // mood + lastMoodAt 联合 key 让相同 mood 词重发也能重放 fade-in
              key={`${moodDisp.mood}-${lastMoodAt ?? 0}`}
              className={`hb-mood-label${moodDisp.stale ? ' stale' : ''}`}
              style={{
                fontFamily: "'Noto Sans SC', 'Space Grotesk', sans-serif",
                fontStyle: 'italic',
                fontSize: 11.5,
                letterSpacing: '.02em',
                color: 'var(--t3)',
                alignSelf: 'baseline',
              }}
            >
              {moodDisp.mood}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
