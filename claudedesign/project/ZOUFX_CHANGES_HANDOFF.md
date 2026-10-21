# Zoufx AI · 本轮改动交接文档

> 适用文件：`Zoufx AI.html`（单文件 React + Babel 内联 JSX，约 2440 行）
> 旧版本备份：`Zoufx AI v1~v5.html`，不要动。

---

## 一、已完成的打磨项（P1–P4、P6）

### P1 · 署名条入场动画

**位置**：CSS `.home-sig` / `.home-sig-rule` / `.home-sig-name`

**改动说明**：
- 移除了旧的 `animation: up .5s ease .1s both`（整条上飘）
- `.home-sig-rule` 新增 `transform-origin: center` + `animation: sig-rule-expand .55s ease-out both`，实现 hairline 从中心向两侧展开（scaleX 0 → 1）
- `.home-sig-name` 新增 `animation: sig-name-in .45s ease .15s both`，从 `letter-spacing: .4em; opacity:0` 化入到 `letter-spacing: .18em; opacity:1`
- 纯一次性 CSS keyframes，仅 Home 挂载时播，mood/status 变化不重播

```css
@keyframes sig-rule-expand { from{transform:scaleX(0);} to{transform:scaleX(1);} }
@keyframes sig-name-in { from{opacity:0;letter-spacing:.4em;} to{opacity:1;letter-spacing:.18em;} }
```

---

### P2 · asleep 时 Eyes 半闭 + 浮动更慢

**位置**：
- JS：`ASLEEP_EXPR` 常量（在 `DEFAULT_EXPR` 附近）；`Eyes` 组件新增 `asleep` prop
- CSS：`.eyes-z.asleep` 规则块；`.home-nameplate[data-mood="asleep"] .home-eyes`

**改动说明**：

新增 `ASLEEP_EXPR` 对象（与 `MOOD_EXPR` 平级）：
```js
const ASLEEP_EXPR = {pr:2.0, pdy:2.4, esy:0.26, blink:8, liddy:0, lidty:0, lidSlant:0};
```
- `pr` 瞳孔半径缩小，`pdy` 瞳孔下沉，`esy` 眼睑高度压到 26%（细缝）

`Eyes` 组件签名新增 `asleep=false` 参数：
```js
function Eyes({size=64, busy=false, color, pupil, mood, context, asleep=false, drifting=false}){
  const base = asleep ? ASLEEP_EXPR : ((mood && MOOD_EXPR[mood]) || DEFAULT_EXPR);
  const e = asleep ? base : applyContext(base, context); // asleep 时不叠加 context
```

SVG wrapper className：
```js
className={`eyes-z${busy?' busy':''}${asleep?' asleep':''}${drifting?' drifting':''}`}
```

CSS 新增浮动覆盖和睫毛颤动：
```css
@keyframes home-float-asleep {
  0%,100%{transform:translateY(0);}
  50%{transform:translateY(-1.5px);}  /* 比正常 -3px 减半 */
}
.home-nameplate[data-mood="asleep"] .home-eyes {
  animation: home-float-asleep 8s ease-in-out infinite; /* 比正常 5.4s 更慢 */
}
.eyes-z.asleep .eye { animation: eye-flutter 12s ease-in-out infinite; }
.eyes-z.asleep .pupil { animation: none; } /* 睡着时不扫视 */
@keyframes eye-flutter {
  0%,80%,100%{transform:scaleY(1);}
  86%{transform:scaleY(.55);}  /* 睫毛抖动 */
  90%{transform:scaleY(1);}
}
```

**调用处**（Home + PresenceSticky 的 Eyes 均加上）：
```jsx
<Eyes ... asleep={status.mood==='asleep'} drifting={status.mood==='drifting'} .../>
```

---

### P3 · mood 切换时 Eyes 形态补间

**位置**：CSS `.eyes-z .pupil` / `.eyes-z ellipse`

**改动说明**：
- 把旧的 `transition: cx .4s ease, cy .4s ease, r .4s ease` 替换为：
```css
.eyes-z .pupil {
  transition: cx .28s cubic-bezier(.4,0,.2,1),
              cy .28s cubic-bezier(.4,0,.2,1),
              r  .28s cubic-bezier(.4,0,.2,1);
}
.eyes-z ellipse {
  transition: ry .28s cubic-bezier(.4,0,.2,1);
}
```
- 眨眼/扫视是 `transform` animation，不经过这些 transition，速度不变
- 注：眼睑 clip-path polygon 不支持 CSS 补间，如需完整过渡需将眼睑改为 transform 实现（待定）

---

### P4 · idle → 走神 → asleep 过渡档

**位置**：
- JS 常量区：`DRIFTING` 对象
- `STATUS_HAS_MOOD` / `STATUS_HAS_REPLY`：新增 `drifting` 键
- `resolveStatus(hbState, idleMs=0)`：新增 `idleMs` 参数
- `Home` / `PresenceSticky` / `Chat` 组件签名：新增 `idleMs=0` prop
- App render：传入 `idleMs={nowTick - lastInputAt}`
- Tweaks 面板：新增「模拟走神」按钮
- CSS：`[data-mood="drifting"]` token；`.eyes-z.drifting` 漂移动画

**改动说明**：

```js
// 常量（与 ASLEEP 相邻）
const DRIFTING = {mood:'drifting', zh:'走神中', en:'DRIFTING'};

// STATUS_HAS_MOOD / STATUS_HAS_REPLY 新增 drifting:false
const STATUS_HAS_MOOD  = {..., drifting:false};
const STATUS_HAS_REPLY = {..., drifting:false};

// resolveStatus 新增 idleMs 参数
function resolveStatus(hbState, idleMs=0){
  const h=new Date().getHours();
  const isNight = h>=23 || h<5;
  const isIdle = hbState==='等待输入';
  const base = MOOD_MAP[hbState] || MOOD_MAP['等待输入'];
  if(isIdle && isNight) return ASLEEP;
  if(isIdle && idleMs > 90000) return DRIFTING;  // 90s 阈值
  return base;
}
```

CSS token（与其他 `[data-mood]` 规则相邻）：
```css
[data-mood="drifting"]{ --mood-color:#94a3b8; }
[data-theme="dark"] [data-mood="drifting"]{ --mood-color:#94a3b8; }
.hb[data-mood="drifting"]{ --mood:#94a3b8; --mood-glow:#94a3b860; --mood-dur:4.2s; }
```

Eyes 漂移动画：
```css
.eyes-z.drifting .pupil { animation: pupil-drift 18s ease-in-out infinite; }
@keyframes pupil-drift {
  0%,20%,100%{ transform:translate(0,0); }
  28%,44%    { transform:translate(4.5px,-0.5px); }
  54%,66%    { transform:translate(0,0); }
  74%,90%    { transform:translate(-3.8px,0.5px); }
}
```

组件签名（三处均加 `idleMs=0`）：
```js
function Home({onSend, mood, context, intimacy, forceAsleep=false, moodStale=false, idleMs=0})
function PresenceSticky({mood, context, spotlight, hbState, forceAsleep=false, moodStale=false, idleMs=0})
function Chat({msgs,onSend,mood,context,spotlight,hbState,forceAsleep=false,moodStale=false,idleMs=0})
```

App render 传值（两处）：
```jsx
<Home ... idleMs={nowTick - lastInputAt}/>
<Chat ... idleMs={nowTick - lastInputAt}/>
```

nowTick 刷新间隔从 15s 改为 10s：
```js
const t = setInterval(()=>setNowTick(Date.now()), 10000);
```

Tweaks 新增按钮（在「模拟深夜」toggle 下方）：
```jsx
<div className="tp-row" style={{marginTop:4}}>
  <span className="tp-label">模拟走神（idle 90s+）</span>
  <button onClick={()=>setLastInputAt(Date.now()-100000)}>触发 →</button>
</div>
```

---

### P6 · 消息密集时的呼吸感

**位置**：Chat 组件内 `msgs.map` 渲染逻辑

**改动说明**：
把原来的 `{msgs.map((m,i)=><Msg key={m.id} m={m} i={i}/>)}` 替换为分组渲染：

```jsx
{(()=>{
  const items = [];
  let roundIdx = 0;
  msgs.forEach((m,i)=>{
    const prev = msgs[i-1];
    if(m.role==='user') roundIdx++;
    // 每 3 轮插呼吸线（从第 4 轮起）
    if(m.role==='user' && roundIdx>1 && (roundIdx-1)%3===0){
      items.push(
        <div key={`br-${m.id}`} className="breath-divider">
          <svg width="40" height="1">
            <line x1="0" y1="0.5" x2="40" y2="0.5"
                  stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4"/>
          </svg>
        </div>
      );
    }
    const sameAuthor = prev && prev.role===m.role;
    const sameMin    = prev && Math.floor(prev.id/60000)===Math.floor(m.id/60000);
    const crossAuthor= prev && prev.role!==m.role;
    // 间距规则：同分钟同作者 8px，跨作者 28px，其余 18px
    const mt = !prev ? 0 : crossAuthor ? 28 : sameMin ? 8 : 18;
    items.push(
      <div key={m.id} className="chat-msg-wrap" style={{marginTop:mt}}>
        <Msg m={m} i={i}/>
      </div>
    );
  });
  return items;
})()}
```

CSS（已在全局样式中加入）：
```css
.breath-divider {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chat-msg-wrap { /* margin-top 由 JS inline style 指定 */ }
```

> **注**：`m.id` 用 `Date.now()` 生成，可作为毫秒时间戳计算同分钟判断（`Math.floor(m.id/60000)`）。Msg 组件 props 接口不变。

---

## 二、尚未实现的打磨项

| 编号 | 名称 | 状态 |
|------|------|--------|
| P5 | 工具调用/思考过程呈现节奏（出现、脉冲、收扁、思考块自动折叠） | ✅ 已完成（见 `ZOUFX_NEXT_ROUND.md` P3） |
| P7 | 起始页 → 聊天页 FLIP 转场（眼睛位置连续性） | ✅ 已完成（见 `ZOUFX_NEXT_ROUND.md` P4） |

> 另：曾计划的「右栏近期工具调用列表滑入」已废弃 —— 右栏 v0.14 重构后无该列表。
> 截至 2026-06-05，所有规划中的打磨项已全部落地或废弃，无剩余待做项。

---

## 三、数据结构速查

```
状态 (status) ← resolveStatus(hbState, idleMs)
  idle → MOOD_MAP['等待输入']
  idleMs > 90000 && !isNight → DRIFTING {mood:'drifting', zh:'走神中', en:'DRIFTING'}
  isNight → ASLEEP {mood:'asleep', zh:'打盹中', en:'ASLEEP'}
  hbState = '正在思考…'|'调用工具…'|'正在回复…'|'发生错误' → 对应 MOOD_MAP 条目

情绪 (mood) ← 用户选 / 回复结束后随机 / INTIMACY_DEFAULT_MOOD[intimacy]
  6 核心值：平静 好奇 兴奋 困惑 难过 愤怒
  STATUS_HAS_MOOD[status.mood] === false 时不展示情绪（asleep/drifting/error）

[data-mood="xxx"] → --mood-color   # 驱动 dot、文字颜色（Home + PresenceSticky 共享）

Eyes 优先级：asleep prop > MOOD_EXPR[mood] > DEFAULT_EXPR
Eyes 形态参数：pr(瞳孔半径) pdy(y偏移) esy(眼睑scaleY) pdxR(右眼x偏移) blink(眨眼周期s)
```

---

## 四、给 Claude Code 的注意事项

1. **不要动 v1~v5 备份文件**，所有改动只在 `Zoufx AI.html`。
2. `Heartbeat` 组件内部有独立的 `resolveStatus` 逻辑副本（没有 idleMs 参数），不影响主流程，但如要统一可以让它也读 `idleMs`。
3. `Eyes` 的 `asleep` 和 `drifting` 是正交的布尔 prop，不是 `mood` 枚举的一部分——因为 mood 是情绪层，asleep/drifting 是状态层。
4. `m.id` 既是消息 key 也是时间戳（`Date.now()` 生成），P6 的同分钟判断依赖这个约定。
5. P7 FLIP 转场是最复杂的一项，建议单独开一轮，实现前先确认方案再动手。
