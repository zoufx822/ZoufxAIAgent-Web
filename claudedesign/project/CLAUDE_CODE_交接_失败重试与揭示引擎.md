---
title: Zoufx AI 前端交接 —— 失败重试新交互（v0.2.3）+ 揭示引擎（替代逐字打字机）
date: 2026-07-06
file: Zoufx AI.html
---

# 交接：失败重试新交互（v0.2.3）+ 揭示引擎

本文档补两处此前未交接的改动：① 失败重试交互从「原地重试/regenerate」改为「回填输入框」（v0.2.3，对齐后端「只有完整对话才落库」）；② `StreamingContent` 的呈现方式已从逐字打字机改为块级淡入（bloom）揭示引擎。

**注意**：`CLAUDE_CODE_交接_命名统一与打磨清单.md` 第 8 节记录的「错误条 + 重试按钮 + onRegenerate」是**旧机制，已被本次改动取代**，请以本文档为准；`design_handoff_zoufx_ai/README.md` 第 151 行「逐字显示，每 9ms 一个字符」的描述也已过期。

---

## 一、失败重试新交互（v0.2.3）

### 背景

后端改为「只有完整对话才落库，失败一点不存」——失败轮在后端不留痕迹。前端因此不再需要「原地重试 / regenerate」那套：重发同一 prompt 天然就是一次干净的新轮，无需任何回滚或特殊标记。

### 移除的旧逻辑

- 错误条上的「重试」按钮，及其 in-place 重生（`regenerate(rid)` / `runStream` 的 `opts.replace` 原位替换）；
- 请求体里的 `regenerate` 标记；
- 「仅最后一条可重试」（`isLast`）门控；
- `Msg` 的 `onRegenerate` 入参、`.me-retry` 按钮样式（CSS 里只保留错误条的兜底展示样式，不再挂按钮）。

### 新交互：失败 → 把消息放回输入框

当后端返回失败（SSE error 事件 / 流中断 / 超时）时：

1. 把这一轮失败的「用户消息」气泡 + 「助手占位」从对话里移除（后端没存，刷新后本就不在，UI 保持一致）：
   ```js
   setChatMsgs(p=>({...p,[id]:(p[id]||[]).filter(m=>m.id!==rid&&m.id!==uid)}));
   ```
2. 把该用户消息原文回填到输入框，输入框获得焦点、光标置末尾：
   ```js
   setPrefill({text, key:Date.now()});
   ```
   `InputBox` 新增 `prefill` prop，`useEffect` 监听 `prefill.key` 上升沿（每次失败都变化）：`setVal(prefill.text)` → `requestAnimationFrame` 里 `autoGrow` + `focus()` + `setSelectionRange(len,len)`。
   **两层防陈旧回填**（重要，接真实项目时保留同样语义）：
   - `prevPrefillKeyRef` 初始化为**挂载时的 key**（而非 null）：只响应挂载后的变化。本项目里 Chat 用 `key={chat-${pageKey}}` 每次发送都重挂载，若 ref 初始为 null，重挂载会把残留的旧 prefill 重新灌回输入框；
   - `App.send()` 开头 `setPrefill(null); setToast(null);`：新一轮发送即清掉上次失败的残留状态。
3. 顶部轻提示：
   ```js
   setToast({text:'发送失败，消息已放回输入框，可修改后重发', key:Date.now()});
   ```
   `App` 渲染 `.top-toast`（fixed 顶部居中胶囊，`role="status" aria-live="polite"`），`useEffect` 依 `toast.key` 设 3.2s 后自动 `setToast(null)`。

失败分支的 `setHbState('出错了')` 会触发眼睛 error 摇头（`MOOD_MAP['出错了']` → `mood:'error'`）；1.6s 后的复位用**函数式守卫** `setHbState(h=>h==='出错了'?'等待输入':h)`——若用户已在 1.6s 内重发（hbState 已是「正在思考…」），不会被错误打回「等待输入」。

用户改或不改，直接点发送 = 一次全新的 `send()`（无任何特殊标记、无 `regenerate` 字段）。

### 关键：不重置 `currentAnchorId`（本项目对应 `activeId`）

失败分支只调用 `setChatMsgs / setHbState / setStreaming / setPrefill / setToast`，**从不**调用 `setActiveId`。原因：

- 若失败的是新会话第一条消息，后端已懒建锚（`anchor_created` 已收到并 claim）。保留 `activeId` 意味着重发会复用同一个锚、把它填满，不会产生重复空锚。
- 若用户就此不再发送：侧栏留一条空「新对话」，可接受（用户可见、可手动删），不需要特殊清理。
- **切勿**失败时把 `activeId` 重置为 `null`——否则重发会新建锚，把上一条弃成永久空壳。

### 不变的部分

- 用户「主动点停止」不算失败：保留已显示的部分内容，不回填输入框、不动 `activeId`（`stopStream()` 逻辑未改动）；
- 正常成功、复制（`MsgActions`）、思考块、工具卡、呼吸线等其它交互一律不动。

### 涉及的函数/状态一览

```
App:
  const [prefill,setPrefill]=useState(null); // {text,key}
  const [toast,setToast]=useState(null);     // {text,key}
  send(): 开头 setPrefill(null) + setToast(null)（防重挂载时旧回填）
  runStream(id, uid, rid, text, thinking, opts={})
    forceError 分支：filter 掉 uid/rid → setPrefill → setToast → return（不再原地生成 error part / 重试按钮）

InputBox:
  prefill prop → useEffect(监听 prefill.key 上升沿，ref 初始化为挂载时 key) → setVal + focus + 光标置末尾

Msg（assistant-with-parts 分支）:
  type:'error' part 仍渲染错误条兜底样式（正常流程不会出现，因为失败轮已被整体移除），
  但不再渲染「重试」按钮，也不再接收 onRegenerate。
```

---

## 二、揭示引擎（`StreamingContent`，替代逐字打字机）

### 问题

逐字打字机的核心假设是「揭示速度 = 生成速度」。但生产环境里 token 到达并不均匀（经常是短暂停顿后一次性大块吐出），逐字机制在这种「突发」场景下会显得忽快忽慢，频繁重排也容易卡顿，或者出现「打一点然后瞬间刷全」的闪屏。

### 现状实现

`StreamingContent` 组件（对齐生产 `stream-markdown.tsx` 链路）内部用 `smd` 直接操作容器 DOM（绕过 React reconcile），文本增量喂给 parser；渲染节奏改为 **rAF 追赶 + 逐块淡入 bloom**：

- 不再逐字符包裹揭示，只在**新的块级元素**（段落 / 列表项 / 标题）出现时触发一次淡入动画（`.sc-in` → `scIn .34s cubic-bezier(.22,1,.36,1)`）；
- 代码块跳过 bloom，交给 shiki 高亮渲染；
- `revealed` 游标每帧按剩余长度的比例追赶 `written`（`step = max(4, ceil(remaining*0.16))`，节流至 ~32ms 一次），实现「文字已经到了但按节奏揭示」的效果，而不是一次性刷全；
- 流结束（`streaming:false`）且 `revealed>=target` 时调用 `finish()`：触发 parser 收尾 + `applyShiki`；
- 标签页切到后台时 rAF 自然暂停，重新可见时 `visibilitychange` 监听会续跑，不强制刷全。

### Mock 数据侧的配合

`REPLIES` 的 mock 发送节奏也已改为「整段回复分几大块、短时间内到达」（模拟真实的 token 突发），渲染节奏完全交给揭示引擎处理，因此不管后端多快吐字都不会闪屏。

### 对接后端时的注意事项

- 后端真实 SSE 增量文本，直接喂给 `StreamingContent` 的 `text` prop 即可，不需要额外节流——节流已经在组件内部做了；
- 如果后端一次性吐出整段（非流式兜底），行为不需要特殊处理，揭示引擎会自己用同样的节奏追赶显示；
- 不要在外部再包一层逐字定时器——那正是本次要移除的旧模式。

---

## 三、需要同步更新的旧文档

- `CLAUDE_CODE_交接_命名统一与打磨清单.md` 第 8 节「消息 hover 操作 + 错误态」：其中「错误条 + 重试按钮 + onRegenerate + opts.replace」的描述已废弃，请标注「已被 v0.2.3 取代，见本文档」或直接删除对应段落；
- `打磨清单_TODO.md` 第 8 项「消息缺操作与错误态」：重试相关的验收标准需要按新交互重写（回填输入框 + 顶部提示，而非错误条重试按钮）；
- `design_handoff_zoufx_ai/README.md` 第 151 行「然后流式逐字显示（每 9ms 一个字符）」：已过期，应改为「块级淡入揭示，rAF 追赶节奏」的描述。
