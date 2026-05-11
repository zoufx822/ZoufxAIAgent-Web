'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useStore } from '@/lib/store'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 全新用户兜底：rehydrate 后若 userId 为空（localStorage 无持久化数据），生成 UUID。
    // onRehydrateStorage 在 storage 为空时 state 是 undefined，无法 mutate；改用 await rehydrate() 后显式补。
    void (async () => {
      await useStore.persist.rehydrate()
      if (!useStore.getState().userId) {
        useStore.setState({ userId: crypto.randomUUID() })
      }
    })()
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
