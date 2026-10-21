# 项目同步文档 · 打磨清单实现 + 命名统一（2026-06）

用途：把本轮在原型 `Zoufx AI.html` 上的改动**同步进正式工程代码**。
逐项给出：改了什么、位置、实现要点。文末单列「命名」一节（同时涉及接口字段，需后端配合）。

> 原型为纯前端、无真实接口；所有「流」都是 mock。涉及后端契约的点会显式标注【后端】。

---

## 一、逐项改动（需同步进工程代码）

### 6 · 代码块语言标签 + 复制可靠化
- **语言标签**：smd 解析器输出的是**裸语言名** `class="ts"`，而非 `language-ts`。旧正则 `language-(\w+)` 匹配不到 → 一律回退「代码」。
  修正提取逻辑：先匹配 `language-([\w+#-]+)`，匹配不到时取 class 第一个 token 作为语言名；再经显示名映射表（ts→TypeScript、python→Python…），无语言才显示「代码」。
- **复制按钮**：`copyText()` 在 `navigator.clipboard` 不可用/失败时回退 `document.execCommand('copy')`，按钮反馈「已复制 / 复制失败」。

### 8 · 消息 hover 操作 + 错误态 + 呼吸线时间标签
**新增 CSS**：`.breath-time`、`.msg-actions` / `.msg-act-btn`（hover 显隐的操作行）、`.msg-error` / `.me-dot` / `.me-txt` / `.me-retry`（错误条）。

**新增组件 `MsgActions({text})`**：AI 回复下方的「复制」按钮，复用 `copyText()`，1.4s「已复制」态。

**`Msg` 改造**（assistant-with-parts 分支）：
- 解析 parts 得到 `contentPart` / `errPart` / `streamingNow`；
- 新增 `type:'error'` part 渲染为错误条（红点 + 文案 + 「重试」按钮，点按调 `onRegenerate(m.id)`）；
- 非流式且有正文时，在末尾渲染 `<MsgActions>`；
- `Msg` 新增 `onRegenerate` 入参。

**呼吸分隔线**：从纯虚线改为「虚线 — HH:MM 时间标签 — 虚线」，时间取自该轮首条 user 消息 `id`（时间戳）。

**流式逻辑抽函数**：把原 `send` 内的「思考→工具→正文」整段抽成可复用的
`runStream(id, rid, text, thinking, opts = {})`：
- `opts.replace`：true 时**原位替换** rid 那条消息（重新生成），false 时**追加**（首次发送）；
- 错误注入：`const forceError = opts.forceError ?? armErrorRef.current`。命中时——工具阶段后不进正文流，改为把工具置 `status:'error'`、追加 `{type:'error'}` part、`setHbState('出错了')`（1.6s 后回「等待输入」）、`setStreaming(false)`。

**新增 `regenerate(rid)`**：向前找最近的 user 文本，`runStream(id, rid, userText, lastThinkingRef.current, {replace:true})`。

**`send` 收尾**：保留 user 消息追加 + FLIP 采集，记 `lastThinkingRef.current = thinking`，再调 `runStream(id, rid, text, thinking, {})`。

**新增 state/ref**：`armErrorRef`（ref，下一条是否出错）、`armError`（state，驱动 UI）、`lastThinkingRef`（重生时复用 thinking 设置）。

**调试面板**：新增开关「下一条回复出错（错误条+重试）」，写 `armErrorRef.current` + `setArmError`。

> 【后端】真实错误来自生成流（SSE 中断 / error 事件），前端只渲染错误条 + 重试。**重试 = 重新发起同一轮生成**；接后端时把 `runStream` 的 mock 替换为真实请求即可，UI 与 `regenerate` 逻辑不变。

### 9 · 工具卡 hover 展开不顶动布局
- 删除旧的 `.tool.flat:hover .tool-body{opacity:1...}`（body 不在 DOM → hover 瞬时挂载顶动下方正文）。
- 新增 `.tool-body-wrap{max-height:0;overflow:hidden;opacity:0;transition:max-height .3s,opacity .22s}` + `.show{max-height:480px;opacity:1}`。
- `ToolCall`：body **常驻 DOM**，包在 `.tool-body-wrap` 内，按 `expanded` 切 `show` 类。`expanded = open || (flat && hovered)`。展开/收起走 max-height 过渡，不再引起回流跳动。

### 12 · 腮红色进 token
- `:root`（亮）新增 `--blush:#f06070`；`[data-theme="dark"]` 新增 `--blush:oklch(0.62 0.12 18)`（降饱和，避免暗色偏亮）。
- 眼睛 happy-dot 两个 `<circle>` 的 `fill` 由硬编码 `#f06070` 改为 `var(--blush)`。

### 13 · 触达尺寸 + 右栏响应式收起
- 发送/停止按钮：30→**36px**（内部停止方块 9→10、箭头 12→14 同步放大）。
- 首页 chips：`padding 6px15px → 9px16px` + `minHeight:36`。
- 右栏：App 新增 `rightHidden` state；ResizeObserver 在视口 `w<1080` 时 `setRightHidden(true)`；StatePanel 渲染改为 `{!rightHidden && <StatePanel .../>}`，窄屏让位正文。

### 14 · （已撤销）命名改动
本轮一度把左侧列表改名「对话」、右侧加面板标题「小Z的记忆」，**已全部回滚**。左右两侧统一沿用「**记忆锚点**」——二者本就是同一张表，不拆分。详见第二节。

### 15 · 可访问性
- `ThinkingA` / `ThinkingC` 的折叠行与展开头：加 `role="button"` `tabIndex={0}` `aria-expanded` + `onKeyDown`（Enter/Space 触发，等价 onClick）。
- `ToolCall` 工具头：同上一套（与 #9 同一处编辑）。
- `LookBackModal`：加 **focus trap** —— `modalRef` + 计算 focusables、Tab/Shift-Tab 循环、Escape 关闭、关闭后焦点归还触发元素；容器加 `role="dialog"` `aria-modal="true"` `aria-label` `tabIndex={-1}`。

### 16 · 表格表头 + 滚动条
- `.md-content th`：背景由 `var(--sidebar)`（白底上几乎不可见）→ `color-mix(in oklab, var(--t1), transparent 91%)`；`font-weight 500→600`；`color --t2→--t1`。
- 滚动条：`width 3px → 9px`；thumb 加圆角 + `border:2px solid transparent;background-clip:padding-box` + hover 加深。

---

## 二、命名方案（已定稿）

### 2.1 核心约定
**左侧「对话」与右侧「锚点」都对应后端的 `anchor`**——这是确定的。二者是同一 `anchor` 在两个视图下的呈现：左侧是会话锚点本身（可点开/重命名/删除），右侧是该锚点经 LLM 跨锚点压缩、按时间衰减后的三层摘要（near/mid/far）。

为在标识符里同时体现「所属侧」与「都属 anchor」的对应关系，前端命名一律带 `Anchor`：
- 左侧 = **对话锚点** → `convAnchor`
- 右侧 = **记忆锚点** → `memoryAnchor`

### 2.2 前端 UI 文案（最终态）
| 区域 | 文案 |
|---|---|
| 左侧列表（列表头 / 移动端抽屉 / 栏按钮 tooltip） | **对话** |
| 右侧面板主标题 | **小Z的记忆** |
| 右侧面板分区（从上到下） | **印象 · 锚点 · 经历 · 承诺** |

### 2.3 前端代码标识符（最终态）
| 概念 | 标识符 |
|---|---|
| 左侧对话锚点·抽屉开关 state | `convAnchorOpen` / `setConvAnchorOpen` |
| 左侧对话锚点·点击回调 prop | `onConvAnchorClick` |
| 右侧记忆锚点·数据 state | `memoryAnchors` / `setMemoryAnchors` |
| 右侧记忆锚点·组件 | `MemoryAnchors`（保留） |
| 右侧记忆锚点·mock 数据 | `MOCK_MEMORY_ANCHORS` |
| 左侧对话列表·mock 数据 | `MOCK`（会话条目） |

> 印象 / 经历 / 承诺 对应后端各自独立接口，命名已自洽，未改：
> `hotMemory` / `HOT_MEMORY_*`（印象，hot memory）、`events` / `MOCK_EVENTS`（经历）、`commitments`（承诺）。

### 2.4 接口契约（保持现状，不细分）
`/ai/chat` 请求体用 `anchorId` / `prevAnchorId`（= 会话锚点 ID），**保持现状、不再细分**：
```jsonc
{ "prompt":"...", "userId":"demo",
  "anchorId":"168...",   // 本次会话锚点 ID（对应左侧「对话」）
  "prevAnchorId":null,
  "thinking":{ "enabled":false } }
```
左右两侧都映射这同一个 `anchor`——这是确定的，前端 `convAnchor*` / `memoryAnchors` 只是同一 `anchor` 在两个视图下的本地命名，不要求后端拆字段。

### 2.5 数据来源（接后端时替换 mock）
| UI | 当前 mock | 接后端取自 |
|---|---|---|
| 左侧「对话」列表 | `MOCK` | 会话锚点列表接口 |
| 右侧「锚点」三层摘要 | `MOCK_MEMORY_ANCHORS` | 长期记忆 / `search_cold_memory` |
| 右侧「印象」 | `hotMemory` 初值 | hot memory 接口 |
| 右侧「经历」 | `MOCK_EVENTS` | significant events 接口 |
| 右侧「承诺」 | `MOCK_COMMITMENTS` | commitments 接口 |
