---
title: 拟人化 AI Agent —— v0.1：Memory Stream + Hot/Cold 分层 + Frozen Snapshot
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.1
aliases:
  - Humanlike AI Agent v0.1 Plan
  - ZoufxAIAgent v0.1 实施
---

> [!note] 文档定位
> v0.1 详细实施方案。顶层架构与版本路线见 [[拟人化AI Agent-总设计方案]]；前置实现见 [[拟人化AI Agent-v0.01]]。
> v0.1 完成后开 `拟人化AI Agent-v2.md`，本文档不预演 v0.2 内部细节。

> [!tip] 一句话定义
> 把"==记得多（独立连续经历流）+ 找得到（按需检索）+ 闭环身份（称呼跨窗口生效）=="三件事一起做掉，并守住"无 session 边界"立场。

> [!info] 文档结构说明
> 章节 一→二→三 是 v0.1 的目标全景与术语对齐；章节 四~十 是按 ==功能/改造单元== 组织的实施细节，**每章内部统一为「理念 → 数据库改动 → 代码改动 → 配置 → 验证」结构**，方便实施时按章对照。

---

## 一、v0.01 遗留盘点与 v0.1 回应

v0.01 完成了"AI 重启还记得 + 砍掉会话边界 + 接口抽象 + 首次见面问称呼"，但留下三个具体痛点：

| v0.01 遗留 | 表现 | v0.1 回应 |
|---|---|---|
| 身份"短期记忆" | 用户说"我叫张三"后超过 20 条消息，AI 又开始问称呼 | **Hot Memory 承载 display_name** + 工具调用晶化 |
| 长对话窗口外完全失忆 | 滑出 20 条窗口的内容直接消失，没有任何召回路径 | **Memory Stream 全量存** + FTS5 全文索引 |
| 没有按需"想起来"能力 | LLM 看不见过往，只能基于当前 20 条作答 | **`session_search` 工具** 暴露 Cold Archive |

> [!warning] v0.1 不做但 v0.2 会做
> ==Importance 评分 / 向量检索 / 完整 UserProfile / SOUL.md / Periodic Nudges== 这些都是 v0.2~v0.3 范畴。v0.1 只搭骨架并闭环身份这一个最具体的痛点。

---

## 二、v0.1 工作范围与本文档导航

### 2.1 v0.1 包含项（章节索引）

| 类型 | 编号 | 名称 | 主要解决 v0.01 哪个痛点 | 详见章节 |
|---|---|---|---|---|
| 新增功能 | 功能1 | **Memory Stream（Cold Archive）** | 超 20 条窗口完全失忆 | [[#四、功能1：Memory Stream（Cold Archive）\|第四章]] |
| 新增功能 | 功能2 | **Hot Memory（结构化关键事实）** | 关键身份信息和闲聊一起被滑出 | [[#五、功能2：Hot Memory（结构化关键事实）\|第五章]] |
| 新增功能 | 功能3 | **`session_search` 工具** | 没有"想起来"能力 | [[#六、功能3：`session_search` 工具（Cold 召回路径）\|第六章]] |
| 新增功能 | 功能4 | **`remember_user_name` 工具** | 没有把识别到的事实"晶化"为长期记忆的写入通路 | [[#七、功能4：`remember_user_name` 工具（Hot 写入路径）\|第七章]] |
| 显式化约束 | 约束1 | **Frozen Snapshot** | 单请求 system prompt 一致性（隐式 → 显式） | [[#八、约束1：Frozen Snapshot 显式化\|第八章]] |
| 工程改造 | 改造A | **业务接口反应式化** | 调用方手写 `subscribeOn` 胶水重复出现 | [[#九、工程改造A：业务接口反应式化\|第九章]] |
| 工程改造 | 改造B | **`LlmRetrySpec` 抽出** | `AIChatService.chat()` 重试逻辑无法单测 | [[#十、工程改造B：`LlmRetrySpec` 抽出\|第十章]] |

### 2.2 v0.1 不做（留给后续版本）

- ❌ 向量库 / Embedding（v0.2）
- ❌ 完整 UserProfile 字段集 / SOUL.md（v0.2）
- ❌ 三维评分（Recency × Importance × Relevance）（v0.2）
- ❌ Consolidation Engine / Periodic Nudges（v0.3）
- ❌ 移除 `chat_messages` 表（v0.1 与 `memory_stream` 并存）

> [!warning] 边界原则
> v0.1 不动认知架构，只完成"经历流 + 按需检索 + 一项 Hot"的最小信息基础设施。

---

## 三、核心概念术语速查（先对齐再读后续）

v0.1 引入的"Hot / Cold / Memory Stream"是从 Hermes Agent 借来的**架构角色**名词。它们和后端 SQLite 表之间的对应关系：

| 架构概念 | 物理表 | 数据形态 | 在 prompt 里的位置 |
|---|---|---|---|
| **Hot Memory** | `user_profile`（KV） | 结构化关键事实（属性卡） | ==每次请求都注入到 system prompt== |
| **Cold Archive / Memory Stream** | `memory_stream` + `memory_stream_fts` | 流水账原文（按时序追加） | ==默认不进 prompt==，LLM 用工具按需检索 |
| 工作记忆（滑动窗口，v0.01 已有） | `chat_messages`（LC4J 管） | 最近 N 条消息 | 每次请求由 LC4J 自动拼到 messages 数组 |

> [!warning] 最容易踩的认知坑
> **Hot 不是从 Cold 里"抽词/抽高频"派生出来的**。两张表==并行写入==：
> - Cold（`memory_stream`）：每轮对话原文都 append
> - Hot（`user_profile`）：LLM 识别到关键事实（如"用户告知称呼"），调 `@Tool` ==主动写入==
>
> Cold 是"完整经历流水账"，Hot 是"AI 关于该用户的结构化认知"。两者来源、写入触发、读出方式都不一样。

> [!tip] 用一个例子贯穿理解
> 用户说："**我叫张三，今天天气不错**"
> - Cold 路径（自动）：`memory_stream` 追加这条原文 `{role: user, content: "我叫张三，今天天气不错"}`
> - Hot 路径（LLM 主动）：LLM 识别到自称，调 `remember_user_name("张三")`，写入 `user_profile[display_name] = "张三"`
>
> 注意 Cold 存的是**原句**，Hot 存的是**提炼后的结构化字段**——这就是 Hermes 所说的 ==Bounded Curation==：用 LLM 判断力做精炼，不是用统计抽词。

### 3.1 三层数据通路示意

```
┌─────────────────────────────────────────────────────────┐
│             system prompt (Frozen per request)          │
│  ├─ ROLE / 全局规则                                     │
│  ├─ Hot Memory  ←──── user_profile（v0.1：display_name）  │
│  └─ 工具集说明 + session_search 用法                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼ 合并
┌─────────────────────────────────────────────────────────┐
│  ChatMemory（LC4J 滑窗 20 条）← chat_messages 表        │
│  ── 当前对话最近上下文                                  │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼ 必要时
┌─────────────────────────────────────────────────────────┐
│  Cold Archive: memory_stream（全量）+ FTS5             │
│  ── 通过 session_search 工具按需召回                    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 三个存储的关键差异

| 维度 | Hot Memory | 工作记忆（LC4J 滑窗） | Cold Archive |
|---|---|---|---|
| 物理表 | `user_profile` | `chat_messages` | `memory_stream` |
| 数据形态 | 结构化 KV（属性卡） | 原文消息列表 | 原文消息流水 |
| 容量 | 极少（v0.1 仅 1 字段） | 滑窗 20 条 | 无上限 |
| 进 prompt？ | ==每次必进==（system prompt） | ==每次必进==（messages 数组） | ==默认不进==，工具按需召回 |
| 写入方 | LLM 主动调 `@Tool` 晶化 | LC4J 框架自动维护 | Controller 路径自动 append |
| Token 占用 | 极低（一行话） | 中等（20 条原文） | 0（除非工具调用） |

---

## 四、功能1：Memory Stream（Cold Archive）

### 4.1 理念

**解决的痛点**：v0.01 工作记忆滑窗 20 条，超出窗口直接遗忘，没有任何召回路径。

**v0.1 思路**：另起一张==只追加==的表，所有用户/AI 消息按时间戳累加，永不删除。配合 FTS5 全文索引，为"按需检索"留出可能性。

#### 4.1.1 设计决策：用独立表，不复用 `chat_messages`

| 表 | 角色 | 写入语义 | 容量 |
|---|---|---|---|
| `chat_messages`（v0.01 已建） | LC4J ChatMemoryStore 的工作记忆载体 | 每次 `updateMessages` ==全量替换==（DELETE + 批量 INSERT） | 滑窗 20 条 |
| `memory_stream`（v0.1 新建） | 经历流，所有消息时间序追加 | ==只追加，不删除== | 无上限 |

> [!tip] 为什么不复用一张表
> - LC4J 全量替换语义 vs 经历流只追加语义直接冲突
> - 单表加 `is_active` 状态字段会让 LC4J 的 SQL 啰嗦，FTS5 触发器也更乱
> - 两表分工后，未来 v0.2 给 `memory_stream` 加 `embedding BLOB` 列时不会污染工作记忆通路

#### 4.1.2 设计决策：Controller-driven Append（不在 LC4J Hook 里做）

> [!warning] 不能在 `SqliteChatMemoryStore.saveByUserId` 里 append
> 原因：LC4J 每次传完整 list，要"diff 出新增"很容易漏（已经滑出 20 条窗口的消息无法对比），逻辑脆弱。

| 时机 | 操作 |
|---|---|
| `AIChatController.chat()` 接到请求 | `memoryStream.append(userId, "user", prompt, null)` |
| `AIChatService` 流式响应拼装完最终 assistant 文本 | `memoryStream.append(userId, "assistant", finalText, null)` |
| 工具调用结果 | **v0.1 不进 stream**（噪音大，等 v0.3 Consolidation 决策） |

### 4.2 数据库改动

#### 4.2.1 新建 `memory_stream` 表

```sql
CREATE TABLE IF NOT EXISTS memory_stream (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,
    role       TEXT    NOT NULL,        -- 'user' / 'assistant' / 'tool'(暂不用) / 'reflection'(v0.3 预留)
    content    TEXT    NOT NULL,
    metadata   TEXT,                    -- JSON 字符串，v0.1 留空；v0.2 写入 importance/tags/embedding_id
    created_at INTEGER NOT NULL          -- epoch millis
);

CREATE INDEX IF NOT EXISTS idx_stream_user_time
    ON memory_stream(user_id, created_at);
```

#### 4.2.2 新建 `memory_stream_fts` 虚表（FTS5）

```sql
-- 不用 external content 模式（content='memory_stream'）：FTS 内容是分词版本，与主表原文不同
CREATE VIRTUAL TABLE IF NOT EXISTS memory_stream_fts USING fts5(
    content,
    tokenize='unicode61'
);

-- 只有 DELETE 触发器；INSERT 由 Java 侧负责（要先分词，SQL 触发器搞不定）
CREATE TRIGGER IF NOT EXISTS mstream_ad AFTER DELETE ON memory_stream BEGIN
    DELETE FROM memory_stream_fts WHERE rowid = old.id;
END;
```

> [!error] FTS5 中文分词的认知坑（commit 2 实施时踩中）
> 原 v0.1 设计预想「`unicode61` 对中文是按 codepoint 切」——**错的**。
> 实际 `unicode61` 默认把连续 CJK 字符当==单个 token==："美式咖啡" 索引为 1 个 token，搜 "美式" 命中 0 行。
>
> **修正方案**：Java 侧 `codepointSplit` 把内容按 codepoint 拆成空格分隔形式再写入 FTS。
> - 原文 `"我喜欢喝美式咖啡"`（主表 `memory_stream.content` 不变）
> - FTS 索引内容 `"我 喜 欢 喝 美 式 咖 啡"`（FTS 表独立存）
> - 查询时 keyword 同样切，包成 FTS5 phrase `"美 式"`（token 必须相邻顺序匹配），语义贴合"原文有这串字"
>
> **代价**：
> - FTS 表==不能用 external content 模式==（内容与主表不一致），主表和 FTS 表各存一份；FTS 表只是索引，体积小，重复存储可接受
> - INSERT 不能用 SQL 触发器（分词逻辑在 Java），改在 Java 同事务里两次 INSERT + `last_insert_rowid()` 拿主表 id 对齐 FTS rowid
> - DELETE 触发器照旧（不需要分词，靠 rowid 同步）
>
> v0.2 接 embedding 后这个粗糙度会被向量检索补偿，到时可以重新评估 FTS 是否还有保留价值。

#### 4.2.3 schema 建立时机

放在 `SqliteChatMemoryStore.init()` 里和 `chat_messages` 一并建（避免单独引入 schema-bootstrap 类）。

### 4.3 代码改动

#### 4.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `memory/MemoryStream.java` | 经历流业务接口（反应式签名，对应[[#九、工程改造A：业务接口反应式化\|改造A]]） |
| `memory/SqliteMemoryStream.java` | SQLite + FTS5 实现，内部 JdbcTemplate + boundedElastic 包装 |
| `memory/StreamEntry.java` | 检索返回 DTO（Java record） |

接口定义：

```java
public interface MemoryStream {
    Mono<Void> append(String userId, String role, String content, String metadataJson);
    Mono<List<StreamEntry>> search(String userId, String keyword, int limit);
    Mono<List<StreamEntry>> loadRecent(String userId, int limit);  // 调试用
}

public record StreamEntry(long id, String role, String content, long createdAt) {}
```

#### 4.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `memory/SqliteChatMemoryStore.java` | `init()` 增建 `memory_stream` + FTS5 虚表 + 触发器（与 4.2.3 一致） |
| `controller/AIChatController.java` | 接到请求后调 `memoryStream.append(userId, "user", prompt, null)` 直接 chain |
| `service/AIChatService.java` | 流尾 `doOnNext` 收集 assistant 文本；流结束时 `memoryStream.append(userId, "assistant", finalText, null).subscribe()` |

### 4.4 配置

`application.yml` 新增：

```yaml
ai:
  memory:
    stream:
      search-limit-default: 5
      search-limit-max: 20
```

### 4.5 验证

#### 持久化（不丢消息）

1. 启动服务，前端发 10 条消息
2. `sqlite3 ./data/zoufx-ai.db "SELECT COUNT(*) FROM memory_stream WHERE user_id='<your_uuid>';"`
3. ✅ 应等于 20（10 条 user + 10 条 assistant）
4. 重启服务，再发 5 条
5. ✅ count 累加到 30

#### Schema 完整性

```sql
SELECT name, type FROM sqlite_master
WHERE type IN ('table','trigger','index')
ORDER BY type, name;
```

应包含：`memory_stream` / `memory_stream_fts*` / `idx_stream_user_time` / `mstream_ai` / `mstream_ad`。

---

## 五、功能2：Hot Memory（结构化关键事实）

### 5.1 理念

**解决的痛点**：v0.01 里"用户的名字"和"今天天气不错"一样都是普通消息，滑窗 20 条后一并丢失，导致 AI 反复问称呼。

**v0.1 思路**：把"AI 关于这个用户知道的结构化事实"单独存一张 KV 表，==每次都注入 system prompt==。和 Cold（流水账）并行写入，不互相派生。

#### 5.1.1 Hot 的定位：结构化关键事实，不是关键词

Hot 存的是「**AI 关于该用户的结构化属性卡片**」，类似你给微信好友设的备注名+标签。==不是从 `memory_stream` 里抽高频词==。

v0.2 可能扩展的字段示意：

```
display_name = "张三"           ← v0.1 唯一启用
language     = "zh"
timezone     = "Asia/Shanghai"
role         = "后端工程师"
```

这些都是结构化 KV，不是文本片段，也不是统计抽词。

#### 5.1.2 v0.1 只启用 `display_name` 一项

==这就是 v0.01 身份"短期记忆"问题的直接病灶==。先把这一项跑通，验证"Hot Memory + 工具晶化 + Frozen Snapshot"整套流程能闭环，v0.2 再扩展 `enabled_keys`。

### 5.2 数据库改动

#### 5.2.1 新建 `user_profile` 表

```sql
CREATE TABLE IF NOT EXISTS user_profile (
    user_id    TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
);
```

v0.1 启用的 key 集合：`{ display_name }`。建表时机同 4.2.3，放在 `SqliteChatMemoryStore.init()` 里。

### 5.3 代码改动

#### 5.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `memory/HotMemoryStore.java` | Hot Memory 接口（反应式签名，对应改造A） |
| `memory/SqliteHotMemoryStore.java` | SQLite 实现 |

接口定义：

```java
public interface HotMemoryStore {
    /**
     * 同步——见 [[#9.3.4]]：被 SystemPromptComposer.compose() 在 event loop 上同步读取，不能反应式。
     * 实现侧用 PK 单点查询，开销可忽略。
     */
    Optional<String> get(String userId, String key);

    /**
     * 同步——同上。一次性读全部启用 key。
     */
    Map<String, String> snapshot(String userId);

    /**
     * 反应式：调用方是 @Tool 方法（LC4J 工具线程），通过 .block() 桥接是合规的；
     * 但保持 Mono 签名为未来 v0.2 在 event loop 上写入（如调用方在反应式 chain 中决定写）留口子。
     */
    Mono<Void> set(String userId, String key, String value);
}
```

> [!warning] `get` / `snapshot` 同步，`set` 反应式
> 不是接口风格不一致——是==读路径和写路径调用方上下文不同==。读发生在 compose() 同步内联，写发生在 @Tool 工具线程。详见 [[#9.3.4 实施修正：哪些 store 读方法必须保持同步\|9.3.4]]。

#### 5.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `config/ai/SystemPromptComposer.java` | 注入 `HotMemoryStore`；`compose()` 优先读 `display_name` → 分支注入对应片段，否则沿用 v0.01 `STRANGER_GREETING`。`compose()` 在 ==WebFlux event loop== 上被 LC4J 同步内联调用，==必须用 `HotMemoryStore.get()` 同步签名==，不能 `.block()`（详见 [[#9.3.4]]） |

`compose()` 三态分支（commit 3 实施时由二态扩展为三态）：

```text
if user_profile.display_name 存在:
    Hot 注入 → "## 关于对方\n对方的称呼是「X」..."（强约束，见 5.4 完整模板）
elif memoryStore.isEmpty(userId):
    沿用 v0.01 STRANGER_GREETING（陌生人迎接）
else:
    无额外身份片段——「已有历史对话但未告知名字」，让 LLM 从 ChatMemory 自然接续
```

> [!tip] 为什么不是简单二态
> v0.01 二态：「empty → 陌生人 / non-empty → 静默」。v0.1 引入 Hot 后，若沿用二态，"有 chat_messages 但没 display_name"（v0.01 升级用户）会被反复当陌生人问名字。三态切分把 display_name 状态独立出来，迁移安全。

### 5.4 配置

`application.yml` 新增：

```yaml
ai:
  memory:
    hot:
      enabled-keys:
        - display_name
```

System prompt 新增片段：

```text
## 关于对方

对方的称呼是「{display_name}」。这是你已经认识的人——
- 直接称呼对方为「{display_name}」，不要问名字、不要确认；
- 每轮回复中至少自然地使用一次这个称呼（除非对方明确问你别叫他名字）；
- 如果对方问「我是谁」「你还记得我吗」之类的问题，明确回答对方就是「{display_name}」，不要敷衍说「刚开始聊天」「没有记录」。
```

> [!error] commit 3 实施时的 prompt 调优坑
> ==初版本写法太软==：「请用这个称呼自然地称呼对方，不要重复确认」。验证时 LLM 收到该 prompt 后仍出现：
> - 不主动用名字称呼对方
> - 用户问"你还记得我喜欢什么吗"时回答"我们刚开始聊天，没有记录"（违背"对方告诉过你"的前提）
>
> 排查：system prompt 确实被注入了（LC4J log 可证），是 LLM 没按软语气执行。
>
> **修正**：把语气改为==显式命令式==（"直接称呼...不要问名字、不要确认"），并==枚举常见反模式==（如"我是谁"问题要明确回答而不是说没记录）。
>
> v0.1 当前模板（上面的代码块）是 commit 3 验证通过的版本。后续 v0.2 多字段 Hot 时，同样要避免软语气；调用方有义务用"对方告诉过你"这种==事实陈述==而非"请记得"这种==请求语气==让 LLM 接受为预设事实。

### 5.5 验证

#### Hot 写入正确性（与功能4 联动）

1. 清空 localStorage → 新 userId
2. 用户说 `我叫张三`
3. ✅ 前端看到 `tool_call: remember_user_name("张三")`（详见[[#七、功能4：`remember_user_name` 工具（Hot 写入路径）\|功能4]]）
4. ✅ SQL：`SELECT * FROM user_profile WHERE key='display_name';` 有数据

---

## 六、功能3：`session_search` 工具（Cold 召回路径）

### 6.1 理念

**Cold Archive 存了不读 = 白存**。v0.1 给 LLM 一个 `@Tool` 工具，让它在"对方暗示之前说过但当前窗口看不到"时主动调用。

**为什么是工具而不是 always-on RAG**：v0.1 不接 embedding，FTS5 检索精度有限；always-on 会注入大量低质量片段污染上下文。==让 LLM 自己判断"要不要查"才符合拟人化路线==。

### 6.2 代码改动

#### 6.2.1 新增文件

| 路径 | 用途 |
|---|---|
| `tool/SessionSearchTool.java` | `@Tool session_search`（内部 `.block()` 调用 `MemoryStream.search`） |

签名设计：

| 维度 | 设计 |
|---|---|
| 签名 | `session_search(@ToolMemoryId String userId, @P String keyword, @P int limit)`，默认 limit=5，最大 20 |
| 实现 | FTS5 `MATCH` 查询 + `user_id` 过滤（==必须带 user_id，防跨用户泄露==） |
| 返回 | 字符串，按编号列出 `[timestamp · role] content`，供 LLM 直接阅读 |
| 多关键词语义 | LLM 常传 "后端 编程语言" 这种空白分隔形式：每个 term 内部 phrase（字符相邻），多个 term 之间 ==OR==（任一命中即算）。AND 太严，弱模型 vocabulary 经常与原文不对齐 |

> [!warning] `@ToolMemoryId`，不是 `@MemoryId`
> LC4J 1.x 有两个 MemoryId 注解：
> - `dev.langchain4j.service.MemoryId` —— 用在 ==AiServices 接口方法== 参数（如 `ChatAssistant.chat()`）
> - `dev.langchain4j.agent.tool.ToolMemoryId` —— 用在 ==`@Tool` 方法==参数
>
> 弄错的代价：`@MemoryId` 在 `@Tool` 上==不会==被 LC4J 排除，userId 会作为 required 参数出现在工具的 JSON schema 里。LLM 看见一个没描述、没值的 userId 字段，直接放弃调用工具（具体表现：tool_call 事件压根不发）。

> [!warning] `.block()` 安全性
> `@Tool` 方法跑在 LC4J 工具线程，不在 WebFlux event loop，`.block()` 是合规桥接。

#### 6.2.2 修改文件

| 路径 | 改动 |
|---|---|
| `config/ai/AssistantConfig.java` | `tools(...)` 注册 `SessionSearchTool` |

### 6.3 配置（提示词约束）

system prompt 新增：

```text
## session_search（经历流检索）

==必须触发==：当对方暗示"之前说过/聊过/讨论过"某事而当前对话窗口里看不到时，==立刻调用 session_search==。
必触发的信号示例：
- 「我之前说过…吗」「你还记得…吗」「上次聊到的…」「我跟你提过…」
- 「我刚才不是说过…」（但近期消息里没有时）
- 任何让你需要去翻"过往交谈"的提问

调用规则：
- keyword：用关键词或短语，不要用整句话（例：传 "美式咖啡" 而不是 "我之前说过我喜欢喝什么饮料吗"）
- 单次请求内最多调用 3 次，避免盲搜
- 拿到结果后自然融入回答（"你之前提过 X..."），不要让对方感到你在翻聊天记录
- 反模式：直接说"我没有记录""我刚开始和你聊天"——这是错的，应该==先调工具搜一次==再判断
```

> [!error] commit 4 prompt 调优坑
> 初版本写法是"当对方暗示…，调用 session_search"——软请求语气。flash 模型在该 prompt 下经常==说"没有记录"==而不去调工具。修正为==命令式==（"必须触发：…立刻调用"）+ ==反模式枚举==（不要说"我没有记录"）后稳定触发。同 [[#5.4 配置]] 节末尾警告里讲的 Hot Memory prompt 加强同款问题。

### 6.4 验证

1. 用户先后说"我喜欢喝美式""我用 Java 写后端""今天天气不错"
2. 灌 25+ 条无关消息把上面三条挤出 ChatMemory 窗口
3. 用户问：`我之前说过我喜欢什么吗？`
4. ✅ LLM 触发 `tool_call` 事件（前端可见），`session_search(keyword="喜欢")`
5. ✅ LLM 用搜出来的内容自然回答"你喜欢喝美式"

---

## 七、功能4：`remember_user_name` 工具（Hot 写入路径）

### 7.1 理念

**Hot 怎么写进去**：让 ==LLM 主动判断==——从用户消息里识别出自称时调用工具写入，而不是后端用 regex 抠。

**为什么不用 regex**：
- regex 无法捕捉自然语言的复杂指代（"我朋友都叫我 Cookie""你就叫我老王吧"）
- LLM 自判 + 工具调用 ==才符合拟人化路线==——和 v0.01"身份识别交给 LLM"决策一致

### 7.2 代码改动

#### 7.2.1 新增文件

| 路径 | 用途 |
|---|---|
| `tool/UserProfileTool.java` | `@Tool remember_user_name(@ToolMemoryId String userId, @P String name)`（内部 `.block()` 调用 `HotMemoryStore.set`）。==注意 `@ToolMemoryId`==，不是 `@MemoryId`——见 [[#六、功能3：`session_search` 工具（Cold 召回路径）\|功能3]] 6.2.1 节警告 |

写入语义：UPSERT 到 `user_profile`，后写覆盖前写。

#### 7.2.2 修改文件

| 路径 | 改动 |
|---|---|
| `config/ai/AssistantConfig.java` | `tools(...)` 注册 `UserProfileTool` |

### 7.3 配置（提示词约束）

system prompt 新增：

```text
## remember_user_name（记住对方称呼）

==必须触发==：只要对方在本轮发言里告知了自己的称呼/姓名，==立刻调用 remember_user_name(name)==，不要犹豫。
必触发的信号示例：
- 「我叫 X」「我是 X」「叫我 X 就行」「你叫我 X」
- 「X 是我」「（在自我介绍中说出）X」
- 任何让对方称呼明确具象化的表达

调用规则：
- name 只传称呼本身（如 "张三"），不要带"我叫"/"叫我"/"姓"等前缀
- 不要替对方猜——只在对方明确说出时调用
- 调用是后台动作，回复对方时无需说"我已记下"——直接用新称呼自然继续对话
- 反模式：识别到名字却==不调用工具==、或在回复里说"好的我会记住"但实际==没调工具==——这两种都错
```

### 7.4 验证

#### 闭环身份（v0.1 最大卖点）

> [!example] 这是 v0.1 真正解决 v0.01 痛点的核心验证

1. 清空 localStorage → 新 userId
2. 用户说 `我叫张三`
3. ✅ 前端看到 `tool_call: remember_user_name("张三")`
4. ✅ SQL：`SELECT * FROM user_profile WHERE key='display_name';` 有数据
5. 灌 30+ 条无关消息（远超 20 条窗口）
6. 用户问 `我是谁`
7. ✅ LLM 直接回答"你叫张三"——==v0.01 在这一步会再次问称呼==

#### 多 userId 隔离

1. Chrome 正常窗口：自我介绍"我叫张三"，确认 user_profile 写入
2. Chrome 隐身窗口（独立 userId）：问"我是谁"
3. ✅ 隐身窗口里 AI 不知道，仍按陌生人迎接处理——==FTS5 搜索同样必须带 user_id 过滤==

---

## 八、约束1：Frozen Snapshot 显式化

### 8.1 理念

LC4J 在单次 chat 请求内，`SystemPromptProvider`（由 `SystemPromptComposer::compose` 提供）只会被调用一次——这是 LC4J 默认行为，==单请求冻结天然成立==。v0.1 不写代码强制，仅==文档化约束==，防止未来误把 compose 改成多次调用。

#### 8.1.1 关键场景：LLM 在响应内调用 `remember_user_name`

```text
T0: 用户请求到达 → SystemPromptComposer.compose() 被调用一次，读到 display_name=null → 注入陌生人迎接片段
T1: LLM 处理用户消息 "我叫张三"
T2: LLM 调用 remember_user_name("张三") → user_profile 写入
T3: LLM 继续输出文本 "你好张三..."
T4: 响应结束。==整个请求中 system prompt 不重读==
T5: 下次请求到达 → compose() 重新读到 display_name=张三 → 注入"对方叫张三"
```

> [!tip] 这正是 Hermes 的 Frozen Snapshot 语义
> "对 Hot Memory 的修改要到下次会话才生效"——在我们这里映射为"==到下次请求才生效=="。

#### 8.1.2 跨请求 prompt cache 命中

| 维度 | v0.1 策略 |
|---|---|
| Hot 改动频率 | `display_name` 改动频率极低（一个用户一辈子一次） |
| Cache miss 次数 | 用户第一次自我介绍后 miss 一次，之后稳定命中 |
| 节流策略 | ==v0.1 不做==——v0.2 加多字段 UserProfile 后再考虑批量写策略 |

### 8.2 数据库改动

无。本章是约束的文档化，不涉及 schema。

### 8.3 代码改动（仅文档化）

| 路径 | 文档化点 |
|---|---|
| `config/ai/SystemPromptComposer.java` | 类级注释明确：`compose()` 由 LC4J 在每次请求开始时调用一次，==请勿在响应流中主动重新调用== |

### 8.4 验证

1. 在 `SystemPromptComposer.compose()` 加临时日志 `log.debug("compose() called for {}", userId)`
2. 单次请求中 LLM 调用 `remember_user_name`
3. ✅ 日志显示 `compose()` 当次请求只被调用一次
4. 紧接下一次请求
5. ✅ `compose()` 再次被调用，读到新的 `display_name`

---

## 九、工程改造A：业务接口反应式化

### 9.1 理念

**起因**：v0.01 的 `MemoryStore` 是同步接口，调用方在 WebFlux event loop 上要手写 `Mono.fromRunnable(...).subscribeOn(Schedulers.boundedElastic())` 才能安全调用：

```java
// AIChatService.clearUserMemory（v0.01 现状）
return Mono.fromRunnable(() -> memoryStore.deleteByUserId(userId))
        .subscribeOn(Schedulers.boundedElastic())
        .then();
```

v0.1 会新增 `MemoryStream.append()`（每轮对话 2 次）、`HotMemoryStore.get()/set()` 等多处持久化调用，==同样的胶水会重复出现 5-7 次==。

**决策**：业务接口统一返回 `Mono<T>` / `Flux<T>`，阻塞 JDBC + `boundedElastic` 包装下沉到实现类。调用方按反应式 chain 自然组合。

### 9.2 数据库改动

无。本章是接口签名重构，不涉及 schema。

### 9.3 代码改动

#### 9.3.1 接口签名变更（破坏性）

| 接口 | v0.01 | v0.1 |
|---|---|---|
| `memory/MemoryStore.java`（v0.01 已有） | 同步 `void` / `List<>` / `boolean` | ==所有方法返回 `Mono<T>`== |
| `memory/MemoryStream.java`（v0.1 新增） | — | 反应式签名直接落地，见 4.3.1 |
| `memory/HotMemoryStore.java`（v0.1 新增） | — | 反应式签名直接落地，见 5.3.1 |

`MemoryStore` v0.1 新签名：

```java
public interface MemoryStore {
    Mono<List<ChatMessage>> loadByUserId(String userId);
    Mono<Void> saveByUserId(String userId, List<ChatMessage> messages);
    Mono<Void> deleteByUserId(String userId);
    Mono<Boolean> isEmpty(String userId);
}
```

调用点仅 4 处，破坏性可控：`AIChatService.clearUserMemory()` / `SystemPromptComposer.compose()` 等。

#### 9.3.2 实现层桥接策略

==`SqliteChatMemoryStore` 仍同时实现 `ChatMemoryStore`（LC4J 同步）+ `MemoryStore`（业务反应式）==。`MemoryStore` 的方法内部调用一个私有同步方法，并用 `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())` 包装。LC4J 接口直接走同步方法。这样不需要拆类，但接口职责清晰。

```java
// 简化示例
public Mono<Boolean> isEmpty(String userId) {
    return Mono.fromCallable(() -> isEmptyBlocking(userId))
            .subscribeOn(Schedulers.boundedElastic());
}

private boolean isEmptyBlocking(String userId) { /* JdbcTemplate 查询 */ }

@Override public List<ChatMessage> getMessages(Object memoryId) {
    return loadByUserIdBlocking(memoryId.toString());  // LC4J 走同步
}
```

三类调用上下文的接口选择：

| 接口 | 调用上下文 | 签名风格 |
|---|---|---|
| `dev.langchain4j.store.memory.chat.ChatMemoryStore`（LC4J 内置） | LC4J 框架线程（非 event loop） | ==同步==，由 `SqliteChatMemoryStore` 直接实现 |
| `com.zoufx.ai.agent.memory.MemoryStore`（业务） | WebFlux event loop + LC4J 框架线程混合 | ==反应式 `Mono<T>`== |
| `MemoryStream` / `HotMemoryStore`（v0.1 新增业务） | 同上 | ==反应式 `Mono<T>`== |

#### 9.3.3 调用方影响

| 调用方 | 上下文 | 桥接方式 |
|---|---|---|
| `AIChatController.chat()` / `AIChatService.chat()` | WebFlux event loop | ==直接 chain==，无需手写 `subscribeOn` |
| `SessionSearchTool` / `UserProfileTool` 内部 | LC4J 工具线程 | ==`.block()`==（同步桥接，安全） |
| `SystemPromptComposer.compose()` | ==WebFlux event loop（不是 LC4J 框架线程）==——LC4J 把 `SystemPromptProvider` 作为 `Function<Object, String>` 同步契约，在 `assistant.chat(...)` 入口处内联执行 | **不能 `.block()`**：会被 Reactor `NonBlockingHook` 拦下。==该路径上读取的 store 方法必须是同步签名==（见 [[#9.3.4 实施修正：哪些 store 读方法必须保持同步\|9.3.4]]） |

> [!warning] `.block()` 不是坏味道，看上下文
> 在 event loop 上 `.block()` 会卡死 Netty（Reactor 还会主动拦截抛错）；在 LC4J 工具线程上 `.block()` 是合规的桥接方式（与 v0.01 `@Tool` 同步阻塞性质一致）。

#### 9.3.4 实施修正：哪些 store 读方法必须保持同步

> [!error] commit 1 实施时发现的设计假设错误
> 原 9.3.3 表里 SystemPromptComposer.compose() 的"上下文 = LC4J 框架线程"是错的。
> 验证 commit 1 时，首次请求被 Reactor 拦下：
> ```
> event:error
> data:block()/blockFirst()/blockLast() are blocking,
>      which is not supported in thread reactor-http-nio-4
> ```

**规则**：任何被 `SystemPromptComposer.compose()` 调用的 store 读方法，签名必须是==同步==（不返回 `Mono`）。原因：LC4J 把它当作 `Function<Object, String>` 在 event loop 上内联同步执行，无法等待 `Mono`。

v0.1 受影响的方法：

| 方法 | v0.1 实际签名 | 理由 |
|---|---|---|
| `MemoryStore.isEmpty(userId)` | `boolean`（同步，例外方法） | compose() 用它做陌生人识别；`SELECT EXISTS` 开销可忽略，event loop 同步执行可接受 |
| `HotMemoryStore.get(userId, key)` | `Optional<String>`（同步） | compose() 用它读 `display_name` 注入；PK 单点查询 |
| `HotMemoryStore.snapshot(userId)` | `Map<String, String>`（同步） | compose() 一次性读全部 enabled-keys |

> [!tip] 为什么不全接口同步
> 这三个方法是因为"被 LC4J 同步契约调用"的具体技术约束，==不是所有 store 方法都该退回同步==。`deleteByUserId` 仍反应式（被 `AIChatService.clearUserMemory` 在 event loop 上 chain）；`MemoryStream.append` / `search` 仍反应式（前者在 event loop chain，后者在 @Tool 线程内 `.block()`）。同步是==精准的例外==，不是规则。

### 9.4 配置

无。

### 9.5 验证

- ✅ `mvn clean compile` 通过（接口签名破坏性变更不留编译错误）
- ✅ 功能1~4 的验证全部通过（接口反应式化对外部行为透明）

---

## 十、工程改造B：`LlmRetrySpec` 抽出

### 10.1 理念

**v0.01 现状**：经过早前 commit `a609127` 重构，`AIChatService.chat()` 已通过 `TokenStreamToFluxAdapter` 拆出，重试逻辑也已挪到私有方法 `buildRetrySpec()`，但仍躺在 `AIChatService` 类内部，==无法独立单测==、==`AtomicBoolean hasEmitted` 状态散落==。

**v0.1 进一步切片**：
- 把 `buildRetrySpec` 从私有方法提到独立类 `LlmRetrySpec`，便于独立单元测试
- 方法名 `onlyRetryBeforeFirstEmission(hasEmitted)` 直接表达 `hasEmitted` 状态语义
- 为 v0.1 引入 `MemoryStream.append` 后 `AIChatService` 调用结构调整留出空间

### 10.2 数据库改动

无。

### 10.3 代码改动

#### 10.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `util/LlmRetrySpec.java` | LLM 重试策略抽出，暴露 `onlyRetryBeforeFirstEmission(AtomicBoolean)` 方法 |

```java
public Retry onlyRetryBeforeFirstEmission(AtomicBoolean hasEmitted) {
    return Retry.backoff(props.getMaxAttempts(), props.getMinBackoff())
            .maxBackoff(props.getMaxBackoff())
            .filter(err -> !hasEmitted.get() && RetryPolicy.isRetryable(err))
            .doBeforeRetry(rs -> log.warn("LLM retry #{} cause={}",
                    rs.totalRetries() + 1, rs.failure().toString()));
}
```

#### 10.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `service/AIChatService.java` | 删除私有方法 `buildRetrySpec`；注入 `LlmRetrySpec`；调用 `.retryWhen(llmRetrySpec.onlyRetryBeforeFirstEmission(hasEmitted))` |

改造后片段：

```java
return tokenStreamAdapter.bridge(assistant, userId, prompt, hasEmitted)
        .retryWhen(llmRetrySpec.onlyRetryBeforeFirstEmission(hasEmitted))
        .onErrorResume(this::toErrorEvent)
        .doOnCancel(() -> log.info("Stream cancelled [userId={}]", userId));
```

### 10.4 配置

无。`RetryProperties` 已存在，`LlmRetrySpec` 注入即可。

### 10.5 验证

- ✅ 单元测试 `LlmRetrySpecTest`：mock `hasEmitted` 为 true/false，验证 retry 行为符合预期（==这是抽出的核心收益==）
- ✅ 集成验证：故意把 MiniMax base-url 改错触发重试，观察日志 `LLM retry #1` / `#2` 出现，且首条 token 推出后不再重试

---

## 十一、前端

> [!tip] v0.1 前端零改动
> Cold 检索是后端工具调用，`tool_call` / `tool_result` SSE 事件 v0.01 已支持显示。

可选增强（==v0.1 不做==）：
- `GET /user/{userId}/memory/stream`：返回近 N 条经历 + Hot 快照——调试用 API，OpenClaw 透明性启示

---

## 十二、依赖

v0.01 已引入 `org.xerial:sqlite-jdbc 3.46.1.3`，==默认编译时已带 FTS5 支持==，无需新增依赖。

---

## 十三、风险与开放问题

| # | 决策点 | 建议 | 理由 |
|---|---|---|---|
| 1 | append 时机：controller-driven vs LC4J hook | **controller-driven** | 语义清晰，避免与 LC4J 全量替换语义冲突；漏写概率小 |
| 2 | tool 调用结果是否进 Memory Stream | **v0.1 不进** | tool_result 噪音大且容量膨胀；等 v0.3 Consolidation 决策 |
| 3 | FTS5 中文分词 | **unicode61 默认** | 简单够用；v0.2 向量检索会补 |
| 4 | Hot Memory 写时机 | **工具调用即时写** | display_name 改动频率本身就低，不需要节流 |
| 5 | display_name 多次修改语义 | **后写覆盖** | 简单语义；历史保留留给 v0.3 |
| 6 | `session_search` 调用频率 | **prompt 软约束 3 次/请求** | 防 LLM 失控连续搜；硬限留给后续 |
| 7 | Cold Archive 永不删除？ | **v0.1 永不删除** | 无数据治理需求；v0.3 Consolidation 决策压缩策略 |
| 8 | FTS5 触发器开销 | **接受** | 单机写入对触发器开销几乎无感 |
| 9 | system prompt 中 Hot 片段格式 | **单行人话注入** | 不用 markdown 列表；让 LLM 自然消化 |
| 10 | append 异常处理 | **记日志不抛错** | 经历流写失败不应阻断主对话流；可恢复性留给后续 |

---

## 十四、估时

| 阶段（对应章节） | 估时 |
|---|---|
| 功能1：Memory Stream（schema + `MemoryStream` 实现 + Controller-driven append） | 3-4 小时 |
| 功能2：Hot Memory（`HotMemoryStore` + `SystemPromptComposer` 改造） | 1.5-2 小时 |
| 功能3：`session_search` 工具 | 1 小时 |
| 功能4：`remember_user_name` 工具 | 0.5 小时 |
| 约束1：Frozen Snapshot 文档化 | 0.5 小时 |
| 改造A：业务接口反应式化 + `SqliteChatMemoryStore` 桥接重构 | 1-1.5 小时 |
| 改造B：`LlmRetrySpec` 抽出 + 单测 | 1 小时 |
| 联调验证（含闭环身份） | 2 小时 |
| **合计** | ==1-1.5 天== |

---

## 十五、与 v0.2 的衔接（仅信息性，本次不规划）

> [!note]- v0.1 留下的扩展点
> - `memory_stream.metadata` 字段已是 JSON，v0.2 加 `importance` / `embedding_id` / `tags` 不动表结构
> - `user_profile.key` 是开放枚举，v0.2 扩展 `enabled-keys` 加入语言偏好、时区、角色等字段
> - `MemoryStream.search()` 接口可在 v0.2 内部增加向量检索分支，调用方无感
> - `SystemPromptComposer` 已是分层组装结构，v0.2 加 `SOUL.md` 只是再添一层
