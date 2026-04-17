'use client'

import { useState, useEffect } from 'react'
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { AppSidebar } from '@/components/app-sidebar'
import { ChatWindow } from '@/components/chat-window'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [isMobile])

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* 遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden backdrop-blur-[2px] transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <div
        className={cn(
          'shrink-0 overflow-hidden transition-all duration-300',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50',
          sidebarOpen ? 'w-72 surface-line bg-sidebar max-md:w-72' : 'w-0'
        )}
      >
        <AppSidebar />
      </div>

      {/* 主内容区 */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 py-3 md:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full text-foreground/70 hover:bg-background/70 hover:text-foreground"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>

          <div className="min-w-0">
            <h1 className="truncate text-[1.75rem] font-medium tracking-tight text-foreground/90 md:text-[2rem]">
              Zoufx
            </h1>
          </div>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full text-foreground/70 hover:bg-background/70 hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="size-4 hidden dark:block" />
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <ChatWindow />
        </div>
      </div>
    </div>
  )
}
