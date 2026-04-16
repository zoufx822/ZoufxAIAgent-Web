'use client'

import { useState, useEffect } from 'react'
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatWindow } from '@/components/chat-window'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { resolvedTheme, setTheme } = useTheme()

  // 移动端默认收起侧边栏
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false)
  }, [])

  return (
    <div className="flex h-full">
      {/* 遮罩层（仅移动端，侧边栏打开时显示） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏：移动端 fixed 浮层，桌面端 inline 布局 */}
      <div
        className={cn(
          'shrink-0 overflow-hidden transition-all duration-300',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50',
          sidebarOpen ? 'w-64' : 'w-0'
        )}
      >
        <AppSidebar />
      </div>

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* 顶部栏 */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <h1 className="text-sm font-semibold flex-1">Zoufx AI</h1>

          {/* 明暗切换 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
          </Button>
        </div>

        {/* 聊天区 */}
        <div className="flex-1 min-h-0">
          <ChatWindow />
        </div>
      </div>
    </div>
  )
}
