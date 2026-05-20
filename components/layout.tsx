'use client'

import {useState} from 'react'
import {useStore} from '@/lib/store'
import {Rail} from '@/components/rail'
import {Heartbeat} from '@/components/heartbeat'
import {StatePanel} from '@/components/state-panel'
import {MemoryAnchorDrawer} from '@/components/memory-anchor-drawer'
import {ChatWindow} from '@/components/chat-window'

/**
 * 应用主布局：三段「工作台」式
 *   ┌─Rail 56─┬─Heartbeat 48 mono──────────────────────┬─StatePanel 280─┐
 *   │  Z      │                                          │ - 当前任务      │
 *   │  记忆🔘 │                                          │ - 近期工具      │
 *   │  +新对话 │   Home / Chat (ChatWindow)              │ - 记忆片段(v0.2)│
 *   │  ☾ 主题 │                                          │               │
 *   └─────────┴──────────────────────────────────────────┴───────────────┘
 *      ↑drawer 从 left:56 滑出 = 记忆锚点列表（替代旧 sidebar 会话列表）
 */
export function AppLayout() {
  const [memoryOpen, setMemoryOpen] = useState(false)
  const {createAnchor, isLoading} = useStore()

  const handleNewAnchor = () => {
    if (isLoading) return
    createAnchor()
    setMemoryOpen(false)
  }

  return (
    <div className="flex h-full overflow-hidden" style={{background: 'var(--bg)'}}>
      <Rail
        memoryOpen={memoryOpen}
        onMemoryClick={() => setMemoryOpen((v) => !v)}
        onNewAnchor={handleNewAnchor}
      />

      <MemoryAnchorDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* 主区：心跳条 + 对话流 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Heartbeat />
        <div className="min-h-0 flex-1">
          <ChatWindow />
        </div>
      </div>

      <StatePanel />
    </div>
  )
}
