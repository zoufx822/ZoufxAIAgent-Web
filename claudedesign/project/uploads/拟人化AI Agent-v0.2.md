---
title: 拟人化 AI Agent —— v0.2：Recall 引擎升级（向量 + Hybrid + 三维加权）
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.2
aliases:
  - Humanlike AI Agent v0.2 Plan
  - ZoufxAIAgent v0.2 实施
---

> [!note] 文档定位
> v0.2 详细实施方案。顶层架构与版本路线见 [[拟人化AI Agent-总设计方案]]；前置实现见 [[拟人化AI Agent-v0.1]] 与 [[拟人化AI Agent-v0.11]]。
> v0.2 完成后开 `拟人化AI Agent-v3.md`，本文档不预演 v0.3 内部细节。

> [!tip] 一句话定义
> 把 v0.1 单关键词 FTS5 召回升级为==向量 + 关键词 Hybrid 检索 + 三维加权==（Recency × Importance × Relevance）。这一步起，AI 不再只是"搜得到字面"——它能"按相关性 + 时近性 + 重要性"想起过去的事，向 Generative Agents 论文里的"类脑联想检索"靠拢一大步。

> [!warning] v0.2 范围在 v0.11 之后已收窄
> 原 v0.2 计划中的 ==UserProfile 多字段 / SOUL.md / 记忆暴露 API + 前端绑定== 三块已下放至 [[拟人化AI Agent-v0.11]] 实施。v0.2 当前==专注于 Recall 引擎升级与向量库装配==——把"信息层"留给 v0.11 补完，把"检索层"留给 v0.2 重做，是两期完全正交的拆分。

> [!info] 文档结构说明
> 章节 一→二→三 是 v0.2 的目标全景与术语对齐；章节 四~五 是按 ==功能/改造单元== 组织的实施细节，**每章内部统一为「理念 → 数据库改动 → 代码改动 → 配置 → 验证」结构**，与 v0.1 / v0.11 文档同款，方便实施时按章对照。

---

## 一、v0.1 / v0.11 遗留盘点与 v0.2 回应

v0.1 完成了"经历流 + 单字段 Hot + 关键词检索 + 三态身份分支"；v0.11 补完了"多字段 UserProfile + SOUL + 记忆 API + 双层情绪"。但==检索层的两个具体痛点==始终留到 v0.2：

| v0.1 / v0.11 遗留 | 表现 | v0.2 回应 |
|---|---|---|
| 召回只看字面 | LLM 搜 "编程语言" 找不到原文里的 "Java"，FTS5 关键词不识别语义 | **向量 + 关键词 Hybrid + 三维加权 Recall 引擎** |
| 召回顺序无优先级 | FTS5 rank 仅按 term 匹配密度排序，"昨天聊过" 和 "三个月前聊过" 同权 | **Recency × Importance × Relevance** 加权打分 |

> [!warning] v0.2 不做但 v0.3+ 会做
> ==Consolidation Engine / Cognitive Load / Reflection / Periodic Nudges== 是 v0.3 范畴；==Skills 三级渐进加载== 是 v4；==Artifact Generator== 是 v5；==Heartbeat 主动循环== 是 v6。
>
> v0.2 的边界是"==给 AI 灌入更准确的过去回忆=="，不做"主动行为"和"反思固化"。

---

## 二、v0.2 工作范围与本文档导航

### 2.1 v0.2 包含项（章节索引）

| 类型 | 编号 | 名称 | 主要解决 v0.1 / v0.11 哪个短板 | 详见章节 |
|---|---|---|---|---|
| 新增功能 | 功能1 | **Recall 引擎升级** | 关键词召回语义不准 / 无三维加权 | [[#四、功能1：Recall 引擎升级（向量 + Hybrid + 三维加权）\|第四章]] |
| 工程改造 | 改造A | **向量库 + Embedding 模型选型与装配** | 项目首次引入向量检索 | [[#五、工程改造A：向量库 + Embedding 模型选型与装配\|第五章]] |

### 2.2 v0.2 不做（留给后续版本）

- ❌ Consolidation Engine / 自反思 / Periodic Nudges（v0.3）
- ❌ Cognitive Load Tracker（v0.3）
- ❌ Skills System（v4）
- ❌ Artifact Generator（v5）
- ❌ Heartbeat 主动循环（v6）
- ❌ Importance 由 LLM 打分——v0.2 起步用规则评分（用户消息 / 含工具调用 / 提及姓名等加权），v0.3 再上 LLM 打分
- ❌ ==UserProfile 多字段 / SOUL / 记忆暴露 API== —— **已迁至 [[拟人化AI Agent-v0.11]]**
- ❌ ==UserImpression 内在维度 + significant-event / commitment 两个新 hot_memory type== —— **已迁至 [[拟人化AI Agent-v0.14|v0.14]]**（v0.2 不消费 hot_memory，不受影响）
- ❌ ==承诺履行状态追踪 / ImpressionCompleteness LLM 评分 / significant-event 多条 Consolidation== —— v0.14 留下的 v0.3 范畴，详见第十章"与 v0.3 的衔接"

> [!warning] 边界原则
> v0.2 单点打磨"检索层"——准确召回 + 加权排序——但==不动认知架构==（没有反思、没有主动行为），也==不再改 Hot/SOUL/前端==（这些 v0.11 已经做好）。这一层稳定了，v0.3 才有底气上 Consolidation 与 Reflection。

---

## 三、核心概念术语速查（先对齐再读后续）

v0.2 在 v0.1 / v0.11 基础上引入 ==Recall 引擎、Importance、Hybrid 检索== 等新概念。物理表 / 文件对应：

| 架构概念 | 物理实体 | v0.1 / v0.11 状态 | v0.2 状态 |
|---|---|---|---|
| Hot Memory | `user_profile`（KV） | v0.11：多字段（display_name / language / timezone / role / interests / tone） | **不变** |
| SOUL | `soul_profile`（KV） | v0.11：全局 KV + yml seed | **不变** |
| Cold Archive | `memory_stream` + `memory_stream_fts` | 原文 + 关键词索引 | 新增 `importance` 列 + 向量索引（vec sidecar） |
| 工作记忆（滑动窗口） | `chat_messages` | 不变 | 不变 |
| **Recall 引擎** | `RecallService`（新增服务层） | 无（直接 FTS5 单查） | **Hybrid 召回 + 三维加权**（Recency × Importance × Relevance） |
| **Embedding Index** | sidecar 表 / 外部向量库 | 无 | 与 Cold Archive 并存的语义索引 |

> [!warning] 最容易踩的认知坑
> - **Recall 不是"换个工具"**：是把 v0.1 的 `session_search` 升级为「先 Hybrid 召回，再三维加权排序」的完整流水线。`@Tool session_search` 仍然存在（LLM 入口），但内部走 RecallService 而不是直接 FTS5。
> - **Importance 不是 LLM 打分**：v0.2 用规则评分起步（避免每次写入都跑 LLM，成本太高且引入额外延迟）。v0.3 再考虑 LLM 评分。
> - **v0.2 不动 Hot / SOUL / 前端**：这些 v0.11 已经做好，v0.2 一行不动。即便 v0.11 的多字段 UserProfile 与 SOUL 注入需要消费 Recall 召回片段——那也是 v0.3 Consolidation 时机的事，==v0.2 阶段两者依然独立运行==。

### 3.1 三维加权打分公式

```
score = α · recency(now - created_at)
      + β · importance         # 0..1 归一化
      + γ · relevance          # cosine_sim(query_embedding, mem_embedding) ∈ [-1, 1] 截断到 [0, 1]
```

| 维度 | 计算 | v0.2 起步取值 |
|---|---|---|
| recency | exp(-Δt / τ)，τ = 7 天 | α = 1.0 |
| importance | rule-based 评分 / 10 | β = 1.0 |
| relevance | hybrid_score（向量 cos_sim ⊕ FTS5 BM25 归一） | γ = 1.5 |

> [!tip] α / β / γ 起步值是经验值，v0.2 验证完打开 yml 配置项，方便调参。

### 3.2 系统提示词分层（v0.2 视角）

```
┌────────────────────────────────────────────────────────────┐
│             system prompt (Frozen per request)             │
│  ├─ ROLE 全局规则（v0.01）                                    │
│  ├─ SOUL 片段（v0.11 已落地）── 我是谁、说话风格           │
│  ├─ UserProfile 片段（v0.11 多字段）── 对方是谁、偏好       │
│  ├─ 工具集说明（含 session_search / update_user_profile / │
│  │   search_web）                                          │
│  └─ 情绪标记指令（v0.11 已落地）── 末尾输出 <!--mood:--->  │
└────────────────────────────────────┬───────────────────────┘
                                      │
                                      ▼ 合并
┌────────────────────────────────────────────────────────────┐
│  ChatMemory（LC4J 滑窗 20 条）+ Recall 召回片段（v0.2 新增） │
│  ── 当前对话最近上下文                                     │
│  ── + 上下文相关的过往经历（Recall 引擎打分 Top-N）        │
└────────────────────────────────────────────────────────────┘
```

> [!warning] v0.2 改造的是"Recall 召回片段如何产生"，==system prompt 上层结构由 v0.11 决定且 v0.2 不动==（SOUL / UserProfile / 情绪标记指令照搬）。Frozen Snapshot 约束依然成立（v0.1 第八章）。

---

## 四、功能1：Recall 引擎升级（向量 + Hybrid + 三维加权）

### 4.1 理念

**解决的痛点**：
- 用户说 "我之前用什么语言写后端"，LLM 搜 "编程语言"——v0.1 FTS5 关键词不识别 Java / Python 等同义概念，召回 0。
- v0.1 用 `FTS5 rank` 排序——只看 term 匹配密度，时间越早匹配越精反而排前面，违反"想起最近的"直觉。

**v0.2 思路**：
1. 给 `memory_stream` 加一个**向量索引 sidecar**（同 rowid 对齐），写入时同步生成 embedding。
2. 检索时走 **Hybrid**：FTS5（关键词精确匹配）+ 向量（语义近似）各召回 Top-K，分数归一后 RRF（Reciprocal Rank Fusion）融合。
3. 在 Hybrid `relevance` 之上叠加 `recency` 时近性衰减 + `importance` 重要性加权，==score = α·recency + β·importance + γ·relevance==。
4. `session_search @Tool` 保留入口语义不变（"找过去说过什么"），但 ==内部实现切到 RecallService==——LLM 不需要知道底层升级了。

#### 4.1.1 设计决策：sqlite-vec 单库 vs 外部向量库

| 选项                         | 优点                                      | 缺点                                                          | v0.2 取向           |
| -------------------------- | --------------------------------------- | ----------------------------------------------------------- | --------------- |
| **sqlite-vec**（SQLite ext） | 与 memory_stream 同库；零运维；`rowid` 对齐天然事务一致 | xerial-sqlite-jdbc ==默认不带==，需要手动加载 native ext；JVM 侧 API 略繁琐 | **首选**——若能跑通即采用 |
| Chroma（嵌入式 Python）         | 上手快、社区活跃                                | Java 集成走 HTTP，多一层延迟；运维独立服务                                  | 备选 1            |
| Qdrant（Rust 独立服务）          | 性能好、filter 灵活                           | 需要起独立服务，单机开发部署多个进程                                          | 备选 2            |
| PGVector                   | 一个 Postgres 通吃                          | 需要从 SQLite 整体迁移到 PG，超出 v0.2 范围                                | ❌               |

> [!tip] v0.2 优先尝试 sqlite-vec
> 项目已经在 SQLite 上稳定（v0.01 起就是），引入 sqlite-vec 只是加一个 ext 加载。失败时降级到 Chroma（备选 1）。==装配类 `MemoryDataSourceConfig.connectionInitSql` 加一行 `SELECT load_extension('vec0')`== 即可。

#### 4.1.2 设计决策：Embedding 模型选型

| 选项 | 优点 | 缺点 | v0.2 取向 |
|---|---|---|---|
| **BGE-M3**（开源、多语言、效果接近商业 API） | 开源 / 本地推理无 API 成本 | 需要起本地推理服务（ONNX / Java DJL），增加部署复杂度 | 备选 |
| **OpenAI 兼容 embedding API**（DeepSeek / SiliconFlow / MiniMax 等） | 走现有 HTTP 链路，与 v0.01 装配一致 | 有 API 成本 + 网络延迟 | **首选**——LC4J 内置 `OpenAiEmbeddingModel` |
| ONNX + Java DJL 跑 BGE | 完全本地，无网络依赖 | 启动慢，内存占用高 | v0.3 起再考虑 |

> [!tip] v0.2 走 OpenAI 兼容 embedding 路线
> 与现有 chat 模型同走 OpenAI 兼容协议，配置一致；==LC4J 的 `OpenAiEmbeddingModel` 即开即用==，不引新依赖。

#### 4.1.3 设计决策：Importance 评分（v0.2 规则版）

v0.2 不用 LLM 打分（每条记忆都跑一次 LLM 成本太高、延迟太大），用 **规则评分** 起步：

| 触发条件 | 加分 |
|---|---|
| 基础分（user / assistant） | user=0.5 / assistant=0.3 |
| 消息长度 > 50 字符 | +0.1 |
| 含工具调用（assistant 端） | +0.1 |
| 提及姓名 / 称呼（含 display_name 字符串） | +0.15 |
| 表达偏好关键词（"喜欢"、"讨厌"、"经常"、"通常"、"我都"...） | +0.15 |

最终 clamp 到 `[0, 1]`，存入 `memory_stream.importance` 列（FLOAT）。

> [!warning] 规则评分只是==起步==
> v0.3 引入 LLM 评分时，规则版作为兜底；规则评分在 v0.2 文档里 ==必须可独立 mock==，方便 v0.3 切换。

#### 4.1.4 设计决策：Hybrid 融合策略

用 **RRF（Reciprocal Rank Fusion）** 而不是直接分数加权：
- FTS5 BM25 分数与向量 cosine_sim 量纲不一致，强行归一容易引入偏置
- RRF 只看 rank 位置，对量纲不敏感，业界常用

```
rrf_score(doc) = Σ over each retriever: 1 / (k + rank(doc))     # k=60 起步
```

### 4.2 数据库改动

#### 4.2.1 修改 `memory_stream` 表（加 importance 列）

```sql
ALTER TABLE memory_stream ADD COLUMN importance REAL NOT NULL DEFAULT 0.5;
CREATE INDEX IF NOT EXISTS idx_stream_user_importance ON memory_stream(user_id, importance DESC);
```

> [!tip] 现有数据迁移
> v0.1 已有的 memory_stream 行 importance 默认 0.5，后续按需 backfill（v0.2 不强制重算）。

#### 4.2.2 新建 `memory_stream_vec` 虚表（sqlite-vec）

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_stream_vec USING vec0(
    embedding FLOAT[1024]                  -- 维度 = embedding 模型输出维度，BGE-M3 是 1024
);
```

> [!warning] 维度对齐
> 若 v0.2 选 OpenAI 兼容 embedding（如 BGE-M3 via SiliconFlow），维度通常是 1024；若切其他模型需同步改。==`ai.memory.vec.dimension` yml 配置项==，启动时与表声明做一致性校验，不一致即拒绝启动。

#### 4.2.3 写入路径：append 时同步写 FTS + Vec

`SqliteMemoryStream.appendBlocking` 加一步：
1. INSERT memory_stream（含 importance，由 ImportanceScorer 规则评分得出）
2. INSERT memory_stream_fts（codepoint-split 内容，v0.1 已实现）
3. **INSERT memory_stream_vec（embedding，rowid 对齐）** ← v0.2 新增

==三步包在同一个 TransactionTemplate==。embedding 生成是阻塞的 HTTP 调用，但调用方已在 `boundedElastic` 线程，不阻塞 event loop。

### 4.3 代码改动

#### 4.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `recall/RecallService.java` | Hybrid 召回 + 三维加权打分主流水线 |
| `recall/RecallResult.java` | 召回返回 DTO（含 memory_stream id, content, role, createdAt, importance, rrfScore, finalScore） |
| `recall/ImportanceScorer.java` | 规则评分器（v0.2 起步版），输出 `[0, 1]` |
| `recall/HybridRetriever.java` | FTS5 与向量并行召回 + RRF 融合 |
| `recall/ScoringPipeline.java` | 加权打分 + MMR 多样性过滤 |
| `config/ai/EmbeddingConfig.java` | EmbeddingModel Bean 装配（OpenAI 兼容） |
| `config/properties/RecallProperties.java` | yml 配置承载（α/β/γ/τ/topK/limit/...） |

接口设计：

```java
public interface RecallService {
    Mono<List<RecallResult>> recall(String userId, String query, int limit);
}

public record RecallResult(
    long id, String role, String content, long createdAt,
    double importance, double rrfScore, double finalScore
) {}
```

#### 4.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `memory/MemoryStream.java` | `append(...)` 签名加 `double importance` 参数（默认值由调用方提供 / Adapter 层填默认 0.5）；新增 `Mono<List<StreamEntry>> recall(String userId, String query, int limit)` 方法委托给 RecallService |
| `memory/SqliteMemoryStream.java` | append 改为三步事务（行 + FTS + vec）；search 标记 `@Deprecated`（仍可用，但 LLM 工具入口改走 recall） |
| `memory/SqliteChatMemoryStore.java` | `init()` 增建 `memory_stream_vec` 虚表 + `ALTER memory_stream ADD importance`（用 `PRAGMA table_info` 检测后做 idempotent） |
| `config/ai/MemoryDataSourceConfig.java` | HikariCP `connectionInitSql` 加载 sqlite-vec ext：`SELECT load_extension('vec0')` |
| `service/AIChatService.java` | `beforeStream` / `onStreamComplete` 调 append 时传 importance（ImportanceScorer 计算） |
| `tool/SessionSearchTool.java` | `session_search` 内部 ==改调 `memoryStream.recall(...)`== 而非 `search(...)`；返回格式微调展示 importance / score（仅 mono 展示，不影响 LLM 用） |

> [!note] 接口反应式 vs 同步签名
> `RecallService.recall` 返回 `Mono<List<RecallResult>>`，因为它会被 SessionSearchTool（LC4J 工具线程）在 `.block()` 模式下调用——和 v0.1 [[拟人化AI Agent-v0.1#9.3.4 实施修正：哪些 store 读方法必须保持同步\|9.3.4 节]]规则保持一致：被 `compose()` 直接调用的方法保持同步，被 `@Tool` 调用的方法可保持反应式。

### 4.4 配置

`application.yml` 新增段落：

```yaml
ai:
  memory:
    vec:
      enabled: true           # false 时降级走 v0.1 FTS5-only 路径
      dimension: 1024         # 与 embedding 模型对齐，启动时校验
    importance:
      base-user: 0.5
      base-assistant: 0.3
      length-threshold: 50    # 超过此长度 +0.1
      length-bonus: 0.1
      tool-call-bonus: 0.1
      name-bonus: 0.15
      preference-keywords: ["喜欢", "讨厌", "经常", "通常", "我都", "习惯"]
      preference-bonus: 0.15
  recall:
    weights:
      alpha: 1.0              # recency
      beta: 1.0               # importance
      gamma: 1.5              # relevance
    recency:
      tau-days: 7             # exp(-Δt / τ_days) 的 τ
    hybrid:
      top-k-fts: 30           # FTS 一阶召回数
      top-k-vec: 30           # 向量一阶召回数
      rrf-k: 60               # RRF 平滑常数
    mmr:
      enabled: true
      lambda: 0.7             # 1.0 = 完全相关性优先；0 = 完全多样性优先
    limit-default: 5
    limit-max: 20

embedding:
  provider: openai           # 走 OpenAI 兼容
  openai:
    base-url: https://api.siliconflow.cn/v0.1   # 示例：硅基流动 BGE-M3 endpoint
    api-key: ${EMBEDDING_API_KEY:}
    model: BAAI/bge-m3
    dimension: 1024
    timeout: 30s
```

### 4.5 验证

#### Hybrid 召回（语义同义）

1. 用户先后说："我用 Java 写后端" / "我最爱喝美式" / "今天天气真好"
2. 灌 25+ 条无关消息把上面三条挤出 ChatMemory 窗口
3. 用户问："我之前说过我用什么编程语言吗"（==关键词 "编程语言" 不在原文==）
4. ✅ LLM 触发 `session_search`，==向量召回找到 "Java" 那条==（v0.1 FTS5-only 会 0 命中）
5. ✅ AI 自然回答 "你说过用 Java"

#### 三维加权效果

1. 同一用户的 memory_stream 里同时有：
   - 三天前提过 "Spring Boot"（importance=0.5）
   - 三个月前提过 "Spring Boot"（importance=0.5）
   - 三个月前提过 "Spring Boot 大量讨论"（importance=0.8）
2. 用户问 "我之前提过 Spring Boot 吗"
3. ✅ 召回 Top-3 顺序为：三天前那条（recency 高）→ 三个月前 importance=0.8 那条（importance 加权）→ 三个月前 importance=0.5 那条

#### Importance 评分

1. 用户说 "我喜欢喝美式咖啡"（含偏好关键词）
2. ✅ memory_stream.importance ≈ 0.5（base） + 0.15（含 "喜欢"） = 0.65
3. assistant 回 "好的，记住了"（不含关键词、较短）
4. ✅ memory_stream.importance ≈ 0.3（base） = 0.3

#### v0.1 FTS5 不退化

1. 用户问 "之前提过咖啡吗"（关键词与原文一致）
2. ✅ Hybrid 走 FTS5 + 向量双召回，FTS5 命中那条仍排前

---

## 五、工程改造A：向量库 + Embedding 模型选型与装配

### 5.1 理念

v0.2 首次引入向量检索，==是 v0.01 以来最大的依赖变更==。装配抽象做好是后续 v0.3 / v4 平滑扩展的前提。

按 [[拟人化AI Agent-总设计方案#8.3 Plugin Slot 架构：记忆层可替换]] 的接口化思路：
- 整个 RecallService 是上层接口，==向量库实现可替换==（sqlite-vec / Chroma / Qdrant）
- EmbeddingModel 通过 LC4J `EmbeddingModel` 接口接入，==Provider 可替换==（OpenAI / BGE 本地）

### 5.2 数据库改动

见功能1 第 4.2 节（向量虚表 + importance 列）。

### 5.3 代码改动

#### 5.3.1 接口抽象

```java
public interface VectorIndex {
    Mono<Void> upsert(long rowid, float[] embedding);
    Mono<Void> deleteByRowid(long rowid);
    /** 返回 (rowid, distance) Top-K，distance 越小越相近。 */
    Mono<List<VectorHit>> queryTopK(float[] queryEmbedding, int topK);
}

public record VectorHit(long rowid, double distance) {}
```

#### 5.3.2 实现（v0.2 起步：SqliteVec）

```java
@Component
@ConditionalOnProperty(name = "ai.memory.vec.enabled", havingValue = "true")
public class SqliteVecIndex implements VectorIndex { /* ... */ }
```

#### 5.3.3 Embedding 模型装配

LC4J 提供 `OpenAiEmbeddingModel`，直接 wrap 即可：

```java
@Configuration
public class EmbeddingConfig {
    @Bean
    public EmbeddingModel embeddingModel(EmbeddingProperties props) {
        return OpenAiEmbeddingModel.builder()
            .baseUrl(props.getOpenai().getBaseUrl())
            .apiKey(props.getOpenai().getApiKey())
            .modelName(props.getOpenai().getModel())
            .dimensions(props.getOpenai().getDimension())
            .timeout(props.getOpenai().getTimeout())
            .build();
    }
}
```

### 5.4 配置

见功能1 第 4.4 节（`embedding.*` / `ai.memory.vec.*`）。

### 5.5 验证

#### sqlite-vec 加载

1. 启动后端，日志包含 `SqliteVecIndex initialized (dim=1024)`
2. ✅ 无 `SQL error or missing database`
3. `PRAGMA function_list;` 查询包含 `vec_distance_cosine`

#### Embedding 模型连通

1. POST 一条聊天，触发 append → embedding 调用
2. ✅ LC4J 日志显示 embedding HTTP 请求 200
3. ✅ memory_stream_vec 行数等于 memory_stream 行数

---

## 六、前端

> [!tip] v0.2 前端零改动
> v0.11 已经把"记忆暴露 API + 前端 hook + status/mood 数据 plumbing"做完。v0.2 不动 SOUL / UserProfile / 情绪——==Recall 升级对前端完全透明==，LLM 通过 `session_search` 工具调用的结果照旧由 `tool_call` / `tool_result` 事件展示。

==如果== v0.11 阶段决定让 StatePanel 展示 Recall 命中的过往片段——那是新设计稿的事，与 Recall 引擎本身的实现无关。

---

## 七、依赖

### 7.1 后端

| 依赖 | 用途 | 来源 |
|---|---|---|
| `dev.langchain4j:langchain4j-open-ai` | 已有 chat；==v0.2 复用做 embedding== | 已有 |
| `org.xerial:sqlite-jdbc 3.46+` | 已有；需检查是否带 `enable_load_extension` JNI 入口 | 已有 |
| `sqlite-vec` native ext（`vec0.so / .dll / .dylib`） | 向量虚表实现 | 新增（放到 `resources/native/` 或独立目录，启动时 load） |

> [!warning] sqlite-vec 是 native 扩展
> 不通过 Maven 拉，需要按 OS 下载对应 binary。==开发机三套（mac / win / linux）都要预置==，启动失败要友好降级（`ai.memory.vec.enabled=false`）。

### 7.2 前端

无新依赖、无新改动。

---

## 八、风险与开放问题

| # | 决策点 | 建议 | 理由 |
|---|---|---|---|
| 1 | sqlite-vec 跨平台 | 三套 OS 各自下载 binary 放 `data/native/`，启动时按 OS 选 | 避免一台机器跑、另一台跑不起 |
| 2 | Embedding API 成本 | 单次 chat 触发 2~3 次 embedding（user + assistant + 检索 query），用 OpenAI 兼容免费/低价 provider | DeepSeek/SiliconFlow/MiniMax 都有便宜的 embedding tier |
| 3 | Importance 规则评分跑偏 | 用 5~10 个真实样本 case 调权重，输出 importance 分布合理 | v0.3 上 LLM 评分后规则版作为兜底 |
| 4 | 向量维度切换 | dimension 写 yml，启动时校验，不一致拒绝启动 | 防止跑到一半发现维度对不上 |
| 5 | RRF k 常数 | k=60 起步（业界经验值），开放 yml 配置 | 后续调参 |
| 6 | 三维加权超参 α/β/γ | 写 yml 默认 `1.0 / 1.0 / 1.5`，验证后调 | 让 relevance 略重于 recency 是常见经验值 |
| 7 | MMR 多样性 | 默认开启 λ=0.7，可一键关 | 防止"想起来的全是同一件事"但避免过度去重把直接答案过滤掉 |
| 8 | embedding 失败的兜底 | 失败时跳过 vec 写入但保留 FTS + 原文写入 | 不阻断主对话流；append 异常按 v0.1 原则"记日志不抛错" |
| 9 | 历史数据 backfill | v0.2 不自动 backfill v0.1 已有 memory_stream 的 embedding | 启动成本可控；按需手动跑迁移脚本 |

---

## 九、估时

| 阶段（对应章节） | 估时 |
|---|---|
| 工程改造A：sqlite-vec 装配 + EmbeddingModel + 向量虚表 schema | 0.5-1 天 |
| 功能1：ImportanceScorer 规则评分 + memory_stream.importance 列 + append 三步事务 | 0.5 天 |
| 功能1：Recall 引擎（含 RecallService / Hybrid / 加权 / MMR） | 1-1.5 天 |
| 联调验证（含 4.5 / 5.5 全套） | 0.5-1 天 |
| **合计** | ==2.5-4 天== |

> [!tip] 比原 v0.2 估时缩水
> 原 v0.2 估时 4-5 天，是把 UserProfile / SOUL / 记忆 API 三块算进去的。这三块已迁 v0.11（v0.11 估时 2-3 天）——==两期合计与原 v0.2 估时持平==，只是拆成了两个反馈周期。

---

## 十、与 v0.3 的衔接（仅信息性，本次不规划）

> [!note]- v0.2 留下的扩展点
> - `ImportanceScorer` 已是接口式，v0.3 加 LLM 评分实现切换即可
> - `RecallService.recall()` 返回 `RecallResult` 含 finalScore，v0.3 上 Consolidation 时可按 finalScore 阈值决定哪些进 reflection
> - `memory_stream.importance` 列已就位，v0.3 Consolidation 可用「importance 累计超阈值」触发反思（[[拟人化AI Agent-总设计方案#3.4 Generative Agents 三大机制]]）
> - v0.11 已落地的 SOUL / UserProfile / 情绪三块，v0.3 Consolidation 可反向更新——给 SOUL 加 `recent_reflections` 段、给 UserProfile 自动维护、给 mood 持久化进 user_profile

> [!note]- v0.14 留下的扩展点（v0.2 阶段无关，但 v0.3 / 前端方案要捡起）
> - ==承诺履行状态追踪==：[[拟人化AI Agent-v0.14|v0.14]] 只记录原始承诺文本，不追踪 pending / fulfilled / broken。==注意 v0.14 的 commitment 是对话双方的==（AI 答应对方 + 对方答应 AI + 双方共同约定）——v0.3 Reflection 阶段补 status 列时，==双方承诺的兑现判定逻辑不同==：AI 自己的承诺看 AI 是否在后续轮次中兑现；对方的承诺看对方在后续轮次中是否兑现（更难，需要 LLM 比对承诺文本与实际对话内容）。新增 `update_commitment_status(commitmentKey, status)` 工具或由 Reflection 自动更新；CommitmentSection 渲染时显式标注状态
> - ==ImpressionCompleteness LLM 评分版==：v0.14 用"非空计数"规则版（"填了 'personality=不知道' 也算 1 分"的边界没处理）。v0.3 抽 `ImpressionCompletenessEvaluator` 接口 + LLM 评分实现，按"填充质量 / 内容深度"打分，规则版作兜底
> - ==`hot_memory` 多 type Consolidation==：v0.14 的 `significant-event` / `commitment` 是 append-only 多条共存，没做 dedup / 合并。v0.3 Consolidation 阶段补：周期性把同一 user 同一 type 的多条相似条目合并（如三条"备考研究生"合并为"长期备考研究生（首次提及 2026-04）"），保留原条目归档，注入段只看合并后的高层条目
> - ==`HotMemoryStore.recent` 是通用 append-only 基础设施==——v0.3 Reflection 阶段写"反思结论"为新 type（如 `reflection`）时直接复用
> - ==前端「重要经历 / 承诺」渲染==：v0.14 `MemoryController.GET /hot?type=...` 返回 `Map<key,value>` 不含 timestamp 与排序，前端有序展示需新增端点 `GET /hot/recent?type=...&limit=...`（返回带 `updatedAt` 的 List）。版本待前端"重要经历 / 承诺" 设计稿出来时定
