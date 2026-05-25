'use client'

import {useState} from 'react'
import {useStore} from '@/lib/store'
import {Rail} from '@/components/rail'
import {Heartbeat} from '@/components/heartbeat'
import {StatePanel} from '@/components/state-panel'
import {MemoryAnchorDrawer} from '@/components/memory-anchor-drawer'
import {ChatWindow} from '@/components/chat-window'

/**
 * 应用主布局——三段工作台式：Rail(56) + 主区(Heartbeat + ChatWindow) + StatePanel(280)。
 * 记忆锚点 drawer 从 Rail 右侧滑出。
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
