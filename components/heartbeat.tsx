'use client'

import {useEffect, useState} from 'react'
import {useStore} from '@/lib/store'

/**
 * 顶部 48px 心跳条。mono 字体显示"机器视角"状态。
 *
 * 阶段 A 阶段：
 *   - 小Z + pulse 点（idle/思考中视觉反馈）
 *   - mem 计数（当前所有锚点的消息累计）
 *   - tools 计数（当前会话所有工具调用累计）
 *   - user（display_name，目前从 localStorage 读，v2 接后端 Hot Memory）
 *   - state 文字（idle / 思考中 / 工具调用 / 输出中）
 *   - 实时时钟 HH:MM:SS
 */
export function Heartbeat() {
  const {anchors, currentAnchorId, isLoading} = useStore()
  const currentAnchor = anchors.find((a) => a.id === currentAnchorId)
  const memCount = anchors.reduce((acc, a) => acc + a.messages.length, 0)
  const toolCount = (currentAnchor?.messages ?? []).reduce(
    (acc, m) => acc + (m.toolCalls?.length ?? 0),
    0,
  )

  // user 名字：v1 阶段从 localStorage 读，v2 改为后端 Hot Memory 拉取
  const [userName, setUserName] = useState('')
  useEffect(() => {
    try { setUserName(localStorage.getItem('zUserName') || '') } catch { /* noop */ }
  }, [])

  // state 推导：根据 isLoading + 最后消息状态
  const lastMsg = currentAnchor?.messages.at(-1)
  const hbState = (() => {
    if (!isLoading) return '等待输入'
    if (lastMsg?.toolCalls?.some((t) => t.status === 'running')) return '工具调用'
    if (lastMsg?.thinking && (!lastMsg.content || lastMsg.content.length < 4)) return '思考中'
    return '输出中'
  })()

  // 实时时钟
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const hh = now ? String(now.getHours()).padStart(2, '0') : '--'
  const mm = now ? String(now.getMinutes()).padStart(2, '0') : '--'
  const ss = now ? String(now.getSeconds()).padStart(2, '0') : '--'

  return (
    <div
      className="mono flex items-center flex-shrink-0"
      style={{
        height: 48,
        padding: '0 22px',
        borderBottom: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--t2)',
        gap: 18,
        letterSpacing: '0.04em',
        background: 'var(--bg)',
      }}
    >
      <HbId />
      <HbDivider />
      <HbCell k="mem" v={String(memCount)} />
      <HbCell k="tools" v={String(toolCount)} />
      <HbCell k="user" v={userName || 'unknown'} />
      <div style={{flex: 1}} />
      <span style={{color: 'var(--t1)'}}>{hbState}</span>
      <HbDivider />
      <HbCell v={`${hh}:${mm}:${ss}`} />
    </div>
  )
}

function HbId() {
  return (
    <div className="flex items-center" style={{gap: 7, color: 'var(--t1)'}}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--t1)',
          animation: 'pulse-dot 1.8s ease infinite',
        }}
      />
      <span style={{fontWeight: 500, letterSpacing: '0.02em'}}>小Z</span>
    </div>
  )
}

function HbDivider() {
  return <div style={{width: 1, height: 14, background: 'var(--border)'}} />
}

function HbCell({k, v}: {k?: string; v: string}) {
  return (
    <div className="flex items-center" style={{gap: 6}}>
      {k && <span style={{color: 'var(--t3)', textTransform: 'lowercase'}}>{k}</span>}
      <span style={{color: 'var(--t1)'}}>{v}</span>
    </div>
  )
}
