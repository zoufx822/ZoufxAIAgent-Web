---
title: 给 Claude Design 的提示词 —— mood 视觉补设计
tags:
  - AI
  - Agent
  - 拟人化
  - 前端
  - 设计提示词
  - v1.1
---

> [!note] 用途
> 这份是给 [claude.ai/design](https://claude.ai/design) 的**补设计提示词**——在已经交付的 Zoufx AI HTML 原型基础上，**只补 mood 视觉**那一块。
> 直接整段复制粘贴到 Claude Design 对话框，作为新一轮设计的输入。

---

# Zoufx AI · mood 情感词视觉补设计

## 上下文

我之前已经和你完成过一版 Zoufx AI 的高保真 HTML 原型 + 一份 `emotion-system.md` 实现规范。==前一版已经做完的部分==：

- **顶栏 Heartbeat 情绪条**（六态 status 显示器）：`● 色点 + 中文 + EN mono 标签`，左对齐，48px 高
  - 六态：`idle / thinking / tooling / writing / error / asleep`
  - 每态独立颜色（绿/琥珀/蓝/青/红/紫）+ 不同脉冲周期
- **Eyes 字标**：替代 "小Z" / "Z" 字标，两椭圆 + 两瞳孔 SVG，会眨眼/斜视/忙碌半眯
- **StatePanel 右栏**：对话目标 / 当前任务 / 近期工具 / 记忆片段四栏
- **整体气质**：单色冷淡（黑灰 mono），工作台/仪器感，反 emoji 反卖萌，信息密度高于装饰，JetBrains Mono + Space Grotesk + Noto Sans SC

==这次要补设计的==：**mood 情感词的视觉表达**。

---

## 什么是 mood（与 status 的区别）

| 维度 | status（已有视觉） | mood（这次要设计） |
|---|---|---|
| 含义 | AI **此刻在干什么**（运行态） | AI **此刻什么心情**（情感色彩） |
| 来源 | 前端状态机派生（SSE 事件） | LLM 在每条回复末尾顺带输出 `<!--mood:KEYWORD-->`，后端剥离 |
| 取值 | 6 个固定运行态 | 10 个情感词（受限词表） |
| 变化频率 | 高频（一条消息内多次切换） | 低频（每条 AI 回复一次） |
| 关键性 | 主信息（不可缺） | 辅信息（缺了也能跑） |

**mood 词表（10 个）**：

```
好奇 / 温和 / 严肃 / 平静 / 共情 / 戏谑 / 困惑 / 疲惫 / 兴奋 / 挫败
```

这 10 个词覆盖日常情感谱，是 LLM 从词表里精确选一个出来的（不是开放文本）。

---

## 设计目标

在不破坏现有"工作台/仪器"气质的前提下，让用户能**一眼看出 AI 此刻的情感状态**，但又**不能抢走 status 的视觉焦点**。

**主从关系**：status 是主（颜色 + 脉冲 + 双标签），mood 是辅（更轻、更安静）。

**反例**（不要做）：
- ❌ 用 emoji 显示 mood（"好奇 🤔" / "兴奋 🎉"）——违反"反 emoji"人格
- ❌ 给 mood 加大色块或大字号——抢 status 焦点
- ❌ 给每个 mood 词配一个鲜艳的独立颜色——单色气质破坏
- ❌ 把 mood 设计成"卡通 mascot 表情"——和 Eyes 字标的克制风格冲突

**正例方向**（择一深入或组合）：
- ✅ 用 mono 小字 + 极轻的字符前缀（如 ` · 好奇`）放在 Heartbeat 末尾
- ✅ 用极淡的色阶（在 var(--t2) 至 var(--t3) 之间）做 mood 词的颜色映射
- ✅ 让 mood 改变 Eyes 字标的某个微表情（如眉宇间距 / 瞳孔大小 / 斜视方向）
- ✅ mood 出现/切换时做一次低调的 char-fade 动画（< 200ms）

---

## 关键设计问题（请你给方案）

### Q1. mood 放在哪里？

候选位置：

| 位置 | 优点 | 缺点 |
|---|---|---|
| A. Heartbeat 顶栏末尾（status 之后） | 与 status 同行，扫读连贯 | 占顶栏宽度；与 status 的视觉竞争 |
| B. Eyes 字标下方一行 mono 小字（仅 Home） | Home 视觉焦点位，留白合理 | 对话页看不到 |
| C. StatePanel 顶部"对话目标"section 下方一格 | 不挤顶栏 | 用户视线焦点不在右栏 |
| D. 完全融入 Eyes 字标的微表情（不出现文字） | 最克制最拟人 | 信息明确度弱 |
| E. 组合方案（如 A + D） | 同时有文字读和无文字感受 | 实现复杂 |

请你结合现有视觉气质评估，给出 1-2 种推荐方案并说明理由。

### Q2. mood 怎么表达？

候选形式：

- **纯文字**：mono 10px 小字 + 中文，颜色 var(--t3)
- **文字 + 极轻图形**：在文字前加 1px 小图标（如几何 dot/triangle）
- **色阶映射**：10 个 mood 各自映射到 var(--t1) ~ var(--t3) 区间内的不同灰度
- **微表情联动**：mood 改变 Eyes 的瞳孔大小 / 偏移 / 眼睑张开度

### Q3. mood 与 status 的状态优先级

确认这个规则在你的设计里是否正确表达：

- `status = error` 时，**mood 隐藏**（出错时说自己"好奇"语义冲突）
- `status = asleep` 时，**mood 隐藏**（睡着时不应有 mood）
- 其他 status 下，mood 正常显示

### Q4. mood 过期淡出

- mood 字段是上一次 LLM 输出的，可能已经过去几分钟
- 当 `lastMoodAt` 超过 5 分钟时，需要一个视觉信号表示"这是旧的 mood"
- 你怎么表达？候选：
  - 颜色直接调灰（已有思路）
  - 加一个 mono 小后缀如 `(stale)` 或 `· 过时`
  - 加一个微小的褪色动画
  - 完全隐藏

### Q5. 暗色模式

10 个 mood 在 light / dark 两套主题下分别用什么色值？==与 status 6 态保持同款方法论==（dark 模式更亮版本）。

---

## 数据接入约束（前端已经预留）

设计稿不需要操心数据怎么来，但你设计的视觉要能消费以下两个字段：

```ts
interface Store {
  currentMood: string | null   // 当前 mood 词，未设置时 null
  lastMoodAt: number | null    // 设置时的 epoch ms 时间戳
}
```

mood 词永远只在词表 10 个里取（不会有意外字符）。如果你的设计需要每个 mood 配置不同视觉参数，请给出完整的 10 个词的映射表。

---

## 与已有视觉的兼容约束

==必须沿用，不要破坏==：

- 配色：light/dark 两套 token；accent 是极深/极浅近黑/近白（中性单色）
- 字体：JetBrains Mono（mono）/ Space Grotesk + Noto Sans SC（西文+中文）
- mood 视觉**绝对不能**用 emoji、卡通、彩虹色、霓虹色、渐变背景
- mood 视觉**绝对不能**破坏 Heartbeat 48px 高度
- mood 视觉**绝对不能**比 status 视觉权重大

==可以新加==：

- 新的 mono 字号 / letter-spacing 组合（保持 ≤ 11px 即可）
- 新的几何元素（dot / line / diamond / triangle），1-2px 极简风
- Eyes 字标的扩展 props / 内部动画状态
- 新的 CSS 变量与色阶（在 mono 灰度范围内）

==不要碰==：

- 已有的 Heartbeat 六态 status 视觉（颜色 / 脉冲 / 字号 / 排版）
- StatePanel 四栏布局
- Eyes 字标的几何（viewBox / 椭圆位置 / 瞳孔位置）
- 整体 layout 比例（Rail 56px / Heartbeat 48px / StatePanel 280px）

---

## 交付物

请给我：

1. **更新后的 HTML 高保真原型**（在原 `Zoufx AI.html` 基础上加 mood 视觉）
2. **一份 `mood-system.md`** 实现规范，包含：
   - mood 视觉的最终选型（位置 / 形式 / 配色 / 过期策略 / 暗色版本）
   - 10 个 mood 词的完整视觉参数映射表
   - 与 status 的优先级覆盖规则
   - 必要的 CSS 关键帧（如果有动画）
   - 与 Eyes 字标的联动（如果有）
   - 无障碍约束（`prefers-reduced-motion` / aria）
3. **可选**：如果你做了 Eyes 字标的 mood 微表情联动，附上前后对比示意

---

## 验收清单

- [ ] 10 个 mood 词都有明确的视觉对应（不留一个词没设计）
- [ ] status = error / asleep 时 mood 正确隐藏
- [ ] mood 出现/切换时不抢 status 焦点
- [ ] 视觉不破坏现有"工作台/仪器"冷淡气质
- [ ] light 和 dark 两套主题下都通过对比度 ≥ 3:1 的可读性
- [ ] mood 过期（>5 分钟）有清晰的视觉信号
- [ ] 不出现任何 emoji / 卡通元素
- [ ] 在 360px 窄屏下视觉不溢出 / 不重叠

---

## 备注（可不看）

mood 在工程层是 LLM 顺带输出的零成本特性（不增加 API 调用、不影响响应延迟），所以**视觉上的"重要度"应该匹配这个工程定位**——一个轻量的、点缀式的、可有可无但有了更好的辅信号。

如果你觉得**mood 根本不该出现在 UI 上、应该完全融进 Eyes 表情**，也可以给这种激进方案，但请同时给一份妥协方案备选。
