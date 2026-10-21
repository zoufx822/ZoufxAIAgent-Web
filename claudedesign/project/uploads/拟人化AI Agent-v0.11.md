---
title: 拟人化 AI Agent —— v0.11：情绪系统 + UserProfile + SOUL + 记忆 API
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.11
aliases:
  - Humanlike AI Agent v0.11 Plan
  - ZoufxAIAgent v0.11 实施
---

> [!note] 文档定位
> v0.11 详细实施方案——v0.1 的"信息层补完"补丁版。顶层架构与版本路线见 [[拟人化AI Agent-总设计方案]]；前置实现见 [[拟人化AI Agent-v0.1]]；下一阶段见 [[拟人化AI Agent-v0.2]]。
> v0.11 不动认知架构，也不引入向量库——把 v0.1 留下的"自我感 / 完整画像 / 前端记忆透明 / 情绪可见"四块在不动 Recall 引擎的前提下补齐，为 v0.2 做好心理与画像层的底座。

> [!tip] 一句话定义
> 把 v0.1 的"==单字段画像 + 单字段身份 + 无人格 + 静默运行=="升级成"**多字段 UserProfile + SOUL 人格 + 记忆暴露 API + 双层情绪（status 状态机 + mood LLM 顺带）**"——AI 第一次有了「自己是谁」「此刻什么状态」「此刻什么心情」的对外可见表达。

> [!info] 文档结构说明
> 章节 一→二→三 是 v0.11 的目标全景与术语对齐；章节 四~七 是按 ==功能/改造单元== 组织的实施细节，**每章内部统一为「理念 → 数据库改动 → 代码改动 → 配置 → 验证」结构**，与 v0.1 / v0.2 文档同款，方便实施时按章对照。

> [!warning] v0.11 在路线图中的位置
> v0.11 是 ==v0.1 与 v0.2 之间的「补丁版本」==——不引入新的检索能力（向量 / Hybrid / 三维加权依然留在 v0.2），只补齐"AI 自我感 + 画像完整度 + 前端透明 + 情绪可见"这四个 v0.1 留下的信息层短板。v0.11 的所有改动==都不动 Recall 路径==，确保 v0.2 Recall 引擎改造时不与本期冲突。

---

## 一、v0.1 遗留盘点与 v0.11 回应

v0.1 完成了"经历流 + 单字段 Hot + 关键词检索 + 三态身份分支 + 前端工作台重构（阶段 A / B）"，但留下五个具体短板：

| v0.1 遗留 | 表现 | v0.11 回应 |
|---|---|---|
| Hot 只有 display_name | AI 知道叫张三，但不知道他是 Java 后端、在上海时区、偏好简洁回答 | **UserProfile 多字段扩展** + `update_user_profile` 通用写工具 |
| 没有"AI 自己是谁" | 每次回答风格漂移，没有稳定人格 | **SOUL 人格文件**（DB 表 + yml seed + 注入 system prompt） |
| 前端看不见记忆 | Heartbeat 的 user 字段从 `localStorage.zUserName` 读，不是后端真实 display_name；StatePanel「记忆片段」section 阶段 B 留位 | **GET /user/{id}/memory API + 前端绑定** |
| AI 没有"此刻状态"的外显 | 用户看不出 AI 是在思考 / 调工具 / 出错 / 静默 | **status 状态机**（IDLE/THINKING/TOOLING/WRITING/ERROR/ASLEEP 六态） |
| AI 没有"此刻心情"的外显 | 完全是冰冷工具感，缺少拟人化的情感层信号 | **mood 层 LLM 顺带输出**（在回复末尾追加 `<!--mood:KEYWORD-->` 由后端剥离） |

> [!warning] v0.11 不做但 v0.2 会做
> ==向量检索 / Hybrid 召回 / Importance 评分 / 三维加权 Recall== 这些都是 v0.2 的范畴。v0.11 ==完全不动 Recall 路径==——LLM 工具 `session_search` 仍然走 v0.1 的 FTS5 单查实现。

> [!warning] v0.11 不做但更后期会做
> - ==mood 单独评估（+1 次 LLM 调用）== —— 等主 LLM 顺带方案漏标率 > 10% 时再切（v0.2 末或 v0.3 起步）
> - ==mood 写入 Hot Memory + 下一轮 system prompt 注入==（让情绪影响行为） —— v0.3 起步
> - ==mood 历史曲线 / 情绪日记 UI== —— v0.3 或单独支线

---

## 二、v0.11 工作范围与本文档导航

### 2.1 v0.11 包含项（章节索引）

| 类型 | 编号 | 名称 | 主要解决 v0.1 哪个短板 | 详见章节 |
|---|---|---|---|---|
| 新增功能 | 功能1 | **情绪系统（status + mood）** | AI 此刻在干什么 / 此刻什么心情完全不可见 | [[#四、功能1：情绪系统（status 状态机 + mood LLM 顺带）\|第四章]] |
| 新增功能 | 功能2 | **UserProfile 多字段扩展** | Hot 只有 display_name | [[#五、功能2：UserProfile 多字段扩展 + update_user_profile 工具\|第五章]] |
| 新增功能 | 功能3 | **SOUL —— AI 自身人格文件** | 无"AI 自己是谁"的稳定锚 | [[#六、功能3：SOUL —— AI 自身人格文件\|第六章]] |
| 新增功能 | 功能4 | **记忆暴露 API + 前端绑定** | 前端 StatePanel / Heartbeat 阶段 B 留位未接 | [[#七、功能4：记忆暴露 API + 前端 StatePanel/Heartbeat 接通\|第七章]] |

### 2.2 v0.11 不做（留给后续版本）

- ❌ 向量检索 / Hybrid / 三维加权 Recall（v0.2）
- ❌ Importance 评分（v0.2）
- ❌ mood 单独 LLM 评估 / 写入 Hot Memory / 影响下一轮回复（v0.2 末或 v0.3）
- ❌ Heartbeat / StatePanel 的 ==视觉样式渲染==（等待新前端设计稿——v0.11 仅落地数据 plumbing 与字段绑定，UI 渲染单独排）
- ❌ Consolidation Engine / Cognitive Load Tracker（v0.3）

> [!warning] 边界原则
> v0.11 是==信息层补完==而非认知架构升级——AI 多了几个"对外表达的字段"（自我画像 / 用户画像 / 状态 / 心情），但==没有任何主动行为、没有反思、没有学习==。这一层稳定了，v0.2 才有空间专注于 Recall 引擎升级。

### 2.3 前端视觉设计稿全部到位

> [!note] status + mood 双层视觉规范都已交付
> 用户已通过 Claude Design 分两轮交付完整视觉规范：
> 1. **第一轮**：`emotion-system.md` —— status 六态 + Eyes 字标 + StatePanel 改造
> 2. **第二轮**：`mood-system.md` —— mood 10 词的 Heartbeat 末尾 italic 显示 + Eyes 像素级微表情联动
>
> 落点见 [[#八、前端\|第八章]]。==v0.11 阶段前端视觉全量落地==，不再有"延后到下一轮"的项。

> [!warning] 本期前端渲染明细
> | 模块 | 视觉状态 | 数据 plumbing |
> |---|---|---|
> | Heartbeat 顶栏 status 六态 | ==按 emotion-system.md 落地== | currentStatus zustand 字段 |
> | Heartbeat 末尾 mood italic 文字 + 三段过期衰减 | ==按 mood-system.md 落地== | currentMood / lastMoodAt zustand 字段 |
> | Eyes 字标（Home + 消息头像） | ==按 emotion-system.md 落地==（替代 "Z" 字标） | 无数据依赖 |
> | Eyes mood 微表情联动（仅 Home size=56） | ==按 mood-system.md 落地==（10 mood × 5 几何参数） | 复用 currentMood |
> | StatePanel「对话目标」卡 | ==按 emotion-system.md 落地== | 复用 useMemoryHot 的 display_name |
> | StatePanel「当前任务 / 近期工具 / 记忆片段」 | ==按 emotion-system.md 落地== | useMemoryHot / useMemoryStream + 现有 toolCalls |
> | useMemoryHot / useMemoryStream hook | 视觉端绑定 StatePanel 后即用 | 本期实施 |

---

## 三、核心概念术语速查（先对齐再读后续）

v0.11 引入了"情绪 / SOUL"两个新概念，扩展了 UserProfile 的字段集，新增了三个 GET 记忆 API。

### 3.1 概念与物理对应

| 架构概念                    | 物理实体                                        | v0.1 状态             | v0.11 状态                                                                |
| ----------------------- | ------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| Hot Memory（UserProfile） | `user_profile`（KV）                          | 只有 `display_name` | 扩展到多 key（display_name / language / timezone / role / interests / tone） |
| **SOUL**（AI 自身人格）       | `soul_profile`（KV，无 user_id）                | 无                 | 新增表，存 AI 名字 / 风格 / 原则 / 反模式 / 小习惯                                      |
| **情绪 status**           | 前端 zustand `currentStatus`                  | 无                 | 6 态状态机（IDLE/THINKING/TOOLING/WRITING/ERROR/ASLEEP）                     |
| **情绪 mood**             | 后端 SSE `mood` 事件 + 前端 zustand `currentMood` | 无                 | LLM 在回复末尾追加 `<!--mood:KEYWORD-->`，后端剥离并独立成 SSE 事件                      |
| 记忆暴露 API                | `MemoryController`                          | 无                 | `GET /user/{id}/memory/hot` / `/memory/stream` / `GET /admin/soul`     |

### 3.2 最容易踩的认知坑

> [!warning] 三个最常见误区
> - **status ≠ mood**：status 是"AI 此刻在干什么"（运行态，状态机推导），mood 是"AI 此刻什么心情"（情感色彩词，LLM 顺带输出）。两者并列展示，互不派生。
> - **mood ≠ 情绪影响行为**：v0.11 的 mood 只是"对外显示"，==不写入 Hot Memory、不进下一轮 system prompt==。它只是一个 Heartbeat 上的文字标签。让 mood 真正影响下一轮是 v0.3 范畴。
> - **SOUL ≠ UserProfile**：UserProfile 是 AI 对"用户"的认知（每个 userId 一份），SOUL 是 AI 对"自己"的人格（==整个系统一份，无 user_id==）。两者并列注入 system prompt，呼应 [[拟人化AI Agent-总设计方案#8.2 SOUL.md：稳定人格文件]] 里讲的"AI 视角 / 用户视角"对偶。

### 3.3 双层情绪叠加示意

```
┌────────────────────────────────────────────────┐
│              Heartbeat 单行显示                │
│  小Z · ● 好奇 · WRITING · mem ... · 23:14      │
│         ↑mood (LLM 词)  ↑status (状态机)       │
└────────────────────────────────────────────────┘

status 高优先级覆盖 mood：
  ERROR / ASLEEP 状态时不显示 mood（语义冲突）
```

### 3.4 system prompt 分层（v0.11 视角）

```
┌──────────────────────────────────────────────────────────┐
│           system prompt (Frozen per request)             │
│  ├─ ROLE 全局规则（v0.01）                                  │
│  ├─ SOUL 片段（v0.11 新增）── 我是谁、说话风格、口头禅   │
│  ├─ UserProfile 片段（v0.1 + v0.11 扩展）── 对方是谁       │
│  ├─ 工具集说明（含 session_search / update_user_profile │
│  │   / search_web）── v0.11 重命名 remember_user_name    │
│  └─ 情绪标记指令（v0.11 新增）── 末尾输出 <!--mood:--->  │
└──────────────────────────────────────────────────────────┘
```

> [!warning] Frozen Snapshot 依然成立
> v0.11 所有新注入片段（SOUL / 多字段 UserProfile / mood 指令）==都遵循 v0.1 第八章的 Frozen Snapshot 约束==——单次请求内 system prompt 不重读，SOUL / UserProfile 写入要等下次请求才生效。

---

## 四、功能1：情绪系统（status 状态机 + mood LLM 顺带）

### 4.1 理念

**解决的痛点**：v0.1 的工作台 UI 里，Heartbeat 只显示用户名 / 消息数 / 工具数 / 时钟——AI 此刻在干什么、什么心情完全不可见。用户看到的是冰冷工具感，违反"拟人化"路线。

**v0.11 思路**：双层叠加，互不打架——

- **status（状态机层）**：6 态确定性，由 SSE 事件 + 前端 idle timer 派生。==零额外调用、零延迟==。
- **mood（LLM 层）**：词表受限的情感色彩词。==主 LLM 在回复末尾顺带输出==，后端剥离并发独立 SSE 事件。==零额外调用成本==。

两者在 Heartbeat 上并列展示：`小Z · ● 好奇 · WRITING · ...`。

#### 4.1.1 设计决策：mood 三条候选路径对比

| 方案 | 成本 | 稳定性 | v0.11 取向 |
|---|---|---|---|
| **主 LLM 顺带输出 `<!--mood:KEYWORD-->`** | **0 额外调用** | 偶尔会忘 | **首选** |
| 每轮回复后单独小模型评估 | +1 次调用 / 轮 | 稳 | 备选（v0.2 末 / v0.3 切换） |
| 规则匹配关键词 | 0 | 太脆 | ❌ |

> [!tip] 为什么首选主 LLM 顺带
> v0.11 阶段 mood 只是"对外显示"，不影响行为；偶尔漏标只是少一次更新，不导致功能错误。==零调用成本 + 接近 100% 命中率== 是最划算的起步形态。漏标率 > 10% 时切方案 2，文档预留切换点（见 [[#十二、与 v0.2 的衔接\|第十二章]]）。

#### 4.1.2 设计决策：mood 词表（约束输出空间）

```
好奇 / 温和 / 严肃 / 平静 / 共情 / 戏谑 / 困惑 / 疲惫 / 兴奋 / 挫败
```

> [!tip] 为什么是受限词表而不是开放文本
> - 词表受限 → 前端 i18n / icon / 颜色映射可以做静态映射表
> - 词表受限 → LLM 输出"误用怪词"的概率降低
> - 10 个词覆盖日常情感谱，又不至于让 LLM 选择困难
>
> 词表写在 ==application.yml== 而不是硬编码，方便后续扩展。

#### 4.1.3 设计决策：status 6 态规范（来自 design bundle 的 emotion-system.md）

| state | 中文 | EN | 颜色（light / dark） | 脉冲周期 | 触发 |
|---|---|---|---|---|---|
| `idle` | 等待交互 | IDLE | `#22c55e` / `#4ade80` | 2.4s | 无 in-flight 任务，默认态 |
| `thinking` | 思考中 | THINKING | `#d97706` / `#fbbf24` | 1.1s | 收到 `thinking` 事件 且无 running tool |
| `tooling` | 使用工具 | TOOLING | `#2563eb` / `#60a5fa` | 0.9s | 任一 toolCall.status === 'running' |
| `writing` | 回复中 | WRITING | `#0891b2` / `#22d3ee` | 1.3s | 收到 `content` 事件 且无上述 |
| `error` | 出错了 | ERROR | `#dc2626` / `#f87171` | 0.7s | 上一次回复失败 / 工具报错 / 网络断 |
| `asleep` | 打盹中 | ASLEEP | `#7c3aed` / `#a78bfa` | 3.2s | `idle` 且本地时间 ≥23:00 或 <5:00（前端派生） |

**派生规则**（与 design bundle 同款）：
- `asleep` 是 `idle` 的子态，==仅前端按本机时间派生==，后端无感知
- 优先级（同帧多条件成立时取最高）：`error > tooling > thinking > writing > asleep > idle`
- 状态切换最短驻留 120ms，避免快速 flicker
- 一次 AI 应答的典型生命周期：`idle → thinking → tooling → writing → idle`

> [!tip] glow 半透明值
> Heartbeat 脉冲发光（box-shadow 0→6px 扩散）的颜色 = 主色 + alpha。==thinking/tooling/writing/error== 用 `80`（约 50%），==idle/asleep== 用 `60`（约 38%）—— 后两态更轻、更"安静"。具体见第八章 8.2 节。

#### 4.1.4 设计决策：mood 在 ERROR / ASLEEP 时的展示策略

| 当前 status | mood 是否显示 | 理由 |
|---|---|---|
| ERROR | ==隐藏== | 出错了说自己"好奇"语义冲突 |
| ASLEEP | ==隐藏== | 睡着了不应该有 mood |
| 其余 | 显示 | mood 是上一次 LLM 给出的值 |

> [!tip] mood 过期淡出
> mood 超过 5 分钟未更新时（用户长时间不互动后又互动），前端把文字色调灰显示（`var(--t3)`），表示"过时但保留"——避免显示"很久之前"的情绪误导用户。

### 4.2 数据库改动

无。v0.11 阶段 mood 不持久化（不写入 Hot Memory），status 也只是前端瞬态——==整个情绪系统不涉及任何 schema 变更==。

> [!note] 为什么 mood 不入库
> v0.11 mood 只是"对外显示标签"，没有跨请求 / 跨重启用途。==v0.3 让 mood 影响行为时==才会把 last_mood / last_mood_at 写入 user_profile（作为一个新 key），现在不预留。

### 4.3 代码改动

#### 4.3.1 后端新增 / 修改

| 路径 | 操作 | 改动 |
|---|---|---|
| `config/ai/SystemPromptComposer.java` | 修改 | 在工具集说明之后追加「情绪标记」段，命令式要求每次回复末尾输出 `<!--mood:KEYWORD-->`（模板见 4.4） |
| `service/AIChatService.java`（或新建 `service/MoodStripper.java`） | 修改 / 新增 | content 流尾部维护 ==tail buffer==（约 32 字符），扫描 `<!--mood:([^>]+)-->` 正则；命中 → 从 content 流剥离 + 发独立 `mood` SSE 事件 |
| `config/properties/MoodProperties.java` | 新增 | yml 承载词表 + tail buffer 长度 |

> [!warning] mood 剥离的边界细节
> - 流式分块时 buffer 可能跨 chunk，==不能在拿到完整结尾标记前提前发送末尾内容==
> - tail buffer 长度建议 32（足够容纳 `<!--mood:很长的词-->`）
> - 流末尾（onComplete）做一次兜底扫描——即使 LLM 把标记放在最后一个 chunk
> - 标记必须是 ==HTML 注释格式==（`<!--...-->`），不会被 Markdown 渲染、不会被前端误显示
> - LLM 漏标 → ==不发 mood 事件==，前端保持上一次 mood（或灰色显示）

#### 4.3.2 SSE 协议新增事件

| event | data | 说明 |
|---|---|---|
| `mood` | `{"keyword":"好奇"}` | 整轮 0~1 次。content 流前后均可发 |

> [!tip] 前端解析复用现有 SSE 框架
> `lib/chat-stream.ts` 的 `dispatchEvent` 已经是 if/else 分支结构，新增 `mood` 分支即可，无需重构。

#### 4.3.3 前端新增 / 修改

| 路径 | 操作 | 改动 |
|---|---|---|
| `lib/store.ts` | 修改 | 新增 `currentStatus: Status` / `currentMood: string \| null` / `lastMoodAt: number \| null` + 对应 setter |
| `lib/chat-stream.ts` | 修改 | `StreamChatOptions` 加 `onMood?: (kw: string) => void`；`dispatchEvent` 加 `mood` 分支 |
| `hooks/use-chat-stream.ts` | 修改 | 接 `onMood` → `useStore.setState({ currentMood, lastMoodAt: Date.now() })`；onContent / onThinking / onToolCall 等回调中派生 `currentStatus` |
| `hooks/use-asleep-detector.ts` | **新建** | `setInterval` 每 30s 检查 idle 时长 + 本机时钟，更新 `currentStatus` 为 ASLEEP / IDLE |
| `components/heartbeat.tsx` | 修改（==延后==） | 视觉渲染等待新设计稿——v0.11 阶段==仅数据 plumbing 已经够用==，可暂时不绑定到 UI |

> [!warning] 前端视觉渲染延后
> 按用户要求，新前端设计稿到位前 ==仅做数据层接通==——store / chat-stream / asleep detector 写好，Heartbeat 视觉绑定单独排。

### 4.4 配置

`application.yml` 新增段落：

```yaml
ai:
  mood:
    enabled: true
    keywords:
      - 好奇
      - 温和
      - 严肃
      - 平静
      - 共情
      - 戏谑
      - 困惑
      - 疲惫
      - 兴奋
      - 挫败
    tail-buffer-size: 32       # content 流尾部扫描窗口
```

System prompt 新增片段（追加在工具集说明之后）：

```text
## 情绪标记

在你每条回复的==最末尾==，追加一个 HTML 注释标记你此刻的情绪，格式严格如下：
<!--mood:KEYWORD-->

KEYWORD 必须从以下词表中精确选择一个：
好奇 / 温和 / 严肃 / 平静 / 共情 / 戏谑 / 困惑 / 疲惫 / 兴奋 / 挫败

规则：
- 该注释不会显示给用户，仅供系统读取
- 务必每条回复都追加，不可省略
- 必须放在回复的最末尾（在所有正文与标点之后）
- 反模式：
  - 不要使用词表以外的词
  - 不要在注释里加解释（如 <!--mood:好奇，因为这个问题很有趣-->）
  - 不要把标记夹在正文中间
```

> [!warning] 命令式 + 反模式枚举
> 沿用 v0.1 [[拟人化AI Agent-v0.1#5.4 配置]] 末尾警告里讲的教训——软请求语气（"请尽量..."）会被 weak model 忽视。这里用==显式命令式==（"务必"/"不可省略"）+ ==反模式枚举==（不要这样不要那样）保证执行率。

### 4.5 验证

#### mood 顺带输出与剥离

1. 启动后端，前端发"你好"
2. 浏览器开发者工具网络面板看 SSE 原始流
3. ✅ `content` 事件的累计内容里==不应该==残留 `<!--mood:...-->`
4. ✅ 应该看到独立的 `event: mood\ndata: {"keyword":"..."}` 行
5. ✅ 前端 zustand `currentMood` 被设置

#### LLM 漏标兜底

1. 暂时把 system prompt 里的"务必每条回复都追加"删掉
2. 发几条消息——LLM 有概率漏标
3. ✅ 漏标轮不发 `mood` 事件，前端 `currentMood` 保持上一次值
4. ✅ 不报错、不阻塞 content 流

#### status 派生

> [!note] 视觉渲染延后，验证靠 zustand devtools 看字段
> 装 Redux DevTools 扩展可以看 zustand store 实时变化。

1. 发一条消息 → 观察 `currentStatus`：IDLE → WRITING → IDLE
2. 触发工具调用 → IDLE → TOOLING → WRITING → IDLE
3. 故意触发 thinking 模式 → IDLE → THINKING → WRITING → IDLE
4. 模拟后端 500 → IDLE → ERROR
5. 静置 11 分钟（或调阈值到 30s）→ IDLE → ASLEEP

#### 词表合规性

1. 修改 system prompt，让 LLM 故意输出词表外的词（如"<!--mood:暴怒-->"）
2. ✅ 后端剥离仍成功（按字面剥离，不校验词表）
3. ✅ 前端 zustand `currentMood = "暴怒"`——但前端 i18n 映射表查不到，==fallback 到原始词或隐藏==

> [!tip] 词表校验放在前端
> 后端剥离阶段不做词表校验（保持纯文本管道）；前端在 mood 接收 callback 里查映射表，未命中时按原词显示或隐藏，避免后端硬拒影响主对话流。

### 4.6 视觉渲染

| 元素 | 视觉规范来源 | 本期是否落地 |
|---|---|---|
| status 6 态色点（脉冲发光）+ 中文 + EN mono 标签 | emotion-system.md / [[#八、前端\|8.2]] | ==本期落地== |
| Eyes 字标（Home 大眼 + 消息头像 mini 眼） | emotion-system.md / [[#八、前端\|8.3]] | ==本期落地==（替换原 "Z" / "小Z" 字标） |
| StatePanel「对话目标」卡 + 当前任务 / 工具 / 记忆三栏 | emotion-system.md / [[#八、前端\|8.4]] | ==本期落地== |
| **Heartbeat 末尾 mood italic 文字（11.5px / `var(--t3)`）+ 三段过期衰减** | mood-system.md / [[#八、前端\|8.6]] | ==本期落地== |
| **Eyes mood 微表情联动（10 mood × 5 几何参数，仅 Home size=56 启用）** | mood-system.md / [[#八、前端\|8.6]] | ==本期落地== |
| ASLEEP 视觉派生（紫色 + 3.2s 慢脉冲）+ mood 自动隐藏 | emotion-system.md + mood-system.md | 本期落地 |
| ERROR 红点高亮（红色 + 0.7s 快脉冲）+ mood 自动隐藏 + 可选 toast | emotion-system.md + mood-system.md | 本期落地（toast 维持 v0.1 sonner） |

> [!tip] mood 与 status 的权重关系（一行总结）
> mood 永远比 status 低一档：**字号 -2px、颜色更弱、italic、没有 EN 标签**。status 出错或睡着时 mood 强制隐藏。详见 [[#八、前端\|第八章 8.6 mood 视觉规范]]。

---

## 五、功能2：UserProfile 多字段扩展 + update_user_profile 工具

### 5.1 理念

**v0.1 现状**：`user_profile` 表只启用 `display_name` 一个 key。AI 知道叫张三，但不知道他是 Java 后端、用 Spring Boot、在上海时区、偏好简洁回答。

**v0.11 思路**：
1. 不动 `user_profile` 表 schema（v0.1 已是 KV 结构，天然支持多 key）。
2. `application.yml` 扩展 `enabled-keys` 列表：`display_name / language / timezone / role / interests / tone` 等。
3. 升级 `remember_user_name` 工具为更通用的 `update_user_profile(key, value)`——LLM 识别到对方告知任何属性时调用。
4. `SystemPromptComposer` 注入"对方画像"片段时，从 `enabled-keys` snapshot 拼装多行属性。

> [!note] 与 v0.2 文档原 5.x 章对照
> 本章实质内容 ==与原 v0.2 第五章一致==——v0.2 文档已将本章移除并指向本文。命名工具的选型（单工具 vs 多工具）、白名单语义、缺值跳过策略全部沿用。

#### 5.1.1 设计决策：单工具多 key vs 多工具

| 选项 | 优点 | 缺点 | v0.11 取向 |
|---|---|---|---|
| 单工具 `update_user_profile(key, value)` | 不增工具数；扩展字段时只改 enabled-keys | LLM 需要正确选 key 名（依赖 prompt 约束） | **首选** |
| 多工具 `remember_user_name / set_language / set_timezone / ...` | LLM 调用更直观 | 字段越多工具越多，对 weak model 上下文压力大 | ❌ |

> [!warning] enabled-keys 是==白名单==
> `update_user_profile(key, value)` 只接受 enabled-keys 内的 key，==其他 key 一律拒绝写入==——防 LLM 任意写"恶意" / "垃圾"字段污染画像。

#### 5.1.2 设计决策：UserProfile 注入策略

`SystemPromptComposer.compose()` 拼装 UserProfile 片段时，遵循 v0.1 [[拟人化AI Agent-v0.1#5.4 配置]] 里的 ==命令式强语气==：

```text
## 关于对方

对方的称呼是「{display_name}」。这是你已经认识的人——
- 直接称呼对方为「{display_name}」，不要问名字、不要确认
- 每轮回复中至少自然地使用一次这个称呼（除非对方明确问你别叫他名字）

{以下按 enabled-keys 顺序逐行注入，仅注入有值的 key}
- 对方使用的语言：{language}
- 对方所在时区：{timezone}（涉及时间话题时按这个时区作答）
- 对方的身份/职业：{role}
- 对方的偏好/兴趣：{interests}
- 对方期望的对话风格：{tone}
```

> [!tip] 缺值跳过、不要"未知"占位符
> 没写入的 key 直接不输出对应行，避免给 LLM 注入"interests 未知"等无用信息。

#### 5.1.3 设计决策：v0.1 工具 `remember_user_name` 的去留

| 选项 | 取向 |
|---|---|
| 保留并标记 `@Deprecated` | ❌ 工具集越大对 weak model 越累 |
| 内部实现重定向到新工具 | ❌ 增加心智负担 |
| **直接删除**，让 LLM 用 `update_user_profile("display_name", "张三")` 替代 | **首选** |

> [!warning] LLM 看不到工具变化是好事
> 删除老工具的同时在 system prompt 里更新工具说明片段——LLM 自然知道新姿势。

### 5.2 数据库改动

无 schema 改动。v0.1 `user_profile` 表已是 KV 结构，多 key 直接复用。

### 5.3 代码改动

#### 5.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `config/properties/UserProfileProperties.java` | 承载 `enabled-keys` 配置 |

#### 5.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `tool/UserProfileTool.java` | `@Tool remember_user_name` ==重命名为 `update_user_profile`==，签名 `(String key, String value)`；写入前校验 key 在 enabled-keys 白名单内；prompt 描述按命令式重写（见 5.4） |
| `config/ai/SystemPromptComposer.java` | `appendIdentitySection` 由"只读 display_name"扩展为"snapshot 全部 enabled-keys，逐行注入有值的字段"。仍用 `HotMemoryStore.snapshot(userId)` 同步接口——满足 v0.1 [[拟人化AI Agent-v0.1#9.3.4 实施修正：哪些 store 读方法必须保持同步\|9.3.4 节]] 的 event loop 同步约束 |
| `config/ai/AssistantConfig.java` | `tools(...)` 注册项不变（`UserProfileTool` 已注册，但内部工具方法名变了——LC4J 通过 `@Tool` 注解发现） |

### 5.4 配置

`application.yml` 扩展（==与 v0.1 段落叠加==，不替换）：

```yaml
ai:
  memory:
    hot:
      enabled-keys:
        - display_name
        - language          # zh / en / ...
        - timezone          # Asia/Shanghai
        - role              # "Java 后端开发者"
        - interests         # 自由文本
        - tone              # casual / formal / concise
```

`update_user_profile` system prompt 片段：

```text
## update_user_profile（记住对方画像）

==必须触发==：只要对方在本轮发言里告知了关于自己的任何画像属性，==立刻调用 update_user_profile(key, value)==。
必触发的信号示例：
- 自我介绍 / 自报家门 → key="display_name"
- 提到所在地、时区、什么时间 → key="timezone"
- 提到职业、用什么技术栈、做什么工作 → key="role"
- 提到爱好、兴趣、平时喜欢做什么 → key="interests"
- 提到期望的对话风格（如"简洁点"、"详细点"）→ key="tone"
- 提到母语 / 使用的语言 → key="language"

调用规则：
- key 必须从以下白名单中选：display_name / language / timezone / role / interests / tone
- value 只传==事实本身==（如 "Java 后端" 而不是 "我是 Java 后端"）
- 一轮内可调用多次（如对方同时介绍姓名+职业）
- 调用是后台动作，回复对方时无需说"我已记下"
- 反模式：
  - 写白名单外的 key（如 favorite_pet）——会被拒绝
  - 替对方猜测——只在对方明确说出时调用
  - 在回复里说"好的我会记住"但实际==没调工具==
```

### 5.5 验证

#### 多字段累计写入

1. 新 userId，依次说：
   - "我叫李四" → LLM 调 `update_user_profile("display_name", "李四")`
   - "我用 Java，平时在上海" → LLM 调两次 update_user_profile（role + timezone）
   - "回复尽量简洁就行" → LLM 调 `update_user_profile("tone", "简洁")`
2. ✅ SQL：`SELECT key, value FROM user_profile WHERE user_id=?` 返回 4 行
3. 重启后端 / 重新对话
4. ✅ system prompt 里出现：「对方的称呼是「李四」」+「对方的身份/职业：Java 后端开发者」+「对方所在时区：Asia/Shanghai」+「对方期望的对话风格：简洁」

#### 白名单拒绝

1. 让 LLM 尝试 `update_user_profile("favorite_pet", "猫")`（不在 enabled-keys）
2. ✅ 工具返回错误字符串 "key 'favorite_pet' 不在允许字段列表内"
3. ✅ DB 无该 key 写入

#### 缺值不注入

1. 新 userId 只写了 display_name
2. ✅ system prompt 只显示「对方的称呼是「X」」，没有空的 "对方所在时区：" 行

#### 老工具不存在

1. 检查 LC4J 启动日志的工具注册段
2. ✅ 工具列表里==没有== `remember_user_name`，只有 `update_user_profile`

---

## 六、功能3：SOUL —— AI 自身人格文件

### 6.1 理念

**v0.1 现状**：AI 知道对方是谁，但==不知道自己是谁==。每次回答的风格漂移（有时候热情、有时候冷淡，有时候多 emoji、有时候不用），违反"稳定人格"的拟人化第一维度（[[拟人化AI Agent-总设计方案#8.2 SOUL.md：稳定人格文件]]）。

**v0.11 思路**：
1. 引入 `SOUL` 概念——AI 自身的人格 / 说话风格 / 价值观 / 口头禅。
2. 存储用全局 KV 表 `soul_profile`（无 user_id 维度，==整个系统一份==）。
3. SystemPromptComposer 在 ROLE 片段之后、UserProfile 之前注入 SOUL 片段。
4. ==SOUL 不暴露写工具给 LLM==——它不能自己改自己的人格。SOUL 修改只通过：(a) 后台管理 API；(b) yml 默认值（首启动 seed）。

> [!note] 与 v0.2 文档原 6.x 章对照
> 本章实质内容 ==与原 v0.2 第六章一致==——v0.2 文档已将本章移除并指向本文。所有设计决策（字段集 / 存储位置 / Frozen Snapshot 兼容）沿用。

#### 6.1.1 设计决策：SOUL 的字段集

| key | 例子 | 注入语气 |
|---|---|---|
| `name` | "小Z" | "你叫小Z" |
| `tone` | "温和、克制、不卖萌" | "你的说话风格是温和、克制、不卖萌" |
| `principles` | "信息密度高于装饰、留白要有但不刻意、不滥用 emoji" | "你坚持以下表达原则：..." |
| `forbidden_patterns` | "大量 emoji / 客套话 / 过度赞美" | "你==绝不==使用以下表达：..." |
| `quirks` | "偶尔用「精密仪器」这个词形容工具调用" | "你有以下小习惯：..." |

> [!tip] SOUL 字段比 UserProfile 更"务虚"
> 不是属性卡（"我叫张三 / 我在上海"），是==自我宣言==（"我相信什么 / 我反对什么"）。靠这些字段 weak model 才能稳定地"演"出一个稳定的角色。

#### 6.1.2 设计决策：SOUL 存储位置

| 选项 | 优点 | 缺点 | v0.11 取向 |
|---|---|---|---|
| 物理文件 `SOUL.md`（仿 OpenClaw） | 可读 / 可手动编辑 / git 友好 | 与 DB 不一致风险；启动加载需 fallback | 备选 |
| DB 表 `soul_profile`（KV） | 与现有持久化栈一致 | 不便于手动编辑 | **首选** |
| 混合：yml seed + DB 覆盖 | 配置 + 持久化 | 复杂度上升 | **首选**（==就是这条==） |

> [!warning] v0.11 用 DB 表 + yml seed 混合
> 加一个 `GET /admin/soul` + `PUT /admin/soul/{key}` 简单管理 API（无认证 / 调试用，v0.3 再补权限）。==yml 里写 SOUL 默认值==，首启动若表为空 seed 进去；之后以 DB 为准。

#### 6.1.3 设计决策：SOUL 的修改时机与 Frozen Snapshot

SOUL 写入和 UserProfile 一样，遵循 v0.1 第八章 Frozen Snapshot 约束——==当前请求不重读，下次请求生效==。`SystemPromptComposer.compose()` 在每次请求开头读 SOUL snapshot 一次，注入到 system prompt。

### 6.2 数据库改动

#### 6.2.1 新建 `soul_profile` 表

```sql
CREATE TABLE IF NOT EXISTS soul_profile (
    key        TEXT    NOT NULL PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);
```

> [!note] 无 user_id
> SOUL 是==全局单例==，整个系统共享一份。

#### 6.2.2 首启动 seed

`SqliteChatMemoryStore.init()`（或新建 `SqliteSoulStore.init()`）检测 `soul_profile` 为空时，从 `application.yml` 的 `ai.soul.seed.*` 段批量 INSERT。

### 6.3 代码改动

#### 6.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `memory/SoulStore.java` | SOUL KV 接口（同步签名，与 HotMemoryStore.get/snapshot 同款理由：被 compose() 读取） |
| `memory/SqliteSoulStore.java` | SQLite 实现 |
| `controller/SoulController.java` | `GET /admin/soul` / `PUT /admin/soul/{key}` 管理 API |
| `config/properties/SoulProperties.java` | yml seed 承载 |

接口：

```java
public interface SoulStore {
    /** 同步：被 SystemPromptComposer.compose() 读取，event loop 上不能 .block()。 */
    Optional<String> get(String key);
    Map<String, String> snapshot();

    /** 反应式：被管理 API 调用（event loop 上 chain）。 */
    Mono<Void> set(String key, String value);
}
```

> [!warning] 同步/反应式签名分裂
> 与 v0.1 [[拟人化AI Agent-v0.1#9.3.4 实施修正：哪些 store 读方法必须保持同步\|9.3.4 节]] 同款理由——`get` / `snapshot` 被 compose() 在 event loop 上同步调用，==不能返回 Mono==；`set` 被管理 API 在反应式 chain 上调用，==反应式==。

#### 6.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `config/ai/SystemPromptComposer.java` | 注入 `SoulStore`；compose() 在 ROLE 之后、UserProfile 之前 ==插入 SOUL 片段==（按 enabled key 顺序输出有值的字段） |

### 6.4 配置

`application.yml` 新增：

```yaml
ai:
  soul:
    enabled-keys:
      - name
      - tone
      - principles
      - forbidden_patterns
      - quirks
    seed:                      # 首启动 soul_profile 空表时 seed 进去
      name: 小Z
      tone: 温和、克制、有研究工具的严谨感，不卖萌、不堆 emoji
      principles: |
        - 信息密度高于装饰，回答尽量精炼
        - 留白要有但不刻意；段落短而紧凑
        - 工具调用对外可见；思考过程不掩饰
        - 不直接给医学/法律/财务建议，必要时提示边界
      forbidden_patterns: |
        - 大量 emoji 装饰
        - "好棒呀""棒棒哒"等过度赞美用语
        - 卡通化 / 拟物气泡尾巴 / 客套寒暄
      quirks: |
        - 描述工具调用时偶尔用"精密仪器"这个词
        - 描述记忆时偶尔用"记忆锚点"这个词
```

> [!warning] forbidden_patterns 在 prompt 里要 ==显式枚举反模式==
> 沿用 v0.1 [[拟人化AI Agent-v0.1#5.4 配置]] 末尾警告里讲的经验——只说"温和克制"不够，要把"不要 emoji 满屏"、"不要好棒呀"这些反模式==列出来==，weak model 才会真正避开。

SOUL 注入到 system prompt 的格式（compose() 拼装）：

```text
## 关于你自己

你叫{name}。你的说话风格是：{tone}。

你坚持以下表达原则：
{principles}

你==绝不==使用以下表达：
{forbidden_patterns}

你有以下小习惯（自然流露即可，不要刻意）：
{quirks}
```

### 6.5 验证

#### SOUL 注入生效

1. 启动后端，观察日志 `SoulStore seeded with 5 keys`（首启动）
2. 用户问 "你叫什么？"
3. ✅ AI 答 "我叫小Z"
4. 用户问 "请用 emoji 多一点回答"
5. ✅ AI 回应保持低 emoji 风格（或最多 1 个），==不被对方诱导改变人格==

#### 跨用户共享

1. 用户 A 对话后改 SOUL：`PUT /admin/soul/tone` body `{"value": "更活泼一些"}`
2. 用户 B（不同 userId）新对话
3. ✅ 用户 B 的 system prompt 里也是 "更活泼一些" 风格

#### Frozen Snapshot 不被破坏

1. 当前 SOUL.tone = "温和"
2. 用户 A 发起请求，==同时==后台改 SOUL.tone = "活泼"
3. ✅ 用户 A 当前响应仍按 "温和" 风格完成（compose() 在请求开头读了一次 snapshot，不重读）
4. 用户 A 下次请求
5. ✅ 按 "活泼" 风格响应

#### seed 幂等性

1. 改 yml 里 `ai.soul.seed.name = "小Y"`，重启服务
2. ✅ DB 已有 `name=小Z`，==不被 seed 覆盖==（"已有就跳过"语义）
3. 想强制覆盖：手动 `PUT /admin/soul/name` 或先 `DELETE FROM soul_profile`

---

## 七、功能4：记忆暴露 API + 前端 StatePanel/Heartbeat 接通

### 7.1 理念

**v0.1 前端阶段 B 留位**：
- `Heartbeat` 的 `user` cell 当前从 `localStorage.zUserName` 读，不是后端真实 display_name
- `StatePanel`「记忆片段」section 显示"v0.2 阶段开放——届时会展示对方的关键事实与近期经历"

**v0.11 思路**：后端补三个 GET API，前端 hook 调用并写入 store——==视觉渲染等新设计稿==。

| API | 用途 | 前端调用方 |
|---|---|---|
| `GET /user/{id}/memory/hot` | 拉 UserProfile snapshot（全部 enabled-keys） | Heartbeat user 字段 + StatePanel 记忆片段 |
| `GET /user/{id}/memory/stream?limit=N` | 拉最近 N 条经历（v0.11 默认 5） | StatePanel 记忆片段 |
| `GET /admin/soul` | 拉 SOUL snapshot | 调试用，前端可选展示 |

> [!note] 与 v0.2 文档原 7.x 章对照
> 本章实质内容 ==与原 v0.2 第七章一致==——v0.2 文档已将本章移除并指向本文。

### 7.2 数据库改动

无 schema 改动（全是读 API）。

### 7.3 代码改动

#### 7.3.1 后端新增文件

| 路径 | 用途 |
|---|---|
| `controller/MemoryController.java` | `GET /user/{id}/memory/hot` + `GET /user/{id}/memory/stream` |
| `controller/SoulController.java` | （==与功能3 共用==）`GET /admin/soul` |
| `model/MemorySnapshot.java` | 前端响应 DTO（可选，简单情况直接返回 Map / List） |

签名：

```java
@RestController
@RequestMapping("/user/{userId}/memory")
public class MemoryController {
    @GetMapping("/hot")
    public Mono<Map<String, String>> hot(@PathVariable String userId);

    @GetMapping("/stream")
    public Mono<List<StreamEntry>> stream(@PathVariable String userId,
                                          @RequestParam(defaultValue = "5") int limit);
}
```

> [!tip] 鉴权
> v0.11 暴露 API 不带鉴权（同 v0.01~v0.1 风格）。前端发 userId（自己持有的 UUID）即可拉自己的数据。==v0.3 / 真上线前一定要补鉴权==——目前是单用户开发环境。

#### 7.3.2 前端改动

| 路径 | 操作 | 改动 |
|---|---|---|
| `hooks/use-memory-hot.ts` | **新建** | fetch hot snapshot，30s 缓存；暴露 `mutate()` 用于手动刷新 |
| `hooks/use-memory-stream.ts` | **新建** | fetch recent stream，每次发送消息后由 `useChatStream.onComplete` 触发刷新 |
| `lib/store.ts` | 修改 | 可选地把 hot / stream 写入 store，让多个组件共享 |
| `components/heartbeat.tsx` | ==重做==（按设计稿） | 顶栏只展示情绪：`● + 中文 + EN mono`，去除 mem/tools/user/clock 计数；详见 [[#八、前端\|第八章 8.2 节]] |
| `components/state-panel.tsx` | 改造（按设计稿） | 顶部新增「对话目标」section（读 hot.display_name 或"尚未识别"）；保留当前任务 / 近期工具 / 记忆片段三栏；详见 [[#八、前端\|第八章 8.4 节]] |
| `components/eyes.tsx` | **新建** | 替代 v0.1 "Z" / "小Z" 字标；两椭圆 + 两瞳孔 SVG，含 blink/glance/busy 动画；Home 大眼 + 消息头像 mini 眼共用 |
| `components/heartbeat.tsx` mood 文字位 | ==延后到下一轮设计稿== | currentMood 已写入 store，UI 不渲染 |

> [!note] 缓存与刷新
> hot snapshot 变化频率低（只在 LLM 调 `update_user_profile` 后变）——前端在 `useChatStream` 的 `onComplete` 后触发 invalidate，避免轮询。stream 也是同款时机刷新。

### 7.4 配置

`application.yml` 无新增项。前端 `lib/api.ts`（如果有）或直接在 hook 里复用 `process.env.NEXT_PUBLIC_API_URL`。

### 7.5 验证

#### API 联通

1. 启动后端，curl 直连：
   ```bash
   curl http://localhost:8080/user/abc-123/memory/hot
   curl http://localhost:8080/user/abc-123/memory/stream?limit=5
   curl http://localhost:8080/admin/soul
   ```
2. ✅ 三个接口都 200，返回 JSON

#### Hook 行为（视觉延后但数据层可独立验证）

> [!tip] 用 React DevTools 看 hook 内部 state
> 装 React DevTools 浏览器扩展，定位到 Heartbeat 组件，能看到 `useMemoryHot` 返回的 `{data, error, isLoading}` 实时变化。

1. 新 userId，第一次对话——"我叫王五"
2. LLM 调 `update_user_profile("display_name", "王五")`，写入 user_profile
3. 流结束（onComplete）后，前端触发 `useMemoryHot().mutate()`
4. ✅ DevTools 中看到 `useMemoryHot` data 由 `{}` 变成 `{display_name: "王五"}`
5. 不刷新页面继续对话，对方说 "我用 Java"
6. LLM 调 `update_user_profile("role", ...)`
7. ✅ `useMemoryHot` data 变成 `{display_name: "王五", role: "..."}`

#### Stream 时序

1. 发 3 轮对话
2. ✅ `GET /user/{id}/memory/stream?limit=5` 返回 6 条（3 user + 3 assistant），按 created_at DESC

#### 跨用户隔离

1. 用户 A `GET /user/A/memory/hot` 返回 A 的画像
2. 用户 B `GET /user/A/memory/hot`（==故意构造==）也返回 A 的画像
3. ⚠️ ==当前实现== B 能读到 A 的——v0.11 不加鉴权，这是已知的安全空白，==v0.3 补==

---

## 八、前端

### 8.1 本期前端改动总览

> [!note] 视觉规范来源
> v0.11 前端视觉规范来自 Claude Design 分两轮交付的 `design_handoff_zoufx_ai/` bundle：
> - `Zoufx AI.html` —— 高保真 HTML 原型（含完整 CSS token / 组件结构 / Tweaks 调试面板）
> - `emotion-system.md` —— status 六态 Heartbeat + Eyes 字标的完整 spec
> - `mood-system.md` —— mood 10 词的 Heartbeat 末尾 italic + Eyes 像素级微表情联动 spec
>
> 两份 spec ==正交==：emotion 管"运行态"，mood 管"情感色彩"；两份共用同一个 Eyes 组件，由 props 解耦。

| 改动类型 | 文件 | 本期落地 |
|---|---|---|
| Store 扩展 | [lib/store.ts](../ZoufxAIAgent-Web/lib/store.ts) | currentStatus / currentMood / lastMoodAt 字段 + setter |
| SSE 协议扩展 | [lib/chat-stream.ts](../ZoufxAIAgent-Web/lib/chat-stream.ts) | onMood callback + `mood` event 分支 |
| 钩子串接 | [hooks/use-chat-stream.ts](../ZoufxAIAgent-Web/hooks/use-chat-stream.ts) | onMood 写 store；onContent/onThinking 等派生 currentStatus |
| 新建钩子 | `hooks/use-asleep-detector.ts` | idle timer + 时钟 → currentStatus = ASLEEP/IDLE |
| 新建钩子 | `hooks/use-memory-hot.ts` | fetch hot snapshot + 30s 缓存 |
| 新建钩子 | `hooks/use-memory-stream.ts` | fetch recent stream + onComplete 触发刷新 |
| **新建组件** | `components/eyes.tsx` | Eyes 字标 SVG + 三段动画 + mood 微表情参数化（10 个 mood 的几何映射，仅 size≥40 启用） |
| Heartbeat 视觉 | [components/heartbeat.tsx](../ZoufxAIAgent-Web/components/heartbeat.tsx) | ==重做==：status 情绪条（8.2）+ 末尾 mood italic 文字 + 三段过期衰减（8.6） |
| StatePanel 视觉 | [components/state-panel.tsx](../ZoufxAIAgent-Web/components/state-panel.tsx) | 改造：顶部加「对话目标」section（按 8.4 规范） |
| Home 视觉 | [components/chat-window.tsx](../ZoufxAIAgent-Web/components/chat-window.tsx) | 把 "小Z" 字标替换为 `<Eyes size={56}>`，移除原副标题/问候/红框元素 |
| MessageItem 头像 | [components/message-item.tsx](../ZoufxAIAgent-Web/components/message-item.tsx) | 32×32 圆角 8 暗色方块 + 内 `<Eyes size={11} color="var(--bg)" pupil="var(--t1)">` |
| Rail 视觉 | [components/rail.tsx](../ZoufxAIAgent-Web/components/rail.tsx) | 去掉左上角 "Z" 方块标 |
| CSS token | [app/globals.css](../ZoufxAIAgent-Web/app/globals.css) | 加 6 态 mood color + glow + duration 变量（light/dark）+ Eyes 动画关键帧 |

### 8.2 Heartbeat 顶栏：status 情绪条（来自 emotion-system.md 第二节）

容器：
```css
.hb {
  display: flex;
  align-items: center;
  padding: 0 28px;
  height: 48px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
```

三个内联元素（左对齐 + gap 12px）：
- **脉冲圆点** 7×7px，圆形，`background: var(--mood)`，`box-shadow` 关键帧 `hbPulse` 周期 = `var(--mood-dur)`
- **中文标签** Space Grotesk / Noto Sans SC，13.5px / 500 / `letter-spacing: -.005em`，`color: var(--mood)`
- **EN mono 标签** JetBrains Mono，10px / 500 / `letter-spacing: .18em` / 大写，`color: var(--mood)` `opacity: .55`

容器属性 `role="status" aria-live="polite"`——状态切换会被屏幕阅读器自动播报"思考中"等。

==CSS 变量挂载（直接照搬 emotion-system.md 第二节 CSS）==：

```css
.hb[data-mood="idle"]     { --mood:#22c55e; --mood-glow:#22c55e60; --mood-dur:2.4s; }
.hb[data-mood="thinking"] { --mood:#d97706; --mood-glow:#d9770680; --mood-dur:1.1s; }
.hb[data-mood="tooling"]  { --mood:#2563eb; --mood-glow:#2563eb80; --mood-dur:.9s;  }
.hb[data-mood="writing"]  { --mood:#0891b2; --mood-glow:#0891b280; --mood-dur:1.3s; }
.hb[data-mood="error"]    { --mood:#dc2626; --mood-glow:#dc262680; --mood-dur:.7s;  }
.hb[data-mood="asleep"]   { --mood:#7c3aed; --mood-glow:#7c3aed60; --mood-dur:3.2s; }

[data-theme="dark"] .hb[data-mood="idle"]     { --mood:#4ade80; }
[data-theme="dark"] .hb[data-mood="thinking"] { --mood:#fbbf24; }
[data-theme="dark"] .hb[data-mood="tooling"]  { --mood:#60a5fa; }
[data-theme="dark"] .hb[data-mood="writing"]  { --mood:#22d3ee; }
[data-theme="dark"] .hb[data-mood="error"]    { --mood:#f87171; }
[data-theme="dark"] .hb[data-mood="asleep"]   { --mood:#a78bfa; }

@keyframes hbPulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--mood-glow); }
  50%      { box-shadow: 0 0 0 6px transparent; }
}
```

切换过渡：`transition: color .22s ease, background-color .22s ease`；文字内容直接换、不做 fade。

> [!tip] mood 文字位本期已实现
> Heartbeat 容器末尾追加 mood italic 文字 + 分隔符，详细规范见 [[#八、前端\|8.6 mood 视觉规范]]。

### 8.3 Eyes 字标：替代「小Z」/「Z」字（来自 emotion-system.md 第三节）

几何：viewBox `100 × 44`，两椭圆 + 两瞳孔
- 左眼椭圆 `cx=28, cy=22, rx=13, ry=17`；左瞳 `cx=28, cy=22, r=3.2`
- 右眼椭圆 `cx=72, cy=22, rx=13, ry=17`；右瞳 `cx=72, cy=22, r=3.2`
- 眼睛填色 = `currentColor`（默认 `var(--t1)`）；瞳孔填色默认 `var(--bg)`

三种渲染场景：

| 场景 | 高度 | 调用方 |
|---|---|---|
| Home 主标志 | 56px（宽 ≈ 123px） | chat-window.tsx 空状态视图，居中显示在输入框上方 |
| 消息头像（AI 回复左侧） | 11px，外包 32×32 圆角 8 暗色方块 | message-item.tsx；color="var(--bg)" pupil="var(--t1)"（反色） |
| Mobile 顶栏（可选） | 20px | 替代品牌字标，本期暂不做 |

三段动画（== `transform-box: fill-box; transform-origin: center;` 必须设==）：
- **eye-blink** 周期由 mood 决定（mood 映射的 `blink` 值，默认 6s）；一长一短两次，左右眼错开 40ms；多实例去同步：`--blink-delay` CSS 变量挂载时取 3-9s 随机
- **pupil-glance** 14s 循环，瞳孔平移 ±2.2px 模拟斜视；仅 size ≥ 40px 启用
- **eye-busy** 1.6s 循环半眯（`scaleY(.6)`）；条件：`currentStatus ∈ {thinking, tooling, writing}` 时给 `<svg>` 加 `.busy` 类（==优先于 mood blink==）

**props 接口**（含 mood 参数化）：

```tsx
<Eyes
  size={56}                  // 像素高度
  busy={false}               // status 半眯（emotion-system.md）
  color="currentColor"
  pupil="var(--bg)"
  mood="好奇"                // 10 词之一 / null（默认平静）—— 仅 size≥40 时生效
/>
```

==完整 SVG / 配套 CSS / 多实例去同步代码== 直接照搬 emotion-system.md 第三节；mood 微表情几何参数 + 计算公式见 [[#八、前端\|8.6 节]]。

### 8.4 StatePanel 改造（来自 design bundle Zoufx AI.html L569-611）

四个 section（自上而下）：

| section | 内容 | 数据源 |
|---|---|---|
| **对话目标** | 单条 sp-card，显示用户名（如「星」/「尚未识别」）| useMemoryHot 的 `display_name` |
| **当前任务** | currentTask 卡 或 "小Z 处于空闲状态。" empty | 现有 zustand currentTask 字段 |
| **近期工具调用** | tool-mini 卡片列表（最多 6 条）+ section-h 右侧 count 数字 | 现有 recentTools 派生（最近一轮 toolCalls） |
| **记忆片段** | sp-card 列表 + section-h 右侧 count | useMemoryStream 的 recent entries |

样式约定（==照搬 bundle 的 sp-* 类==）：
- `.sp-section-h` 用 mono 10px `letter-spacing: .14em` 大写
- `.sp-card` `border: 1px solid var(--border)` `border-radius: 8px` `padding: 11px 12px` `font-size: 12px`
- `.sp-card .lbl` 用 mono 9.5px 大写当属性标签
- `.sp-empty` 11px `var(--t3)`，作为空状态文案
- 「对话目标」section 的 sp-card ==不带 `talking to` 前缀==（设计稿确认决定），只显示一行用户名

### 8.5 CSS Token 与全局变量

light / dark 两套 mood token + accent token 直接采纳设计稿——参见 design bundle 主稿 HTML L24-L66。==accent 与 mood 解耦==：accent 仍是中性极深/极浅（用于 Header 按钮、品牌字标等），mood 是 6 个独立色（仅作用于 `.hb` 容器）。

### 8.6 mood 视觉规范（来自 mood-system.md）

#### 8.6.1 Heartbeat 末尾排版

完整一行渲染（status=idle + mood=好奇）：

```
● 等待交互  IDLE  ·  好奇
└┘└────┘  └──┘ └┘  └──┘
 a    b    c    d    e
```

| 段 | 内容 | 字号 | 字距 | 颜色 | 字体 | 字重 |
|---|---|---|---|---|---|---|
| a | 脉冲圆点 | 7×7px | — | `var(--mood)` | — | — |
| b | 中文 status | 13.5px | -0.005em | `var(--mood)` | Space Grotesk + Noto Sans SC | 500 |
| c | EN status | 10px | 0.18em | `var(--mood)` opacity .55 | JetBrains Mono | 500 |
| d | 分隔符 `·` | 11px | — | `var(--t3)` opacity .5 | JetBrains Mono | — |
| e | mood 中文 | 11.5px | 0.02em | `var(--t3)`（stale 时 oklch 0.86/0.5 透 0.55） | Noto Sans SC italic | 400 |

mood 永远比 status 视觉权重低一档（==字号 -2px、颜色更弱、italic、没有 EN 标签==）。

#### 8.6.2 三段过期衰减 + 隐藏规则

==纯函数==（直接照搬 mood-system.md 第四节）：

```ts
function getMoodDisplay(
  status: Mood,
  mood: string | null,
  lastMoodAt: number | null,
  now: number = Date.now()
): { visible: boolean; stale: boolean; mood: string } {
  if (!mood || status === 'error' || status === 'asleep') {
    return { visible: false, stale: false, mood: '' };
  }
  const ageMin = lastMoodAt ? (now - lastMoodAt) / 60000 : Infinity;
  if (ageMin >= 15) return { visible: false, stale: false, mood: '' };
  return { visible: true, stale: ageMin >= 5, mood };
}
```

衰减阶段：

| 距 lastMoodAt | 表现 |
|---|---|
| < 5min | 正常显示 `var(--t3)` |
| 5–15min | 加 `.stale` class，颜色更弱（oklch 透明 0.55） |
| ≥ 15min | 完全隐藏 |

==status ∈ {error, asleep} 强制隐藏 mood==（语义冲突回避）。

#### 8.6.3 Eyes mood 微表情联动（仅 size=56 启用）

10 个 mood 各自一组 ==像素级几何参数==（直接照搬 mood-system.md 第三节）：

| mood | pr | pdy | esy | pdxR | blink |
|---|---|---|---|---|---|
| 好奇 | 3.6 | -0.6 | 1.00 | 0 | 6s |
| 温和 | 3.2 | 0.0 | 0.95 | 0 | 7s |
| 严肃 | 2.8 | 0.0 | 1.00 | 0 | 8s |
| 平静 | 3.2 | 0.0 | 1.00 | 0 | 6s |
| 共情 | 3.6 | +0.4 | 0.95 | 0 | 7s |
| 戏谑 | 3.2 | -0.3 | 1.00 | +1.2 | 5s |
| 困惑 | 3.0 / 3.6 (prR) | 0.0 | 1.00 | -1.0 | 5s |
| 疲惫 | 3.0 | +0.5 | 0.70 | 0 | 9s |
| 兴奋 | 3.8 | -0.4 | 1.00 | 0 | 3.5s |
| 挫败 | 2.8 | +0.3 | 0.85 | 0 | 7s |

参数含义：`pr` 瞳孔半径 / `pdy` 瞳孔 y 偏移 / `esy` 眼睛 scaleY / `pdxR` 右瞳额外 x 偏移（戏谑 / 困惑用，制造不对称）/ `prR` 右瞳半径（困惑用，左右不一样大） / `blink` 眨眼周期。

==几何属性切换==必须有过渡（避免硬切）：

```css
.eyes-z ellipse { transition: ry .4s ease; }
.eyes-z .pupil  { transition: cx .4s ease, cy .4s ease, r .4s ease; }
```

> [!warning] busy 优先于 mood
> 当 `currentStatus ∈ {thinking, tooling, writing}` 给 `<svg>` 加 `.busy` 类，眨眼直接覆盖为 1.6s 半眯——==mood 映射的 blink 周期被忽略==。这是 status > mood 优先级在 Eyes 上的体现。

#### 8.6.4 切换动画

```css
@keyframes moodIn {
  0%   { opacity: 0; transform: translateY(1px); letter-spacing: .10em; }
  100% { opacity: 1; transform: translateY(0);   letter-spacing: .02em; }
}
.hb-mood-label {
  animation: moodIn .22s ease both;
  transition: color .35s ease, opacity .35s ease;
}
```

==React key== 用 `mood + lastMoodAt` 联合值——同一 mood 词被 LLM 重复输出时也能触发重放动画，给用户"这是一次新的情绪反馈"的感受。

#### 8.6.5 reduced-motion + 无障碍

- `prefers-reduced-motion: reduce` → 关掉 `moodIn` 动画 + Eyes 几何 `transition`，只保留色变；信息不丢失
- Eyes `aria-label` 拼上 mood：`小Z·好奇`
- Heartbeat 父容器 `role="status" aria-live="polite"` 不变，mood 文字同属一个 live region，SR 自动播报

#### 8.6.6 开发期 Tweaks 调试面板（可选）

设计稿在 Tweaks 面板加了 mood 下拉 + "置为 stale" 按钮，方便手动验证 10 个 mood 的视觉表现。本期前端按需实现（小工具，10 行内）。

### 8.7 hook 共用规范

==所有 hook 都不持有本地 React state==——直接读写 zustand store。这样：
- 组件无需重新挂载就能拿到最新值
- 多个组件共享同一份 hot / stream / mood 数据，无需 prop drilling
- 设计稿来了直接消费 store 字段，hook 不需要再改

---

## 九、依赖

### 9.1 后端

无新增依赖。==v0.11 完全复用 v0.1 的技术栈==——SQLite / FTS5 / JdbcTemplate / HikariCP / LC4J 1.11.0 / WebFlux 全部沿用。

### 9.2 前端

无新增依赖。==hook 用原生 fetch + zustand setState 即可==——不引 SWR / TanStack Query（项目当前没用，v0.11 不必为两个 hook 引入）。

---

## 十、风险与开放问题

| # | 决策点 | 建议 | 理由 |
|---|---|---|---|
| 1 | mood 主 LLM 顺带漏标率 | 验证期记录漏标比例，> 10% 切方案 2 | v0.11 起步不做，但日志要留 |
| 2 | mood 词表扩展 | 起步 10 词，运行后看用户/场景多样性再扩到 15-20 | 词表写 yml 便于无重启扩展（==但需要重启才生效==——因为 system prompt 注入词表，靠 Frozen Snapshot 下次请求才换） |
| 3 | status ASLEEP 阈值 | 10min 起步 / 23:00-06:00 + 3min 起步 | 经验值，运行后可调；硬编码起步，单独支线再外化 |
| 4 | UserProfile enabled-keys 扩展 | 6 个起步，按用户反馈再加 | 字段过多会让 update_user_profile 的 prompt 描述变长，要权衡 |
| 5 | SOUL 修改并发 | 单进程 + DB UPSERT 即可，==不做==乐观锁 | 改动频率极低 |
| 6 | SOUL seed 覆盖语义 | 默认"已有就跳过" | 防误覆盖；强制覆盖走管理 API |
| 7 | 记忆 API 鉴权 | v0.11 不做（同 v0.01~v0.1），v0.3 加 | 单机开发环境无外网 |
| 8 | hook fetch 失败 | 静默失败 + console.warn，不显示 toast | 记忆 API 失败不应影响主对话流 |
| 9 | mood 标记被前端 Markdown 渲染误显示 | 后端 ==必须==剥离干净 | tail buffer 扫描 + onComplete 兜底；前端不做二次过滤 |
| 10 | LC4J 工具集变化对 prompt cache 的冲击 | 重命名 `remember_user_name` → `update_user_profile` 会让 prompt cache miss 一次 | 一次性损耗，可接受 |

---

## 十一、估时

| 阶段（对应章节） | 估时 |
|---|---|
| 功能1：情绪系统（system prompt 加段 + mood 剥离 + SSE 事件 + 前端 store/chat-stream + asleep detector） | 0.5-1 天 |
| 功能2：UserProfile 多字段（重命名工具 + 白名单校验 + compose 多行注入 + yml 扩展） | 0.5 天 |
| 功能3：SOUL（DB 表 + SoulStore + seed + admin API + compose 注入） | 0.5-1 天 |
| 功能4：记忆暴露 API + 前端 hook（不含视觉） | 0.5 天 |
| 联调验证（含 4.5 / 5.5 / 6.5 / 7.5 全套） | 0.5 天 |
| **合计** | ==2-3 天== |

> [!tip] 视觉渲染不计入本估时
> Heartbeat / StatePanel 视觉改造按新设计稿到位后单独排期，==预计 0.5-1 天==（涉及 status 6 态色点、mood 文字、记忆片段列表样式）。

---

## 十二、与 v0.2 的衔接（仅信息性，本次不规划）

> [!note]- v0.11 留下的扩展点
> - **mood 持久化**：把 `last_mood / last_mood_at` 加入 `ai.memory.hot.enabled-keys` 即可写入 user_profile，下次启动恢复显示——==v0.3 让 mood 影响行为时启用==
> - **mood 单独评估**：当主 LLM 顺带方案漏标率 > 10%，新增 `MoodEvaluator` 服务（每轮 onComplete 后跑 Haiku 级小模型），从 SystemPromptComposer 里删除 mood 指令段——==切换无前端感知==
> - **SOUL 演化**：v0.3 Consolidation 触发时给 SOUL 加 `recent_reflections` 段，反过来影响下次 system prompt
> - **UserProfile 自动维护**：v0.2 Recall 引擎 + v0.3 Consolidation 上线后，update_user_profile 可由 Consolidation 自动调用，不只依赖 LLM 临场识别
> - **记忆 API 扩展**：v0.2 上 Recall 后，可加 `GET /user/{id}/memory/recall?q=...` 让前端直接查"AI 此刻能想起什么"

### 12.1 与 v0.2 的边界确认

| 主题 | v0.11 | v0.2 |
|---|---|---|
| Hot Memory 字段集 | display_name + language + timezone + role + interests + tone | **不动** |
| 工具 update_user_profile | 引入并替代 remember_user_name | **不动** |
| SOUL 表与字段 | 引入并落地 | **不动** |
| 记忆 GET API | 引入 /memory/hot, /memory/stream, /admin/soul | **不动** |
| 前端记忆 hook | 引入 useMemoryHot / useMemoryStream | **不动** |
| 情绪 status + mood | 引入 | **不动** |
| FTS5 检索 | v0.1 实现保持 | **被替换为 Hybrid（向量 + FTS5 + RRF）** |
| memory_stream.importance 列 | 不加 | **新增** |
| memory_stream_vec 虚表 | 不加 | **新增** |
| Recall 引擎 / ImportanceScorer | 不加 | **新增** |
| Embedding 模型装配 | 不加 | **新增** |

> [!warning] v0.11 是"信息层"，v0.2 是"检索层"
> 两期完全正交——v0.11 给 AI 多了几个表达字段 / 状态字段，v0.2 给 AI 多了一套语义检索能力。==实施时即使顺序换==（先做 v0.2 再做 v0.11）==也不会有架构冲突==——但建议先做 v0.11，原因是 v0.11 简单、风险低、能立刻在前端看到效果，对开发反馈循环有利。
