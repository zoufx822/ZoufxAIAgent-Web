# Zoufx AI · 交接提示词 —「思考中」表情系统 + 困惑表情重做

> 适用文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX）
> 旧版本备份：`Zoufx AI v1~v6.html`，**不要动**。
> 本轮共 3 块改动：① 困惑表情重做 ② 新增系统状态驱动的「思考中」形态 ③ 情绪解析机制（最小播放锁 + mock 发出时机）。

---

## 背景 / 设计意图

Zoufx AI 是一个"有人格"的对话 AI 原型，核心是一双会表达情绪的眼睛（`Eyes` 组件，SVG）。

**情绪有两个正交的来源：**

1. **LLM 情绪**（好奇/兴奋/困惑/难过/愤怒/平静）—— 由后端在回复里返回的情绪标记驱动。
2. **系统状态**（思考中）—— 由前端交互状态驱动（正在思考 / 正在调用工具），**与 LLM 情绪无关**。

**关键规则（务必保持）：**
- 前端收到 LLM 情绪事件 → **第一时间**立即渲染对应情绪。这是硬规则，任何时候都不能给它加延迟。
- 「思考中」只是"等待情绪期间"的占位脸，优先级低于已落定的情绪。
- 用一层**最小播放锁**协调两者（见第三块）。

---

## ① 困惑表情重做

**问题**：旧困惑是双瞳一起向右偏（`pdx:1.8`），读起来像"出神在想"，不是困惑。

**改动**：`MOOD_EXPR['困惑']` 改为**不对称发懵**——右眼眯起、瞳孔回正且左右略不等大，保留 `?` 符号。

```js
// 旧：
'困惑': {pr:3.2, pdy:0.0, esy:1.00, blink:5.0, liddy:0, lidty:0, pdx:1.8, question:true },
// 新：
'困惑': {pr:3.6, prR:2.7, pdy:0.0, esy:1.02, esyR:0.60, blink:5.0, liddy:0, lidty:0, liddyR:2.2, question:true },
```

- `esyR:0.60` —— 右眼眼睑高度压到 60%（眯眼），左眼 `esy:1.02` 正常 → 不对称。
- `prR:2.7` vs `pr:3.6` —— 左右瞳孔不等大。
- `liddyR:2.2` —— 右眼上眼睑下压。
- 删掉了 `pdx`（瞳孔不再整体偏向一侧）。
- 注：`esyR / prR / liddyR` 是右眼专用属性，`Eyes` 组件里本就支持，只是困惑此前没用到。`?` 由 `question:true` 渲染，未改。

---

## ② 新增「思考中」形态（系统状态驱动）

### 2a. 新增专用形态常量

与 `ASLEEP_EXPR` 平级新增（瞳孔上抬、眼睛略放松）：

```js
const THINKING_EXPR = {pr:3.0, pdy:-1.4, esy:0.95, blink:5, liddy:0, lidty:0, lidSlant:0};
```

### 2b. `Eyes` 组件新增 `thinking` prop

签名加 `thinking=false`。形态选择优先级：`waking → asleep → thinking → mood`：

```js
const base = waking
  ? { ...ASLEEP_EXPR, esy: wakingEsy ?? ASLEEP_EXPR.esy }
  : asleep ? ASLEEP_EXPR
  : thinking ? THINKING_EXPR
  : ((mood && MOOD_EXPR[mood]) || DEFAULT_EXPR);
const e = (asleep||thinking) ? base : applyContext(base, context);
```

- `thinking` 时跳过 `applyContext`（不叠加上下文偏移），形态干净。
- `pupilShift` / `calmDrift` / `sad` 等判断都追加了 `&& !thinking`，避免互相干扰。
- 根 svg className 追加 `${thinking?' thinking':''}`。

### 2c. CSS —— 删除旧 busy 跳动，换成 thinking 漂移

**删掉**了旧的 `.eyes-z.busy` 整块（瞳孔纵向跳动 `pupil-busy`）。新增：

```css
/* 思考中：瞳孔缓缓上抬、向两侧出神游移 + 略放松的眨眼，取代旧的 busy 纵向跳动 */
.eyes-z.thinking .eye{animation:eye-blink 4.6s ease-in-out infinite;}
.eyes-z.thinking .eye.eye-r{animation-delay:.06s;}
.eyes-z.thinking .pupil{animation:pupil-think 4.4s ease-in-out infinite;}
.eyes-z.thinking .pupil.pupil-r{animation-delay:.12s;}
@keyframes pupil-think{
  0%,100%{transform:translate(0,-0.6px);}
  28%{transform:translate(2.3px,-2.8px);}
  58%{transform:translate(-1.6px,-2.4px);}
  82%{transform:translate(0.6px,-1.2px);}
}
```

### 2d. 眼睛右侧三点律动（强化"正在想"）

```css
.think-dots{position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);display:flex;gap:5px;pointer-events:none;}
.think-dots i{width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:.28;animation:think-dot 1.4s ease-in-out infinite;}
.think-dots i:nth-child(2){animation-delay:.18s;}
.think-dots i:nth-child(3){animation-delay:.36s;}
@keyframes think-dot{0%,100%{opacity:.22;transform:translateY(1px);}42%{opacity:.95;transform:translateY(-2px);}}
```

挂在 `Eyes` 同级（父容器 `.presence-eyes-wrap` / `.home-eyes` 都是 `position:relative`）：

```jsx
{showThinking && <span className="think-dots"><i/><i/><i/></span>}
```

> 文字状态条仍是 `THINKING` / 「思考中」，未改；三点是眼睛旁的额外律动。

`prefers-reduced-motion: reduce` 媒体查询里也加了 `.eyes-z.thinking .eye,.eyes-z.thinking .pupil,.think-dots i` 一并停动。

---

## ③ 情绪解析机制（最小播放锁 + mock 发出时机）

### 3a. 新增常量

```js
// 情绪最小播放时长：情绪事件一到立即播放并锁定这么久；
// 锁内情绪优先于思考中，锁过期后再重新判定系统状态。
const MOOD_MIN_MS = 1500;
```

### 3b. 显示优先级解析（在渲染眼睛的组件里，如 PresenceFloat）

```js
const status = forceAsleep ? ASLEEP : resolveStatus(hbState, idleMs);
const {glowEls, beatKey} = useMoodPresence(mood, spotlightKey);
// 思考中 = 系统处于思考 / 调用工具状态（与 LLM 情绪正交）
const thinkingState = status.mood==='thinking' || status.mood==='tooling';
// 最小播放锁：情绪事件（spotlightKey 上升沿）一到立即播放并锁定；
// 锁内情绪优先于思考中。锁过期后若系统仍在思考态则让位给思考中，否则维持情绪。
const [moodLocked,setMoodLocked]=useState(false);
const lockRef=useRef(null);
const prevSpotRef=useRef(spotlightKey);
useEffect(()=>{
  if(spotlightKey>0 && spotlightKey!==prevSpotRef.current){
    setMoodLocked(true);
    clearTimeout(lockRef.current);
    lockRef.current=setTimeout(()=>setMoodLocked(false), MOOD_MIN_MS);
  }
  prevSpotRef.current=spotlightKey;
  return ()=>clearTimeout(lockRef.current);
},[spotlightKey]);
const showThinking = thinkingState && !moodLocked;
const moodVisible = STATUS_HAS_MOOD[status.mood] && mood && !showThinking;
```

渲染：

```jsx
<Eyes size={60} mood={mood} context={context} thinking={showThinking} beatKey={beatKey}
      asleep={status.mood==='asleep'} drifting={status.mood==='drifting'}
      lookDown={lookDown} waking={waking}
      color="var(--accent)" pupil="var(--bg)"/>
{showThinking && <span className="think-dots"><i/><i/><i/></span>}
{glowEls}
```

> `spotlightKey` 是既有的"情绪到达"信号（每次情绪事件 +1，由 `triggerSpotlight()` 触发）。这里用它的上升沿作为"情绪事件到达"的判定点。

### 3c. mock 发出情绪的时机（仅原型用，接真后端时删）

**这是原型里模拟后端的部分，不是前端机制。** 前端永远"一收到就渲染"；这里只改"mock 何时发出情绪事件"。

- 旧：`send()` 里思考阶段 `setTimeout(()=>{ setCurrentMood(picked); triggerSpotlight(); }, 1100)` —— 1.1s 硬塞，导致思考阶段几乎看不到「思考中」。
- 新：删掉那个 setTimeout；改在**开始吐回复正文那一刻**才落定情绪：

```js
// 工具完成、开始回复时：
setRecentTools(p=>p.map((t,i)=>i===0?{...t,status:'done',duration:'418ms'}:t));
// 开始回复 → LLM 情绪落定，立即切到对应情绪（触发节拍 + 光晕 + 最小播放锁）
setHbState('正在回复…');
setCurrentMood(picked); triggerSpotlight();
```

**理由**：真实 LLM 的情绪标记是跟回复内容一起返回的，思考/工具阶段还没产生情绪。所以"回复开始才发出"更贴近真实后端。这样「思考中」完整覆盖思考+工具阶段；回复阶段情绪已落定、无任何跳动。

> 接真后端时：把"何时发出情绪事件"交给后端（情绪标记到达即调用 `setCurrentMood + triggerSpotlight`），3c 这段 mock 删除即可。前端的最小播放锁（3b）会自动处理"情绪在工具调用途中提前到达"的边界情况——立即切情绪、锁 1.5s、锁过期后若仍在工具态则退回思考中。

---

## 验证要点

1. 聊天页发送消息 → 思考/工具阶段：`.eyes-z` 应带 `thinking` 类，右侧出现 `.think-dots`，瞳孔上抬（cy≈20.6），**无**旧的纵向跳动。
2. 回复开始：立即切到随机 LLM 情绪，无跳动。
3. 困惑表情：右眼眯、左右瞳孔不等大、不再整体偏向一侧，`?` 仍在。
4. 检查无残留 `.eyes-z.busy` / `pupil-busy`（`.z-mark.busy` 是另一个署名 Z 标记，无关，保留）。

### 排雷提示
- 截图工具无法栅格化 `oklch()` 的 SVG 填充，眼睛在截图里可能显示空白——属正常，用 DOM 读 class/几何判断，别只看截图。
- 隐藏 iframe 里 `setInterval` 可能被节流，导致流式停在思考阶段——是测试环境现象，不是 bug。
