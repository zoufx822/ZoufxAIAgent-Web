# Zoufx AI · mood-system.md

> mood 情感词视觉补设计 — 实现规范。
> 配合 `emotion-system.md` 使用：那份管 status（运行态），这份管 mood（情感色彩）。

---

## 一、关键设计决策

| 维度 | 决策 | 理由 |
|---|---|---|
| **位置** | Heartbeat 末尾文字 + Home Eyes 像素级微表情（A + D 组合） | 文字保证明确，微表情承担"拟人化"权重 |
| **形式** | 纯文字，无图标、无 emoji、无独立色块 | 维持单色冷淡气质 |
| **配色** | 全部 mood 共享同一灰阶（`var(--t3)`），不为每个词单独配色 | 不抢 status 焦点，且符合"反卖萌" |
| **字体** | Noto Sans SC italic，11.5px | italic 提供"旁注"感，与 status 的非斜体形成层级 |
| **过期策略** | 三段衰减：<5min 正常 / 5–15min stale 灰 / ≥15min 隐藏 | 保留信息但弱化时间敏感性 |
| **隐藏规则** | `status ∈ {error, asleep}` 时强制隐藏 mood | 语义冲突回避 |
| **切换动效** | 180ms opacity + letter-spacing 收缩 fade-in，无位移 | 不打扰扫读 |

---

## 二、视觉位置 — Heartbeat 末尾

完整 Heartbeat 渲染（status=idle + mood=好奇）：

```
● 等待交互  IDLE  ·  好奇
└┘└────┘  └──┘ └┘  └──┘
 a    b    c    d    e
```

| 段 | 内容 | 字号 | 字距 | 颜色 | 字体 | 字重 |
|---|---|---|---|---|---|---|
| a | 脉冲圆点 | 7×7px | — | `var(--mood)` | — | — |
| b | 中文 status | 13.5px | -0.005em | `var(--mood)` | Space Grotesk + Noto Sans SC | 500 |
| c | EN status | 10px | 0.18em | `var(--mood)` opacity .55 | JetBrains Mono | 500 |
| d | 分隔符 `·` | 11px | — | `var(--t3)` opacity .5 | JetBrains Mono | — |
| e | mood 中文 | 11.5px | 0.02em | `var(--t3)` | Noto Sans SC italic | 400 |

mood 永远比 status 视觉权重低一档：字号 -2px、颜色更弱、italic、没有 EN 标签。

---

## 三、Eyes 微表情联动（仅 Home 大尺寸启用）

每个 mood 对 Eyes 的几何参数做**像素级**微调。viewBox `100×44`，左眼 cx=28，右眼 cx=72。

### 微表情映射表（10 个 mood）

| mood | `pupil-r` | `pupil-dy` | `eye-scaleY` | 右瞳 x-offset | 眨眼周期 | 备注 |
|---|---|---|---|---|---|---|
| 好奇 | 3.6 | -0.6 | 1.00 | 0 | 6s | 瞳孔放大 + 略向上看 |
| 温和 | 3.2 | 0.0 | 0.95 | 0 | 7s | 轻微眯眼，眼神柔和 |
| 严肃 | 2.8 | 0.0 | 1.00 | 0 | 8s | 瞳孔收紧，少眨眼 |
| 平静 | 3.2 | 0.0 | 1.00 | 0 | 6s | 默认基准 |
| 共情 | 3.6 | +0.4 | 0.95 | 0 | 7s | 瞳孔放大 + 略向下，眼睑略低 |
| 戏谑 | 3.2 | -0.3 | 1.00 | +1.2 | 5s | 单眼瞳孔偏移（不对称） |
| 困惑 | 3.0 / 3.6 | 0.0 | 1.00 | -1.0 | 5s | 左右瞳孔不一样大，更快眨眼 |
| 疲惫 | 3.0 | +0.5 | 0.70 | 0 | 9s | 眼睑明显下垂，眨眼变慢 |
| 兴奋 | 3.8 | -0.4 | 1.00 | 0 | 3.5s | 瞳孔最大，眨眼最快 |
| 挫败 | 2.8 | +0.3 | 0.85 | 0 | 7s | 瞳孔收紧 + 眼睑下垂 |

### 计算公式

```js
// pseudo-code
const expr = MOOD_EXPR[mood] || DEFAULT;
const ellipseRy = 17 * expr.esy;
const leftPupil  = { cx: 28,                cy: 22 + expr.pdy, r: expr.pr };
const rightPupil = { cx: 72 + expr.pdxR,    cy: 22 + expr.pdy, r: expr.prR || expr.pr };
```

### 过渡

mood 切换时，所有几何属性（ry / cx / cy / r）应 `transition: .4s ease`，避免硬切。

```css
.eyes-z ellipse { transition: ry .4s ease; }
.eyes-z .pupil  { transition: cx .4s ease, cy .4s ease, r .4s ease; }
```

### 启用范围

- Home 主标志（size=56）→ **启用** mood 微表情
- 消息头像（size=11）→ **不启用**（看不见反而抖动）

---

## 四、与 status 的优先级

```
mood 渲染逻辑：

  if (status == 'error')         → hide mood
  if (status == 'asleep')        → hide mood
  if (ageMin >= 15)              → hide mood
  else if (ageMin >= 5)          → render with .stale class
  else                           → render normal
```

实现时强烈建议把这逻辑写成纯函数：

```ts
function getMoodDisplay(
  status: Mood,           // emotion-system.md 的六态
  mood: string | null,
  lastMoodAt: number | null,
  now: number = Date.now()
): { visible: boolean; stale: boolean; mood: string } {
  if (!mood || status === 'error' || status === 'asleep') {
    return { visible: false, stale: false, mood: '' };
  }
  const ageMin = lastMoodAt ? (now - lastMoodAt) / 60000 : Infinity;
  if (ageMin >= 15) return { visible: false, stale: false, mood: '' };
  return { visible: true, stale: ageMin >= 5, mood };
}
```

---

## 五、暗色模式色阶

mood 沿用单色 token，不引入新色相：

| 状态 | light | dark |
|---|---|---|
| 正常 | `var(--t3) = #c0c0c0` | `var(--t3) = #3d3d3d` |
| stale | `oklch(0.86 0 0 / 0.55)` | `oklch(0.5 0 0 / 0.55)` |
| 分隔符 `·` | `var(--t3)` opacity .5 | `var(--t3)` opacity .5 |

对比度自检：
- light 正常：c0c0c0 on ffffff ≈ 1.6:1（**仅文字大色块，11.5px italic 可接受为"装饰性"，但若需 AA 合规，调到 #a3a3a3 ≈ 3.0:1**）
- dark 正常：3d3d3d on 0c0c0c ≈ 4.2:1 ✓

> **建议**：light 模式下若要严格 AA，把 mood 颜色调到 `#a3a3a3`（在 t2/t3 之间，确认设计师认可）。当前实现保留 `var(--t3)` 是为了视觉一致性优先。

---

## 六、切换动画

```css
@keyframes moodIn {
  0%   { opacity: 0; transform: translateY(1px); letter-spacing: .10em; }
  100% { opacity: 1; transform: translateY(0);   letter-spacing: .02em; }
}
.hb-mood-label {
  animation: moodIn .22s ease both;
  transition: color .35s ease, opacity .35s ease;
}
```

切换 key 用 `mood + lastMoodAt` 联合值，让 React 在 mood 字面相同但时间戳变了的情况下也能重放动画。

---

## 七、Eyes mood prop 接口

```tsx
<Eyes
  size={56}
  mood="好奇"                // 10 个 mood 之一，或 null/undefined（默认平静）
  busy={false}              // 来自 emotion-system status，与 mood 正交
  color="currentColor"
  pupil="var(--bg)"
/>
```

`busy` 优先于 mood：当 `busy=true` 时眨眼变成半眯（emotion-system.md 第三节），mood 的眨眼周期被覆盖。

---

## 八、无障碍

- `prefers-reduced-motion: reduce` 下：
  - mood 切换 fade 动画关闭，直接换文字
  - Eyes 微表情几何静止变化（取消 `transition`）
  - 不影响信息呈现
- Heartbeat 父容器 `role="status" aria-live="polite"` 不变，mood 文字作为同一 live region 的一部分被屏幕阅读器读出
- Eyes svg `aria-label` 包含 mood：`aria-label="小Z·好奇"`

---

## 九、Tweaks 调试面板（开发期）

为方便手动验证 10 个 mood 的视觉，建议在 Tweaks 面板加：
- mood 下拉选择器（10 项 + "无"）
- "置为 stale" 按钮（把 `lastMoodAt` 拨到 6 分钟前）

```tsx
<select onChange={e => setMood(e.target.value || null)}>
  <option value="">— 无 —</option>
  {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
</select>
<button onClick={() => setLastMoodAt(Date.now() - 6*60*1000)}>stale</button>
```

---

## 十、验收清单

- [ ] 10 个 mood 都能在 Heartbeat 末尾正确显示
- [ ] 10 个 mood 都触发 Home Eyes 几何微调（可肉眼区分至少 7 个）
- [ ] status=error 时 mood 隐藏
- [ ] status=asleep（深夜 idle）时 mood 隐藏
- [ ] 设置 mood 后 6 分钟，mood 变 stale 灰
- [ ] 设置 mood 后 16 分钟，mood 完全隐藏
- [ ] mood 切换有 ≤200ms 的 fade-in，无位移
- [ ] mood 视觉权重明显低于 status（字号 / 颜色 / italic 三重弱化）
- [ ] light & dark 两套主题下 mood 都可见
- [ ] reduced-motion 开启后所有 mood 相关动画静止
- [ ] 360px 窄屏下，mood 文字不溢出（必要时优先隐藏 mood 保留 status）

---

## 十一、Mood 词义对照（给后端 / LLM 参考）

LLM 输出 `<!--mood:好奇-->` 时，应严格从下表取词。每个词应只在对应场景下使用：

| mood | 使用场景 |
|---|---|
| 好奇 | 用户提了新话题、有探索价值的问题 |
| 温和 | 日常闲聊、安抚情绪、轻松对话 |
| 严肃 | 涉及金钱/法律/医疗/重要决策 |
| 平静 | 默认中性回复，无明显情感倾向 |
| 共情 | 用户表达情绪、抱怨、求安慰 |
| 戏谑 | 玩笑、双关、用户主动开玩笑 |
| 困惑 | 用户表述模糊、矛盾、超出能力范围 |
| 疲惫 | 长对话末尾、重复问题、深夜场景 |
| 兴奋 | 用户分享成就、好消息、突破 |
| 挫败 | 工具调用失败、无法满足用户需求 |

> mood 是 LLM 在每条回复 **末尾** 顺带输出的元信息，不影响主回复内容，前端从 SSE 流中剥离后写入 store。
