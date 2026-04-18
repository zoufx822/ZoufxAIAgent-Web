'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useStore } from '@/lib/store'

export function Providers({ children }: { children: React.ReactNode }) {
  // 客户端挂载后从 localStorage 恢复会话数据
  useEffect(() => {
    useStore.persist.rehydrate()
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  )
}
