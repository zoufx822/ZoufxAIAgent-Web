# Zoufx AI · 下一轮打磨提示词

## 背景说明

项目：Zoufx AI — 一个"有人格"的对话 AI 原型（中文优先）。
主文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX，约 2520 行，当前 v0.15）。
旧版本备份：`Zoufx AI v1~v5.html`，不要动。
历史改动详见：`ZOUFX_CHANGES_HANDOFF.md`

---

## 工作规则

- 每轮只动一处。不要顺手"顺便优化"别的。
- 改动前用 1~3 行说设计意图。
- 改动用最小 diff；不要重写无关代码。
- 改完用 done 检查无报错；不要主动 fork verifier。
- 不要生成长篇总结；2~4 行说"动了什么 + 为什么"就够。

---

## 当前版本现状速查（重要：本轮设计基于这些事实）

| 元素 | 现状 |
|------|------|
| 起始页眼睛 | `Home` → `.home-eyes` 内 `<Eyes size={80}>`，屏幕中央偏上，眼下是署名条 |
| 聊天页眼睛 | `PresenceFloat`（**不是** PresenceSticky）→ `.presence-eyes-wrap` 内 `<Eyes size={60}>`，`position:sticky;top:0`，**居中悬浮**在对话流顶部 |
| 页面切换 | App 里 `isHome ? <Home key=.../> : <Chat key=.../>`，硬切换 + `.page-enter`（up .25s）入场，**无 FLIP 连续转场** |
| 工具块 | `ToolCall` 组件：可折叠面板，head 有 `.tool-dot`（running 时 `toolPulse` 脉冲）+ name + meta（状态文字 + duration）+ caret；`.tool-runbar` 跑马灯已存在；body 展开显示 params/result。状态字段 `status: 'running' | 'done' | 'error'` |
| 思考块 | `ThinkingC`（char-fade 斜体，head「思绪」/「思绪 · 已结」），`ThinkingA`（mono 左线）。**完成后不会自动折叠** |
| 右栏工具列表 | `StatePanel` → 「近期工具调用」`recentTools.slice(0,6)`，每条 `.sp-card.tool-mini`。**新条目直接出现，无滑入** |
| Eyes prop | 已实现：`mood / context / asleep / drifting / lookDown(打字注视) / waking(唤醒睁眼)`。**无 error 反应** |
| error 状态 | `MOOD_MAP['出错了'] = {mood:'error',...}`；`status.mood==='error'` 时已不显示情绪，但 Eyes 无动作 |

---

## 待做项（4 项，按低风险 → 高复杂度排序）

### P1 · error 时 Eyes 抖一下（摇头）· 低风险

**位置**：`Eyes` 组件（约 1219 行）+ 调用处（Home 1916 / PresenceFloat 1984）

设计意图：进入 error 状态时，眼睛轻微左右抖一次（像摇头/一愣），然后恢复平静——给"出错"一个身体语言，而不只是文字变红。

实现要点：
- 给 `Eyes` 加 `error=false` prop，调用处传 `error={status.mood==='error'}`（两处）。
- error 由 false→true 的那一刻触发**一次性** transform 抖动（不是循环）：用 CSS keyframes，translateX 在 0 → -2px → +2px → -1px → 0 约 0.4s，可叠加极小 rotate（≤0.6deg）。
- 用 React 状态或 key 触发单次播放：监听 `error` 上升沿（useEffect + 上一帧值），置一个 `shakeKey` 自增，作用在 `.eyes-z` 外层 wrapper 上，让动画重播。
- 抖动幅度要克制——是"一愣 / 摇头"，不是"剧烈晃动"。reduced-motion 下跳过。

验收：
- Tweaks 触发 error（可临时加一个「模拟出错」按钮，或用现有触发路径）→ 看到眼睛抖一下随即平静。
- 非 error 状态完全不受影响；连续 error 不会卡住动画。

改完 done，3~4 行说明。

---

### P2 · 右栏「近期工具调用」列表滑入 · ~~低风险~~ ❌ 已废弃

> **废弃原因**：右栏在 v0.14 已重新设计，现在只有「用户印象 / 重要经历 / 承诺 / 记忆锚点」四个区，
> `recentTools`／「近期工具调用」这一段已不存在，本打磨项失去对象。如未来恢复工具调用列表，再另开一项。

---

### P3 · 工具调用 / 思考过程的呈现节奏 · 中风险

**位置**：`ToolCall` 组件（约 975 行）、`ThinkingC`（959 行）、CSS `.tool*`（108~124）、`.think-c`（105）

现状问题：工具块和思考块出现得突然，完成后只是静态留在原地，占据视觉权重；思考块完成后整段斜体长文一直摊在那里。

设计意图：
- **出现**：工具块从一条占位行"长出来"——`max-height` 0 → 实际高度，opacity 0 → 1，约 180ms ease-out（利用 `.tool` 已有 `overflow:hidden`）。
- **进行中**：`.tool-dot.running` 脉冲已存在，保留；`.tool-runbar` 跑马灯保留；右侧 duration 在 running 期间每 ~100ms 递增刷新（目前 duration 是写死字符串，需在 running 阶段用计时器累加显示，done 时定格为最终值）。
- **完成**：`status` 转 done 后，约 0.4s 延迟，未展开（open=false）的工具块**收扁**——`max-height` 收到仅剩 head 的高度、padding 收紧、`tool-runbar` 撤掉；鼠标 hover 时恢复正常高度（CSS `:hover` 还原 max-height）。已被用户手动展开（open=true）的块不收扁。
- **思考块（ThinkingC）**：流式结束（streaming false）后维持斜体；**1.5s 后自动折叠**成单行——首行截断 + 「展开」按钮，点击恢复全文。

实现要点：
- 用 CSS `max-height` + `transition: max-height .25s` 做"长出 / 收扁"；不要用高度 auto 直接切（无法补间）。
- 工具状态已是 `'running' | 'done' | 'error'`，UI 直接据此切 class。
- running 计时：在 ToolCall 内用 useState + useEffect setInterval(100ms)，status!=='running' 时清除并定格。
- 思考折叠：ThinkingC 内加 `collapsed` 状态，streaming 变 false 后 setTimeout(1500) 置 true；collapsed 时只渲染首行 + 省略号 + 展开按钮。
- **不要破坏** 现有 recentTools 数据流、ToolCall 的 open/caret 手动展开、ThinkingC 的 char-fade 入场。

验收：
- 发消息触发「记忆检索」→ 工具块长出 → running 脉冲 + duration 跳动 → 完成 0.4s 后收扁。
- hover 收扁的工具块能临时展开看内容；手动点开过的块不会被自动收扁。
- 思考块流式结束 1.5s 后折叠成单行，点「展开」恢复。

改完 done，4 行说明。

---

### P4 · 起始页 → 聊天页转场（眼睛位置连续性）· 高复杂度

> 动手前先用 3~5 行说实现方案，等确认再写代码。

背景（已按当前版本校正）：
- 起始页 `Home` Eyes 在屏幕**中央偏上**、`size=80`。
- 聊天页 `PresenceFloat` Eyes 在对话流**顶部居中**、`size=60`、sticky。
- 当前是 `isHome` 硬切换（换 key + `.page-enter` 入场），眼睛会"先消失再出现"，没有连续感。

设计意图：
- 用户发出第一条消息后，眼睛从起始页中央位置"飞"到聊天页顶部位置，并从 80px 缩到 60px，看起来是**同一双眼睛在移动**（FLIP）。
- 没有"先消失再出现"的闪烁。
- 转场期间起始页署名条 `.home-sig`、状态/chips 优雅淡出（~150ms）。
- 输入框也走 FLIP：起始页居中大输入框 → 聊天页底部输入框（位置 + 尺寸补间）。
- 聊天页第一条用户消息延后 ~280ms 再出现，等转场基本完成。
- 转场总时长 ≤ 500ms。reduced-motion 下退化为简单淡入。

实现路径建议：
- App 层加 `transitionState: 'idle' | 'flying' | 'chat'`。
- 发送第一条时记录 Home Eyes 的 `getBoundingClientRect()`（from rect），`transitionState='flying'`。
- `requestAnimationFrame` 后切到 Chat 渲染，`PresenceFloat` 用 ref 拿到 to rect，对眼睛 wrapper 应用 inverse transform（translate + scale），下一帧清掉 transform 让它过渡到位。
- 输入框同理记录 from/to rect 做 FLIP。
- 注意：`PresenceFloat` 是 sticky，FLIP 计算用首帧 rect；眼睛 size 差异（80→60）用 scale 而非改 size prop，避免重排。

验收：
- 从起始页发消息：眼睛从中央滑到顶部、缩小，看起来是同一双眼睛移动，无闪烁。
- 署名条/状态条/chips 优雅淡出，不突然消失。
- 第一条用户消息在转场后出现，整体 ≤500ms 顺滑。

改完 done，4 行说明。

---

## 本轮状态小结（2026-06-05 核对）

- **P1 · error 摇头** —— ✅ 已实现（`.eyes-z.error-shake` + `eye-headshake`，`errorKey` 上升沿单次触发，Tweaks 有「模拟出错」）
- **P2 · 右栏工具列表滑入** —— ❌ 已废弃（右栏 v0.14 重构，无工具调用列表）
- **P3 · 工具/思考呈现节奏** —— ✅ 已实现（`tool-grow` 长出、`.flat` 收扁、JS 计时、`useAutoCollapse` 思考折叠）
- **P4 · 起始页→聊天页 FLIP 转场** —— ✅ 已实现（`runFlip` + `flyEyesFrom`/`flyInputFrom`）

> 即本轮 4 项实质完成 3 项，P2 因前提变化废弃。无剩余待做项。

## 早前已完成（不要重复做）

上一轮的 P1~P4、P6（详见 `ZOUFX_CHANGES_HANDOFF.md`），以及原"加分项"中：打字时 Eyes 注视输入框（`lookDown`）、流式输出节奏配合 mood、深夜 asleep 唤醒睁眼（`waking`）均已实现。
