---
title: Zoufx AI 前端交接 —— P0 功能修复 + v0.2.2 思考深度（effort）
date: 2026-06-26
file: Zoufx AI.html
base: Zoufx AI (P0前备份).html
---

# 交接：P0 功能修复 + 思考深度选择器

本轮在 `Zoufx AI.html` 上落地两组改动：① 打磨清单里的 4 项 P0 功能硬伤；② v0.2.2「思考深度」选择器。修改前已备份为 `Zoufx AI (P0前备份).html`。

---

## 一、P0 功能修复（4 项）

### 1. 中文输入法回车误发送
- **问题**：拼音候选未上屏时按回车会误触发送。
- **改动**：`InputBox` 的 `onKeyDown` 增加 `!e.nativeEvent.isComposing` 守卫；流式生成中（`streaming`）回车不发送。
```js
onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault(); if(!streaming) send();} }}
```

### 2. textarea 不自动长高
- **问题**：多行输入不撑高，长文本只能在单行里滚动。
- **改动**：新增 `autoGrow(el)`，`onChange` 时按 `scrollHeight` 撑高，封顶 180px 后内部滚动；发送后复位 `height:auto`。`rows={1}` 起步。

### 3. 滚动锁定缺失（自动跟随抖动 / 想看历史被拽回底部）
- **问题**：每个流式 chunk 都 `smooth` 滚到底，既抖动又打断用户回看。
- **改动**：`Chat` 监听列表滚动，维护 `atBottom`（距底 <80px 视为贴底）。
  - 仅当贴底时才跟随，且用 `scrollTop=scrollHeight`（instant）写入，消除逐 chunk 抖动；
  - 用户上滑离底后停止自动跟随，输入区上方浮出**「回到底部」**圆钮，点按 `smooth` 归位并恢复跟随。

### 4. 没有「停止生成」
- **问题**：流式生成途中无法中断。
- **改动**：
  - 发送按钮在 `streaming` 时变为**停止键**（方块图标），点按调用 `onStop`；
  - App 层 `streamRef` 登记本轮所有 `timeout/interval` 与目标消息 `rid/chatId`；
  - `stopStream()` 清掉全部计时器，把进行中的 thinking/工具卡收尾为完成态，复位 `streaming` 并自动 refocus 输入框；
  - `send()` 开头 `if(streaming) return`，防止重复并发。

---

## 二、v0.2.2 思考深度（effort）选择器

> 需求：思考模式可逐请求调节推理深度，三档。是否支持取决于后端激活的 LLM，前端按 `GET /ai/features` 能力声明**差异化渲染**，档位**全部遍历 options 动态生成、不硬编码**。

### 2.1 能力声明（当前为 mock，接后端时替换）
本原型无后端，用 `FEATURES_BY_PROFILE` 模拟两种 profile 的 `/ai/features` 返回：
- `deepseek-v4` → `effort.supported:true`，三档 `options`；
- `MiniMax-M3` → `effort.supported:false`，`options:[]`。

**定稿文案（label，value 不变）**：
| value | label |
|---|---|
| normal | 标准（默认） |
| high | 深度 |
| max | 极致 |

> 接真实后端时：删除 `FEATURES_BY_PROFILE`，启动拉 `GET /ai/features` 写入 store，`effortCap` 取自接口。`EffortPicker` 与请求逻辑无需改动。

### 2.2 渲染规则（顺序敏感）
```
!effort.supported   → 整块不渲染（EffortPicker 直接 return null）
!thinkingEnabled    → 不渲染（选择器 gate 在思考开关 thinkSelected 上）
else                → 遍历 effort.options 渲染 segmented control
```
- `EffortPicker` 是无状态展示组件，选项 `options.map` 生成，label 直接取接口；
- 选中档位 `selectedEffort` 提升到 App，初始化为 `effortCap.defaultValue`，profile 切换时重置。

### 2.3 请求体（thinking 由布尔改为对象）
`POST /ai/chat` 在 `send(text, thinking)` 中构造：
```js
thinking: {
  enabled: thinkingEnabled,
  effort: (enabled && effortCap.supported && effort) ? effort : undefined  // 省略 = 后端用默认/忽略
}
```
- `enabled:false` 时不带 effort；
- 当前实现把构造结果 `console.log('[POST /ai/chat] …')` 便于核对，接后端时改为真正发请求。
- 额外：effort 影响 mock 思考文本长度（normal/high/max 递增），贴合「effort 只影响 thinking 内容多少」语义；接后端后由 SSE thinking 事件决定，删除该模拟。

### 2.4 演示入口
Tweaks 面板（宿主开启编辑模式触发）新增 **Thinking · 思考深度** 区块：
- 「模型 profile」下拉切换 deepseek-v4 / MiniMax-M3，现场演示选择器出现/消失；
- 下方实时显示当前档位或「当前模型隐藏选择器」。

---

## 三、验收对照（已自测通过，日志为证）

P0：
- [x] 中文输入法候选态回车不发送；流式中回车不发送
- [x] 多行输入自动长高，封顶后内部滚动
- [x] 贴底跟随无抖动；离底停止跟随并出现「回到底部」钮
- [x] 流式中可停止，工具卡/思考收尾正常，停止后自动聚焦

思考深度：
- [x] deepseek + 思考开 → 三档「标准/深度/极致」，默认选「标准」
- [x] MiniMax（supported=false）→ 选择器消失
- [x] 思考关 → 选择器隐藏
- [x] 标准/深度/极致 → `thinking.effort: normal/high/max`
- [x] 思考关 → `thinking.enabled:false`，effort 不传
- [x] 选项 label、默认值全部来自接口 options/defaultValue，无硬编码

---

## 四、接后端时的清理清单
1. 删 `FEATURES_BY_PROFILE`，改为拉 `GET /ai/features` 写 store；`effortCap` 取自 store。
2. `send()` 里的 `console.log` 改为真实 `POST /ai/chat`，SSE 事件类型不变（anchor_created / thinking / content / tool_call / tool_result / mood / error）。
3. 删除 effort→思考文本长度的 mock（`_thinkExtra`），thinking 内容改由 SSE 决定。
4. 移除 Tweaks 里的 profile 切换器（或保留为内部调试）。
