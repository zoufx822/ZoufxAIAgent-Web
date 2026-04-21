import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Zoufx AI',
  description: 'AI 聊天助手',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="h-full antialiased" style={{ backgroundColor: 'var(--bg)', color: 'var(--t1)' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
