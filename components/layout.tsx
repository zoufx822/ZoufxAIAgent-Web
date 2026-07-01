'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/lib/store'
import { Rail } from '@/components/rail'
import { StatePanel } from '@/components/state-panel'
import { useEnsureAnchor } from '@/hooks/use-ensure-anchor'
import { MemoryAnchorDrawer } from '@/components/memory-anchor-drawer'
import { ChatWindow } from '@/components/chat-window'
import { LookBackModal } from '@/components/lookback-modal'

/**
 * 应用主布局——三段工作台式：Rail(56) + 主区(PresenceFloat + ChatWindow) + StatePanel(280)。
 * 记忆锚点 drawer 从 Rail 右侧滑出；LookBack modal 由 StatePanel 底部按钮触发。
 */
export function AppLayout() {
  useEnsureAnchor()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [rightHidden, setRightHidden] = useState(false)
  const layoutRef = useRef<HTMLDivElement>(null)
  const isLoading = useStore((s) => s.isLoading)
  const addAnchor = useStore((s) => s.addAnchor)

  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setRightHidden(entry.contentRect.width < 1080)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleNewAnchor = () => {
    if (isLoading) return
    addAnchor()
    setMemoryOpen(false)
  }

  return (
    <div ref={layoutRef} className="flex h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Rail
        memoryOpen={memoryOpen}
        onMemoryClick={() => setMemoryOpen((v) => !v)}
        onNewAnchor={handleNewAnchor}
      />

      <MemoryAnchorDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} />

      {/* 主区：Home 空态 = 无顶条；对话态 = ChatWindow 内嵌 PresenceFloat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatWindow />
      </div>

      {!rightHidden && <StatePanel />}

      <LookBackModal />
    </div>
  )
}
