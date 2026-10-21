# 交接提示词 · 把「小Z」情绪过渡增强同步到正式项目

> 下面整段可直接贴给 Claude Code。改动已在 HTML 原型里验证通过，现需平移到真实 React/TSX 代码。
> **只动表现层**：`components/eyes.tsx`、`components/presence-float.tsx`、`app/globals.css`。
> 不改后端契约、不改 `onMood` / `setMood` 数据流、不改 `MOOD_EXPR` 几何参数语义。

---

## 背景

小Z 用一对 SVG 眼睛（`eyes.tsx`）表达 6 词固定情绪谱：平静 / 好奇 / 兴奋 / 困惑 / 难过 / 愤怒。
后端机制是「先读脸、后听话」，一轮对话有两个情绪事件来源：

1. **瞬时情绪（instant mood）**：用户消息发出后约 1.1s 推来第一个 mood，**早于 AI 正文**。
2. **行内情绪转折（inline mood）**：AI 正文里情绪起伏时再推，一轮可能多次。

前端 `onMood → setMood(keyword)` 更新 store 的 `currentMood` + `lastMoodAt`，`PresenceFloat` 据此渲染。

现状（保持不动，只增强过渡）：
- `eyes.tsx`：几何驱动 SVG 眼睛，每个情绪是一组参数（pr / pdy / esy / blink / liddy / lidty / lidSlant / pdx + 问号 / sparkle），切换靠 CSS transition。
- `presence-float.tsx`：包裹眼睛 + 状态标签 + 情绪词；mood 变化时 `glowKey++` 重挂载 `.mood-glow` 重播绽放；容器带 `data-emotion={currentMood}`。
- `globals.css`：`.eyes-z .pupil` / `.eyes-z ellipse` 已有过渡；`.eyes-z.busy` 用 `eye-busy` 节律且 `.eyes-z.busy .pupil{animation:none}`；`[data-emotion='X']` 6 情绪色 token（亮/暗各一套）；`@keyframes mood-glow-bloom`、`@keyframes moodIn` 已存在。

## 硬约束

- 6 词情绪谱固定，不增删；`MOOD_EXPR` 几何参数语义不动，**只调过渡 / 动画**。
- 沿用现有 CSS 变量体系（`--emotion-color` / `--mood-color` / `--mood-glow`），**亮暗两套都要覆盖**。
- 遵守 `prefers-reduced-motion: reduce`：reduce 时关掉所有律动 / 绽放 / 节拍，**只保留颜色**。
- 视觉气质：温和、克制、灵动而不表演（小Z 不卖萌、不堆装饰）。

---

## 改动一 · busy 态也透出情绪表情（`globals.css` + `eyes.tsx`）

**问题**：情绪 1.1s 就到、此时还在 thinking/writing（busy），但 busy 用 `eye-busy` 挤压 + `.pupil{animation:none}` 把表情几何压平了。

**目标**：busy 保留当前情绪的「表情底色」（瞳孔大小、眼睑形状、星芒 / 斜眉 / 问号——这些都是 SVG 属性，本就由 `MOOD_EXPR` 驱动，不要动），busy **只叠加**「忙碌律动」：瞳孔轻微游移 + 略频繁眨眼，而不是抹平。

`globals.css` —— 把原 busy 规则替换为：

```css
/* busy 只叠加忙碌律动，绝不抹平情绪几何 */
.eyes-z.busy .eye{animation:eye-blink 3.4s ease-in-out infinite;}   /* 略快于常态 6s */
.eyes-z.busy .eye.eye-r{animation-delay:.05s;}
.eyes-z.busy .pupil{animation:pupil-busy 2.4s ease-in-out infinite;}  /* 取代原来的 animation:none */
@keyframes pupil-busy{
  0%,100%{transform:translate(0,0);}
  22%{transform:translate(1.1px,-0.5px);}
  50%{transform:translate(-0.9px,0.6px);}
  74%{transform:translate(0.7px,0.4px);}
}
```

> 注意：`pupil-busy` 用 `transform:translate` 做游移，不碰 `cx/cy/r`，因此情绪切换时 `cx/cy/r` 的 transition 照常工作——表情几何与忙碌游移互不干扰，可同时存在。`.eyes-z .pupil` 需有 `transform-box:fill-box;transform-origin:center;`（原型已具备）。

`eyes.tsx` —— 确认 busy 态依旧把 `MOOD_EXPR[currentMood]` 的几何写进 SVG 属性（不要因为 busy 就退回中性几何）。busy 只控制 `.busy` class，不控制几何取值。

---

## 改动二 · 情绪色平滑过渡（`globals.css`）

**问题**：`--emotion-color` 随 `data-emotion` 硬切。

**目标**：给所有用到 `--emotion-color` 的元素（光晕、情绪标签、可能的眼睛描边）约 0.4s 颜色「融」变。

把 `--emotion-color` 注册成可动画的 `<color>` 自定义属性，再在持有 `data-emotion` 的容器上过渡变量本身（后代随继承值逐帧融变）：

```css
@property --emotion-color{ syntax:'<color>'; inherits:true; initial-value:#94a3b8; }

/* 在 data-emotion 容器上过渡变量本身；保留各自已有的 bg/text 过渡，别覆盖主题切换淡入 */
.presence-float,.home-nameplate,.hb{
  transition:--emotion-color .4s ease, background-color .3s ease, color .22s ease;
}
/* 直接用 color:var(--emotion-color) 的情绪标签：补 0.4s 颜色过渡 */
.presence-mood,.home-status-mood,.status-mood,.hb-mood-label{
  transition:color .4s ease, opacity .35s ease !important;
}
```

> 选择器名按正式项目实际类名对齐；要点是：**凡是消费 `--emotion-color` 的元素都要有 ~0.4s 颜色过渡**。`--mood-color` / `--mood-glow` 若也随情绪切换，同样补 `@property` + 过渡，亮暗两套 token 都覆盖。
> `@property` 在目标浏览器若需兜底，降级行为是「硬切」，与改前一致，安全。

---

## 改动三 · 多情绪连发的过渡韧性（`globals.css` + `presence-float.tsx`）

**问题**：一轮内情绪可能几百毫秒连发 2~3 次（瞬时 + 行内转折）。现状几何 0.28s 过渡被下次打断会跳动；`glowKey` 重挂载单束光晕会突兀闪烁。

### 3a 几何过渡换成可中断接续的 ease-out 收尾曲线

```css
.eyes-z .pupil{
  transform-box:fill-box; transform-origin:center;
  transition:cx .36s cubic-bezier(.22,1,.36,1),
             cy .36s cubic-bezier(.22,1,.36,1),
             r  .36s cubic-bezier(.22,1,.36,1);
}
.eyes-z ellipse{ transition:ry .36s cubic-bezier(.22,1,.36,1); }
```

> `cubic-bezier(.22,1,.36,1)` 是 ease-out：被下次 mood 打断时立即朝新目标走、再缓缓落定，连发不跳动（比原 `cubic-bezier(.4,0,.2,1)` 更耐中断）。

### 3b 光晕「池化」：每束冻结自身颜色、单次绽放、播完即卸，多束叠加接管

`globals.css` —— `.mood-glow` 改为单次播放、用每束自己冻结的 `--glow-c`：

```css
.mood-glow{
  position:absolute; width:380px; height:200px; left:50%; top:50%;
  border-radius:50%;
  background:radial-gradient(ellipse at center,
    var(--glow-c, var(--emotion-color,#94a3b8)) 0%,
    color-mix(in oklch, var(--glow-c, var(--emotion-color,#94a3b8)), transparent 55%) 32%,
    transparent 70%);
  filter:blur(16px); pointer-events:none; opacity:0; z-index:-1;
  animation:mood-glow-bloom 2.2s cubic-bezier(.22,1,.36,1) 1 forwards;  /* 单次，非 5 次 */
}
@keyframes mood-glow-bloom{
  0%  {opacity:0;   transform:translate(-50%,-50%) scale(.6);}
  26% {opacity:.6;  transform:translate(-50%,-50%) scale(.95);}
  55% {opacity:.42; transform:translate(-50%,-50%) scale(1.06);}
  100%{opacity:0;   transform:translate(-50%,-50%) scale(1.28);}
}
```

`presence-float.tsx` —— 把原来「单个 `glowKey` 重挂载单束」改成**维护一个光晕数组**：每次情绪事件 push 一束（冻结当时情绪色），`onAnimationEnd` 自移除；数组上限 3，超出截尾。这样上一束没散完时新束叠加接管，不闪烁。

参考实现（一个共用 hook，`PresenceFloat` 与首页眼睛都用它）：

```tsx
// 情绪色查表（与 CSS 的 [data-emotion] token 对齐，亮暗各一套），供光晕冻结颜色
const EMOTION_HEX = {
  light:{平静:'#94a3b8',好奇:'#06b6d4',兴奋:'#f59e0b',困惑:'#a855f7',难过:'#5b80c0',愤怒:'#ef4444'},
  dark: {平静:'#94a3b8',好奇:'#22d3ee',兴奋:'#fbbf24',困惑:'#c084fc',难过:'#7d9fde',愤怒:'#f87171'},
};
function emotionHex(mood: string){
  const t = document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light';
  return (EMOTION_HEX[t] ?? EMOTION_HEX.light)[mood] ?? '#94a3b8';
}

let _glowCounter = 0;
/** mood 变化 → 光晕池叠加 + 首反应节拍。spotlightKey 用于同一事件可能 mood/标志双触发的场景；
 *  正式项目若只有 mood 一个信号源，去掉 spotlightKey 分支、只留 mood effect 即可。 */
function useMoodPresence(mood: string, spotlightKey = 0){
  const [glows, setGlows] = useState<{id:number; c:string}[]>([]);
  const [beatKey, setBeatKey] = useState(0);
  const lastFire = useRef(0);
  const prevMood = useRef(mood);
  const prevSpot = useRef(spotlightKey);

  const fire = useCallback((m: string)=>{
    const now = performance.now();
    const gap = now - lastFire.current;
    if(gap < 40) return;                       // 同一事件双触发去重
    lastFire.current = now;
    const id = ++_glowCounter;
    setGlows(g => [...g.slice(-2), {id, c: emotionHex(m)}]);   // 池上限 3
    if(gap > 600) setBeatKey(k => k + 1);      // 仅“第一反应”起节拍（见改动四）
  },[]);

  useEffect(()=>{
    if(prevMood.current !== null && mood !== prevMood.current) fire(mood);
    prevMood.current = mood;
  },[mood]);                                   // 行内连发也会逐次触发
  useEffect(()=>{
    if(spotlightKey>0 && spotlightKey!==prevSpot.current) fire(mood);
    prevSpot.current = spotlightKey;
  },[spotlightKey]);

  const glowEls = glows.map(g=>(
    <div className="mood-glow" key={g.id} style={{['--glow-c' as any]: g.c}}
         onAnimationEnd={()=> setGlows(gg => gg.filter(x => x.id !== g.id))}/>
  ));
  return { glowEls, beatKey };
}
```

在 `PresenceFloat`（及首页眼睛容器）里：`const {glowEls, beatKey} = useMoodPresence(currentMood)`，把原 `glowKey` 那束 `.mood-glow` 替换为 `{glowEls}`，并把 `beatKey` 透传给 `<Eyes beatKey={beatKey} … />`。

---

## 改动四 · 「第一反应」专属视觉节拍（`globals.css` + `eyes.tsx`）

**目标**：一轮里第一个情绪落地是「读脸」高光时刻。做一个克制的微动作——**快速眨一下 → 瞳孔先收缩再放大到目标值**，配合光晕绽放，让用户感到「它读到我了」。克制，不卡通、不弹跳过头。

仅对一轮的**首个**情绪触发（连发的行内转折不重复节拍）：上面 hook 里 `gap > 600ms` 才 `beatKey++` 即此判定。

`globals.css`：

```css
/* 0.74s 一次性接管 busy/mood 的瞳孔律动，结束自动还原 */
.eyes-z.first-react .eye{animation:first-react-blink .74s ease both !important;}
.eyes-z.first-react .eye.eye-r{animation:first-react-blink .74s ease .03s both !important;}
.eyes-z.first-react .pupil{animation:first-react-pupil .74s cubic-bezier(.22,1,.36,1) both !important;}
@keyframes first-react-blink{
  0%{transform:scaleY(1);} 12%{transform:scaleY(.07);} 27%{transform:scaleY(1);} 100%{transform:scaleY(1);}
}
@keyframes first-react-pupil{
  0%{transform:scale(1);} 20%{transform:scale(.58);} 56%{transform:scale(1.1);} 100%{transform:scale(1);}
}
```

`eyes.tsx` —— 接收 `beatKey`，变化时加 `.first-react` class 播一次，760ms 后移除：

```tsx
const [beating, setBeating] = useState(false);
const timer = useRef<number>();
const prevBeat = useRef(beatKey);
useEffect(()=>{
  if(beatKey>0 && beatKey!==prevBeat.current){
    setBeating(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(()=> setBeating(false), 760);
  }
  prevBeat.current = beatKey;
  return ()=> clearTimeout(timer.current);
},[beatKey]);
// className 拼接里加： `${beating ? ' first-react' : ''}`
```

---

## 改动五 · 常驻呼吸光晕（`globals.css` + `presence-float.tsx`）

单一情绪保持期，眼睛底层垫一层**很淡、缓慢明灭**的常驻光晕，给「反复绽放」的余韵（burst 绽放叠在其上）。用实时 `var(--emotion-color)`，换情绪时颜色随 `@property` 融变。

```css
.mood-ambient{
  position:absolute; width:340px; height:180px; left:50%; top:50%;
  border-radius:50%; transform:translate(-50%,-50%);
  background:radial-gradient(ellipse at center,
    var(--emotion-color,#94a3b8) 0%,
    color-mix(in oklch, var(--emotion-color,#94a3b8), transparent 48%) 36%,
    transparent 70%);
  filter:blur(18px); pointer-events:none; z-index:-2; opacity:0;
  transition:opacity .6s ease;        /* 情绪消失时淡出 */
}
.mood-ambient.on{animation:mood-ambient-breath 4.4s ease-in-out infinite;}
@keyframes mood-ambient-breath{
  0%,100%{opacity:.20; transform:translate(-50%,-50%) scale(.95);}
  50%    {opacity:.36; transform:translate(-50%,-50%) scale(1.05);}
}
/* 首页眼睛更大，光晕同步放大 */
.home-eyes .mood-ambient{width:440px; height:225px;}
```

`presence-float.tsx`（及首页）—— 在眼睛容器内、`<Eyes>` 之前插一层；`on` 跟随「当前状态是否展示情绪」（即 `STATUS_HAS_MOOD[status] && currentMood`）：

```tsx
<div className={`mood-ambient${moodVisible ? ' on' : ''}`} />
```

---

## 改动六 · prefers-reduced-motion（`globals.css`）

reduce 时关掉所有律动 / 绽放 / 节拍，**只留颜色**；常驻光晕降为静态淡色：

```css
@media (prefers-reduced-motion: reduce){
  .eyes-z .eye,.eyes-z .eye.eye-r,.eyes-z .pupil,
  .eyes-z.busy .eye,.eyes-z.busy .pupil,
  .eyes-z.first-react .eye,.eyes-z.first-react .eye.eye-r,.eyes-z.first-react .pupil,
  .eyes-z.drifting .pupil,.eyes-z.asleep .eye,
  .z-sparkle,.z-question,
  .mood-ambient.on{
    animation:none !important;
  }
  .mood-glow{animation:none !important; opacity:0 !important;}
  .mood-ambient.on{opacity:.24 !important;}   /* 只留静态淡色 */
}
```

> 把选择器对齐正式项目实际类名；原则是：所有新增 / 修改的 `@keyframes` 都要在此被 `animation:none` 覆盖，唯独保留 `--emotion-color` 颜色与 `.mood-ambient` 的静态色。

---

## 验收清单

1. 发送消息后 ~1.1s（仍在 thinking/writing）：眼睛 `.eyes-z` 同时带 `busy`，且容器 `data-emotion` 非空——**话没写完脸已带表情**；瞳孔在做 `pupil-busy` 游移而非静止。
2. 连续切换情绪：瞳孔几何平滑接续不跳动；光晕多束叠加接管、无闪烁；每束播完自动从 DOM 移除（检查 `.mood-glow` 节点数不会无限增长，上限 3）。
3. 一轮首个情绪：眼睛短暂出现 `.first-react`（快速眨 + 瞳孔收放），行内后续转折不再触发节拍。
4. 换情绪时 `--emotion-color` 是「融」过去（光晕 / 标签颜色逐帧过渡），非硬跳；亮、暗主题都成立。
5. 情绪保持期底层有缓慢呼吸的常驻光晕，颜色随情绪融变；情绪消失（idle/error/asleep/drifting）时 0.6s 淡出。
6. 开启系统「减弱动态效果」后：无任何律动 / 绽放 / 节拍，仅保留情绪颜色 + 静态淡光晕。
7. 无 TS / 控制台报错；`onMood`/`setMood`/`MOOD_EXPR` 未被改动。
```
