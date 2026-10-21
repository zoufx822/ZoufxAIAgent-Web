---
title: 拟人化 AI Agent —— v0.2.2 前端交接（动态思考深度 effort）
tags:
  - AI
  - Agent
  - 前端交接
  - v0.2.2
aliases:
  - v0.2.2 前端提示词
  - effort 选择器前端
---

> [!note] 文档定位
> 本文档面向==前端实施（独立仓库 ZoufxAIAgent-Web）==，可直接作为提示词交给前端 AI。后端实施见 [[拟人化AI Agent-v0.2.2-开发方案]]。
>
> **一句话需求**：新增"思考深度"选择器。后端 `/ai/features` 现在会声明当前 AI 模型是否支持思考深度调节及可选档位；前端据此==差异化渲染==——支持就显示选择器，不支持就不显示。用户选的档位随聊天请求发给后端。

---

## 一、背景（为什么有这个功能）

思考模式（thinking）开启后，模型会先推理再回答。现在这个推理的"深度"可以逐请求调节了，**三档**：
- **标准（normal）**：模型默认推理量，最快最省（==默认选中==）
- **深入（high）**：推理更多
- **深度（max）**：推理最充分，回答质量更高但更慢、更费 token

但==不是所有 AI 模型都支持==这个调节（取决于后端当前激活的 LLM）。所以前端不能写死档位，必须从后端能力声明里动态获取。

---

## 二、后端契约（你要消费/对接的接口）

### 2.1 `GET /ai/features` —— 能力声明（已有接口，字段扩展）

启动时拉取（前端本就在做，缓存到 store）。**新增 `effort` 字段**：

**支持 effort 的模型（如 deepseek-v4）返回：**
```json
{
  "profile": "deepseek-v4",
  "effort": {
    "supported": true,
    "defaultValue": "normal",
    "options": [
      { "value": "normal", "label": "标准" },
      { "value": "high",   "label": "深入" },
      { "value": "max",    "label": "深度" }
    ]
  }
}
```

**不支持的模型（如 MiniMax-M3）返回：**
```json
{
  "profile": "MiniMax-M3",
  "effort": { "supported": false, "defaultValue": null, "options": [] }
}
```

字段语义：
| 字段 | 含义 |
|---|---|
| `effort.supported` | 是否显示思考深度选择器 |
| `effort.options[].value` | 传回后端的 API 值（**前端不要硬编码**，遍历渲染） |
| `effort.options[].label` | 选项显示文案（直接用，已是中文） |
| `effort.defaultValue` | 默认选中的档位 |

### 2.2 `POST /ai/chat` —— 聊天请求（已有接口，请求体结构调整）

> [!warning] 请求体结构变化：thinking 从布尔改为对象
> 原来 `thinking` 是布尔、`effort` 是平铺字段；现在==合并为一个 `thinking` 对象==：

```json
{
  "prompt": "用户输入",
  "userId": "xxx",
  "anchorId": "xxx",
  "prevAnchorId": null,
  "thinking": { "enabled": true, "effort": "normal" }
}
```
- `thinking.enabled`：是否开启思考模式（原来的布尔 thinking）
- `thinking.effort`：当前选中的深度档 `value`（`"normal"` / `"high"` / `"max"`）
- `effort` 可省略/传 null → 后端用默认档（normal）
- `normal` 是"标准/默认"档，后端按"不加深度"处理——前端照常当普通档位发送即可
- **`effort` 仅在 `enabled:true` 时有意义**；`enabled:false`（快档）时后端忽略 effort
- `thinking` 整体可省略 → 后端按"未开启思考"处理

SSE 响应事件类型==不变==：`anchor_created / thinking / content / tool_call / tool_result / mood / error`。effort 只影响 thinking 内容的多少，不引入新事件。

---

## 三、前端需要做的改动

### 3.1 Store：扩展 features 缓存

`/ai/features` 拉取后，把 `effort` 能力存进现有 features store。新增一个当前选中档位的状态（`selectedEffort`），初始化为 `effort.defaultValue`。

### 3.2 UI：思考深度选择器（差异化渲染）

渲染规则（==顺序很重要==）：

```
if (!features.effort.supported)        → 不渲染选择器（整块隐藏）
else if (!thinkingEnabled)             → 不渲染 / 置灰（思考关闭时深度无意义）
else                                   → 渲染选择器，遍历 effort.options 出选项
```

- 选择器形态建议：紧挨思考开关的 segmented control / 小型下拉，3 档（标准 / 深入 / 深度）
- 选项==必须遍历 `options` 动态生成==，禁止前端写死 "normal"/"high"/"max"——后端档位可能调整
- 默认选中 `defaultValue`（normal）
- 思考开关关闭时：选择器隐藏或禁用（二选一，建议隐藏，保持界面干净）

### 3.3 发送请求时带上 effort

发 `POST /ai/chat` 时构造 `thinking` 对象：`enabled` = 思考开关状态；`effort` = 当前选中档位（含默认 `normal`，仅模型支持时填，否则可省略）。例：

```js
thinking: {
  enabled: thinkingEnabled,
  effort: (thinkingEnabled && features.effort.supported) ? selectedEffort : undefined
}
```
`enabled:false` 时 effort 传不传都行（后端忽略）。

---

## 四、交互细节与边界

| 场景 | 期望行为 |
|---|---|
| 模型不支持 effort（features.effort.supported=false） | 完全看不到选择器，思考开关行为不变 |
| 思考开关关闭 | 选择器隐藏/禁用；不发 effort |
| 思考开关打开 | 选择器出现，默认选 defaultValue（标准/normal） |
| 切换档位后发消息 | 新档位随请求发出，本轮生效 |
| features 接口拉取失败 | 降级为"不支持 effort"（不显示选择器），不要阻塞聊天 |

> [!warning] 不要硬编码档位
> 档位列表、默认值、文案==全部来自 `/ai/features`==。今天是 high/max 两档，后端以后可能加档或改文案，前端遍历渲染才不会脱节。

---

## 五、验收清单

- [ ] 启动拉 `/ai/features`，正确解析 `effort` 能力存入 store
- [ ] deepseek profile：思考开启 → 显示"标准/深入/深度"三档选择器，默认选"标准"
- [ ] 切到不支持的 profile（features.effort.supported=false）→ 选择器消失
- [ ] 思考关闭 → 选择器隐藏/禁用
- [ ] 选"标准"发消息 → `thinking.effort: "normal"`；"深入" → `"high"`；"深度" → `"max"`
- [ ] 思考关闭发消息 → `thinking.enabled: false`，effort 不传或被忽略
- [ ] features 拉取失败 → 静默降级为无选择器，聊天仍可用
- [ ] 选项 label 直接取自接口（中文"标准/深入/深度"），无前端写死字符串

---

## 六、相关链接

- [[拟人化AI Agent-v0.2.2-开发方案]] —— 后端实施（接口契约出处）
- [[拟人化AI Agent-v0.145-开发方案-前端]] —— 前端既有架构 / features store 消费基线

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v0.2.2 | 2026-06-24 | 新增思考深度选择器：消费 `/ai/features` 的 ThinkEffort 差异化渲染。请求体 `thinking` 由布尔改为对象 `{enabled, effort}`（⚠️结构变更）。三档 normal/high/max（normal=默认/最省）。前端不硬编码档位，全部从能力声明动态渲染 |
