# CLAUDE_CODE 交接 · v0.2.4 consumeStream（失败/停止/断连/超时）

原型：`Zoufx AI.html`（备份 `Zoufx AI (v0.2.3备份).html`）。原型为 mock，本文列出工程侧需要真实实现的部分。搜索代码中 `v0.2.4` 注释可定位全部改动点。

## 核心语义变更
后端 v0.2.4 生成脱离连接（consumeStream）：关页/断网/刷新不掐断生成，服务端跑完落库。
**「流断了」不再等于失败——只有后端明确的 `error` 事件才是失败。**

## 需接真实后端的点（原型中为 mock）

### 1. turnId（`runStream` 开头）
- 真实：消费 SSE `turn` 事件（早于 `anchor_created`），存入 `turnRef.current.turnId`。
- mock 位置：runStream 内 120ms setTimeout。接后端时删除，改为 SSE 事件回调。
- 已实现的前端约束（保留）：`turnReady` state → turnId 未到停止按钮禁用；`pendingStop` 兜底（turnId 一到补发停止）。

### 2. 停止端点（`stopStream`）
- 真实：`POST /ai/chat/stop {turnId}` → `{stopped:boolean}`。
- mock 位置：stopStream 内 150ms setTimeout（`naturallyDone || armStopLateRef` 判定）。替换为真实 fetch。
- 语义（保留）：**先请求、依响应决定，不乐观删除**。
  - `stopped:true` → 掐流 + 移除本轮 user+assistant + prefill 回填 + 中性 toast「已停止，消息已放回输入框」，**不触发眼睛 error 摇头**；
  - `stopped:false` → 保留该轮不动；
  - 全程不重置 activeId；`stopReqRef` 去重在途请求。

### 3. watchdog（`runStream` 内 `feedWatchdog`/`onWatchdogTimeout`）
- 真实值：90_000ms 无数据触发；mock 演示用 3000ms（`forceTimeout` 时）。
- 触发后（逻辑保留）：abort 死连接 → 该轮 assistant 追加 `{type:'pending'}` part（「生成中」占位，渲染在 Msg 组件）→ `pollLoadMessages`。

### 4. 轮询（`pollLoadMessages`）
- 真实：GET loadMessages，2s 间隔、上限 90s（mock capMs=20s）；判定「已落库」= 该 turnId 的 user+assistant 出现在结果里。
- mock 位置：`mockServerRef`（readyAt 时刻视为落库）。替换为真实请求 + 按 turnId 对齐。
- 拿到 → `finishTurnWithFullReply`：**整体替换占位两条**（避免重复问题气泡），content part `streaming:false` → 揭示引擎走非流式路径整条显示；
- 窗口耗尽且 pending 已空 → 才按失败回填（error toast + 摇头）。

### 5. 打开对话的 pending 流程（`simulateOpenWithPending`）
- 真实：打开锚点时并发 `loadMessages` + `GET /ai/anchors/{id}/pending`（返回 `{turnId,prompt}` 或空）。
- pending 非空 → 历史后补 user 气泡 + `{type:'pending'}` 占位 → `pollLoadMessages`。
- mock 仅由 Tweaks 按钮触发；工程侧应挂在会话打开/切换处。

### 6. 同锚并发约束
- `pendingTurn` state 非空 → InputBox `sendBlocked`：发送按钮禁用、Enter 无效、placeholder 变「上一条还在生成中…」；`send()` 开头兜底拦截 + toast。
- 工程侧：pending 清空（轮询完成/失败回填/停止成功）后自动放行——原型已在这三处 `setPendingTurn(null)`。

## 状态判定总表（前端行为，须与此一致）
- 后端 error 事件 → 立即移除本轮 + 回填 + 报错 toast + 摇头（1.6s 函数式守卫复位）
- 用户点停止 → 调 stop 端点，stopped:true 才移除+回填（中性 toast、不摇头）；false 保留
- watchdog 超时 → 不回填：标「生成中」→ 轮询 → 拿到显示 / 窗口耗尽才回填
- 打开有在建轮的对话 → 问题+生成中 → 轮询 → 整体替换占位；期间禁发

## 不变项（v0.2.3，已保留验证）
- 失败/停止不重置 activeId；prefill 双层防陈旧（`prevPrefillKeyRef` 挂载初始化 + `send()` 开头清 prefill/toast）；
- 揭示引擎（块级淡入 bloom、rAF 追赶）未动；
- 旧 regenerate / 错误条重试按钮 / isLast 保持移除。

## Tweaks 演示开关（v0.2.4 · consumeStream 区）
- 「下一条超时」：watchdog 3s 触发 → 5s 后 mock 落库 → 轮询恢复
- 「停止时已完成」：stop 返回 stopped:false，本轮保留
- 「打开有在建轮的对话」：pending 场景一键演示
