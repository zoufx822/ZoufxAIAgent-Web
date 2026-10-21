# Changelog — Zoufx AI 设计稿同步

记录前端落地变动同步到设计稿的修订。仅作记录，不含未实现的优化方案。

---

## 2026-05-20 — 工具中文化 / 用户印象 / 当前状态

### 同步范围
前端已落地 5 处改动；本次只把这些变更同步到 `Zoufx AI.html` 与设计文档中，标题与文案、数据契约均以前端为准。

### 整体布局（未变）
```
┌──────┬─────────────────────────────────┬──────────────┐
│      │  顶部 heartbeat 条（48px）         │              │
│ 56px ├─────────────────────────────────┤  280px        │
│ rail │  消息流（含工具调用卡片）            │  状态栏        │
│      │                                  │  (aside)      │
│      │  输入框                           │               │
└──────┴─────────────────────────────────┴──────────────┘
```

### 1. 工具调用统一改用中文名
工具方法名 → 中文名映射（写入前端 fallback 表 `TOOL_DISPLAY`）：

| 方法名 (tool)         | 显示名 (toolDisplay) |
|-----------------------|----------------------|
| `search_web`          | 网络检索              |
| `search_cold_memory`  | 记忆检索              |
| `update_hot_memory`   | 用户印象更新           |

**数据契约**：SSE 事件 payload 新增 `toolDisplay` 字段；前端优先使用之，缺失时回退到 `TOOL_DISPLAY[tool]`，再缺失则原样展示 `tool` 方法名。

**落地位置**
- 右侧栏「近期工具调用」列表条目
- 消息流里的工具调用卡片 header（结构未变，仅 name 渲染源切换）

### 2. 右侧栏 Section 重命名：「对话目标」→「用户印象」
- **数据**：从只渲染 `display_name` 单字段，改为渲染 hot memory 全部 6 个白名单字段，顺序固定：

  | key            | label |
  |----------------|-------|
  | display_name   | 称呼   |
  | language       | 语言   |
  | timezone       | 时区   |
  | role           | 职业   |
  | interests      | 兴趣   |
  | tone           | 风格   |

- **排版**：单 Card 多行；每行 `display:flex; align-items:baseline;`，左侧 44px 固定宽度中文 label（`--t3`，11.5px），右侧 value（`--t1`，12.5px），行 `gap:4px`
- **空态**：6 字段全为空时，Card 内显示「尚未识别」

### 3. 右侧栏 Section 重命名：「当前任务」→「当前状态」
- **标题固定**：始终为「当前状态」，**不再随 status 切换**
- **内容排版**：与左上角 heartbeat 顶部条对齐
  - 中文状态（13.5px / `--t1` / 500）
  - EN mono uppercase（10px / `--t3` / `letter-spacing:.18em`）
  - `·` 分隔符（仅当 mood 可见时）
  - 斜体 mood（11.5px / `--t2`）— stale 时降为浅灰
  - **注**：色点（●）仅顶部条有，卡片内**无**
- **活动态 reply**：thinking / tooling / writing 末尾追加用户最后一条消息（60 字截断，**无前缀冒号**），换行单独一行 12px `--t2`

### 4. 消息流工具调用卡片
UI 结构未改；header 显示的工具名从英文方法名换成中文显示名（数据源 = `toolDisplay || TOOL_DISPLAY[tool] || tool`）。

### 5. 已删除的旧元素
- 「当前任务」section 的旧 Empty 文案「小Z 处于空闲状态。」— 标题已表达，不再需要
- 卡片内 `lbl="task"` 标签 — 活动态在新版「当前状态」里直接拼接在状态行末尾，不再用 label

---

## 状态机契约（6 态 · 与「当前状态」section 渲染规则配套）

| status     | 中文     | EN       | 显示 mood | 显示 reply |
|------------|---------|----------|----------|-----------|
| `idle`     | 等待交互 | IDLE     | ✓        | ✗         |
| `thinking` | 思考中   | THINKING | ✓        | ✓         |
| `tooling`  | 使用工具 | TOOLING  | ✓        | ✓         |
| `writing`  | 回复中   | WRITING  | ✓        | ✓         |
| `error`    | 出错了   | ERROR    | ✗        | ✗         |
| `asleep`   | 打盹中   | ASLEEP   | ✗        | ✗         |

**mood 时效规则**（未变）：
- ≥15 min：隐藏
- 5–15 min：stale 灰
- < 5 min：正常显示

**reply 规则**：仅活动态（thinking / tooling / writing）展示；为用户最后一条消息截断 60 字后追加；无前缀冒号。

### 24 种组合表达速查

| status × mood × reply | 渲染结果 |
|-----------------------|---------|
| idle + mood + —       | `等待交互 IDLE · 共情` |
| idle + no mood + —    | `等待交互 IDLE` |
| thinking + mood + reply | `思考中 THINKING · 好奇` + 换行 `用户最后一条消息…` |
| thinking + no mood + reply | `思考中 THINKING` + 换行 `用户最后一条消息…` |
| thinking + mood + no reply | `思考中 THINKING · 好奇`（无下行；用户暂无消息） |
| tooling 同 thinking 结构 | — |
| writing 同 thinking 结构 | — |
| error + — + —         | `出错了 ERROR`（mood / reply 均不展示） |
| asleep + — + —        | `打盹中 ASLEEP`（mood / reply 均不展示） |

---

## 已用 design token（未新增）
- 背景层：`--bg / --surface / --sidebar`
- 1px 描边：`--border`
- 文字三级灰度：`--t1 / --t2 / --t3`
- 顶部条状态色：`--mood`（保持原映射）
- mono 字体 class（JetBrains Mono）
- 圆角 8px / 卡片 padding 11×12 / Section 间距 22px

---

## 已与现行设计稿冲突 / 留待下轮 review
（仅标记，未在本次同步中调整）

1. **Tweaks 面板「当前用户」字段** 仍读取 legacy `userName` 状态，未切换到 `hotMemory.display_name`。功能性 dev tool，不在本轮同步范围。
2. **`MOOD_MAP` 键名** 仍以中文 hbState（`'等待输入' / '正在思考…'` 等）作为 key 索引，前端契约 status 为英文（`idle / thinking / ...`）。当前通过 `resolveStatus()` 桥接，未做更名重构。

---

## 修改文件清单
- `Zoufx AI.html` — 应用上述 1–5 项变更
- `Zoufx AI v3.html` — 变更前快照
- `design_handoff_zoufx_ai/CHANGELOG.md` — 本文件
- `design_handoff_zoufx_ai/README.md` — 追加「右侧栏 · 用户印象 / 当前状态」与状态机渲染规则
