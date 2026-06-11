'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useStore } from '@/lib/store'
import { useFeaturesStore } from '@/lib/features'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // rehydrate 后若无 userId，生成 UUID（全新用户兜底）
    void (async () => {
      await useStore.persist.rehydrate()
      if (!useStore.getState().userId) {
        useStore.setState({ userId: crypto.randomUUID() })
      }
    })()

    // 启动时拉一次 LLM 能力声明，网络失败走兜底不阻塞 UI
    void useFeaturesStore.getState().fetch()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        {children}
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  )
}
