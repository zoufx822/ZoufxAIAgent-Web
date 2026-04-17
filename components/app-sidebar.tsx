'use client'

import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

function relativeTime(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function AppSidebar() {
  const { sessions, currentSessionId, isLoading, createSession, switchSession, deleteSession } = useStore()

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      {/* 标题 + 新建 */}
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold text-foreground">会话列表</span>
        <Tooltip>
          <TooltipTrigger
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
            onClick={createSession}
            disabled={isLoading}
          >
            <Plus className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent side="right">新建会话</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="opacity-70" />

      {/* 会话列表 */}
      <ScrollArea className="flex-1 py-2">
        <div className="flex flex-col gap-0.5 px-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors',
                session.id === currentSessionId
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--primary)]'
                  : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
              )}
              onClick={() => !isLoading && switchSession(session.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium leading-snug">
                  {session.title}
                </span>
                <span className="text-[10px] text-muted-foreground/60 leading-snug" suppressHydrationWarning>
                  {relativeTime(session.createdAt)}
                </span>
              </div>

              {/* 删除按钮 */}
              {sessions.length > 1 && (
                <Tooltip>
                  <TooltipTrigger
                    className="h-5 w-5 shrink-0 inline-flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      if (!isLoading) deleteSession(session.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent side="right">删除会话</TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* 底部 */}
      <Separator className="opacity-70" />
      <div className="px-4 py-3">
        <p className="text-[11px] text-muted-foreground/60 text-center">
          Zoufx AI · Powered by MiniMax
        </p>
      </div>
    </div>
  )
}
