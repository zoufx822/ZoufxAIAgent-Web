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
- **数据获取**: 原生 fetch（`lib/api.ts` + `lib/chat-stream.ts`），Hot Memory 用 `useMemoryHot` 自管缓存
- **主题**: next-themes（明暗切换）
- **动画**: motion v12

## 项目结构

```
app/                      # Next.js App Router
  page.tsx               # 主入口（渲染 AppLayout）
  layout.tsx             # 根布局（字体 + Providers）
  globals.css            # 全局样式 + 主题 token + 动画

components/              # React 组件
  layout.tsx             # 三段工作台布局：Rail + 主区 + StatePanel
  rail.tsx               # 左侧 56px 图标栏（锚点抽屉 / 新对话 / 主题切换）
  memory-anchor-drawer.tsx # 记忆锚点抽屉（列表 + 重命名）
  chat-window.tsx        # 聊天消息区 + 输入框 + Home 空态
  message-item.tsx       # 单条消息渲染（memo）
  presence-sticky.tsx    # 顶部 Presence 状态条（Eyes + 心情/状态）
  eyes.tsx               # 情绪 SVG 字标
  state-panel.tsx        # 右侧 280px 状态面板容器
  state-panel/           # 用户印象 / 记忆锚点 / 事件 / 承诺 子面板
  lookback-modal.tsx     # 回望 modal
  providers.tsx          # 主题 + 水合 + 能力拉取包装
  ui/                    # sonner / tooltip / textarea / stream-markdown

lib/                     # 核心逻辑
  store.ts               # Zustand 主 store（锚点元数据 + 消息 + UI/情绪态）
  chat-stream.ts         # SSE 流解析（streamChat）
  api.ts                 # 锚点 / 消息 / context / Hot Memory REST 客户端
  capability.ts          # LLM 能力声明 store（GET /ai/capabilities）
  status-labels.ts       # status 中英标签 + mood 隐藏态（共享常量）
  utils.ts               # cn() 等工具函数

hooks/                   # 自定义 React Hooks
  use-chat-stream.ts     # 主聊天发送/停止逻辑（含流式处理）
  use-smart-scroll.ts    # 聊天消息自动滚动
  use-anchor-messages.ts # 切锚拉取窗口消息
  use-ensure-anchor.ts   # 启动确保 currentAnchorId 指向真锚点
  use-memory-hot.ts      # Hot Memory snapshot（含并发去重）
  use-intimacy.ts        # 由印象填充率推断亲密度
  use-context-detector.ts# 由消息节奏推断 context
  use-asleep-detector.ts # 夜间 idle→asleep 派生

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

- 单一 Zustand 存储（`useStore`）管理锚点元数据、消息、UI/情绪态
- 仅 `userId / anchors / currentAnchorId` 持久化到 localStorage 键 `zoufx-chat-sessions`（`partialize`）
- **消息不持久化**：切锚时由 `useAnchorMessages` 从后端按需拉取窗口消息（migrate v3→v4 已把 messages 从 anchor 剥离）
- 每条消息独立追踪流式状态、思考内容、工具调用
- selector 必须返回稳定引用——空 anchor 用模块级 `EMPTY_MESSAGES` 兜底，禁止在 selector 内合成新数组

### 聊天流式处理（lib/chat-stream.ts）

- 用自定义 `parseSSE()` 函数解析服务端事件
- 处理事件：`thinking`、`content`、`tool_call`、`tool_result`、`mood`、`error`
- **流超时**: 无数据活动 watchdog——每次 `reader.read()` 与 90s 定时器 race，超时则 abort 并报错（阈值须 > 后端单次工具调用最坏阻塞 ~60s）
- 尾部数据缓冲处理：规范化未完成的最后消息
- 通过 AbortSignal 支持中止（用于停止按钮）
- 常见 HTTP 状态码（401、403、404、429、5xx）友好错误提示

### 组件流

1. `AppLayout`（layout.tsx）- 三段工作台布局：Rail + 主区 + StatePanel
2. `Rail` / `MemoryAnchorDrawer` - 左栏图标 + 锚点抽屉（列表 / 重命名 / 新建）
3. `ChatWindow` - 消息区与输入框（使用 `useChatStream()` Hook），含 `PresenceSticky` 顶条
4. `MessageItem`（memo） - 渲染单条消息、Markdown 和工具调用 UI
5. `StatePanel` / `LookBackModal` - 右栏用户印象/锚点/事件/承诺 + 回望
6. `Providers` - 包装应用进行主题 / Zustand 水合 / 能力拉取（必须在客户端）

### 样式

- CSS 变量主题化：`--bg`、`--border`、`--t1`（主文本）、`--t2`、`--t3`（辅助）
- Tailwind 工具类处理布局；内联样式处理自定义主题变量
- Sonner 提供 Toast 通知（无需手动样式）

## 后端集成

前端期望在 `${NEXT_PUBLIC_API_URL}/ai/chat` 处有 POST 端点：

- 接收 JSON：`{ prompt, anchorId, prevAnchorId, thinking: boolean }`
- 返回 SSE，包含事件：
  - `thinking`: 扩展思考内容（可选）
  - `content`（默认事件）: 响应文本块
  - `tool_call`: JSON `{ tool, toolDisplay, query }`
  - `tool_result`: JSON `{ tool, toolDisplay, count, resultPreview }`
  - `mood`: JSON `{ keyword }`，content 尾部剥离 `<!--mood:KEYWORD-->` 后独立发送，一轮 0~1 次
  - `error`: 包含 `error.message` 或 `message` 字段的 JSON 错误
- 锚点 CRUD / 消息 / context / Hot Memory 走 `lib/api.ts` 的 REST 端点（`/ai/anchors*`、`/ai/memory/hot`）

## 开发模式

**添加新工具类型**: 更新 `useStore` 处理新字段，然后在 `MessageItem` 中添加展示逻辑。

**扩展响应类型**: 修改 `chat-stream.ts` 中 `dispatchEvent()` 的事件处理，并在 `use-chat-stream.ts` 中添加对应存储更新。

**主题定制**: 更新 globals.css 中的 CSS 变量；组件通过内联样式或 Tailwind 引用它们。

**流式 UI 状态**: 使用助手消息上的 `isStreaming` 标志显示加载指示器并禁用输入。

## 注意事项

- 中文界面（欢迎信息、标签、错误提示）
- 切锚时从后端按需拉取窗口消息（消息不进 localStorage）
- 工具调用内联渲染，支持展开/折叠和状态徽章
- 通过 `stream-markdown` 组件实时渲染 Markdown
- 页面全量使用 `'use client'`（完全客户端，含水合包装）
