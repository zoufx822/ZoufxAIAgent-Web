# Zoufx AI · 交接说明（眼睛 / 情绪 / 状态系统）

主文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX）。本轮全部改动集中在 `Eyes` 组件、`InputBox`、`App` 状态层，以及 CSS 颜色 token。下面按模块说明，供 Claude Code 在真实代码库里对齐。

---

## 1. 兴奋表情修正
- `MOOD_EXPR['兴奋']` 的 `esy` 从 `1.08` 改回 `1.00`（眼睛不再撑大、不再被裁边）。
- 兴奋改用「**更大瞳孔 + 上抬 + sparkle**」表达：`pr:6.2, pdy:-2.6, sparkle:true`。
- Eyes 的 clip polygon 改为动态边界：`eyeTop = min(5, 22-ry)`、`eyeBot = max(39, 22+ry)`，确保任何 `esy` 都不会截顶/截底。

## 2. 打字时瞳孔向下注视（lookDown）
- 触发条件：**仅打字时**（textarea `onChange`），focus/blur 不触发注视。
- `InputBox` 的 `onChange` 调 `onTyping(true)` 并起 1.2s debounce；停止输入 1.2s 后归中；`onBlur` 立即归中。
- 链路：`InputBox.onTyping` → `App.handleTypingStart` → `App.typingActive` → `Eyes.lookDown`。
- 下移量：好奇/兴奋 `+7.0px`（因为这两个情绪 `pdy` 为负、瞳孔本在上方，需更大位移抵消），其余情绪 `+4.5px`。
- **屏蔽规则**：`asleep` 或 `waking` 状态下 lookDown 不生效（`pupilShift` 条件含 `!asleep && !waking`），否则瞳孔会跑出睡眠态细缝椭圆。
- 平静的随机漂移在注视期间暂停（`calmDrift` 含 `!lookDown`）。

## 3. Asleep 唤醒动画（waking）
- `isWaking` 是**纯推导值**：`typingActive && (深夜 || mockNight)`，不用 timer（早期 timer 版本有 bug，已废弃）。
- `Eyes` 内 RAF 把 `esy` 从 `ASLEEP_EXPR.esy(0.26)` 插值到目标情绪的 `esy`，时长 1400ms，ease-in-out。
- **关键点**：RAF 结束时保留最终 esy 值（不要 `setWakingEsy(null)`），否则眼睛会立刻缩回细缝。
- 唤醒期间 SVG 去掉 `asleep` class（`asleep && !waking`），避免 `eye-flutter` 动画压制睁眼过渡。
- 行为：深夜 idle → 细缝；打字 → 1.4s 睁开并维持；失焦 → 回到细缝。

## 4. 流式输出节奏（按情绪调速）
- `App.send()` 内回复流式输出从固定 `setInterval(14)` 改为递归 `setTimeout`，速率按发送时快照的 `currentMood`：
  - 好奇 9ms · 兴奋 7ms · 平静 14ms · 愤怒 11ms · 难过 22ms · 困惑 14ms
  - 困惑额外：每约 50 字、70% 概率插入 180ms 停顿。

## 5. 瞳孔动态（按情绪区分，核心机制）
**只有平静和难过有瞳孔动效，其他情绪专注盯看、瞳孔固定。** 全部由 CSS class 驱动（React 控制 class，无 JS 竞态）：
- **平静** → `.eyes-z.calm .pupil` → `calm-wander`（18s，随机幅度扫视，快速移动 + 停留 + 归中循环）。class 条件：`mood==='平静' && !drifting && !asleep && !waking && !busy && !lookDown`。
- **难过** → `.eyes-z.sad .pupil` → `sad-sway`（10s，左右各停留约 4s 的缓慢平移）。class 条件含 `!lookDown`。
- **走神状态** → `.eyes-z.drifting .pupil` → `pupil-drift`（原有，与情绪正交）。
- ⚠️ 曾有 bug：全局 `.eyes-z .pupil { animation: pupil-glance }` 污染所有情绪，已**删除**该全局 animation，只保留 transform-box/transition。Claude Code 务必确认真实代码里没有这条全局 pupil animation。

## 6. 颜色系统重构（重要）
把「状态色」和「情绪色」彻底拆开：

### 状态色 `--mood-color`（由 `data-mood` 状态决定，用于状态文字/圆点）
- 等待交互 idle → 绿 `#22c55e`
- 调用工具 tooling → 琥珀 `#d97706`（时长较长，独立配色）
- 思考中 thinking / 回复中 writing → **统一蓝** `#3b82f6`（切换快，不再变色）
- 出错 error → 红 `#dc2626`；打盹 asleep → 紫 `#7c3aed`；走神 drifting → 灰 `#94a3b8`
- 同步更新了 `[data-mood]` 与 `.hb[data-mood]` 两套规则（含 dark 变体）。

### 情绪色 `--emotion-color`（由 `data-emotion` 当前 mood 决定）
- 平静 `#94a3b8` · 好奇 `#06b6d4` · 兴奋 `#f59e0b` · 困惑 `#a855f7` · 难过 `#5b80c0` · 愤怒 `#ef4444`（含 dark 变体）。
- `data-emotion={mood||''}` 挂在 `home-nameplate` / `presence-float` / `hb` 三处容器上。
- **用途**：① 聚光灯光晕颜色 ② 情绪标签文字颜色（过期时仍褪为灰，`.stale` 特异性更高会覆盖）。

## 7. 聚光灯特效（Gemini 风格光晕）
- 由原来的描边双圆环改为**单个柔和径向渐变光晕** `.mood-glow`（解决了双圈错位 bug）。
- 用 `--emotion-color` 着色，`filter:blur(16px)`，`z-index:-1` 晕在眼睛后方，2.6s 绽放淡出。
- 横向加宽：presence 380px / home 500px。
- 触发：`spotlightKey` 计数器（App）→ 传给 Home / PresenceFloat → 各自 `ringKey++` 重新挂载 glow。mood 变化也会触发。
- 容器 `.home-eyes` 加了 `width:fit-content; position:relative`，确保光晕 `left:50%` 落在眼睛中心。

## 8. Tweaks 面板修复 & 清理
- 删除「当前用户」「重置身份」「侧边栏（自适应）」三行。
- **模拟走神**按钮：加 `e.stopPropagation()`，否则点击冒泡到全局 `window.click` 监听会立刻把 `lastInputAt` 刷新回 `Date.now()`，效果被抵消。
- **置为过期**按钮：同样加 `e.stopPropagation()`。

---

## ⚠️ 需 Claude Code 确认：与时间相关的触发机制

以下三个机制依赖系统时间 / 闲置时长，请确认真实设计/代码是否已跟进，**如未实现需补充**：

1. **深夜 asleep**
   - 触发：`hour >= 23 || hour < 5`（晚 23:00–凌晨 5:00）**且** `hbState === '等待输入'`（idle）。
   - 思考/回复中（非 idle）不会睡着；发消息后退出 asleep，回复完回到 idle 再次入睡。
   - 调试开关：Tweaks「模拟深夜」`mockNight`（强制 `forceAsleep`，会覆盖 resolveStatus，连思考态也保持细缝——仅调试用）。

2. **走神 drifting**
   - 触发：`hbState === '等待输入'` **且** `idleMs > 90000`（90s 内无 `mousemove` / `keydown` / `click`）。
   - `idleMs = nowTick - lastInputAt`；`nowTick` 每 10s tick 一次，故实际触发在末次交互后 90–100s。
   - 任意交互重置 `lastInputAt`，立即解除。

3. **情绪过期 stale**
   - 触发：`currentMood` 存在且 `lastMoodAt` 距今 ≥ 5 分钟。
   - 视觉：情绪标签文字褪色（`.stale`，约 55% opacity）。
   - 情绪写入时间戳 `lastMoodAt` 在每次回复结束、或 Tweaks 手动设 mood 时更新。

> 重点：这三处的「阈值（23点/5点、90s、5min）」和「计时刷新逻辑（nowTick 10s tick、全局交互重置 lastInputAt）」是否在正式代码里一致。原型里 `nowTick` 用 `setInterval(10000)` 驱动，真实实现需保证 idle/stale 判断有等价的周期性重算，否则状态不会自动推进。
