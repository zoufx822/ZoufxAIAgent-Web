---
title: 拟人化 AI Agent —— v0.135：LLM Profile 化重构 + Capability 协商 + 前端"思考"按钮语义重定义
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.135
  - 重构
aliases:
  - Humanlike AI Agent v0.135 Plan
  - ZoufxAIAgent v0.135 实施
---

> [!note] 文档定位
> v0.135 是 [[拟人化AI Agent-v0.13|v0.13]] 与 [[拟人化AI Agent-v0.14|v0.14]] 之间的「LLM 装配层纯重构 + 前端按钮语义重定义」补丁版本：
> 1. ==LC4J 升级 1.11.0 → 1.13.1==（pom 同步升级），核心 builder API 完全兼容
> 2. ==合并 `thinkingChatModel` / `nonThinkingChatModel` 双 Bean== 为单一 `chatModel`，对应 Assistant 也合并
> 3. ==以"行为 profile"为单位重新组织 LLM 装配==——以 `OpenAi vs Anthropic 协议`分类粒度太粗，伪二分
> 4. ==新增 `GET /ai/capabilities` 能力协商接口==，让前端 UI 行为依据后端真实能力而非硬编码
> 5. ==前端"思考一下"按钮重命名"思考"==，按 capability 自适应行为
>
> 顶层架构与版本路线见 [[拟人化AI Agent-总设计方案]]；前置实现见 [[拟人化AI Agent-v0.13|v0.13]]；下一阶段见 [[拟人化AI Agent-v0.14|v0.14]]。
> v0.135 不引入认知层新功能，不动 Memory / Recall / SOUL / Mood / Hot Memory，纯收敛 LLM 装配层的伪二分 + 把"模型能力"显式化。

> [!warning] v0.135 编码 spike 已落实的约束（**降级方案已转正**）
> 编码 spike 阶段验证：==LC4J 1.13.1 的 `langchain4j-anthropic` 模块没有 `AnthropicChatRequestParameters` 子类==，per-call 时仅能覆盖通用 `ChatRequestParameters` 字段（modelName/temperature/topP/topK/maxOutputTokens/...），==不含 thinking==。
>
> 升级到 main 分支也未提供此能力，社区相关需求记录在 [issue #2954](https://github.com/langchain4j/langchain4j/issues/2954)，未实现。
>
> **决策**：v0.135 走==降级方案==：
> - 两个 profile 的 capability ==均声明 `thinkingToggle: false`==
> - 前端按钮在两个 profile 下行为统一 = ==仅控显示==
> - minimax profile 的 LC4J builder 仍开启 `thinkingType("enabled")` + `thinkingBudgetTokens(...)`，让 MiniMax 自适应思考深度（类似 DeepSeek v4 hybrid 的行为）
> - 等 LC4J 后续给 Anthropic 模块加 `AnthropicChatRequestParameters` 时，==仅需改 capability 声明 + 前端发请求带 thinking 字段==，架构不动
>
> 这条约束已同步落入 [[拟人化AI Agent-总设计方案]] 的"已知技术债"一节。

> [!tip] 一句话定义
> 把 v0.13 遗留的「双 ChatModel/Assistant Bean 几乎全等代码 + 前端"思考一下"按钮的 thinking 字段路由含义混乱」两个问题一次性解决：**以 `ai.llm.profile` 为切换枢轴的单 Bean 装配 + capability 协商接口 + 按钮语义按 capability 自适应**——为 v0.14 引入更多模型 / 新前端能力时减少认知与维护负担。

> [!info] 文档结构说明
> 章节 一→二→三 是 v0.135 的目标全景与术语对齐；四~七章按 ==功能/改造单元== 组织实施细节，**每章内部统一为「理念 → 数据库改动 → 代码改动 → 配置 → 验证」结构**，与 v0.11 / v0.12 / v0.13 文档同款。

> [!warning] v0.135 在路线图中的位置
> v0.135 是 ==v0.13 与 v0.14 之间的「LLM 装配层重构 + UI 契约规范 + LC4J 版本升级」补丁版本==——它==不引入认知层新功能==，==不动 SOUL / Mood / Memory / Recall 路径==，只做五件事：
> 1. **依赖升级**：LC4J `1.11.0` → `1.13.1`（pom 中 `langchain4j-core` / `langchain4j` / `langchain4j-anthropic` / `langchain4j-open-ai` 统一到 `1.13.1`；`langchain4j-web-search-engine-tavily` 对齐 `1.13.1-beta23`）
> 2. **重构 A**：双 ChatModel + 双 ChatAssistant Bean → 单一 `chatModel` + 单一 `ChatAssistant`
> 3. **重构 B**：`OpenAiModelConfig` / `OpenAiProperties` → `DeepSeekV4Config` / `DeepSeekV4Properties`；新增 `MinimaxConfig` / `MinimaxProperties`；profile 切换由 `ai.llm.profile` 驱动
> 4. **新增能力 C**：`GET /ai/capabilities` 接口 + `LlmCapabilities` record，由每个 profile 配置声明（==代码归属 `chat/` 包，不单开 `llm/capability/` 子包==）
> 5. **前端改造 D**：按钮"思考一下"→"思考"；按 capability 自适应行为（降级方案下统一仅控显示）
>
> 改动覆盖 LLM 装配层 + 前端按钮组件 + yml 命名空间 + 一处 API 新增 + LC4J 版本号。==零侵入 LC4J 框架契约==、==零改动 Memory / Recall / SOUL / Mood / Hot Memory 路径==、==SSE 事件协议不变==。开发流程允许==清库重启==免迁移成本（本次改动不动 schema）。

---

## 一、v0.13 遗留盘点与 v0.135 回应

v0.13 完成了 SystemPrompt 模块化 + Hot Memory type 分层。留到 v0.135 的有==两类痛点==，根源都在 LLM 装配层未做收敛：

| v0.13 遗留 | 表现 | v0.135 回应 |
|---|---|---|
| 双 ChatModel + 双 ChatAssistant Bean 几乎全等代码 | `OpenAiModelConfig` 内 `thinkingChatModel` / `nonThinkingChatModel` 两个 Bean 区别仅在 modelName 字符串；`AssistantConfig` 对应两个 Assistant Bean 也几乎全等——为了承载"thinking on/off"路由的伪二分 | 合并为单一 `chatModel` + 单一 `ChatAssistant`；thinking 的真实控制由 profile 决定（见痛点 2） |
| 前端"思考一下"按钮 thinking 字段路由含义混乱 | 当前 `POST /ai/chat` 的 `thinking: bool` 字段含义是"路由到 thinkingAssistant 还是 nonThinkingAssistant"——实现细节泄漏到 API。且对 DeepSeek v4 hybrid（always-on 自适应）来说，这个开关在 LLM 层本就==无效==——后端给两个不同 modelName，但模型行为差异其实由模型自身决定，不是开关决定 | 重新定义 `thinking` 字段为==用户希望本轮 LLM 思考==的请求；profile 不支持时静默忽略 + warn log；前端按钮按 capability 自适应（见改造 D） |
| `OpenAiProperties` / `OpenAiModelConfig` 命名误导 | 类名说"OpenAi"，实际连的是 DeepSeek（OpenAI 兼容协议 ≠ 真 OpenAI）——名字承载了错误信息 | 改名为 `DeepSeekV4*`；profile 命名遵循"行为档位最小子集"原则，对齐 provider 实际产品 |
| LLM 能力对前端不可见 | 前端按钮逻辑硬编码"thinking 开关由按钮控制"，但 DeepSeek v4 上这个开关其实==不存在==（模型 always-on）；MiniMax / Claude 上才==真正存在== | 新增 `GET /ai/capabilities` 能力声明接口，前端 UI 行为依据 capability 自适应 |

> [!warning] v0.135 不做但后续版本会做
> ==更多 profile（openai-reasoning / claude / zhipu-glm / qwen3 等）== 留到 v0.14+ 按需添加，本次只实现 deepseek-v4 + minimax 两个 profile。
> ==reasoningEffort 档位 UI（low/medium/high）== 留到接入支持的 profile（如真·OpenAI o-series）时再做。
> ==thinkingBudget 用户调控 UI== 留到 v0.14+ 视用户实际需求决定，本次仅在 capability 中声明 minimax 支持，UI 不做调控只默认。

---

## 二、v0.135 工作范围与本文档导航

### 2.1 v0.135 包含项（章节索引）

| 类型 | 编号 | 名称 | 主要解决 v0.13 哪个短板 | 详见章节 |
|---|---|---|---|---|
| 依赖升级 | 升级 0 | **LC4J 1.11.0 → 1.13.1**（builder API 完全兼容） | 跟进上游版本，避免长期落后 | pom.xml + 附录 A |
| 工程改造 | 改造 A | **双 Bean 合并：`thinkingChatModel` + `nonThinkingChatModel` → `chatModel`；对应 Assistant 同步合并** | 双 Bean 几乎全等代码冗余 | 第四章 |
| 工程改造 | 改造 B | **LLM Profile 化重构（`ai.llm.profile` 切换枢轴 + 独立 Properties 命名空间）** | OpenAi/MiniMax/Anthropic 协议分类粒度太粗 + 命名误导 | 第五章 |
| 新增能力 | 改造 C | **`LlmCapabilities` Bean + `GET /ai/capabilities` 接口**（归属 `chat/` 包） | LLM 真实能力对前端不可见，按钮逻辑硬编码 | 第六章 |
| 前端改造 | 改造 D | **按钮"思考一下"→"思考"，按 capability 自适应行为**（降级方案下统一仅控显示） | thinking 字段含义混乱、按钮在不支持开关的 profile 下行为虚假 | 第七章 |

### 2.2 v0.135 不做（留给后续版本）

- ❌ 接入更多 profile（openai-reasoning / 真 claude / zhipu-glm / qwen3 等）—— v0.14+ 按需
- ❌ reasoningEffort 档位 UI（low/medium/high）—— 接入 o-series 时再做
- ❌ thinkingBudget 用户调控 UI —— 视实际需求
- ❌ 任何 Memory / Recall / SOUL / Mood / Hot Memory 改动
- ❌ 任何 schema 变更

> [!warning] 边界原则
> v0.135 改的是「LLM 装配层 + 前端按钮 + 一个新 API」。
> - ==不引入认知层新功能==、==不改 LC4J 契约==、==不改 SSE 事件协议==
> - 整个 ChatMemory 滑窗、SystemPromptComposer、PromptSection 体系、Hot Memory、SOUL 全部一行不动
> - 开发流程允许==清库重启==免迁移，不写 backfill 代码

---

## 三、核心概念术语速查（先对齐再读后续）

### 3.1 LLM Profile 的本质（核心概念）

==profile 不是 protocol，也不是具体模型——是"行为档位最小子集"==。

为什么不按 protocol 切分（粒度太粗）：

```
"OpenAI 兼容协议" 这个袋子里装着：
├─ DeepSeek v4         → always-on hybrid，reasoning_content 强制回传
├─ DeepSeek v3 (退役)  → 无 reasoning
├─ 智谱 GLM-4.5         → thinking.type=enabled/disabled
├─ Qwen3                → enable_thinking 或 /think 控制
├─ 真·OpenAI o3/GPT-5  → reasoning_effort 档位，不返回 CoT 原文
└─ Moonshot Kimi        → 自家约定
```

它们==仅仅是 HTTP wire format 长得像==，behavior 上完全不是一家。按 protocol 切，落到 builder 上还得在 `if (deepseek) ... else if (zhipu) ...` 里写一堆分支。

为什么不按具体模型切分（粒度太细）：

- `deepseek-v4-pro` 和 `deepseek-v4-flash` 的 builder 配置==几乎一样==（同 baseUrl、同 returnThinking、同回传协议），只差 modelName 字符串
- Claude 的 opus / sonnet / haiku 也共用同一套 builder

最大可复用粒度 = **"模型家族 / 行为 profile"**。同一个 profile 内部行为机制一致，只有 modelName 不同。

### 3.2 v0.135 落地的两个 profile（**降级后的能力矩阵**）

| profile | builder | 用于连接 | thinkingToggle | thinkingBudget | reasoningEffort |
|---|---|---|:-:|:-:|:-:|
| `deepseek-v4` | `OpenAiStreamingChatModel` + returnThinking/sendThinking | DeepSeek 的 OpenAI 兼容端点 | ❌ | ❌ | ❌ |
| `minimax` | `AnthropicStreamingChatModel` + thinkingType("enabled") + thinkingBudgetTokens | MiniMax 的 Anthropic 兼容端点 | ❌（降级） | ❌（降级） | ❌ |

> [!warning] 为什么 minimax 的 thinkingToggle/Budget 也是 ❌——LC4J 1.13.1 上游限制
> 设计阶段假设：MiniMax 协议层支持 thinking 显式开关 + budget（与 Claude 一致），按钮可控 LLM 是否真思考。
>
> 编码 spike 实测：==LC4J 1.13.1 的 `langchain4j-anthropic` 模块没有 `AnthropicChatRequestParameters` 子类==——`AiService` 方法虽然能接收 `ChatRequestParameters` 做 per-call merge（PR #2411 已合并），但通用接口字段不含 thinking。这意味着 thinking 配置==只能在 model builder 期固定==，无法 per-call 覆盖。
>
> 强行 per-call 控制只剩两个不优雅选项：
> - **装两个 model bean**（thinking 一开一关，按需选）→ 与"消灭双 Bean"的核心动机冲突
> - **绕开 LC4J 自己拼 customParameters**→ 脆弱、违背 [[langchain4j_usage_preference]] 的"用框架不手搓"原则
>
> 决策：走==降级方案==——minimax 的 builder 上仍开 `thinkingType("enabled")`，LLM 总是有思考能力，但思考深度由模型自适应（行为类似 DeepSeek v4 hybrid）；按钮在两个 profile 下行为一致 = ==仅控前端显示==。等 LC4J 暴露 `AnthropicChatRequestParameters`（或类似机制）时，==仅需改 capability 声明 + 前端发请求带 thinking 字段==，架构和代码框架不动。
>
> 这条已知技术债同步记录在 [[拟人化AI Agent-总设计方案]] 的"已知技术债"一节。

### 3.3 Capability（能力声明）的本质

==capability 是后端告诉前端「我当前装的这个 LLM 能做什么、不能做什么」的中间契约==。

具象：

```json
GET /ai/capabilities  →
// profile=deepseek-v4 时
{
  "profile": "deepseek-v4",
  "thinkingToggle": false,
  "thinkingBudget": false,
  "reasoningEffort": false
}

// profile=minimax 时
{
  "profile": "minimax",
  "thinkingToggle": true,
  "thinkingBudget": true,
  "reasoningEffort": false
}
```

前端拿到这份"能力清单"后，==根据它决定 UI 行为==——按钮在 deepseek-v4 下只控显示、在 minimax 下同时控 LLM + 显示。没有这份声明，前端就得硬编码"如果 profile 字符串等于……"，把后端实现细节泄漏到前端。

### 3.4 按钮逻辑总览（**降级后的终版**）

| profile capability | 按钮 ON | 按钮 OFF |
|---|---|---|
| `thinkingToggle=false`（deepseek-v4 / minimax 均同此） | 前端展示后端推过来的 thinking 事件 | 前端丢弃后端推过来的 thinking 事件（LLM 仍 always-on/自适应思考，无法控制） |

按钮名称：==`思考一下` → `思考`==——更中性，从"动作触发"语义改为"开关状态"语义。

> [!info] 按钮逻辑的"未来扩展插槽"已预留
> 虽然 v0.135 落地时按钮 = 纯前端显示开关，但 capability 接口已规范化（`thinkingToggle: bool`）。LC4J 后续给出 per-call thinking 覆盖能力后，恢复"按钮也控 LLM"==仅需==：
> 1. minimax profile 的 `LlmCapabilities` 声明改为 `thinkingToggle: true`
> 2. 前端按 `capability.thinkingToggle` 决定是否在请求体带 `thinking` 字段
> 3. 后端 ChatController / ChatAssistant 接收并透传给 LC4J
>
> 三处加起来 < 30 行代码，且==不需要重构现有架构==——这是"capability 协商"这层抽象的核心收益。

### 3.5 最容易踩的认知坑

> [!warning] 核心误区
> - **profile 不等于 protocol**：`deepseek-v4` profile 走的是 OpenAI 兼容协议，但 profile 名是 "deepseek-v4" 不是 "openai" / "openai-compat"。protocol 是底层 wire format，profile 是行为档位。一份 builder 类（`OpenAiStreamingChatModel`）可以被多个 profile 复用（DeepSeek / Zhipu / 真 OpenAI），各 profile 配不同 knob。
> - **`thinking` 字段语义重定义**：v0.13 中 `POST /ai/chat` 的 `thinking: bool` 含义是"路由到哪个 Assistant Bean"（实现细节）；v0.135 重定义为"用户希望本轮 LLM 思考"（用户意图）。profile 不支持时静默忽略+warn log，==不报 400==——容错优先，前端 bug / 缓存过期不至于整崩。
> - **capability 不是 health check**：可以放进 `/ai/health` 但==不应该==。capability 是稳定的、前端启动时拉一次缓存即可；health 是状态轮询的。两者职责不同，分开端点更清晰。前端按"启动时 / profile 切换时"拉 capability，==不轮询==。
> - **`minimax` 不是 `claude`**：profile 命名要对齐==实际产品==而不是==协议==。我们连的是 MiniMax 不是 Anthropic 真 Claude，profile 就该叫 `minimax`。将来真接 Claude 再加 `claude` profile。
> - **按钮 OFF 时 SSE 仍会推 thinking 事件**（在 deepseek-v4 下）：因为 LLM 仍 always-on 思考，后端 LC4J 仍接收 reasoning_content，仍走 `thinking` SSE 事件。前端按按钮状态丢弃即可。==不要==去掉 SSE 推送——多余的网络流量是 DeepSeek v4 协议本身的代价，前端是唯一过滤点。

### 3.6 Profile 与 Bean 装配关系总览

```
┌────────────────────────────────────────────────────────────────┐
│  application.yml: ai.llm.profile = deepseek-v4 | minimax       │
│                                                                │
│  @ConditionalOnProperty(name="ai.llm.profile", havingValue=…) │
│  ┌────────────────────────┐    ┌─────────────────────────┐    │
│  │ DeepSeekV4Config       │    │ MinimaxConfig           │    │
│  │ + DeepSeekV4Properties │ OR │ + MinimaxProperties     │    │
│  │ → chatModel (Bean)     │    │ → chatModel (Bean)      │    │
│  │ → llmCapabilities (Bean) │  │ → llmCapabilities (Bean) │   │
│  └────────────────────────┘    └─────────────────────────┘    │
│              ↓                            ↓                   │
│              └──── 装配同名 Bean ────┘                       │
│                          ↓                                    │
│              ChatAssistant（单 Bean）                         │
│              ChatController（合并暴露 /capabilities）          │
└────────────────────────────────────────────────────────────────┘
```

==一次启动只激活一个 profile==——@ConditionalOnProperty 保证另一份 Bean 不装配。切 profile = 改一行 yml + 重启。

---

## 四、改造 A：双 Bean 合并 → 单一 `chatModel` + 单一 `ChatAssistant`

### 4.1 理念

**解决的痛点**：

- `OpenAiModelConfig` 内 `thinkingChatModel` / `nonThinkingChatModel` 两个 `@Bean` 方法区别==仅在一个字符串==——`props.getChat().getThinkingModel()` vs `props.getChat().getNonThinkingModel()`。所有 builder 配置（apiKey / baseUrl / maxTokens / timeout / returnThinking / sendThinking）==完全一致==。
- 对应的 `AssistantConfig` 装配两个 ChatAssistant Bean（如 `ThinkingChatAssistant` / `NonThinkingChatAssistant`，或带 qualifier 的同接口双 Bean），路由逻辑在 `ChatController` 里根据 `request.thinking` 字段二选一。
- 这种双 Bean 设计的==前提假设==是「thinking 与 non-thinking 是两个不同的模型」——这在 DeepSeek v3 / R1 时代是成立的（deepseek-chat vs deepseek-reasoner），但 v4 系列==都是 hybrid==，pro / flash 仅是规模/成本差异，不是 thinking 能力差异。前提崩塌，二分就成了伪二分。

**v0.135 思路**：

1. 合并为 ==单一 `chatModel` Bean==，由当前激活 profile 的 ModelConfig 装配。
2. 合并为 ==单一 `ChatAssistant` Bean==——无 qualifier、无路由。
3. `POST /ai/chat` 的 `thinking` 字段语义重定义为"用户希望本轮 LLM 思考"，==透传到 LLM 调用层==。profile 支持就生效，不支持就忽略+warn log。

### 4.2 数据库改动

==无==。改造 A 是纯代码层重构。

### 4.3 代码改动

#### 4.3.1 删除文件

| 路径 | 删除原因 |
|---|---|
| `llm/config/OpenAiModelConfig.java` | 命名误导（不是真 OpenAI），改造 B 中以 `DeepSeekV4Config` 替代 |
| `llm/property/OpenAiProperties.java` | 同上 |
| `chat/config/ThinkingChatAssistant.java`（如存在独立接口） | 与 `NonThinkingChatAssistant` 合并 |
| `chat/config/NonThinkingChatAssistant.java`（如存在独立接口） | 与 `ThinkingChatAssistant` 合并 |

> [!note] 实际接口/类名以现状为准
> 上表的 `ThinkingChatAssistant` / `NonThinkingChatAssistant` 是占位描述，实际代码中可能是同一个 `ChatAssistant` 接口下两个 qualifier 注解的 Bean。施工时按现状识别并合并。

#### 4.3.2 新增 / 修改文件

| 路径 | 改动 |
|---|---|
| `llm/config/DeepSeekV4Config.java` | ==新增==（替代 OpenAiModelConfig）：单 `chatModel` Bean；详见改造 B 5.3.3 |
| `llm/config/MinimaxConfig.java` | ==新增==：单 `chatModel` Bean；详见改造 B 5.3.4 |
| `chat/config/AssistantConfig.java` | 改造：装配单一 `ChatAssistant`（无 qualifier），注入合并后的 `chatModel` |
| `chat/api/ChatRequest.java`（或现 DTO 名） | `thinking: Boolean` 字段语义重定义（不删字段，重定义即可）；新增 javadoc 说明"用户意图，profile 不支持时被静默忽略" |
| `web/controller/ChatController.java` | 删路由逻辑（不再按 `request.thinking` 二选一 Assistant）；改为透传 `thinking` 到调用 ChatAssistant 时（通过 ChatRequestParameters 或类似机制，依 LC4J API） |

#### 4.3.3 `thinking` 字段透传到 LC4J 的方式

==需要在编码阶段验证的点==。可能路径：

- **路径 A（推荐）**：通过 LC4J 的 `ChatRequestParameters` per-call override，在 `ChatAssistant` 接口方法上多一个参数，或通过 `dev.langchain4j.service.UserMessage` 之外的 hook 把 thinking 透传给底层 model。
- **路径 B（兜底）**：profile=minimax 时，单独装配一个带"默认 thinking=on"的 model，按钮 ON/OFF 切换时调用不同 method（但这又退化回双 Bean，==不可取==）。

> [!warning] LC4J 1.11.0 透传 per-call thinking 的具体 API 待验证
> 编码前先用一个 spike 跑通 "minimax profile + per-call thinking on/off" 的代码路径。如果 LC4J 1.11.0 当前 API 不支持 per-call thinking 覆盖（只支持 builder 期固定值），改造 D 的"按钮 ON 时 LLM 真思考、OFF 时 LLM 不思考"在 minimax 上==无法做到==——届时降级方案：minimax profile 下也仅"控显示"，与 deepseek-v4 行为一致；按钮 ON/OFF 只影响前端展示，不影响 LLM。capability 中 `thinkingToggle` 字段对应改为 false。
> 这点在编码第一步先确认，再继续后续工作。

### 4.4 配置

无新增 yml。改造 A 是纯代码层重构。

### 4.5 验证

#### 单 Bean 装配健康

1. 启动 backend（profile=deepseek-v4），观察 Spring Bean 初始化日志
2. ✅ 仅一个 `StreamingChatModel` Bean 被装配
3. ✅ 仅一个 `ChatAssistant` Bean 被装配
4. ✅ 无 `NoUniqueBeanDefinitionException`

#### 行为不退化

1. 在合并完成后，前端发起对话
2. ✅ 之前 thinkingAssistant 能完成的对话路径（含工具调用、Hot Memory 写入、SOUL 注入），现在仍能完成
3. ✅ 之前 nonThinkingAssistant 能完成的对话路径同上
4. ✅ SSE 事件协议未变化（thinking / content / tool_call / tool_result / error 五种事件类型如旧）

---

## 五、改造 B：LLM Profile 化重构

### 5.1 理念

**v0.135 思路**：

1. ==`ai.llm.profile`== 作为唯一切换枢轴。当前可选值：`deepseek-v4` / `minimax`。
2. 每个 profile ==独立 `@ConfigurationProperties`==，命名空间 `ai.llm.<profile>.*`——`DeepSeekV4Properties`（prefix=`ai.llm.deepseek-v4`）+ `MinimaxProperties`（prefix=`ai.llm.minimax`）。
3. 每个 profile ==独立 ModelConfig==，由 `@ConditionalOnProperty(name="ai.llm.profile", havingValue="<name>")` 路由激活——仅一个会装配。
4. 每个 profile 的 ModelConfig 内==额外装配一个 `LlmCapabilities` Bean==，声明本 profile 能力。

### 5.2 数据库改动

==无==。

### 5.3 代码改动

#### 5.3.1 新增 Property 类

`llm/property/DeepSeekV4Properties.java`：

```java
package com.zoufx.ai.agent.llm.property;

@Data
@ConfigurationProperties(prefix = "ai.llm.deepseek-v4")
public class DeepSeekV4Properties {
    private String apiKey;
    private String baseUrl;
    private Duration timeout;
    private Chat chat = new Chat();

    @Data
    public static class Chat {
        private String model;       // 如 deepseek-v4-pro / deepseek-v4-flash
        private Integer maxTokens;
    }
}
```

`llm/property/MinimaxProperties.java`：

```java
package com.zoufx.ai.agent.llm.property;

@Data
@ConfigurationProperties(prefix = "ai.llm.minimax")
public class MinimaxProperties {
    private String apiKey;
    private String baseUrl;
    private Duration timeout;
    private Chat chat = new Chat();
    private Thinking thinking = new Thinking();

    @Data public static class Chat {
        private String model;
        private Integer maxTokens;
    }

    @Data public static class Thinking {
        private Integer budgetTokens = 8000;  // 默认预算
    }
}
```

#### 5.3.2 主 Properties 与开关

`llm/property/LlmProperties.java`（新增极简驱动类，==仅承载 profile 名==）：

```java
package com.zoufx.ai.agent.llm.property;

@Data
@ConfigurationProperties(prefix = "ai.llm")
public class LlmProperties {
    /** 当前激活的 profile：deepseek-v4 | minimax */
    private String profile;
}
```

> [!note] LlmProperties 仅承载 profile 名
> 它不持有 apiKey / baseUrl 等共享字段——这些字段在不同 profile 下值不同，强行放进 LlmProperties 会让 profile 切换变成"切换 profile + 同步改 apiKey"两步。让每个 profile 维护自己的 Properties，profile 切换==仅==改 `ai.llm.profile` 一行即可（前提 yml 中两个 profile 的完整配置都已就位）。

#### 5.3.3 `DeepSeekV4Config`

```java
package com.zoufx.ai.agent.llm.config;

@Slf4j
@Configuration
@RequiredArgsConstructor
@EnableConfigurationProperties(DeepSeekV4Properties.class)
@ConditionalOnProperty(name = "ai.llm.profile", havingValue = "deepseek-v4")
public class DeepSeekV4Config {

    private final DeepSeekV4Properties props;

    @Bean
    public StreamingChatModel chatModel() {
        String model = props.getChat().getModel();
        log.info("Creating chatModel [deepseek-v4] baseUrl={} model={}",
                props.getBaseUrl(), model);
        return OpenAiStreamingChatModel.builder()
                .apiKey(props.getApiKey())
                .baseUrl(props.getBaseUrl())
                .modelName(model)
                .maxTokens(props.getChat().getMaxTokens())
                .timeout(props.getTimeout())
                .returnThinking(true)
                .sendThinking(true)
                .logRequests(true)
                .logResponses(true)
                .build();
    }

    @Bean
    public LlmCapabilities llmCapabilities() {
        // capability 值的语义见 chat/api/LlmCapabilities javadoc
        return new LlmCapabilities("deepseek-v4", false, false, false);
    }
}
```

#### 5.3.4 `MinimaxConfig`

```java
package com.zoufx.ai.agent.llm.config;

@Slf4j
@Configuration
@RequiredArgsConstructor
@EnableConfigurationProperties(MinimaxProperties.class)
@ConditionalOnProperty(name = "ai.llm.profile", havingValue = "minimax")
public class MinimaxConfig {

    private final MinimaxProperties props;

    @Bean
    public StreamingChatModel chatModel() {
        String model = props.getChat().getModel();
        log.info("Creating chatModel [minimax] baseUrl={} model={}",
                props.getBaseUrl(), model);
        return AnthropicStreamingChatModel.builder()
                .apiKey(props.getApiKey())
                .baseUrl(props.getBaseUrl())
                .modelName(model)
                .maxTokens(props.getChat().getMaxTokens())
                .timeout(props.getTimeout())
                // thinking 默认开启（per-call 可覆盖，见改造 A 4.3.3）
                .thinkingType("enabled")
                .thinkingBudgetTokens(props.getThinking().getBudgetTokens())
                .logRequests(true)
                .logResponses(true)
                .build();
    }

    @Bean
    public LlmCapabilities llmCapabilities() {
        // ⚠ 降级方案：thinkingToggle / thinkingBudget 暂定为 false
        // LC4J 1.13.1 langchain4j-anthropic 未提供 per-call thinking 覆盖能力（参见 3.2 节 warning）
        // 等上游放出 AnthropicChatRequestParameters 后改回 true, true
        return new LlmCapabilities("minimax", false, false, false);
    }
}
```

> [!info] LC4J 1.13.1 Anthropic builder API 已 spike 验证
> `.thinkingType(String)` / `.thinkingBudgetTokens(Integer)` / `.returnThinking(Boolean)` / `.sendThinking(Boolean)` 在 LC4J 1.13.1 `AnthropicStreamingChatModel.Builder` 上**全部存在**（spike 阶段 javap 已确认）。但通用 `ChatRequestParameters` 接口字段不含 thinking，==不能 per-call 覆盖==，仅 builder 期固定。

### 5.4 配置

#### 5.4.1 `application.yml`（提交）

仅保留==结构 + 非敏感默认值==。两个 profile 都列出，profile 切换只改 `ai.llm.profile` 一行：

```yaml
ai:
  llm:
    profile: deepseek-v4      # deepseek-v4 | minimax
    deepseek-v4:
      chat:
        model: deepseek-v4-pro     # 或 deepseek-v4-flash
        max-tokens: 8192
      timeout: 120s
      # api-key / base-url 由 application-local.yml 覆盖
    minimax:
      chat:
        model: MiniMax-M2          # 实际模型名以 MiniMax 文档为准
        max-tokens: 8192
      timeout: 120s
      thinking:
        budget-tokens: 8000
      # api-key / base-url 由 application-local.yml 覆盖
```

#### 5.4.2 `application-local.yml`（不提交，同步迁移）

==敏感配置==从原 `ai.openai.*` 命名空间迁到 `ai.llm.deepseek-v4.*`；新增 `ai.llm.minimax.*` 段：

```yaml
ai:
  llm:
    deepseek-v4:
      api-key: sk-xxxxxxxxxxxx
      base-url: https://api.deepseek.com
    minimax:
      api-key: xxxxxxxxxxxx
      base-url: https://api.minimaxi.com         # 实际地址以 MiniMax Anthropic 兼容端点文档为准
```

> [!warning] application-local.yml 不上 git
> 这部分变更==只在本地维护==，CI / 协作者各自维护自己的 local。提交时若误添加，CI 检查 / git ignore 应阻止。

### 5.5 验证

#### Profile 切换

1. yml 设 `ai.llm.profile: deepseek-v4`，启动后端
2. ✅ 启动日志包含 `Creating chatModel [deepseek-v4] ...`
3. ✅ 启动日志==不==包含 `Creating chatModel [minimax] ...`
4. ✅ GET `/ai/capabilities` 返回 `thinkingToggle: false`

切换：

5. yml 改为 `ai.llm.profile: minimax`，重启
6. ✅ 启动日志包含 `Creating chatModel [minimax] ...`
7. ✅ 启动日志==不==包含 `Creating chatModel [deepseek-v4] ...`
8. ✅ GET `/ai/capabilities` 返回 `thinkingToggle: true`

#### Properties 绑定

1. 故意把 `ai.llm.deepseek-v4.api-key` 设为空字符串
2. ✅ profile=deepseek-v4 启动时报错（apiKey 缺失），fail-fast
3. 同样对 minimax 验证

---

## 六、改造 C：`LlmCapabilities` Bean + `GET /ai/capabilities` 接口

### 6.1 理念

==capability 是前后端解耦的中间契约==。前端 UI 行为不应硬编码 profile 字符串判断，而应读取 capability 标志位决定。

设计原则：

- capability ==per profile 静态声明==，不随对话动态变化（不像 health 那样是状态）
- 前端==启动时拉一次缓存==，profile 切换需要重启（与后端联动）
- 后端==仅一个 Bean==——profile 切换时由 @ConditionalOnProperty 路由到对应 ModelConfig 中的声明

### 6.2 数据库改动

==无==。

### 6.3 代码改动

#### 6.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `chat/api/LlmCapabilities.java` | 不可变 record，由各 ModelConfig 装配；与 `PromptSection` 同位置（chat/api 承载对外契约 / DTO） |
| `chat/controller/ChatController.java`（现有类追加） | 在原 `POST /ai/chat` + `DELETE /memory` 基础上，**追加 `GET /ai/capabilities`** 端点 + 注入 `LlmCapabilities` 字段；不新增独立 Controller 文件，HTTP 适配层职责整体由 `ChatController` 承担 |

> [!note] capability 代码归属为什么放 chat 而不是 llm
> 虽然 `LlmCapabilities` 内容描述的是 LLM 能力，但==使用方==是 chat 模块（ChatController 透传、未来 ChatAssistant 调用前检查），且对外暴露的 HTTP 端点 `/ai/capabilities` 与 `/ai/chat` 是同一接入面。放在 chat/api + chat/controller 让"前端能看到的接口契约"全部集中在 chat 包内，减少跨包跳读。llm 包专注模型装配（builder 期），chat 包负责对外协商与编排（请求期）。

```java
package com.zoufx.ai.agent.chat.api;

/**
 * LLM 能力声明 —— 当前激活 profile 能做什么、不能做什么。
 *
 * 前端启动时 GET /ai/capabilities 拉一次缓存；profile 切换需要重启。
 *
 * @param profile 当前激活的 profile 名（如 "deepseek-v4" / "minimax"）
 * @param thinkingToggle 是否支持 thinking 开/关（false = LLM always-on 或不支持思考；
 *                       true = 可通过请求参数控制本轮是否思考）
 * @param thinkingBudget 是否支持 thinking 预算调节（false = 不可控；true = 可通过参数控制）
 * @param reasoningEffort 是否支持 reasoning_effort 档位（low/medium/high）
 */
public record LlmCapabilities(
        String profile,
        boolean thinkingToggle,
        boolean thinkingBudget,
        boolean reasoningEffort
) {}
```

在现有 [ChatController](src/main/java/com/zoufx/ai/agent/chat/controller/ChatController.java) 上追加（不新建独立 Controller，HTTP 适配层职责集中在一处）：

```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/ai")
public class ChatController {

    private final ChatService chatService;
    private final LlmCapabilities capabilities;   // ← 新增字段

    // ... 原 POST /chat、DELETE /user/{userId}/memory ...

    @GetMapping("/capabilities")                   // ← 新增端点
    public LlmCapabilities capabilities() {
        return capabilities;
    }
}
```

### 6.4 配置

无新增 yml。

### 6.5 验证

#### 接口可用

1. profile=deepseek-v4 启动
2. `curl http://localhost:8080/ai/capabilities`
3. ✅ 返回 `{"profile":"deepseek-v4","thinkingToggle":false,"thinkingBudget":false,"reasoningEffort":false}`

切换：

4. 改 profile=minimax 重启
5. ✅ 返回 `{"profile":"minimax","thinkingToggle":true,"thinkingBudget":true,"reasoningEffort":false}`

#### Bean 唯一性

1. 启动后查 Spring ApplicationContext 中 `LlmCapabilities` 类型 Bean 数量
2. ✅ 仅 1 个（@ConditionalOnProperty 保证另一份未装配）

---

## 七、改造 D：前端"思考一下"→"思考"按钮重命名 + capability 自适应

### 7.1 理念

按钮的新设计核心是==让 UI 行为依据后端真实能力自适应==，==而非==让 UI 假装总能控制 LLM。

**旧设计**（v0.13）：

- 按钮文案"思考一下"
- 按钮状态由前端 store 维护（thinking: boolean）
- 发请求时把 thinking 字段透传给后端
- 后端按 thinking 字段路由到 thinkingAssistant / nonThinkingAssistant
- 问题：按钮在 deepseek-v4 下其实==没用==——LLM 永远 always-on 思考；后端的所谓"路由"实质只换了模型名字符串

**新设计**（v0.135）：

- 按钮文案"思考"（更中性，从动作触发改为开关状态）
- 前端启动时 `GET /ai/capabilities`，缓存 `thinkingToggle` 标志
- 按钮 ON/OFF 状态由前端 store 维护
- 渲染逻辑：仅当==后端推来 thinking 事件== AND ==按钮 ON==时显示思考块；其他情况丢弃
- 请求发送逻辑：
  - `thinkingToggle: true`（minimax）→ 发请求时带 `thinking: <buttonState>`
  - `thinkingToggle: false`（deepseek-v4）→ 不发 `thinking` 字段（或发了也无效，后端会忽略+warn log）

### 7.2 数据库改动

==无==（前端无 schema）。

### 7.3 前端代码改动

> [!note] 前端在独立仓库
> 前端在 `../ZoufxAIAgent-Web`，与后端同级。本节描述前端改动点，具体落地由独立 PR 跟进。

#### 7.3.1 新增

| 模块 | 用途 |
|---|---|
| `lib/api/capabilities.ts` | 封装 `GET /ai/capabilities` 调用；返回 typed `LlmCapabilities` |
| `store/capability.ts`（zustand） | 启动时拉一次 capability 并缓存到全局 store |

#### 7.3.2 修改

| 模块 | 改动 |
|---|---|
| 按钮组件（"思考一下"按钮所在文件） | 文案改"思考"；按钮 disabled 状态==不==因 capability 改变（始终可点）；点击行为按 capability 自适应 |
| chat 消息发送逻辑 | 发请求前读 capability：`thinkingToggle: true` 时带 `thinking: <state>`，否则不带 |
| SSE 事件处理器 | thinking 事件渲染前先判断按钮状态：ON 渲染，OFF 丢弃；==不变==的是 SSE 事件协议本身（后端始终推 thinking 事件，前端是唯一过滤点） |
| 启动钩子（_app.tsx 或 layout.tsx） | 应用启动时调用 capability fetcher |

### 7.4 验证

#### deepseek-v4 profile

1. 后端 `profile=deepseek-v4`，启动
2. 前端启动，浏览器 DevTools Network 看到 `/ai/capabilities` 请求返回 `thinkingToggle: false`
3. ✅ "思考"按钮可点击
4. ✅ 按钮 ON 时：发条消息 → 前端展示思考块 + 回复
5. ✅ 按钮 OFF 时：发条消息 → 前端==不==展示思考块，但有回复（后端日志仍能看到 LLM 出了 reasoning_content）
6. ✅ Network 看请求体==不含== `thinking` 字段（或含也无效）

#### minimax profile

7. 后端 `profile=minimax`，重启
8. 前端刷新，capability 返回 `thinkingToggle: true`
9. ✅ 按钮 ON 时：请求体含 `thinking: true`；前端展示思考块 + 回复；后端日志可见 LLM 真做了思考（reasoning_tokens > 0 / thinking blocks 非空）
10. ✅ 按钮 OFF 时：请求体含 `thinking: false`；前端==不==展示思考块；后端日志可见 LLM 跳过思考（reasoning_tokens = 0 / thinking blocks 空）

#### 容错

11. 模拟前端 bug：profile=deepseek-v4 时硬塞 `thinking: true` 到请求体
12. ✅ 后端 ChatController 静默忽略 + 输出 warn log（不报 400）
13. ✅ 对话继续正常完成

---

## 八、CLAUDE.md / application.yml / application-local.yml 同步

### 8.1 `CLAUDE.md` 过时描述更新

文件：`e:\ZoufxDemo\ZoufxAIAgent\CLAUDE.md`

| 旧描述 | 新描述（v0.135 后） |
|---|---|
| "通过 Anthropic 兼容接口连接 MiniMax AI" | "支持 `deepseek-v4` / `minimax` 双 profile 切换：deepseek 走 OpenAI 兼容协议，minimax 走 Anthropic 兼容协议；profile 切换由 `ai.llm.profile` 驱动" |
| "`POST /ai/chat`（SSE）按 `thinking` 字段路由到两个 ChatAssistant Bean" | "`POST /ai/chat`（SSE）单一 ChatAssistant；`thinking` 字段语义为用户希望本轮 LLM 思考，profile 不支持时静默忽略" |
| 其他与双 Bean 相关的描述（如有） | 同步删除 |

新增段：

> ## LLM Profile 切换
>
> 当前激活 profile 由 `ai.llm.profile` 决定：
> - `deepseek-v4`：DeepSeek v4 hybrid 模型，always-on 自适应 reasoning，无 thinking 开关
> - `minimax`：MiniMax 模型，支持 thinking 开关 + 预算调节
>
> 前端通过 `GET /ai/capabilities` 拉取当前 profile 能力，UI 行为按 capability 自适应。

### 8.2 `application.yml` 完整结构

见 5.4.1 节。==删除==旧 `ai.openai.*` 命名空间；==新增==`ai.llm.profile` + `ai.llm.deepseek-v4.*` + `ai.llm.minimax.*` 三段。

### 8.3 `application-local.yml` 同步迁移

见 5.4.2 节。本地把原 `ai.openai.api-key` / `ai.openai.base-url` 迁到 `ai.llm.deepseek-v4.*`；新增 `ai.llm.minimax.*` 段。

### 8.4 `pom.xml` 版本号

`<version>0.13.0-SNAPSHOT</version>` → `<version>0.13.5-SNAPSHOT</version>`

---

## 九、施工顺序与自测

### 9.1 推荐施工顺序（编码时按此顺序减少中间不稳定时长）

1. ==Spike 验证==：先验证 LC4J 1.11.0 的 `AnthropicStreamingChatModel` builder 中 thinking 参数 API、以及 per-call thinking 透传机制（改造 A 4.3.3 / 改造 B 5.3.4 的标黄点）。如果 LC4J 1.11.0 不支持 per-call thinking 覆盖，按"降级方案"调整 capability 声明。
2. ==新增 Properties + Config==：DeepSeekV4* / Minimax* / LlmProperties / LlmCapabilities（不删旧代码，并存装配，但旧 OpenAiModelConfig 暂保留为不激活状态——通过临时去掉 `@Configuration` 或 `@ConditionalOnProperty` 加临时条件）
3. ==yml 迁移==：application.yml + application-local.yml 按 5.4 结构改造，profile=deepseek-v4 启动验证
4. ==capability 接口落地==：在 ChatController 追加 `GET /capabilities` 端点 + 自测 `curl /ai/capabilities`
5. ==合并 Assistant + 改造 ChatController==：删双 Bean 路由，单一 ChatAssistant，`thinking` 字段透传
6. ==删除旧 OpenAiModelConfig / OpenAiProperties==
7. ==前端按钮重命名 + capability 自适应逻辑==
8. ==CLAUDE.md 更新==
9. ==pom.xml 版本号更新==
10. ==清库重启 + 完整 /test 自测==

### 9.2 自测清单

- [ ] profile=deepseek-v4 下，按钮 ON / OFF 各发一条消息，对话正常
- [ ] profile=deepseek-v4 下，按钮 OFF 时前端==不显示==思考块；后端日志可见 reasoning_content
- [ ] profile=minimax 下，按钮 ON 时 LLM 真思考（reasoning_tokens > 0）
- [ ] profile=minimax 下，按钮 OFF 时 LLM 跳过思考（reasoning_tokens = 0 / thinking blocks 空）
- [ ] profile 切换：改 yml 一行 + 重启，capabilities 接口响应同步变化
- [ ] 多轮工具调用对话（含 Hot Memory 写入）在两个 profile 下均正常
- [ ] Memory / Recall / SOUL / Mood / Hot Memory 行为完全未退化（v0.13 已有功能不破坏）
- [ ] SSE 事件类型协议不变（thinking / content / tool_call / tool_result / error 五种）
- [ ] 容错：deepseek-v4 profile 下硬塞 `thinking:true` 到请求体，后端静默忽略 + warn log
- [ ] `/test` 全量跑过

### 9.3 风险与边界

| 风险 | 兜底 |
|---|---|
| ~~LC4J 的 Anthropic 模块不支持 per-call thinking 覆盖~~ | **已确认（编码 spike）**：LC4J 1.13.1 仍不支持。==已转正为降级方案==——见 3.2 节、3.4 节、5.3.4 节的相关说明。本次发版接受此约束。 |
| MiniMax 实际接口字段与 Claude 不一致（即使协议兼容） | 编码时实测验证：发个开 thinking 的请求，看返回是否含 thinking blocks。不一致则在 `MinimaxConfig` 中做适配（如自定义 HTTP header / 字段名映射），保持 capability 声明语义不变。 |
| 前端 capability 缓存过期（后端切 profile 但前端未刷新） | 静默忽略 + warn log 即可兜底，对话不中断；前端可加"每次启动时强制刷新 capability"机制；不做更复杂的实时 push。 |
| application-local.yml 误提交 | git ignore 检查 / pre-commit hook（已有则验证仍生效） |
| LC4J 1.11.0 → 1.13.1 升级引入回归 | 编码完成后跑 `/test` 全量自测；重点观察：SystemPrompt 注入、Hot Memory 工具调用、SSE 五种事件类型协议、Tavily 检索 |

---

## 附录 A：v0.135 修改文件清单速查

### 新增

```
src/main/java/com/zoufx/ai/agent/llm/
├─ config/
│  ├─ DeepSeekV4Config.java                   (替代 OpenAiModelConfig)
│  └─ MinimaxConfig.java                       (新)
└─ property/
   ├─ LlmProperties.java                       (新，仅承载 profile 名)
   ├─ DeepSeekV4Properties.java                (替代 OpenAiProperties)
   └─ MinimaxProperties.java                   (新)

src/main/java/com/zoufx/ai/agent/chat/
├─ api/
│  └─ LlmCapabilities.java                     (record，归 chat/api 与 PromptSection 同位)
└─ controller/
   └─ ChatController.java                      (现有类追加：注入 LlmCapabilities + 新增 GET /capabilities)
```

### 修改

```
src/main/resources/application.yml             (ai.openai.* → ai.llm.*)
src/main/resources/application-local.yml       (敏感配置同步迁移，不上 git)
src/main/java/.../chat/config/AssistantConfig.java   (双 Bean 合并)
src/main/java/.../web/controller/ChatController.java (删路由逻辑)
src/main/java/.../chat/api/ChatRequest.java          (thinking 字段语义重定义 + javadoc)
CLAUDE.md                                       (LLM Profile 段新增 + 过时描述更新)
pom.xml                                         (0.13.0 → 0.13.5)
```

### 删除

```
src/main/java/.../llm/config/OpenAiModelConfig.java       (命名误导 + 双 Bean)
src/main/java/.../llm/property/OpenAiProperties.java      (命名误导)
src/main/java/.../chat/config/ThinkingChatAssistant*      (与 NonThinking 合并；按现状识别)
src/main/java/.../chat/config/NonThinkingChatAssistant*   (同上)
```

### 前端（独立仓库 ZoufxAIAgent-Web）

```
新增：lib/api/capabilities.ts、store/capability.ts
修改：按钮组件文案 + 行为逻辑、chat 发送逻辑、SSE 处理器、应用启动钩子
```

---

## 附录 B：术语速查

| 术语 | 含义 |
|---|---|
| **profile** | 行为档位最小子集（如 `deepseek-v4` / `minimax`），不等于 protocol 也不等于具体模型 |
| **capability** | 当前激活 profile 的能力声明（thinkingToggle / thinkingBudget / reasoningEffort），通过 `GET /ai/capabilities` 暴露 |
| **thinkingToggle** | LLM 是否支持「本轮思考开/关」开关；false=always-on 或不支持思考；true=可控 |
| **thinkingBudget** | LLM 是否支持思考预算调节（token 上限） |
| **reasoningEffort** | LLM 是否支持 reasoning_effort 档位（OpenAI o-series 风格） |
| **single ChatAssistant** | v0.135 合并后的单一 ChatAssistant Bean，不再有 thinking / nonThinking 二分 |

---

## 附录 C：开放问题（编码 spike 后回填）

| # | 问题 | 状态 |
|---|---|---|
| 1 | LC4J 的 `AnthropicStreamingChatModel.builder()` 上 thinking 参数的实际 API 形态 | ✅ **已 spike**：`.thinkingType(String)` / `.thinkingBudgetTokens(Integer)` / `.returnThinking(Boolean)` / `.sendThinking(Boolean)` 在 1.13.1 builder 上均存在 |
| 2 | per-call thinking 覆盖机制 | ❌ **已 spike**：LC4J 1.13.1 langchain4j-anthropic 没有 `AnthropicChatRequestParameters` 子类，通用 `ChatRequestParameters` 字段不含 thinking。**走降级方案**——见 3.2 节、3.4 节、5.3.4 节 |
| 3 | LC4J 版本升级路径 | ✅ **已升级**：pom 中 `<langchain4j.version>1.13.1</langchain4j.version>` + tavily 对齐 `1.13.1-beta23` |
| 4 | MiniMax 的 Anthropic 兼容端点 base-url | ⏳ 编码时以 MiniMax 官方文档为准 |
| 5 | MiniMax 实际可用的模型 ID | ⏳ 编码时以 MiniMax 官方文档为准（占位 `MiniMax-M2`） |
