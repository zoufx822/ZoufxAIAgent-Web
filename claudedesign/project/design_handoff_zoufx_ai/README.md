# Handoff: Zoufx AI — 对话界面设计

## Overview
Zoufx AI 是一个极简风格的 AI 对话产品界面，参考 Kimi 的纯白极简布局，结合 Gemini 的对话列表侧边栏结构设计而成。固定使用苔绿（sage green）作为唯一品牌色，支持亮色/深色双主题。

## About the Design Files
`Zoufx AI.html` 是 **HTML 设计原型**，用于展示视觉风格与交互行为，不是生产代码。

开发者的任务是：**在目标项目的现有技术栈中（React / Next.js / Vue 等）按照此设计还原界面**，使用项目已有的组件库和模式。若尚无技术栈，建议使用 **Next.js + Tailwind CSS**。

## Fidelity
**高保真（High-fidelity）** — 颜色、字重、间距、圆角、交互动效均已确定，开发者应尽量像素级还原。

---

## Design Tokens

### Colors — Light Theme
| Token | Value | 用途 |
|---|---|---|
| `--bg` | `#ffffff` | 主背景 |
| `--sidebar` | `#fafafa` | 侧边栏背景 |
| `--surface` | `#ffffff` | 卡片/输入框背景 |
| `--surf-hov` | `#f3f4f3` | hover 背景 |
| `--border` | `#ebebeb` | 边框 |
| `--border-lt` | `#f2f2f2` | 轻边框（输入框内部） |
| `--t1` | `#111412` | 主文字 |
| `--t2` | `#60666a` | 次要文字 |
| `--t3` | `#adb3b0` | 占位/辅助文字 |
| `--chip` | `#f4f5f4` | 建议按钮背景 |
| `--chip-brd` | `#e4e6e4` | 建议按钮边框 |
| `--accent` | `oklch(0.52 0.16 100)` | 苔绿品牌色 |
| `--accent-s` | `oklch(0.52 0.16 100 / 0.10)` | 品牌色柔和背景 |
| `--accent-r` | `oklch(0.52 0.16 100 / 0.22)` | 品牌色描边 |

### Colors — Dark Theme
| Token | Value |
|---|---|
| `--bg` | `#0e0f0e` |
| `--sidebar` | `#111311` |
| `--surface` | `#181a18` |
| `--surf-hov` | `#1f211f` |
| `--border` | `#252725` |
| `--t1` | `#eef0ee` |
| `--t2` | `#7a807a` |
| `--t3` | `#454945` |
| `--accent` | `oklch(0.66 0.17 100)` |

### Typography
| 用途 | Font | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| 品牌名 | DM Sans | 64px | 700 | -0.05em |
| 欢迎副标题 | DM Sans / Noto Sans SC | 16px | 300 | -0.01em |
| 正文消息 | DM Sans / Noto Sans SC | 14.5px | 400 | -0.005em |
| 输入框 | DM Sans / Noto Sans SC | 15px | 400 | -0.005em |
| 侧边栏标题 | DM Sans | 13px → 12px | 500 | - |
| 侧边栏对话项 | DM Sans / Noto Sans SC | 12px | 400 | - |
| 时间戳/辅助 | DM Sans | 10–11px | 400 | 0.07em |

字体引入：`https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,200;9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Noto+Sans+SC:wght@300;400;500;700`

### Spacing
- 侧边栏宽度（完整）: 224px
- 侧边栏宽度（紧凑）: 52px
- Header 高度: 58px
- 聊天区域左右 padding: 56px
- 消息最大宽度: 720px
- 消息气泡间距: 26px
- 输入框圆角: 16px
- 侧边栏圆角: 7–9px

### Shadows
- `box-shadow: 0 2px 16px #0000000a` — 输入框默认
- `box-shadow: 0 8px 32px #00000010` — 输入框聚焦/弹窗
- 聚焦环: `0 0 0 4px var(--accent-s)`

---

## Screens / Views

### 1. 首页（Home）
**用途**：用户进入后看到的欢迎页，输入第一条消息后进入对话页。

**布局**：
- 整体垂直水平居中，`padding: 0 48px`，最大内容宽 640px
- 品牌名 "Zoufx"：64px 700 苔绿，`letter-spacing: -0.05em`，`line-height: 1`，`margin-bottom: 14px`
- 副标题 "你好，需要我为你做些什么？"：16px 300，颜色 `--t2`，`line-height: 1.5`
- 输入框：下方 48px 间距后显示，高度 3 行（初始），圆角 16px
- 建议 chips：输入框下方 16px，胶囊形（`border-radius: 100px`），hover 变苔绿
- 底部免责文字：绝对定位 `bottom: 20px`，11px `--t3`

**入场动效**：`opacity: 0 → 1`，`translateY(8px → 0)`，0.3s ease

### 2. 对话页（Chat）
**用途**：展示对话消息流，用户可继续输入。

**布局**：
- 消息区：`padding: 36px 56px`，内容最大宽 720px，居中
- 用户消息：右对齐，气泡背景 `--accent-s`，边框 `--accent-r`，圆角 `18px 18px 5px 18px`，padding `10px 16px`，最大宽 72%
- AI 消息：左对齐，无气泡，前置 28×28 苔绿头像（圆角 8px，白色 "Z" 字），字号 14.5px
- 输入框：固定在底部，`padding: 0 56px 24px`
- 消息间距：`margin-bottom: 26px`
- 新消息到达时平滑滚动到底部（`scrollTo behavior: smooth`）

**AI typing 状态**：3个点，苔绿色，逐个脉冲动画（`0.2s` 间隔）

### 3. 侧边栏（Sidebar）
**布局（完整模式 224px）**：
- Header 区（58px）：28×28 苔绿 logo（圆角 8px）+ "Zoufx" 15px 600 + 折叠按钮
- 新对话按钮：`border: 1px solid --border`，hover 变苔绿，圆角 9px，12px
- 历史列表：10px uppercase 标签 + 对话项列表
- 对话项：12px，hover 背景 `--surf-hov`，激活左边 2px 苔绿条，气泡 SVG icon
- 悬停出现 × 删除按钮（右侧）
- 双击对话标题进入 inline 重命名（Enter 确认 / Esc 取消）
- 底部用户区：头像圆形 + 名称邮箱 + 齿轮设置入口

**紧凑模式（52px）**：只显示 logo 和 icon，无文字

**隐藏模式**：完全隐藏，左上角汉堡按钮，点击滑出抽屉（带半透明遮罩）

### 4. Header 栏
- 高度 58px，`border-bottom: 1px solid --border`
- 左侧：当前对话标题（首页不显示）+ 汉堡按钮（仅小屏）
- 右侧：亮/深色切换胶囊按钮 + 设置齿轮图标

---

## Interactions & Behavior

### 页面切换
- 首页 → 对话页：发送第一条消息后切换，`opacity + translateY` 淡入动效 0.3s
- 对话 → 首页：新建对话时，动效相同

### 主题切换
- 亮色/深色：CSS custom properties 整体过渡，`transition: background-color/border-color/color 0.28s ease`

### 对话项交互
- hover：显示 × 删除按钮
- 单击：切换到该对话
- 双击：inline 编辑标题，Enter 确认，Esc 取消

### 输入框
- 聚焦：边框变苔绿 + `0 0 0 4px accent-soft` 光晕
- Enter：发送消息
- Shift+Enter：换行
- 发送按钮：有内容时变苔绿 + 微阴影，无内容时灰色 disabled

### AI 回复
- 发送后 600–1000ms 延迟（模拟思考）
- 先显示 typing 三点动画
- 然后流式逐字显示（每 9ms 一个字符）

### 自适应响应式
| 宽度 | 侧边栏状态 |
|---|---|
| > 860px | 完整展开（224px） |
| 560–860px | 紧凑图标（52px） |
| < 560px | 完全隐藏（抽屉） |
使用 `ResizeObserver` 监听，自动切换，手动折叠可临时覆盖。

---

## State Management

```ts
interface State {
  theme: 'light' | 'dark'            // 主题，持久化到 localStorage
  chats: Chat[]                       // 对话列表
  activeId: number                    // 当前对话 ID
  chatMessages: Record<id, Message[]> // 各对话消息
  isHome: boolean                     // 当前是否在首页
  sidebarMode: 'full' | 'compact' | 'hidden' // 自适应模式
}

interface Chat {
  id: number
  title: string
  t: string // 时间字符串
}

interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  typing?: boolean  // true = 显示 loading dots
}
```

localStorage key：`zoufx`，保存 `{ theme }`

---

## Assets & Icons
- 所有图标均为内联 SVG，stroke 风格，strokeWidth 1.7–2.2
- Logo：简单的圆角正方形 + 白色 "Z" 字，背景苔绿
- 无外部图片资源

---

## Files
- `Zoufx AI.html` — 完整高保真设计原型，可直接在浏览器打开预览
- `CHANGELOG.md` — 同步变更记录（以前端落地为准）

---

## 右侧状态栏（aside / 280px）

### Section：用户印象
hot memory 白名单 6 字段，顺序固定：

| key            | label  |
|----------------|--------|
| `display_name` | 称呼    |
| `language`     | 语言    |
| `timezone`     | 时区    |
| `role`         | 职业    |
| `interests`    | 兴趣    |
| `tone`         | 风格    |

- 单 Card，多行。每行左侧 **44px** 固定宽度中文 label（`--t3`, 11.5px），右侧 value（`--t1`, 12.5px），行 `gap:4px`
- 空态（6 字段全为空）：Card 内文字「尚未识别」

### Section：当前状态
标题固定，**不随 status 切换**。内容对齐顶部 heartbeat 条，但**卡片内无色点**：

```
[中文状态 13.5px] [EN mono 10px /.18em] · [italic mood 11.5px]
[用户最后一条消息抦 60 字]   ← 仅活动态
```

6 status × mood × reply 的展示契约：

| status     | 中文      | EN       | mood | reply |
|------------|----------|----------|------|-------|
| `idle`     | 等待交互  | IDLE     | ✓    | ✗     |
| `thinking` | 思考中    | THINKING | ✓    | ✓     |
| `tooling`  | 使用工具  | TOOLING  | ✓    | ✓     |
| `writing`  | 回复中    | WRITING  | ✓    | ✓     |
| `error`    | 出错了    | ERROR    | ✗    | ✗     |
| `asleep`   | 打盹中    | ASLEEP   | ✗    | ✗     |

- **mood 时效**：< 5 min 正常；5–15 min stale 灰；≥ 15 min 隐藏
- **reply**：仅活动态（thinking / tooling / writing）拼接；**无前缀冒号**；超过 60 字截断加 `…`

### Section：近期工具调用
条目 `name` 显示中文名：

| tool 方法名            | toolDisplay |
|----------------------|-------------|
| `search_web`         | 网络检索     |
| `search_cold_memory` | 记忆检索     |
| `update_hot_memory`  | 用户印象更新  |

SSE payload 字段：`{ tool, toolDisplay, status, duration }`。前端渲染优先级：`toolDisplay > TOOL_DISPLAY[tool] > tool`。

消息流里的工具调用卡片 header 遵同一规则。
