# Handoff: Chat Presence 组件重设计（v0.14 → v0.15）

## Overview

将聊天页顶部的 AI 表情 banner 重设计为**无边框的悬浮大眼睛**：
- 移除 header 感（背景、border-bottom、固定高度）
- 眼睛放大至原来近 2 倍
- 情绪变化时改用「双环扩散脉冲」特效替代原来的 spotlight 放大动画
- 修复 SVG clipPath 在浏览器缩放后出现的锯齿问题

这是设计稿参考文件（HTML prototype），请在真实 codebase 中按下述规格还原。

---

## Fidelity

**高保真（Hifi）** — 颜色、尺寸、动画时序均为最终值，请像素级还原。

---

## 变更一：移除旧 `PresenceSticky` 组件，新增 `PresenceFloat`

### 旧组件（删除）

```
PresenceSticky
- position: sticky, top: 0
- height: 56px（固定）
- background: var(--bg)
- border-bottom: 1px solid var(--border-lt)   ← 删除
- 横向排列：眼睛 + 状态标签
- Eyes size={32}（spotlight 时临时变为 size={88}）← 删除 spotlight 逻辑
```

### 新组件 `PresenceFloat`

```
- position: sticky, top: 0, z-index: 5
- 纵向排列（flex-direction: column）居中对齐
- padding: 28px 24px 18px
- gap: 10px
- background: var(--bg)（与页面同色，无 border）
- pointer-events: none（整体不拦截点击，状态标签单独恢复 pointer-events: auto）
```

#### Eyes 尺寸

```
size={60}
→ SVG width  = Math.round(60 * 2.2) = 132px
→ SVG height = 60px
→ viewBox: "0 0 100 44"
```

#### 状态标签（眼睛正下方）

与旧版完全一致，仅改了父级选择器前缀（`.presence-sticky` → `.presence-float`）：

| 元素 | 样式 |
|---|---|
| `.presence-dot` | 7×7px 圆点，颜色 `var(--mood-color)`，`hbPulse` 动画 2.4s |
| `.status-zh` | Space Grotesk / 13px / weight 500 / 颜色 `var(--mood-color)` |
| `.status-en` | JetBrains Mono / 10px / weight 500 / letter-spacing 0.18em / uppercase / opacity 0.55 |
| `.presence-sep` | `·` 分隔符，颜色 `var(--t3)` / opacity 0.5 |
| `.presence-mood` | Noto Sans SC / italic / 12px / 颜色 `var(--t2)` / 进入动画 `moodIn` |

---

## 变更二：情绪变化特效 — 双环脉冲（替换 spotlight）

### 触发时机

`mood` prop 发生变化时（非首次挂载）。

### 实现方式（React）

```tsx
const [ringKey, setRingKey] = useState(0);
const prevMoodRef = useRef(mood);

useEffect(() => {
  if (prevMoodRef.current !== null && mood !== prevMoodRef.current) {
    setRingKey(k => k + 1);
  }
  prevMoodRef.current = mood;
}, [mood]);

// JSX（在 eyes-wrap 内）
{ringKey > 0 && (
  <Fragment key={ringKey}>
    <div className="mood-ring" />
    <div className="mood-ring mood-ring-2" />
  </Fragment>
)}
```

> `key={ringKey}` 确保每次 mood 变化都重新挂载、重新播放动画。

### CSS

```css
/* 环形容器：绝对定位，居中于 eyes-wrap */
.mood-ring {
  position: absolute;
  width: 148px;
  height: 68px;
  border-radius: 40%;
  border: 1.5px solid var(--mood-color);
  top: 50%;
  left: 50%;
  pointer-events: none;
  animation: mood-ring-out 1.15s cubic-bezier(.18, .6, .3, 1) forwards;
}

/* 第二圈：延迟 120ms，更淡更细 */
.mood-ring-2 {
  animation-delay: .12s;
  opacity: .3;
  border-width: 1px;
}

@keyframes mood-ring-out {
  0%   { opacity: .55;  transform: translate(-50%, -50%) scale(.82); }
  25%  { opacity: .38; }
  100% { opacity: 0;    transform: translate(-50%, -50%) scale(2.1); }
}
```

**重点：**
- `var(--mood-color)` 随当前情绪状态变化（绿/蓝/橙等），环的颜色自动对应
- 不改变 Eyes 尺寸，不改变布局

### 删除旧 spotlight 相关

以下内容可以删除（或保留状态但停止向 Chat 传递）：

```
- .presence-sticky.spotlight { height: 170px; ... }
- spotlight-pop / spotlight-halo / label-rise keyframes
- triggerSpotlight() 函数（如 tweaks 面板不再需要可一并删除）
- Chat 组件不再接收 spotlight prop
```

---

## 变更三：Chat 组件 top padding 调整

聊天消息区顶部 padding 从 `36px` 改为 `8px`（因为 `PresenceFloat` 本身已有 `28px` 顶部内边距）：

```tsx
// 旧
<div style={{ flex:1, overflow:'auto', padding:'36px 56px' }}>

// 新
<div style={{ flex:1, overflow:'auto', padding:'8px 56px 36px' }}>
```

---

## 变更四：SVG clipPath 锯齿修复

在 `Eyes` 组件的 `<svg>` 元素上加 `shapeRendering="geometricPrecision"`：

```tsx
// 旧
<svg width={w} height={h} viewBox="0 0 100 44" fill="none" ...>

// 新
<svg width={w} height={h} viewBox="0 0 100 44" fill="none"
     shapeRendering="geometricPrecision" ...>
```

**原因：** Eyes 用 `<clipPath><polygon>` 做眼皮遮罩，浏览器缩放时会重新光栅化裁剪边缘，产生锯齿。加 `geometricPrecision` 强制反锯齿渲染。

---

## 设计 Token 参考

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#0c0c0c` |
| `--border-lt` | `#f0f0f0` | `#1f1f1f` |
| `--t2` | `#737373` | `#737373` |
| `--t3` | `#c0c0c0` | `#3d3d3d` |
| `--mood-color` (idle) | `#22c55e` | `#4ade80` |
| `--mood-color` (thinking) | `#2563eb` | `#60a5fa` |
| `--mood-color` (tooling) | `#d97706` | `#fbbf24` |
| `--mood-color` (writing) | `#16a34a` | `#4ade80` |
| `--mood-color` (asleep) | `#7c3aed` | `#a78bfa` |
| `--mood-color` (drifting) | `#94a3b8` | `#94a3b8` |

---

## 文件

设计参考 HTML 原型：`Zoufx AI.html`（Zoufx AI 项目）
