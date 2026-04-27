# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

**ZoufxAIAgent-Web** 是一个基于 Next.js 的 AI 聊天界面，具有以下特性：
- 多会话聊天，支持持久化存储
- 服务端事件流（SSE）流式响应
- AI 工具调用与结果可视化
- 响应式侧边栏布局（全屏/紧凑/移动端）
- 深色/浅色主题支持
- 扩展思考能力（Claude 扩展思考模式）

## 技术栈

- **框架**: Next.js 16（App Router）
- **React**: 19.2.4 + TypeScript 5
- **状态管理**: Zustand（含 localStorage 持久化）
- **样式**: Tailwind CSS v4 + @tailwindcss/typography
- **UI 组件**: Base UI React、shadcn
- **图标**: lucide-react
- **代码高亮**: shiki、streaming-markdown
- **通知**: sonner（Toast）
- **数据获取**: TanStack React Query v5
- **主题**: next-themes（明暗切换）
- **动画**: motion v12

## 项目结构

```
app/                      # Next.js App Router
  page.tsx               # 主入口
  layout.tsx             # 根布局
  globals.css            # 全局样式
  favicon.ico

components/              # React 组件
  layout.tsx             # 带响应式侧边栏的主应用布局
  sidebar.tsx            # 会话列表与控制按钮
  chat-window.tsx        # 聊天消息区与输入框
  message-item.tsx       # 单条消息渲染
  providers.tsx          # Zustand 水合包装组件
  ui/
    sonner.tsx           # Toast 通知
    tooltip.tsx          # 工具提示组件
    textarea.tsx         # 文本输入组件
    stream-markdown.tsx  # 流式内容 Markdown 渲染器

lib/                     # 核心逻辑
  store.ts               # Zustand 存储（会话、消息、工具调用）
  chat-stream.ts         # SSE 流解析与 API 客户端
  utils.ts               # 工具函数

hooks/                   # 自定义 React Hooks
  use-chat-stream.ts     # 主聊天发送/停止逻辑（含流式处理）
  use-smart-scroll.ts    # 聊天消息自动滚动

tsconfig.json            # TypeScript 配置（含 @ 路径别名）
next.config.ts           # 简化的 Next.js 配置
```

## 关键数据结构

**Message**: 核心单元，包含角色（user/assistant）、内容、思考过程（扩展思考）、工具调用、流式状态。

**ToolCall**: 表示 AI 工具调用，包括状态追踪（running/completed/failed）、结果预览、展开/折叠状态。

**Session**: 按对话分组消息，包含标题和创建时间戳。

**Store**: 集中的 Zustand 状态，持有所有会话和 UI 状态（加载中、当前会话）。

## 常用命令

```bash
# 开发
pnpm dev                   # 启动开发服务器（http://localhost:3000）

# 构建
pnpm build                 # 生产构建
pnpm start                 # 运行生产服务器

# 环境变量
NEXT_PUBLIC_API_URL        # 后端 API 端点（默认：http://localhost:8080）
```

## 架构说明

### 状态管理（lib/store.ts）
- 单一 Zustand 存储（`useStore`）管理所有会话和消息
- 通过 localStorage 键 `zoufx-chat-sessions` 持久化
- 水合时清理孤立的 `isStreaming: true` 状态和缺失的 `toolCalls` 数组
- 每条消息独立追踪流式状态、思考内容、工具调用

### 聊天流式处理（lib/chat-stream.ts）
- 用自定义 `parseSSE()` 函数解析服务端事件
- 处理事件：`thinking`、`content`、`tool_call`、`tool_result`、`error`
- **流超时**: 总计 60 秒，但每 30 秒无活动就检查超时
- 尾部数据缓冲处理：规范化未完成的最后消息
- 通过 AbortSignal 支持中止（用于停止按钮）
- 常见 HTTP 状态码（401、403、404、429、5xx）友好错误提示

### 组件流
1. `AppLayout`（layout.tsx）- 顶级布局，含响应式侧边栏切换
2. `AppSidebar` - 会话列表与新建聊天按钮
3. `ChatWindow` - 消息区与输入框（使用 `useChatStream()` Hook）
4. `MessageItem` - 渲染单条消息、Markdown 和工具调用 UI
5. `Providers` - 包装应用进行 Zustand 水合（必须在客户端）

### 响应式设计
- 使用 ResizeObserver 检测容器宽度
- 侧边栏模式：`full`（>860px）、`compact`（560–860px）、`hidden`（<560px）
- 移动端：头部汉堡菜单，侧边栏滑入为浮层（含遮罩）

### 样式
- CSS 变量主题化：`--bg`、`--border`、`--t1`（主文本）、`--t2`、`--t3`（辅助）
- Tailwind 工具类处理布局；内联样式处理自定义主题变量
- Sonner 提供 Toast 通知（无需手动样式）

## 后端集成

前端期望在 `${NEXT_PUBLIC_API_URL}/ai/chat` 处有 POST 端点：
- 接收 JSON：`{ prompt, sessionId, thinking: boolean }`
- 返回 SSE，包含事件：
  - `thinking`: 扩展思考内容（可选）
  - `content`（默认事件）: 响应文本块
  - `tool_call`: JSON `{ tool: string, query: string }`
  - `tool_result`: JSON `{ tool: string, count: number, resultPreview: string }`
  - `error`: 包含 `error.message` 或 `message` 字段的 JSON 错误

## 开发模式

**添加新工具类型**: 更新 `useStore` 处理新字段，然后在 `MessageItem` 中添加展示逻辑。

**扩展响应类型**: 修改 `chat-stream.ts` 中 `dispatchEvent()` 的事件处理，并在 `use-chat-stream.ts` 中添加对应存储更新。

**主题定制**: 更新 globals.css 中的 CSS 变量；组件通过内联样式或 Tailwind 引用它们。

**流式 UI 状态**: 使用助手消息上的 `isStreaming` 标志显示加载指示器并禁用输入。

## 注意事项

- 中文界面（欢迎信息、标签、错误提示）
- 会话切换保留消息历史（localStorage）
- 工具调用内联渲染，支持展开/折叠和状态徽章
- 通过 `stream-markdown` 组件实时渲染 Markdown
- 页面全量使用 `'use client'`（完全客户端，含水合包装）
