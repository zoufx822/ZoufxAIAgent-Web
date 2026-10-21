# Zoufx AI — 情绪 & 动态内容实现规范

> 给 Claude Code 的交付提示词。落地 Zoufx AI 顶栏"情绪指示器"和首页/消息头像的"眼睛标志"。框架无关，可用 React / Vue / Svelte 实现。

---

## 一、情绪状态机（Mood State Machine）

小Z 在任意时刻处于以下六态之一。每个状态对应：内部 key、中文展示名、英文 mono 标签、主色（含 light/dark）、脉冲频率、触发条件。

| key | 中文 | EN | 颜色（light / dark） | 脉冲周期 | 触发条件 |
|---|---|---|---|---|---|
| `idle` | 等待交互 | IDLE | `#22c55e` / `#4ade80` | 2.4s | 无 in-flight 任务，默认态 |
| `thinking` | 思考中 | THINKING | `#d97706` / `#fbbf24` | 1.1s | AI 正在推理（pre-tool / pre-content） |
| `tooling` | 使用工具 | TOOLING | `#2563eb` / `#60a5fa` | 0.9s | 任一工具调用 in-flight |
| `writing` | 回复中 | WRITING | `#0891b2` / `#22d3ee` | 1.3s | 内容流式输出中 |
| `error` | 出错了 | ERROR | `#dc2626` / `#f87171` | 0.7s | 上一次回复失败 / 工具报错 / 网络断 |
| `asleep` | 打盹中 | ASLEEP | `#7c3aed` / `#a78bfa` | 3.2s | `idle` 且本地时间 ≥23:00 或 <5:00 |

**派生规则**
- `asleep` 是 `idle` 的子态，不是独立事件；仅在前端按本地时间衍生。
- 状态优先级（同帧多条件成立时取最高）：`error > tooling > thinking > writing > asleep > idle`
- 状态切换需有 ≥120ms 的最短驻留时间，避免快速 flicker
- 一次 AI 应答的典型生命周期：`idle → thinking → tooling → writing → idle`

**接口建议**
```ts
type Mood = 'idle' | 'thinking' | 'tooling' | 'writing' | 'error' | 'asleep';

interface MoodController {
  set(m: Mood): void;
  get(): Mood;
  subscribe(cb: (m: Mood) => void): () => void;
}
```

---

## 二、顶栏情绪指示器（Heartbeat Strip）

页面顶部 48px 高的窄栏。**只展示情绪**，不放计时器、不放 mem/tools 计数。

### 布局

```
┌────────────────────────────────────────────────────────────┐
│ ● 等待交互  IDLE                                            │
└────────────────────────────────────────────────────────────┘
```

- 容器：`padding: 0 28px; height: 48px; border-bottom: 1px solid var(--border); background: var(--bg);`
- 左对齐，三个内联元素：脉冲圆点 + 中文标签 + 英文 mono 标签
- 元素间隙 `gap: 12px`，垂直 baseline 对齐
- 整条 `role="status" aria-live="polite"`

### 圆点

- 尺寸 `7×7px`，圆形
- `background: var(--mood)`
- 脉冲发光动画：
  ```css
  @keyframes hbPulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--mood-glow); }
    50%      { box-shadow: 0 0 0 6px transparent; }
  }
  ```
- `animation-duration` = 表里的脉冲周期
- glow = 主色 + alpha：thinking/tooling/writing/error 用 `80`（约 50%），idle/asleep 用 `60`（约 38%）

### 中文标签

- `font-family: 'Space Grotesk', 'Noto Sans SC', sans-serif`
- `font-size: 13.5px; font-weight: 500;`
- `color: var(--mood)` — 跟着情绪变色
- `letter-spacing: -.005em;`

### 英文 mono 标签

- `font-family: 'JetBrains Mono', ui-monospace, monospace`
- `font-size: 10px; font-weight: 500;`
- `letter-spacing: .18em; text-transform: uppercase;`
- `color: var(--mood); opacity: .55;` — 比中文更安静
- 像情绪的"机型代号"，方便老用户扫读

### 状态切换过渡

- 用 `transition: color .22s ease, background-color .22s ease`
- 文字内容切换不做 fade（避免眼花），直接换；颜色过渡足够
- 脉冲周期变化时浏览器会自然 interpolate `animation-duration`，无需额外处理

### CSS 变量挂载

```css
.heartbeat[data-mood="idle"]     { --mood:#22c55e; --mood-glow:#22c55e60; --mood-dur:2.4s; }
.heartbeat[data-mood="thinking"] { --mood:#d97706; --mood-glow:#d9770680; --mood-dur:1.1s; }
.heartbeat[data-mood="tooling"]  { --mood:#2563eb; --mood-glow:#2563eb80; --mood-dur:.9s;  }
.heartbeat[data-mood="writing"]  { --mood:#0891b2; --mood-glow:#0891b280; --mood-dur:1.3s; }
.heartbeat[data-mood="error"]    { --mood:#dc2626; --mood-glow:#dc262680; --mood-dur:.7s;  }
.heartbeat[data-mood="asleep"]   { --mood:#7c3aed; --mood-glow:#7c3aed60; --mood-dur:3.2s; }

[data-theme="dark"] .heartbeat[data-mood="idle"]     { --mood:#4ade80; }
[data-theme="dark"] .heartbeat[data-mood="thinking"] { --mood:#fbbf24; }
[data-theme="dark"] .heartbeat[data-mood="tooling"]  { --mood:#60a5fa; }
[data-theme="dark"] .heartbeat[data-mood="writing"]  { --mood:#22d3ee; }
[data-theme="dark"] .heartbeat[data-mood="error"]    { --mood:#f87171; }
[data-theme="dark"] .heartbeat[data-mood="asleep"]   { --mood:#a78bfa; }
```

---

## 三、眼睛标志（Eyes Glyph）

替代字标 "小Z"。两只椭圆眼 + 中心小瞳孔，会眨眼会斜视，**忙碌**时会半眯专注。

### 几何

- viewBox `100 × 44`
- 左眼椭圆：`cx=28, cy=22, rx=13, ry=17`（纵向略长，更像人眼）
- 右眼椭圆：`cx=72, cy=22, rx=13, ry=17`
- 左瞳圆：`cx=28, cy=22, r=3.2`
- 右瞳圆：`cx=72, cy=22, r=3.2`
- 眼睛填色 = 前景色（`currentColor` 或显式传入）
- 瞳孔填色 = 反色（浅底用 `var(--bg)` 白；暗色头像里用 `var(--t1)` 深）

### 渲染场景

| 场景 | 高度 | 备注 |
|---|---|---|
| Home 主标志 | 56px（宽 ≈ 123px） | 居中显示在输入框上方，作为页面主视觉 |
| 消息头像（AI 回复左侧） | 11px，外包 32×32 圆角 8 暗色方块 | 每条 assistant 消息都带 |
| Mobile 顶栏（可选） | 20px | 替代品牌字标 |

### 动画 1 — 眨眼（Blink）

- 6 秒循环
- 关键帧：
  ```css
  @keyframes eye-blink {
    0%, 40%, 46%, 92%, 100% { transform: scaleY(1); }
    43%                     { transform: scaleY(0.05); }
    95%                     { transform: scaleY(0.05); }
    97%                     { transform: scaleY(1); }
  }
  ```
- 一长一短两次眨（更像人，不像机械点头）
- 应用对象：每只眼的 `<g class="eye">`
- 必须设置 `transform-box: fill-box; transform-origin: center;` 才能正确以眼睛中心收缩
- 左右眼错开 40ms（右眼 `animation-delay: 0.04s`），避免完全同步的"塑料感"
- **多实例去同步**：页面上多个 Eyes（Home + N 条消息头像），每个实例的 `animation-delay` 应是 3–9s 之间的随机数。建议在挂载时生成一个 CSS 变量传入。

### 动画 2 — 斜视（Glance）

- 14 秒循环，仅 pupil 平移
- 关键帧：
  ```css
  @keyframes pupil-glance {
    0%, 28%, 72%, 100% { transform: translate(0, 0); }
    34%, 44%           { transform: translate(2.2px, -1px); }   /* 瞥右上 */
    56%, 66%           { transform: translate(-2.2px, 0.5px); } /* 瞥左下 */
  }
  ```
- 应用对象：`<circle class="pupil">`，同样需要 `transform-box: fill-box; transform-origin: center;`
- 仅大尺寸（高度 ≥40px）启用，小头像不需要（看不清反而显得抖）

### 动画 3 — 忙碌（Busy）

- 当 mood ∈ `{thinking, tooling, writing}` 时，给 `<svg class="eyes-z">` 加 `.busy` 类
- `.busy` 下：
  - 关闭 glance 动画（瞳孔归中）
  - 眨眼变成"半眯专注"：1.6 秒循环
    ```css
    @keyframes eye-busy {
      0%, 100% { transform: scaleY(1); }
      50%      { transform: scaleY(0.6); }
    }
    ```
- 这是关键的人格点：人类专注思考时确实会半眯眼

### 动画 4 — 错误（Error，可选 V2）

- mood = `error` 时，眼睛短促左右抖动 3 次（0.3s 内），然后停在略下垂位置
- 实现：在外层 svg 上 `animation: shake .3s ease-out` + 一次性 transform 让眼睛 y+1px

### 动画 5 — 跟随鼠标（可选 V2）

- pupils 的位置基于鼠标在视口的 x/y 偏移，最大平移 ±3px
- 平滑：`transition: transform .25s ease-out`
- 仅 Home 大标志启用
- `prefers-reduced-motion` 时关闭

### 完整 SVG 模板

```jsx
function Eyes({ size = 56, busy = false, color, pupil, blinkDelay }) {
  const w = Math.round(size * 2.2);
  const h = size;
  const fill = color || 'currentColor';
  const pp = pupil || 'var(--bg)';
  return (
    <svg
      className={`eyes-z${busy ? ' busy' : ''}`}
      width={w} height={h} viewBox="0 0 100 44"
      role="img" aria-label="小Z"
      style={blinkDelay ? { ['--blink-delay']: blinkDelay } : undefined}
    >
      <g className="eye eye-l">
        <ellipse cx="28" cy="22" rx="13" ry="17" fill={fill}/>
        <circle  className="pupil pupil-l" cx="28" cy="22" r="3.2" fill={pp}/>
      </g>
      <g className="eye eye-r">
        <ellipse cx="72" cy="22" rx="13" ry="17" fill={fill}/>
        <circle  className="pupil pupil-r" cx="72" cy="22" r="3.2" fill={pp}/>
      </g>
    </svg>
  );
}
```

### 配套 CSS

```css
.eyes-z .eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: eye-blink 6s ease-in-out infinite;
  animation-delay: var(--blink-delay, 3s);
}
.eyes-z .eye.eye-r { animation-delay: calc(var(--blink-delay, 3s) + 0.04s); }

.eyes-z .pupil {
  transform-box: fill-box;
  transform-origin: center;
  animation: pupil-glance 14s ease-in-out infinite;
}

.eyes-z.busy .eye   { animation: eye-busy 1.6s ease-in-out infinite; }
.eyes-z.busy .pupil { animation: none; }
```

---

## 四、状态联动（Mood ↔ Eyes）

页面同一个 `MoodController` 同时驱动：
- 顶栏 Heartbeat 的 `data-mood` 属性
- Home 主 Eyes 的 `busy` prop（`mood !== 'idle' && mood !== 'asleep' && mood !== 'error'`）
- 消息头像 Eyes 的 `busy` prop 同上

```tsx
const mood = useMood();
return (
  <>
    <Heartbeat mood={mood} />
    <Eyes size={56} busy={['thinking','tooling','writing'].includes(mood)} />
  </>
);
```

---

## 五、无障碍

- 所有持续动画必须遵守 `prefers-reduced-motion: reduce`：关掉脉冲、眨眼、斜视、忙碌半眯；只保留颜色变化
  ```css
  @media (prefers-reduced-motion: reduce) {
    .heartbeat-dot,
    .eyes-z .eye,
    .eyes-z .pupil { animation: none !important; }
  }
  ```
- 眼睛 SVG：`role="img" aria-label="小Z"`
- 顶栏：`role="status" aria-live="polite"`，状态切换会被屏幕阅读器播报"思考中"等
- 颜色对比度：所有 mood 主色与背景对比度 ≥ 4.5:1（已在表里给定值满足）

---

## 六、组件 API 速查

```tsx
<Heartbeat mood="idle" />

<Eyes
  size={56}                  // 渲染高度 px
  color="currentColor"       // 眼睛填色，默认随父级 color
  pupil="var(--bg)"          // 瞳孔填色，默认背景色
  busy={false}               // 忙碌态：半眯专注
  blinkDelay="4.2s"          // 多实例去同步用，可选
/>
```

---

## 七、验收清单

- [ ] 六种情绪切换时，圆点颜色 + 脉冲速度 + 中文/EN 标签**同时**变
- [ ] 同一页面多个 Eyes 实例**不会同步眨眼**
- [ ] 深夜（≥23:00）且空闲时，自动从 `idle` 派生为 `asleep`
- [ ] `error` 状态正确显示红色且脉冲最快（0.7s）
- [ ] busy 状态下眼睛不再做大眨眼，改半眯
- [ ] 暗色模式下每个 mood 颜色都比浅色版本更亮
- [ ] reduced-motion 开启后，所有动画静止；颜色还在
- [ ] 顶栏情绪文字在 SR 中被读出
- [ ] 颜色对比度 ≥ 4.5:1（light & dark）
