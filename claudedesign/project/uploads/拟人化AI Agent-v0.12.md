---
title: 拟人化 AI Agent —— v0.12：函数式模块架构 + 双层记忆 + SOUL 系统
tags:
  - AI
  - Agent
  - 拟人化
  - 架构设计
  - v0.12
  - 模块化
aliases:
  - ZoufxAIAgent v0.12 Architecture
  - Functional Module Architecture v0.12
---

> [!note] 文档定位
> v0.12 是 v0.1 基础上的**架构重构版本**——从按技术层组织的代码重构为按**业务域**组织的模块化架构。不改变核心功能，而是提升代码组织方式、提高可维护性与可扩展性。顶层设计与版本路线见 [[拟人化AI Agent-总设计方案]]；前置版本见 [[拟人化AI Agent-v0.1]]；后续计划见 [[拟人化AI Agent-v0.2]]。

> [!tip] 一句话定义
> 把 v0.1 的"**按技术层次堆砌**（config、service、controller 等）"升级为"==按业务域聚合==（chat、memory、soul、tool 等）"——每个模块独立完整，模块内部统一分层（api → config → impl/service → helper/processor），依赖关系清晰单向，新增功能时只需定位对应模块，无需跨层级修改。

> [!info] 文档结构说明
> 章节 一→二 是重构的背景与全景视图；章节 三 详细每个模块的设计与边界；章节 四→八 是架构决策、命名规范、依赖约束、配置外化的详细规范，与后续版本同款；章节 九→十一 是快速参考、文件树全景、版本历史；[[#十二、快速参考|快速参考章节]] 包含"添加新工具""添加新模块"的 copy-paste 模板。

> [!warning] 本版本对 v0.1 的改变范围
> v0.12 **只改架构，不改功能** —— 同样支持：
> - ✅ 流式聊天、多轮记忆、双层 Hot/Cold 记忆
> - ✅ 网络搜索（Tavily）、工具调用、会话检索
> - ✅ SOUL 人格系统、情绪处理（status + mood）
> - ✅ SystemPrompt 动态组装（Frozen Snapshot 约束保持）
> 
> ==调用方（Controller/前端）零感知——接口签名、返回值、HTTP 路由完全不变==。后续版本（v0.2 向量搜索、v0.3 多租户）的架构扩展都基于 v0.12 的模块边界进行。

---

## 一、重构背景与动机

### 问题陈述

在 v0.01～v0.1 版本中，代码按**技术层**组织（config/、properties/、service/、controller/）：

```
// v0.01～v0.1 的问题结构
src/main/java/com/zoufx/ai/agent/
├── config/             ← 所有配置混在一起（LLM、Memory、Soul、Tool）
├── properties/         ← 20+ 个 Properties 类，难以定位
├── service/            ← 业务逻辑分散，AIChatService 调 MemoryStore、SOUL、Tool
├── controller/         ← HTTP 端点混合各功能
├── model/              ← ChatEvent、ColdMemoryEntry 等混在一起
└── ...其他层级        ← Memory 实现、Tool 实现也跟随服务文件夹组织
```

导致的问题：
- **低内聚**：同一业务功能的代码散落在 4～5 个目录
- **高耦合**：添加新功能（如新工具）需要跨多个层级编辑文件
- **模块边界不清**：不知道 Memory / Tool / Soul 各自的责任边界
- **扩展困难**：v0.2 想加向量搜索时，无法独立编辑一个"search 模块"，只能继续拆散在 config/service 中

### 设计目标

重构为**函数式模块架构**（Functional Module Architecture），按**业务域**划分：

| 目标 | 实现方式 |
|-----|---------|
| **高内聚** | 同一模块内聚焦单一业务职责（chat、memory、soul、tool） |
| **低耦合** | 模块间通过接口依赖，单向无循环 |
| **可扩展** | 新模块可独立开发/测试/部署，无需修改既有模块 |
| **易维护** | 业务变更时定位对应模块，不跨层级修改 |

---

## 二、模块结构全景

### 2.1 顶级模块划分

```
src/main/java/com/zoufx/ai/agent/
├── ZoufxAIAgentApplication.java        应用入口
│
├── base/                               Web 基础设施层（跨模块共享）
│   ├── config/                         CORS、编码、过滤器等
│   └── exception/                      全局异常处理
│
├── llm/                                LLM 模型配置与管理（支持多协议）
│   ├── config/                         Anthropic / OpenAI 配置
│   └── property/                       模型参数外化
│
├── chat/                               聊天与对话编排（核心流程）
│   ├── api/                            ChatAssistant 接口（LC4J 契约）
│   ├── config/                         AssistantConfig、SystemPromptComposer
│   ├── service/                        AIChatService（流编排）
│   ├── controller/                     HTTP /ai/chat 端点（SSE）
│   ├── processor/                      MoodEventProcessor（有状态流处理）
│   ├── helper/                         RetryPolicyHelper、WebSearchEventHelper
│   ├── model/                          ChatEvent、ChatRequest 数据模型
│   └── property/                       聊天相关配置（memory、mood、retry）
│
├── memory/                             会话记忆系统（Hot/Cold 双层）
│   ├── api/                            MemoryStore / HotMemoryStore / ColdMemoryStore 接口
│   ├── config/                         MemoryConfig、MemoryDataSourceConfig（HikariCP）
│   ├── controller/                     GET /user/{userId}/memory API
│   ├── impl/                           SQLite 实现（3 个 Store）
│   ├── model/                          ColdMemoryEntry 数据模型
│   └── property/                       db-path、maxMessages 配置
│
├── soul/                               AI 人格系统（自身定义）
│   ├── api/                            SoulStore 接口
│   ├── config/                         SoulConfig、种子初始化
│   ├── controller/                     GET/POST /soul 端点
│   ├── impl/                           SqliteSoulStore（SQLite 实现）
│   └── property/                       soul.enabled-keys、seed 配置
│
└── tool/                               工具执行框架
    ├── api/                            ToolPrompt 接口（工具说明）
    ├── config/                         TavilySearchConfig（网络搜索装配）
    ├── impl/                           TavilySearchTool、ColdMemorySearchTool、HotMemoryUpdateTool
    └── property/                       WebSearchProperties、TavilySearchProperties
```

### 2.2 模块内部统一结构

每个模块采用**内部分层模式**（从接口到实现）：

```
{module}/
├── api/                    📋 业务接口（契约定义）
│   └── {Feature}Store.java 或 {Feature}Service.java
│
├── config/                 ⚙️  Spring 装配与组件注册
│   └── {Module}Config.java
│
├── impl/ 或 service/       💼 核心业务逻辑实现
│   ├── {Class}Impl.java
│   └── Sqlite{Feature}Store.java
│
├── processor/ 或 helper/   🔧 流处理器 / 工具函数
│   ├── {Feature}Processor.java    （有状态）
│   └── {Feature}Helper.java       （无状态）
│
├── model/                  📦 数据模型与 DTO
│   └── {VO|DTO}.java
│
├── property/               🔐 配置属性（外化到 yml）
│   └── {Module}Properties.java
│
└── controller/             🌐 HTTP 端点（如有）
    └── {Module}Controller.java
```

**内部分层的好处**：
- 每一层职责单一清晰
- 新增功能在模块内扩展，不跨模块
- 与 v0.2、v0.3 版本保持一致的组织方式

---

## 三、各模块详细设计

### 3.1 BASE 模块 —— Web 基础设施

**职责**：提供跨模块的 Web 基础能力，与业务逻辑无关。

**结构**：
```
base/
├── config/
│   └── WebConfig.java              CORS、ContentNegotiation、错误映射等
└── exception/
    └── GlobalExceptionHandler.java  全局异常翻译（Bean Validation 400 等）
```

**设计原则**：
- 所有模块公用的 Web 配置集中在此
- 业务异常统一翻译为 HTTP 状态码（4xx 或 5xx）
- 反应式异常（`Mono.error()`）由 GlobalExceptionHandler 统一处理

---

### 3.2 CHAT 模块 —— 聊天编排核心

**职责**：聊天请求的完整生命周期（接收 → 组装 system prompt → LLM 流 → 响应 → 收集内存）。

**结构**：
```
chat/
├── api/
│   └── ChatAssistant.java              LC4J @AiService 动态代理接口
├── config/
│   ├── AssistantConfig.java            两套 ChatAssistant Bean（thinking/non-thinking）
│   └── SystemPromptComposer.java       **关键**：分层组装 system prompt
├── controller/
│   └── AIChatController.java           HTTP POST /ai/chat（SSE）+ 清空记忆
├── service/
│   └── AIChatService.java              **关键**：流编排主体
├── processor/
│   └── MoodEventProcessor.java         从 LLM content 剥离 <!--mood:KEYWORD-->
├── helper/
│   ├── RetryPolicyHelper.java          判断异常是否可重试
│   └── WebSearchEventHelper.java       构造 tool_call / tool_result SSE 事件
├── model/
│   ├── ChatEvent.java                  SSE 事件 DTO（type: thinking|content|tool_call|...）
│   ├── ChatEventMapper.java            ChatEvent → ServerSentEvent 转换
│   └── ChatRequest.java                POST 请求体 + Bean Validation
└── property/
    ├── ChatMemoryProperties.java       滑窗消息条数限制等
    ├── MoodProperties.java             情绪系统开关与关键词
    └── RetryProperties.java            重试策略（最大次数、backoff 等）
```

**关键约束**：

> [!warning] SystemPromptComposer 的 Frozen Snapshot 约束
> - System prompt 在**请求开始时**由 LC4J 调用 `compose()` **一次且仅一次**
> - 响应流中**禁止重新调用** compose()，否则会破坏"Hot Memory 修改要到下次请求生效"的语义
> - 此约束保证了：用户提交 `update_hot_memory` → Hot Memory 更新 → 下一个请求时 system prompt 才看到新值
> - 详见 SystemPromptComposer 类注释的《Frozen Snapshot 约束（v0.1 显式化）》

> [!warning] MoodEventProcessor 的有状态生命周期
> - 每个 chat 请求 `new` 一个实例（不是单例）
> - 增量接收 token（`accept(token)`）→ 扫描 mood 标记 → emit 事件
> - 流末尾调用 `flush()` 清空尾部缓冲
> - 与 Helper 的区别：Helper 无状态、无生命周期，Processor 有两者

**反应式管道示意**（AIChatService.buildStream）：
```java
Flux.create(sink -> startTokenStream(...))
  .retryWhen(...)           // 首次 emit 前重试
  .doOnNext(event -> ...)   // 收集 assistant 文本
  .onErrorResume(...)       // 错误兜底为 error 事件
  .doOnComplete(() -> ...) // onStreamComplete Hook
  .doOnCancel(() -> ...)    // 客户端断开日志
```

---

### 3.3 LLM 模块 —— 模型配置与管理

**职责**：支持多个 LLM 提供商、模型参数的条件装配与动态切换。

**结构**：
```
llm/
├── config/
│   ├── AnthropicModelConfig.java       Anthropic 兼容接口（MiniMax）
│   └── OpenAiModelConfig.java          OpenAI 兼容接口（DeepSeek）
└── property/
    ├── AnthropicProperties.java        base-url、api-key、model、thinking budget
    └── OpenAiProperties.java           thinking-model vs non-thinking-model
```

**设计原则**：
- 所有模型配置外化到 `application.yml` 的 `ai.*` 前缀
- 通过 `ai.provider` 环境变量条件装配切换模型
- 两套 ModelConfig 都返回同类型 `StreamingChatModel`，上层（chat 模块）无感知
- 支持思考模式自动检测（thinking budget、max tokens 等）

---

### 3.4 MEMORY 模块 —— 会话记忆系统（核心）

**职责**：多层记忆的存储、检索、生命周期管理（Hot/Cold 双层 + 工作窗口）。

**结构**：
```
memory/
├── api/
│   ├── MemoryStore.java                工作记忆接口（LC4J ChatMemoryStore 载体）
│   ├── HotMemoryStore.java             热内存接口（结构化关键事实）
│   └── ColdMemoryStore.java            冷内存接口（经历流 append-only log）
├── config/
│   ├── MemoryConfig.java               MemoryStore Bean 注册
│   └── MemoryDataSourceConfig.java     SQLite DataSource / JdbcTemplate / TransactionTemplate 装配
├── controller/
│   └── MemoryController.java           GET /user/{userId}/memory/hot 等端点
├── impl/
│   ├── SqliteChatMemoryStore.java      MemoryStore SQLite 实现（双接口：LC4J + 业务）
│   ├── SqliteHotMemoryStore.java       HotMemoryStore SQLite 实现
│   └── SqliteColdMemoryStore.java      ColdMemoryStore SQLite + FTS5 实现
├── model/
│   └── ColdMemoryEntry.java            经历流单条记录 DTO
└── property/
    └── MemoryStoreProperties.java      db-path、maxMessages 等配置
```

**三层记忆设计**（Hermes 架构启发）：

| 层级 | 接口 | 实现 | 表 | 容量 | 写入 | 用途 |
|-----|------|------|-----|------|------|------|
| **工作** | `MemoryStore` | `SqliteChatMemoryStore` | chat_memory | 20 条滑窗 | 全量替换 | LC4J 当前对话上下文 |
| **热** | `HotMemoryStore` | `SqliteHotMemoryStore` | hot_memory | 无上限 | UPSERT | 结构化用户画像（称呼、职业、时区等） |
| **冷** | `ColdMemoryStore` | `SqliteColdMemoryStore` | cold_memory | 无上限 | 只追加 | 长期经历档案（FTS5 全文搜索） |

**关键约束**：

> [!warning] 同步 vs 反应式的分界
> - `MemoryStore.isEmpty()` 必须**同步**（SystemPromptComposer 在 event loop 同步调用）
> - `HotMemoryStore.get()` / `.snapshot()` 也必须**同步**（SystemPromptComposer 依赖）
> - `ColdMemoryStore` 所有方法都是反应式，调用方在 event loop 或 LC4J 工具线程
> - 违反此约束会导致 event loop 阻塞、请求时间翻倍

> [!warning] FTS5 中文分词处理
> - SQLite FTS5 的 unicode61 tokenizer 会把连续 CJK 文本视作单 token，导致子串查询失效
> - **解决方案**：Java 侧按 codepoint 拆分写入（"美式咖啡" → "美 式 咖 啡"），查询时同样拆分
> - 效果：`SELECT * FROM cold_memory WHERE content MATCH '咖啡'` 就能正确命中

**HikariCP 连接池配置**（MemoryDataSourceConfig）：
```java
cfg.setMaximumPoolSize(5);              // SQLite 单写并发限制，保守值
cfg.setConnectionInitSql("PRAGMA journal_mode=WAL");  // 每个连接自动启用 WAL
```

---

### 3.5 SOUL 模块 —— AI 人格系统

**职责**：定义 AI 自身的人格、风格、原则、禁忌，并注入 system prompt。

**结构**：
```
soul/
├── api/
│   └── SoulStore.java                  存取接口（get / snapshot / set）
├── config/
│   └── SoulConfig.java                 Bean 注册 + 种子初始化
├── controller/
│   └── SoulController.java             GET /soul 查看 + POST /soul 编辑
├── impl/
│   └── SqliteSoulStore.java            SQLite 实现（单全局实例）
└── property/
    └── SoulProperties.java             enabled-keys + seed 配置
```

**设计要点**：
- SOUL 数据库表无 user_id（全局单例，不分用户）
- 与 MemoryStore / HotMemoryStore 用同一个 HikariCP DataSource
- 也遵循 **Frozen Snapshot 约束**（system prompt 请求开始读一次）
- 种子数据仅在首启动时写入（已有数据不覆盖），支持后续手动编辑或 API 更新

---

### 3.6 TOOL 模块 —— 工具执行框架

**职责**：为 LLM 提供外部工具集成（网络搜索、会话检索、用户画像更新）。

**结构**：
```
tool/
├── api/
│   └── ToolPrompt.java                 工具说明聚合接口
├── config/
│   └── TavilySearchConfig.java         网络搜索工具条件装配
├── impl/
│   ├── TavilySearchTool.java           @Tool 网络检索（Tavily API）
│   ├── ColdMemorySearchTool.java          @Tool 经历流全文检索（FTS5）
│   └── HotMemoryUpdateTool.java            @Tool 用户画像 UPSERT
└── property/
    ├── WebSearchProperties.java        高层配置（enabled、type: tavily）
    └── TavilySearchProperties.java     Tavily 专有配置（apiKey、searchDepth 等）
```

**工具设计原则**：
- 所有 `@Tool` 方法在 LC4J 框架线程同步调用（不在 event loop），可安全 `.block()` 桥接反应式 API
- 工具说明统一通过 `ToolPrompt` Bean 聚合到 SystemPromptComposer
- 工具缺失优雅降级（如 apiKey 为空时），不阻断应用启动

**多引擎搜索配置架构**（为 v0.2 留口子）：
```yaml
ai:
  web-search:                  # 高层配置
    enabled: true
    type: tavily               # 标记使用哪个引擎
  web-search:                  # 引擎特定配置
    tavily:
      api-key: ${TAVILY_API_KEY:}
      search-depth: basic
      include-answer: true
      max-results: 5
```

条件装配示意：
```java
@ConditionalOnProperty(prefix = "ai.web-search", name = "type", havingValue = "tavily")
public TavilySearchTool tavilySearchTool(...) { ... }
```

---

## 四、命名规范总结

### 4.1 包名与类名约定

| 层级 | 包名 | 类名模式 | 示例 |
|-----|------|---------|------|
| **接口** | `api/` | `{Feature}` 或 `{Feature}Store` | `ChatAssistant`, `MemoryStore` |
| **装配** | `config/` | `{Module}Config` 或 `{Feature}Config` | `AssistantConfig`, `TavilySearchConfig` |
| **实现** | `impl/` | `{Feature}Impl` 或 `Sqlite{Feature}Store` | `SqliteColdMemoryStore` |
| **业务** | `service/` | `{Feature}Service` | `AIChatService` |
| **流处理** | `processor/` | `{Feature}Processor` | `MoodEventProcessor` |
| **工具函数** | `helper/` | `{Feature}Helper` | `RetryPolicyHelper` |
| **数据模型** | `model/` | `{VO\|DTO}` 或 `{Feature}Event` | `ChatEvent`, `ColdMemoryEntry` |
| **配置属性** | `property/` | `{Module}Properties` | `MoodProperties` |
| **HTTP 端点** | `controller/` | `{Feature}Controller` | `AIChatController` |

### 4.2 Hot/Cold 内存命名体系

```
MemoryStore        工作记忆       （短期滑窗，LC4J ChatMemory 载体，20 条）
↓
HotMemoryStore     热内存         （结构化关键事实，hot_memory，无上限）
ColdMemoryStore    冷内存         （经历流 append-only event log，FTS5 搜索）
  ↳ ColdMemoryEntry  单条记录 DTO
```

**为何不统一叫 XXXStore**：
- `MemoryStore` = 工作窗口，需要 LC4J 承载，生命周期与 ChatMemory 耦合，特殊性强
- `HotMemoryStore` / `ColdMemoryStore` = 记忆系统的两个侧面，需要区分职责与调用方式

---

## 五、依赖流向与架构约束

### 5.1 允许的依赖关系

```
┌──────────────────────────────┐
│        base/                 │  ← 所有模块依赖（Web 基础设施）
│  （CORS、异常处理等）         │
└──────────────────────────────┘

┌──────────────────────────────┐
│        llm/                  │  ← chat 依赖（模型配置）
│   （Anthropic、OpenAI）       │
└──────────────────────────────┘
         ↑
       chat/  ← memory、soul、tool 依赖（编排核心）
   （聊天主体）

memory/ ↔ soul/ ↔ tool/    （平级，可互相调用）
```

### 5.2 禁止的依赖关系

❌ `chat → tool` 直接调用工具业务逻辑  
✅ `chat → tool.api` 依赖工具接口，LC4J 自动注入

❌ 循环依赖（如 `memory → tool → memory`）  
✅ 单向流向（通过事件或接口解耦）

---

## 六、关键技术决策

### 6.1 为什么分离 Processor 和 Helper

| 特征 | Helper | Processor |
|-----|--------|-----------|
| **有状态** | ❌ 否 | ✅ 是（buffer、游标等） |
| **生命周期** | ❌ 无 | ✅ 有（init → process → flush） |
| **调用频率** | 按需（少）| 增量反复（多，如每个 token） |
| **实例化** | 静态或单例 | 每个请求 new 一个 |
| **示例** | `RetryPolicyHelper` | `MoodEventProcessor` |

### 6.2 为什么 MemoryStore 保留对 LC4J 的双接口

```java
public class SqliteChatMemoryStore 
    implements ChatMemoryStore,  // LC4J 接口
               MemoryStore       // 业务接口
```

**原因**：
- LC4J ChatMemory 通过反射探测 `ChatMemoryStore`，绑定到同一实例
- 业务接口 `MemoryStore` 是窄接口，面向应用逻辑
- 双接口允许 LC4J 和业务代码共享同一数据通路，避免重复查询

### 6.3 为什么 SystemPromptComposer 在 config 不在 processor

| 角度 | SystemPromptComposer | MoodEventProcessor |
|-----|-------------------|-----------------|
| **职责** | 决策/组装 | 流转换/处理 |
| **状态来源** | 外部注入（无生命周期） | 内部维护（有生命周期） |
| **调用方式** | 同步一次 | 异步多次 |
| **所属层级** | 配置/装配层 | 处理层 |

---

## 七、配置外化规范

### 7.1 命名空间划分

```yaml
spring:
  ai:                              # spring.ai.* 保留给 Spring AI
    anthropic:
      api-key: ...

ai:                                # ai.* 项目自定义（ ZoufxAIAgent 专用）
  provider: openai                 # 全局开关（anthropic / openai）
  memory:
    max-messages: 20               # 滑窗消息条数
    store:
      db-path: ./data/zoufx-ai.db  # SQLite 文件路径
  web-search:                      # 网络搜索（High Level）
    enabled: true
    type: tavily                   # 引擎类型（为多引擎留口子）
    tavily:                        # Tavily 专有配置
      api-key: ${TAVILY_API_KEY:}
      search-depth: basic
      include-answer: true
      max-results: 5
      timeout: 20s
  mood:
    enabled: true
    tail-buffer-size: 20           # MoodEventProcessor 尾部缓冲
    keywords: [好奇, 温和, ...]    # 情绪关键词列表
  soul:
    enabled-keys: [name, tone, ...] # 启用哪些 SOUL 字段 + 注入顺序
    seed:                          # 初始 SOUL 值
      name: "Zoufx"
      tone: "友好且专业"
```

### 7.2 配置属性类放置原则

- `ai.{feature}.xxx` → `{module}.property.{Feature}Properties`
- 嵌套配置也用类来承载（避免 `Map<String,Object>`）
- Properties 类结构与 `application.yml` 对应

---

## 八、关键约束汇总

> [!danger] 线程安全约束（必读）
> - ✅ `MemoryStore.isEmpty()` 必须同步（SystemPromptComposer 在 event loop 调用）
> - ✅ `HotMemoryStore.get()` / `.snapshot()` 必须同步
> - ✅ `ColdMemoryStore` 所有方法反应式（调用方在 event loop）
> - ❌ 违反此约束会导致 event loop 阻塞、响应时间 2～3 倍增长

> [!warning] Frozen Snapshot 约束（SystemPromptComposer）
> - System prompt 请求开始时调用一次
> - 流中禁止重新调用，否则 Hot Memory 更新语义丢失
> - 影响：用户提交 `update_hot_memory` → 下一请求才生效

> [!info] HikariCP 连接池约束
> - Pool size = 5（SQLite 单写并发限制）
> - WAL 模式（由 connectionInitSql 注入）
> - 若出现 "database is locked"，检查：
>   1. 是否有同步调用在 event loop
>   2. 是否有长事务（>1s）未提交

---

## 九、测试与验证

### 9.1 本版本验证结果

✅ **功能测试**（11/14 用例通过）：
- 流式聊天、多轮记忆、网络搜索、工具调用、SSE 事件处理
- 配置加载、特殊字符处理、长输入耐受

⚠️ **已知非关键异常**：
- thinking 模式前端 UI 视觉待同步（后端配置已完善）
- 空 prompt 缺少前端验证提示

### 9.2 自测清单（后续开发参考）

```bash
# 编译验证
mvn clean compile

# 应用启动
mvn spring-boot:run

# 功能测试
- [ ] POST /ai/chat，观察 SSE 事件序列（thinking / content / tool_call / error）
- [ ] 多轮对话，检查会话记忆是否持久化
- [ ] 工具调用（搜索），验证 tool_call + tool_result 事件
- [ ] 浏览器 console，确认无 JavaScript 错误
- [ ] 后端日志，确认无异常堆栈

# 模块边界验证
- [ ] chat 模块可独立编译（移除 tool 依赖后）
- [ ] memory 模块的三层记忆工作正常（isEmpty / get / append）
- [ ] soul 模块的 seed 初始化成功
```

---

## 十、后续版本规划建议

### v0.12.1（微调）

**小范围优化**（不涉及架构）：
- [ ] 添加更多单元测试（Helper / Processor）
- [ ] 文档同步（README per module）
- [ ] 性能基准（响应时间 P50 / P99）

### v1.3（功能增强）

**功能补完**：
- [ ] 前端 thinking UI 实现与同步（后端数据已完善）
- [ ] 空 prompt 客户端验证
- [ ] 用户画像侧边栏展示

### v2.0（重大升级）

**模块扩展与引擎升级**：
- [ ] 多引擎搜索（Google Search、Bing 等）
  - 新增 `GoogleSearchConfig`、`GoogleSearchProperties`
  - 复用 `ai.web-search.type` 架构
  
- [ ] 向量检索模块（`vector/` 新模块）
  - 取代 FTS5，支持语义搜索
  - 与 v0.12 的 ColdMemoryStore 并存（Hybrid Recall）

- [ ] Consolidation Engine（记忆压缩/提炼）
  - 新增 `consolidation/` 模块
  - 定期将旧 ColdMemoryEntry 合并为 HotMemoryStore 结构化事实

**架构演进**：
- [ ] 事件驱动（Spring Events 或 Kafka）
  - 解耦 memory → tool 的强依赖
  - 工具执行完成后发事件，memory 订阅更新
  
- [ ] 缓存层（Redis）
  - System prompt 预热缓存
  - HotMemoryStore 的本地 Caffeine 缓存

### v3.0（多租户与权限）

**企业化升级**：
- [ ] 多租户支持（workspaceId 分组）
- [ ] RBAC 权限模型
- [ ] 分布式部署（多机 + 消息队列）

---

## 十一、快速参考

### 快速添加新工具

```java
// 1. 新建工具实现类（tool/impl/）
@Component
public class GoogleSearchTool implements ToolPrompt {
    @Tool("搜索 Google") 
    public String search(@ToolMemoryId String userId, @P("query") String q) { 
        // 工具逻辑
        return "...";
    }
    
    @Override 
    public String section() { 
        return "google_search";  // 在 system prompt 中的 section 名
    }
    
    @Override 
    public String promptInstructions() { 
        return "使用 Google 搜索...";
    }
}

// 2. 在 AssistantConfig 中注册
@Bean
public AiServices assistant(..., GoogleSearchTool googleSearchTool, ...) {
    return AiServices.builder(...)
        .tools(tavilySearchTool, coldMemorySearchTool, hotMemoryUpdateTool, googleSearchTool)
        .build();
}

// 3. application.yml 无需改动（ToolPrompt Bean 自动聚合）
```

### 快速添加新模块

```
新建模块 {module}/
├── api/
│   └── {Feature}Store.java           接口定义
├── config/
│   └── {Module}Config.java           Bean 装配
├── impl/
│   └── {Feature}Impl.java            实现
├── property/
│   └── {Module}Properties.java       配置属性
└── model/
    └── {DTO}.java                    数据模型

关键注意事项：
1. 新模块依赖关系单向（不循环）
2. 业务接口放 api/，实现放 impl/
3. Properties 配置项对应 application.yml 的 ai.{feature}.*
4. 在 CLAUDE.md 更新项目约束（如有新线程模型）
5. 在 tech-stack 更新技术选型（如用了新库）
6. 更新本文档的【依赖流向】和【文件树】章节
```

---

## 十二、文件树全景（v0.12 最终状态）

```
src/main/java/com/zoufx/ai/agent/
├── ZoufxAIAgentApplication.java
├── base/
│   ├── config/
│   │   └── WebConfig.java
│   └── exception/
│       └── GlobalExceptionHandler.java
├── chat/
│   ├── api/
│   │   └── ChatAssistant.java
│   ├── config/
│   │   ├── AssistantConfig.java
│   │   └── SystemPromptComposer.java
│   ├── controller/
│   │   └── AIChatController.java
│   ├── service/
│   │   └── AIChatService.java
│   ├── processor/
│   │   └── MoodEventProcessor.java
│   ├── helper/
│   │   ├── RetryPolicyHelper.java
│   │   └── WebSearchEventHelper.java
│   ├── model/
│   │   ├── ChatEvent.java
│   │   ├── ChatEventMapper.java
│   │   └── ChatRequest.java
│   └── property/
│       ├── ChatMemoryProperties.java
│       ├── MoodProperties.java
│       └── RetryProperties.java
├── llm/
│   ├── config/
│   │   ├── AnthropicModelConfig.java
│   │   └── OpenAiModelConfig.java
│   └── property/
│       ├── AnthropicProperties.java
│       └── OpenAiProperties.java
├── memory/
│   ├── api/
│   │   ├── MemoryStore.java
│   │   ├── ColdMemoryStore.java
│   │   └── HotMemoryStore.java
│   ├── config/
│   │   ├── MemoryConfig.java
│   │   └── MemoryDataSourceConfig.java
│   ├── controller/
│   │   └── MemoryController.java
│   ├── impl/
│   │   ├── SqliteChatMemoryStore.java
│   │   ├── SqliteColdMemoryStore.java
│   │   └── SqliteHotMemoryStore.java
│   ├── model/
│   │   └── ColdMemoryEntry.java
│   └── property/
│       └── MemoryStoreProperties.java
├── soul/
│   ├── api/
│   │   └── SoulStore.java
│   ├── config/
│   │   └── SoulConfig.java
│   ├── controller/
│   │   └── SoulController.java
│   ├── impl/
│   │   └── SqliteSoulStore.java
│   └── property/
│       └── SoulProperties.java
└── tool/
    ├── api/
    │   └── ToolPrompt.java
    ├── config/
    │   └── TavilySearchConfig.java
    ├── impl/
    │   ├── TavilySearchTool.java
    │   ├── ColdMemorySearchTool.java
    │   └── HotMemoryUpdateTool.java
    └── property/
        ├── WebSearchProperties.java
        └── TavilySearchProperties.java

（共 43 个 Java 文件）
```

---

## 十三、相关链接与引用

- **[[CLAUDE.md]]**：项目开发约束、线程模型、已知瓶颈
- **[[tech-stack skill]]**：后端技术选型备忘（LangChain4J、Spring WebFlux 等）
- **[[拟人化AI Agent-v0.1]]**：前一版本架构（功能设计）
- **[[拟人化AI Agent-v0.11]]**：情绪系统与 UserProfile 扩展
- **[[拟人化AI Agent-总设计方案]]**：全版本路线图与顶层愿景

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v0.12 | 2026-05-19 | **架构重构**：从技术层到业务模块化；HikariCP 连接池集成；Hot/Cold 双层记忆完整落地 |
| v1.0 | 2026-05-18 | 初版：功能式模块架构概览 |
