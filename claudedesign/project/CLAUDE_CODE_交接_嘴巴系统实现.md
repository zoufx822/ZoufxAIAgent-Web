# Zoufx AI · 交接提示词 —— 嘴巴系统实现

> 适用文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX）  
> 展示参考：`全情绪展示（嘴巴版）.html`  
> 本轮改动：① 在 `Eyes` 组件追加嘴巴渲染逻辑 ② 好奇眼睛放大 ③ 解决线条锯齿

---

## 背景 / 设计意图

Zoufx AI 的核心表情原本只有眼睛（SVG clipPath 裁切椭圆）。本轮在同一个 `Eyes` SVG 内追加**嘴巴元素**，让情绪表达更完整、更易读。

**设计原则：**
- 嘴巴绘制在眼睛 clip 区域**下方**（overflow:visible），不干扰眼睛逻辑
- 嘴型随 `mood` prop 切换，与眼睛共享同一套 `fill` / `pp`（背景色）变量
- 睡眠状态（`asleep`）隐藏嘴巴，不打破睡眠脸的极简感

---

## 实现位置

`Eyes` 组件 return 里，`{e.question && ...}` 问号符号块的**正后方**，`</svg>` 的**正前方**：

```jsx
{/* ── Mouth ── */}
{!asleep && (()=>{
  const sp = {fill:'none', stroke:fill, strokeLinecap:'round'};
  if(thinking)      return <path d="M 46,40 L 54,40" {...sp} strokeWidth="2.0"/>;
  if(mood==='愉快') return <path d="M 41,40 Q 50,45.5 59,40" {...sp} strokeWidth="2.0"/>;
  if(mood==='平静') return <path d="M 44,40 Q 50,42 56,40" {...sp} strokeWidth="2.0"/>;
  if(mood==='好奇') return <ellipse cx="50" cy="43" rx="4.2" ry="3.5" fill={fill}/>;
  if(mood==='兴奋') return <path d="M 39,40 Q 50,47 61,40" {...sp} strokeWidth="2.2"/>;
  if(mood==='困惑') return <path d="M 43,41 Q 46.5,39 50,41 Q 53.5,43 57,41" {...sp} strokeWidth="2.0"/>;
  if(mood==='难过') return <path d="M 43,38 Q 50,33 57,38" {...sp} strokeWidth="2.0"/>;
  if(mood==='愤怒') return (<g>
    <rect x="41" y="37.5" width="18" height="6" rx="1.5" fill={fill}/>
    <rect x="42.5" y="38.5" width="15" height="2" rx="0.5" fill={pp} opacity="0.9"/>
    <rect x="42.5" y="40.7" width="15" height="1.8" rx="0.5" fill={pp} opacity="0.75"/>
  </g>);
  return <path d="M 44,40 Q 50,42 56,40" {...sp} strokeWidth="2.0"/>;
})()}
```

---

## 各情绪嘴型说明

| 情绪 | 嘴型 | 关键坐标 |
|------|------|----------|
| 思考中 | 短横线（静默） | y=40，长度 8units |
| 愉快 | 中弧上扬笑 | 弧顶 y=45.5 |
| 平静 | 微弧放松线 | 弧顶 y=42 |
| 好奇 | 实心 O 型嘴 | cx=50 cy=43，rx=4.2 ry=3.5 |
| 兴奋 | 大弧咧嘴笑 | 弧顶 y=47，宽 22units |
| 困惑 | 双峰波浪线 | 两个波峰，幅度 ±2units |
| 难过 | 下弯弧（倒笑） | 弧顶 y=33（最高点） |
| 愤怒 | 咬牙切齿矩形 | 三层矩形：外框+上排牙+下排牙，pp 色模拟牙齿 |
| default / 无 mood | 同平静 | fallback |

---

## 坐标系参考

SVG viewBox = `0 0 100 44`，但嘴巴绘制在 **overflow:visible** 区域，y 可超出 44。

眼睛 clip 底边（各情绪不同）：
- 标准情绪（愉快/平静/好奇/兴奋/困惑）：clip 底 y ≈ **39**
- 愤怒：clip 底 y ≈ **37**
- 难过：clip 底 y ≈ **33**（眼睛更小，嘴巴随之上移）

**嘴巴最高点 = clip 底 + 约 0.5–1 unit**，保证嘴巴完全在眼睛下方，视觉不压叠。

---

## 好奇眼睛联动放大

`MOOD_EXPR['好奇']` 的 `pr`（瞳孔半径）从 `5.0` 改为 `6.5`，配合 O 型嘴，强化「大眼睁圆」的好奇感。

```js
'好奇': {pr:6.5, pdy:-3.2, esy:1.00, blink:3.0, liddy:0, lidty:0},
```

---

## 锯齿问题与 strokeWidth 选择

**问题根因：**
- SVG 在 1x DPR 屏幕上，viewBox 100×44 → 实际渲染 ~176×80px（size=80），缩放比 ≈ 1.8x
- strokeWidth=1.3 SVG units → 物理像素仅 ~2.3px，sub-pixel 渲染锯齿明显
- 弯曲路径（困惑波浪/平静弧）尤其明显，水平线也因非整数 y 跨 3 个像素行

**解决方案：**
- 所有线条嘴巴 strokeWidth 统一提升至 **2.0–2.2**（物理像素 ≥ 3.5px）
- y 坐标整数化：思考中 `39.5→40`，困惑 `41.5→41`，难过弧顶 `33.5→33`
- SVG 已有 `shapeRendering="geometricPrecision"`，保持不变

---

## 注意事项

1. **`asleep` 状态不渲染嘴巴** — `{!asleep && (...)}` 包裹整个嘴巴 block，Claude Code 实现时务必保持此条件
2. **`thinking` 优先于 `mood`** — if 判断顺序不能颠倒，thinking 先判断
3. **愤怒牙齿用 `pp` 色** — `pp = pupil || 'var(--bg)'`，即背景色，模拟牙缝/牙齿，不要硬编码白色（深色模式下会出错）
4. **好奇嘴巴用 `fill={fill}` 实心填充** — 不是 stroke，单独处理，不能套用 `sp` 对象
5. **嘴巴不参与任何动画** — 当前版本嘴巴是静态的，无过渡动画，情绪切换时直接替换即可
