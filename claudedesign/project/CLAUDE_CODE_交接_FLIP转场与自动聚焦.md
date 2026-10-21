# Zoufx AI · 交接提示词 —— 起始页→聊天页 FLIP 转场 + 回复结束自动聚焦

> 适用文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX）
> 旧版本备份：`Zoufx AI v1~v6.html`，**不要动**。
> 本轮 2 块改动：① 回复结束自动 refocus 输入框 ② 起始页→聊天页 FLIP 连续转场（眼睛 + 输入框位置连续性）。
> 平移到正式项目时只动表现层 / 交互层，**不改后端契约、不改 mood / hbState 数据流**。

---

## ① 回复流式结束 → 自动聚焦输入框

**问题**：每轮 LLM 回复输出完后，焦点丢失，用户得手动点一下输入框才能继续打字。

**设计意图**：回复真正结束的那一刻，自动把焦点还给输入框，连续对话不断手。**只在真实回复完成时触发**——错误模拟、思考中途切回 idle 都不触发。

**机制**：一个自增信号 `focusKey`（上升沿驱动），沿 `App → Chat → InputBox` 透传；InputBox 监听上升沿调用 `ref.current.focus()`。

### App 层
```js
// 与 hbState 相邻
const [focusKey,setFocusKey]=useState(0);

// 回复流式输出结束处（i>=reply.length 那一支）：
if(i>=reply.length){
  setHbState('等待输入');
  setFocusKey(k=>k+1);   // ← 新增：回复结束 → 自增，驱动 refocus
  return;
}
```
> 注意：错误模拟里 `setHbState('等待输入')` 那条路径**没有**自增 focusKey，所以出错回到 idle 不会抢焦点。

App render 把信号传给 Chat：
```jsx
<Chat ... focusSignal={focusKey}/>
```

### Chat → InputBox 透传
```js
function Chat({..., focusSignal=0, ...}){
  ...
  <InputBox placeholder="继续提问…" ... focusSignal={focusSignal}/>
}
```

### InputBox 监听上升沿聚焦
```js
function InputBox({placeholder,onSend,big,onTyping,focusSignal=0}){
  ...
  const ref=useRef(null);
  useEffect(()=>{ if(big&&ref.current) ref.current.focus(); },[big]); // 既有：起始页大框挂载即聚焦
  // 新增：回复结束后自动 refocus（focusSignal 上升沿驱动）
  const prevFocusRef=useRef(focusSignal);
  useEffect(()=>{
    if(focusSignal>0 && focusSignal!==prevFocusRef.current && ref.current){
      ref.current.focus();
    }
    prevFocusRef.current=focusSignal;
  },[focusSignal]);
  ...
}
```

**正式项目对齐**：把"回复流（stream）结束"的回调里加一句 `bumpFocusKey()`（或直接 `inputRef.current?.focus()`），其余照搬。若真实输入框组件已持有 ref，可省掉 focusSignal 透传、回复结束时直接 focus。

**验收**：发消息 → 回复流式结束瞬间，输入框自动获得焦点（光标在内，可直接打字）；模拟出错回到 idle 不抢焦点。

---

## ② 起始页 → 聊天页 FLIP 连续转场（P4 / P7）

**问题**：发出第一条消息时是 `setIsHome(false)` 硬切 + 整页 `.page-enter` 上飘，眼睛会"先消失再出现"，没有连续感。

**设计意图**：
- 发出第一条消息后，眼睛从起始页**中央 80px** 连续"飞"到聊天页**顶部 60px**，看起来是**同一双眼睛在移动**（FLIP），无闪烁。
- 输入框从起始页**居中大框**滑到聊天页**底部**。
- 聊天页内容（消息 / 输入区）分层淡入；第一条用户气泡不在飞行途中突兀蹦出。
- 转场总时长 0.46s；`prefers-reduced-motion` 下退化为"原位出现 + 普通淡入"。
- 聊天页内继续发消息（chat→chat）**不重飞**，沿用既有 `.page-enter`。

### 核心思路：destination-FLIP（在目标元素上做 First-Last-Invert-Play）

不画飞行覆盖层、不复制眼睛节点。流程：
1. **发送瞬间**（DOM 仍是 Home）同步量取起始页眼睛 / 输入框的 `getBoundingClientRect()`（First）。
2. 切到 Chat，目标眼睛 / 输入框挂载（Last）。
3. 在目标元素的 **`useLayoutEffect`（paint 前）** 量取它的终点 rect，算出 inverse transform（translate + 可选 scale），**立即套上**（Invert）——于是首帧目标元素正好出现在起始页旧位置 / 旧尺寸，**没有"消失→出现"的空窗**。
4. `requestAnimationFrame` 后清掉 transform 并加 transition，补间回原位（Play）。`transitionend` 清理内联样式。

### 2a. FLIP 助手（模块作用域，眼睛 / 输入框共用）

```js
/* el 从 fromRect（旧位置/尺寸）"放回"，再补间回 0。
   scale=true：按宽度比缩放（眼睛 80→60）；scale=false：仅平移（输入框，避免圆角变形）。
   reduced-motion 下直接跳过，元素在终点原位出现。 */
function runFlip(el, fromRect, {scale=true, dur=0.46}={}){
  if(!el || !fromRect) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = el.getBoundingClientRect();
  if(!to.width || !to.height) return;
  const fcx=fromRect.left+fromRect.width/2, fcy=fromRect.top+fromRect.height/2;
  const tcx=to.left+to.width/2,             tcy=to.top+to.height/2;
  const dx=fcx-tcx, dy=fcy-tcy;
  const s = scale ? (fromRect.width/to.width) : 1;
  if(Math.abs(dx)<0.5 && Math.abs(dy)<0.5 && Math.abs(s-1)<0.01) return; // 无位移则不动
  el.style.transformOrigin='center center';
  el.style.transition='none';
  el.style.transform=`translate(${dx}px,${dy}px) scale(${s})`;
  void el.offsetWidth; // 强制回流，让初始 transform 立即生效
  requestAnimationFrame(()=>{
    el.style.transition=`transform ${dur}s cubic-bezier(.4,0,.2,1)`;
    el.style.transform='translate(0,0) scale(1)';
    const cleanup=()=>{
      el.style.transition=''; el.style.transform=''; el.style.transformOrigin=''; el.style.willChange='';
      el.removeEventListener('transitionend',cleanup);
    };
    el.addEventListener('transitionend',cleanup);
  });
}
```
> `useLayoutEffect` 需在 hooks 解构里加上：`const {useState,useEffect,useRef,useCallback,useLayoutEffect}=React;`

### 2b. App：发送时量取起始页 rect，存入 state 传给 Chat

```js
// 与 focusKey 相邻
const [flyEyesFrom,setFlyEyesFrom]=useState(null);
const [flyInputFrom,setFlyInputFrom]=useState(null);

// send() 内，setIsHome(false) 之前（此刻 DOM 仍是 Home，量取有效）：
let flyEyes=null, flyInput=null;
if(isHome){
  const eEl=document.querySelector('.home-page .eyes-z');
  const iEl=document.querySelector('.home-input-slot');
  if(eEl){const r=eEl.getBoundingClientRect(); flyEyes={left:r.left,top:r.top,width:r.width,height:r.height};}
  if(iEl){const r=iEl.getBoundingClientRect(); flyInput={left:r.left,top:r.top,width:r.width,height:r.height};}
}
setFlyEyesFrom(flyEyes);   // chat→chat 时为 null → 不重飞
setFlyInputFrom(flyInput);
setIsHome(false);
setPageKey(k=>k+1);
```
render：
```jsx
<Chat ... flyEyesFrom={flyEyesFrom} flyInputFrom={flyInputFrom}/>
```
> **关键**：只有 `isHome===true`（起始页发送）那次才量取并写入 rect；chat→chat 发送写入 `null`。因为 Chat 用 `key={chat-${pageKey}}`、每次发送都重挂载，靠 rect 是否为 null 区分"要不要飞"。

### 2c. Home：给眼睛 / 输入框打可量取的标记

- 眼睛：Home 根 `className="page-enter home-page"`（已有），眼睛 svg 自带 `.eyes-z` → 用 `.home-page .eyes-z` 选中。
- 输入框：把起始页输入框外层包裹加类名：
```jsx
<div className="home-input-slot" style={{marginBottom:16}}>
  <InputBox ... big={true} .../>
</div>
```

### 2d. PresenceFloat：眼睛 FLIP（挂载时）

```js
function PresenceFloat({..., flyFrom=null}){
  ...
  const eyesWrapRef=useRef(null);
  useLayoutEffect(()=>{
    if(flyFrom && eyesWrapRef.current) runFlip(eyesWrapRef.current, flyFrom, {scale:true});
  },[]); // 仅挂载时跑一次
  ...
  return(
    <div className="presence-float" ...>
      <div className="presence-eyes-wrap" ref={eyesWrapRef}>
        ...<Eyes size={60} .../>...
      </div>
      ...
    </div>
  );
}
```
> transform 套在 `.presence-eyes-wrap`（弹性容器，尺寸=眼睛）。光晕 / think-dots 是它的子节点，转场期间一起被带飞，0.46s 后归位——可接受。

### 2e. Chat：输入框 FLIP（仅平移）+ 内容淡入 + 接线

```js
function Chat({..., focusSignal=0, flyEyesFrom=null, flyInputFrom=null}){
  const listRef=useRef(null);
  const inputSlotRef=useRef(null);
  const flying = !!(flyEyesFrom || flyInputFrom);
  ...
  useLayoutEffect(()=>{
    if(flyInputFrom && inputSlotRef.current) runFlip(inputSlotRef.current, flyInputFrom, {scale:false});
  },[]);

  return(
    <div className={flying?'chat-flying':'page-enter'} style={{...}}>
      <PresenceFloat ... flyFrom={flyEyesFrom}/>
      <div ref={listRef} className="chat-scroll-area" style={{...overflow:'auto'...}}>
        ...messages...
      </div>
      <div className="chat-input-area" style={{...}}>
        <div ref={inputSlotRef} style={{maxWidth:720,margin:'0 auto'}}>
          <InputBox placeholder="继续提问…" ... focusSignal={focusSignal}/>
        </div>
      </div>
    </div>
  );
}
```
> **`flying` 时根容器不挂 `.page-enter`**：否则整页 `up` 动画会给祖先加 translateY，叠在眼睛 FLIP 上造成抖动。flying 时改为子内容分层淡入（见 CSS）。

### 2f. CSS（紧挨 `.page-enter`）

```css
.page-enter { animation: up .25s ease both; }

/* FLIP 转场：根不整体上飘，内容分层淡入；眼睛/输入框位移由 JS runFlip 接管 */
.chat-flying .chat-scroll-area{animation:chatContentIn .44s ease .16s both;}
.chat-flying .chat-input-area{animation:chatContentIn .40s ease .06s both;}
@keyframes chatContentIn{from{opacity:0;}to{opacity:1;}}
@media (prefers-reduced-motion: reduce){
  .chat-flying .chat-scroll-area,.chat-flying .chat-input-area{animation:none;}
}
```
> 消息区延迟 .16s 淡入 → 第一条用户气泡不在飞行途中突兀出现（≈"延后 ~280ms"的等效效果）。

---

## 验收清单

1. **起始页发消息**：眼睛从中央滑到顶部并缩小（80→60），看起来同一双眼睛移动，**无"先消失再出现"**；输入框从居中大框滑到底部。
2. 消息 / 输入区分层淡入，第一条用户气泡不在飞行途中蹦出。
3. **聊天页内继续发消息**：无 FLIP、无 transform，沿用 `.page-enter`（`flyEyesFrom`/`flyInputFrom` 为 null）。
4. 回复流式结束瞬间，输入框自动获得焦点；模拟出错回 idle 不抢焦点。
5. 开启系统"减弱动态效果"：`runFlip` 跳过，眼睛 / 输入框终点原位出现，内容不做淡入。
6. 无控制台报错。

### 实测记录（HTML 原型，供参考）
- home→chat：`.presence-eyes-wrap` 与输入框 slot 均在挂载首帧拿到 inverse transform，rAF 后补间回 `translate(0,0) scale(1)`，transition `transform .46s cubic-bezier(.4,0,.2,1)`。✓
- chat→chat：无 `.chat-flying`、走 `.page-enter`、眼睛无 transform。✓

---

## 正式项目对齐要点（React/TSX）

1. **量取时机**：必须在"还显示起始页"时同步量 rect（事件处理器里、切页 state 前）。若用路由切换且旧页已卸载，改为在卸载前用 ref 缓存 rect。
2. **destination 套 transform**：务必放在 `useLayoutEffect`（不是 `useEffect`），否则会先 paint 在终点、产生闪烁。
3. **scale vs translate-only**：眼睛用 scale（尺寸变化是表达的一部分）；输入框只平移（scale 会扭曲圆角与文字）。若正式项目起始/聊天输入框宽度差异大、需要尺寸过渡，建议改用宽度补间或 clip 而非 scale。
4. **重挂载判定**：原型靠 Chat `key` 每次发送重挂载 + rect 是否为 null 来决定是否飞。正式项目若 Chat 不重挂载，改为：用一个一次性 flag（如 `pendingFlyRef`）在首次进入聊天时消费、随即清空。
5. **reduced-motion**：`runFlip` 内已早退；CSS 淡入也在 media query 内关掉。两处都要对齐。
6. 时长 `0.46s` 与缓动 `cubic-bezier(.4,0,.2,1)` 是可调旋钮；内容淡入延迟（.16s / .06s）决定"第一条消息延后出现"的观感。
