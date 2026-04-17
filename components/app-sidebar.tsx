'use client'

import { Plus, Trash2, MessageSquare } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    <div className="flex h-full w-72 flex-col bg-sidebar">
      <div className="px-4 pb-4 pt-5">
        <p className="text-sm font-medium text-foreground/80">Zoufx AI</p>
      </div>

      {/* 新建会话 */}
      <div className="px-3 pb-4">
        <button
          onClick={createSession}
          disabled={isLoading}
          className="flex w-full items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-foreground/82 transition-colors hover:bg-background/75 disabled:opacity-50"
        >
          <Plus className="size-4" />
          <span>发起新对话</span>
        </button>
      </div>

      {/* 会话列表 */}
      <ScrollArea className="flex-1 px-3 py-1">
        <div className="flex flex-col gap-0.5">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-3 py-3 cursor-pointer transition-colors',
                session.id === currentSessionId
                  ? 'bg-background/78 text-foreground'
                  : 'text-muted-foreground hover:bg-background/54 hover:text-foreground'
              )}
              onClick={() => !isLoading && switchSession(session.id)}
            >
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  session.id === currentSessionId ? 'bg-primary/10 text-primary' : 'bg-transparent text-muted-foreground'
                )}
              >
                <MessageSquare className="size-4 shrink-0" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium leading-snug">
                  {session.title}
                </span>
                <span className="text-[10px] text-muted-foreground/60 leading-snug" suppressHydrationWarning>
                  {relativeTime(session.createdAt)}
                </span>
              </div>

              {sessions.length > 1 && (
                <Tooltip>
                  <TooltipTrigger
                    className="size-7 shrink-0 inline-flex items-center justify-center rounded-full opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation()
                      if (!isLoading) deleteSession(session.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="right">删除会话</TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
