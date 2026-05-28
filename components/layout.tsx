'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Rail } from '@/components/rail'
import { StatePanel } from '@/components/state-panel'
import { useEnsureAnchor } from '@/hooks/use-ensure-anchor'
import { MemoryAnchorDrawer } from '@/components/memory-anchor-drawer'
import { ChatWindow } from '@/components/chat-window'
import { LookBackModal } from '@/components/lookback-modal'

/**
 * 应用主布局——三段工作台式：Rail(56) + 主区(PresenceSticky + ChatWindow) + StatePanel(280)。
 * 记忆锚点 drawer 从 Rail 右侧滑出；LookBack modal 由 StatePanel 底部按钮触发。
 */
export function AppLayout() {
  useEnsureAnchor()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const userId = useStore((s) => s.userId)
  const isLoading = useStore((s) => s.isLoading)
  const addAnchor = useStore((s) => s.addAnchor)

  const handleNewAnchor = async () => {
    if (isLoading || !userId) return
    try {
      const created = await api.createAnchor(userId)
      addAnchor({
        id: created.id,
        title: created.title ?? '新对话',
        lastActiveAt: created.lastActiveAt,
        createdAt: created.createdAt,
      })
      setMemoryOpen(false)
    } catch (err) {
      console.warn('createAnchor failed', err)
      toast.error('新建对话失败，请稍后重试')
    }
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Rail
        memoryOpen={memoryOpen}
        onMemoryClick={() => setMemoryOpen((v) => !v)}
        onNewAnchor={handleNewAnchor}
      />

      <MemoryAnchorDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* 主区：Home 空态 = 无顶条；对话态 = ChatWindow 内嵌 PresenceSticky */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatWindow />
      </div>

      <StatePanel />

      <LookBackModal />
    </div>
  )
}
