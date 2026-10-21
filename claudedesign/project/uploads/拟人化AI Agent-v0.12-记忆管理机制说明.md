---
title: 拟人化 AI Agent —— 截止 v0.12 版本的记忆管理机制说明
tags:
  - AI
  - Agent
  - 拟人化
  - 记忆系统
  - v0.12
  - 数据持久化
aliases:
  - ZoufxAIAgent Memory Management v0.12
  - 三层记忆系统实现
---

> [!note] 文档定位
> 本文从**工程实现角度**详细说明 v0.12 版本中 AI Agent（小Z）的记忆如何被管理、存储、检索、更新。涵盖三层记忆架构、数据库设计、生命周期管理、工具调用机制、以及关键的 Frozen Snapshot 约束。面向：
> - 希望理解项目记忆系统如何工作的开发者
> - 需要扩展记忆功能（如 v0.2 向量检索）的架构师
> - 调试记忆丢失、重复、错误问题的工程师

> [!warning] 版本范围
> 本文档适用于 **v0.12 及以前版本**。v2.0 将引入向量数据库、Consolidation Engine 等，会改变某些设计；那时需要另外出新文档。

---

## 一、核心概念：三层记忆系统（Hermes 架构）

### 1.1 三层分类与职责

ZoufxAIAgent 采用**三层记忆设计**，与大语言模型在会话中维护的记忆形成互补：

| 层级 | 接口 | 实现类 | 存储媒介 | 表名 | 数据量 | 写入语义 | 访问模式 | 主要用途 |
|-----|------|------|---------|------|--------|---------|---------|--------|
| **工作** | `MemoryStore` | `SqliteChatMemoryStore` | SQLite | chat_memory | 20 条滑窗 | **全量替换** | LC4J ChatMemory | 当前对话的上下文窗口（LLM 看得见） |
| **热** | `HotMemoryStore` | `SqliteHotMemoryStore` | SQLite | hot_memory | 无上限 | **UPSERT** | 同步 get/snapshot | 结构化用户画像（注入 system prompt） |
| **冷** | `ColdMemoryStore` | `SqliteColdMemoryStore` | SQLite + FTS5 | cold_memory | 无上限 | **只追加** | 反应式 search | 长期经历档案（按需检索） |

### 1.2 比喻：AI 的"大脑"结构

```
┌─────────────────────────────────────────────────────────┐
│                LLM 内部（前缀注意力）                    │
│    当前对话上下文 + System Prompt（当次请求冻结）        │
└─────────────────────────────────────────────────────────┘
        ↑ 注入        ↓ 更新
┌─────────────────────────────────────────────────────────┐
│              热 Memory（hot_memory）                   │
│   结构化字段：称呼、职业、时区、语言、兴趣、对话风格     │
│   特点：小、快、频繁访问、表达 AI 对对方的认知完整度     │
└─────────────────────────────────────────────────────────┘
        ↑ 每轮插入    ↓ 定期检索
┌─────────────────────────────────────────────────────────┐
│         冷 Memory（cold_memory + FTS5 索引）           │
│ 完整的经历日志：对话、搜索结果、思考过程等，按时序追加  │
│ 特点：大、耐久、低频访问、记录所有对话历史并支持全文搜索 │
└─────────────────────────────────────────────────────────┘

当前对话窗口  →  System Prompt（冻结）  →  LLM 回复
      ↓                                        ↓
  记录到 Cold  ←  当对方说新事实时  ←  调用工具更新 Hot
```

---

## 二、工作记忆（ChatMemory Window）

### 2.1 设计目标

工作记忆是 LLM **能看到的**对话历史。它的存在是因为：
- LLM 的 token 窗口有限（通常几千～十几万）
- 长对话历史会浪费 token、降低推理质量
- 需要保持"最近 N 轮对话"作为即时上下文

### 2.2 实现细节：SqliteChatMemoryStore

**表结构**：
```sql
CREATE TABLE chat_memory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,          -- 哪个用户的对话
    role        TEXT    NOT NULL,          -- "user" 或 "assistant"
    content     TEXT    NOT NULL,          -- 消息文本
    created_at  INTEGER NOT NULL           -- Unix 时间戳
);
CREATE INDEX idx_user ON chat_memory(user_id);
```

**写入时机与语义**：
- 每次 `POST /ai/chat` 完成后，`AIChatService.onStreamComplete()` 调用 `MemoryStore.saveByUserId()`
- 语义是**全量替换**，不是追加：先 DELETE 该 user 的所有消息，再 INSERT 新消息列表
  ```java
  // SqliteChatMemoryStore.saveByUserIdBlocking()
  jdbc.update("DELETE FROM chat_memory WHERE user_id = ?", userId);
  jdbc.batchUpdate("INSERT INTO chat_memory (...) VALUES (...)", batchSetter);
  ```
- 好处：LC4J ChatMemory 总是给出完整的消息列表，Store 不需要判断"追加还是更新"

**读取时机**：
- 每次 `POST /ai/chat` 开始时，LC4J 自动从 Store 读取 `getMessages(memoryId)` 拼装到 LLM request 中
- 同步调用，不涉及反应式，因为 LC4J 在自己的工具线程上运行

**容量管理**：
- v0.12 中硬编码为最多 20 条消息（可配置 `ai.memory.max-messages`）
- 由 LC4J 的 `ChatMemory` 自动执行滑窗策略
- 当消息条数 > 20 时，自动删除最旧的，保留最近的

**这一层对用户的影响**：
- ✅ 用户能看到最近 10 来轮的对话（在前端消息列表）
- ❌ 超过 20 轮的历史不再被 LLM "看见"（但仍保存在 Cold Memory 里）

---

## 三、热内存（用户画像档案）

### 3.1 设计目标

热内存记录对**用户的认知**——不是对话内容，而是用户的属性。例如：
- **display_name**：用户的称呼（"小张"、"Tom"）
- **timezone**：用户所在时区（影响时间相关回答）
- **role**：用户的职业/身份（"Java 后端"、"产品经理"）
- **interests**：用户的兴趣偏好（"机器学习"、"羽毛球"）
- **language**：用户使用的语言（"中文"、"English"）
- **tone**：用户期望的对话风格（"简洁"、"详细"、"幽默"）

这些字段注入 system prompt，让 LLM 知道"在和谁对话、如何适配对方"。

### 3.2 实现细节：SqliteHotMemoryStore

**表结构**：
```sql
CREATE TABLE hot_memory (
    user_id    TEXT    NOT NULL,      -- 用户 UUID
    key        TEXT    NOT NULL,      -- 属性字段名（display_name、timezone 等）
    value      TEXT    NOT NULL,      -- 属性值
    updated_at INTEGER NOT NULL,      -- 最后更新时间戳
    PRIMARY KEY (user_id, key)        -- 同一用户 + 同一 key 只有一条记录
);
```

**为什么用 KEY-VALUE 表而不是宽表**？
- **灵活性**：新增字段不需要 ALTER TABLE，只需在白名单里注册即可
- **稀疏性**：不同用户可能有完全不同的字段组合（某用户未曾提过时区，该字段为空）
- **演进**：v0.2 可轻易新增字段而不破坏既有数据

**访问方式**：
- `get(userId, key)`：同步，获取单个字段值
- `snapshot(userId)`：同步，一次读出该用户的所有字段（返回 `Map<String,String>`）
- `set(userId, key, value)`：反应式，写入单个字段（UPSERT 语义）

**关键约束：必须同步**

> [!danger] 关键：Hot Memory 的同步约束
> `get()` 和 `snapshot()` 方法必须**同步实现**（不涉及 `.block()`）。
> 
> **原因**：这两个方法被 `SystemPromptComposer.compose()` 调用，而 `compose()` 是由 LC4J 在 WebFlux event loop 上同步调用的。如果此时去 `.block()` 一个 Mono，Reactor 的 NonBlockingHook 会抛错。
> 
> ```java
> // ❌ 错的做法
> @Override
> public Map<String, String> snapshot(String userId) {
>     return hotMemoryStore.blockingSomething().block();  // 这会被拦
> }
> 
> // ✅ 对的做法：使用 JdbcTemplate 直接同步查询
> @Override
> public Map<String, String> snapshot(String userId) {
>     Map<String, String> result = new HashMap<>();
>     jdbc.query(sql, rs -> { result.put(...); });
>     return result;
> }
> ```

### 3.3 Hot Memory 在 System Prompt 中的角色

在 `SystemPromptComposer.compose()` 中，每次请求开始时都会读一次 Hot Memory 并注入 system prompt：

```markdown
## 关于对方

对方的称呼是「小张」。这是你已经认识的人——
- 直接称呼对方为「小张」，不要问名字；
- 每轮回复中至少自然地使用一次这个称呼；
- 如果对方问「我是谁」，明确回答对方就是「小张」。

- 对方所在时区：Asia/Shanghai（涉及时间话题时按这个时区作答）
- 对方的身份/职业：Java 后端工程师
- 对方的偏好/兴趣：深度学习、开源社区
- 对方期望的对话风格：简洁且技术

## 可用工具
...
```

**注入顺序**：
1. 首先检查 `display_name` 是否存在
2. 若存在 → 注入"已认识"段落 + 所有 enabled keys 的有值字段
3. 若不存在但该用户第一次（memoryStore.isEmpty） → 注入陌生人迎接
4. 若不存在但有历史 → 无特殊段落，LLM 从 ChatMemory 自然接续

### 3.4 Hot Memory 的更新机制

用户无法直接 PUT/POST Hot Memory。更新只能通过 **LLM 工具调用**：

#### 工具：`update_hot_memory(key, value)`

当用户在对话中提及自己的任何属性时，LLM 应该自动调用此工具更新 Hot Memory。

**触发时机**（LLM 需识别的信号）：
```
用户说"我叫小张" → LLM 调用 update_hot_memory("display_name", "小张")
用户说"我在上海" → LLM 调用 update_hot_memory("timezone", "Asia/Shanghai")
用户说"我是 Java 后端" → LLM 调用 update_hot_memory("role", "Java 后端")
用户说"我喜欢 ML" → LLM 调用 update_hot_memory("interests", "机器学习")
用户说"请简洁点" → LLM 调用 update_hot_memory("tone", "简洁")
```

**工具实现**（`HotMemoryUpdateTool.java`）：
```java
@Tool("当对方告诉你关于自己的画像属性时，调用此工具写入长期记忆")
public String update_hot_memory(
        @ToolMemoryId String userId,
        @P("属性字段名") String key,
        @P("属性值") String value) {
    
    // 校验 key 是否在白名单内
    if (!properties.getEnabledKeys().contains(key)) {
        return "rejected: key not in whitelist";
    }
    
    // UPSERT 到 Hot Memory
    hotMemoryStore.set(userId, key, value).block();
    log.info("📝 update_hot_memory [{}] {}={}", userId, key, value);
    return "已记下：" + key + "=" + value;
}
```

**白名单机制**：
- System prompt 里明确列出允许的 key：`display_name / language / timezone / role / interests / tone`
- yml 配置 `ai.tool.user-profile.enabled-keys`
- Tool 实现里用白名单校验，防止 LLM 乱写字段

**这一层对用户的影响**：
- ✅ 一旦告知名字，后续对话中 AI 会自动称呼、记得身份
- ✅ AI 可根据时区、职业等字段调整回答粒度
- ❌ 如果 LLM 没有识别到用户的信号，或 system prompt 没有触发工具的明确指令，可能记不住

---

## 四、冷内存（经历流档案）

### 4.1 设计目标

冷内存记录**所有发生过的事件**——每一轮对话的 user 消息和 assistant 消息都被记录在这里，作为完整的档案。用途：
- **完整性**：当 ChatMemory 窗口滑出时，冷内存还保留着历史
- **检索**：当用户问"我们之前讨论过 X 吗"时，LLM 可以从冷内存里搜索
- **审计**：保留对话完整记录，便于事后分析、调试、改进 AI 行为

### 4.2 实现细节：SqliteColdMemoryStore

**表结构**：
```sql
-- 主表：经历流档案
CREATE TABLE cold_memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,      -- 哪个用户
    role       TEXT    NOT NULL,      -- "user" 或 "assistant"
    content    TEXT    NOT NULL,      -- 消息原文
    metadata   TEXT,                   -- 预留给未来的元数据（如情绪、工具调用等）
    created_at INTEGER NOT NULL        -- 消息时间戳
);
CREATE INDEX idx_cold_memory_user_time ON cold_memory(user_id, created_at);

-- FTS5 虚表：分词后的内容索引（用于全文搜索）
CREATE VIRTUAL TABLE cold_memory_fts USING fts5(
    content,
    tokenize='unicode61'
);

-- 触发器：主表删除时，FTS 索引同步删除
CREATE TRIGGER cold_memory_ad AFTER DELETE ON cold_memory BEGIN
    DELETE FROM cold_memory_fts WHERE rowid = old.id;
END;
```

**为什么是"append-only"而不能更新/删除**？
- 保证完整性：一旦写入就不改，避免历史被篡改
- 简化并发：没有并发写冲突（只有一个 append 点）
- 方便审计：所有操作都有时序，可以重放

**关键设计：FTS5 中文分词处理**

> [!warning] FTS5 中文分词的坑
> SQLite FTS5 的默认 `unicode61` tokenizer 在处理**连续 CJK 文本**时有个问题：
> 
> 它会把"美式咖啡"当作**一个 token**，而不是四个字。所以当你搜"咖啡"时，能命中；但搜"美式"时却命中不了（因为没有"美 式"作为单个 phrase 的索引）。
> 
> **解决方案**：Java 侧按 **Unicode codepoint** 拆分，把内容从"美式咖啡"变成"美 式 咖 啡"再写入 FTS 索引。这样 unicode61 tokenizer 会把每个字符当作独立 token，子串查询才能正常工作。
> 
> ```java
> // 写入时
> String tokenized = codepointSplit("我喜欢喝美式咖啡");  
> // 结果："我 喜 欢 喝 美 式 咖 啡"
> jdbc.update("INSERT INTO cold_memory_fts (content) VALUES (?)", tokenized);
> 
> // 查询时，也要把关键词拆分
> String keyword = "咖啡";
> String tokenizedKeyword = codepointSplit(keyword);  // "咖 啡"
> String matchExpr = "\"" + tokenizedKeyword.replace("\"", "\"\"") + "\"";  // phrase
> jdbc.query("SELECT ... WHERE cold_memory_fts MATCH ?", matchExpr);
> ```

### 4.3 冷内存的写入时机

每次 `POST /ai/chat` 响应完成后，`AIChatService.onStreamComplete()` 会调用：

```java
// 记录用户的问题
memoryStream.append(userId, "user", userPrompt, null).subscribe();

// 记录 AI 的回答（mood 标记已被剥离）
memoryStream.append(userId, "assistant", assistantText, null).subscribe();
```

**关键细节**：
- 这两个 append 调用是**异步的**（`.subscribe()` 后即返回）
- 如果 append 失败，日志记录但不阻断对话（用户看不到）
- 为什么？因为对话已经返回给用户了，补写内存的失败不应该破坏已有的对话体验

### 4.4 冷内存的检索机制：工具 `search_cold_memory()`

当 LLM 需要查询过往对话时，通过 `search_cold_memory(keyword, limit)` 工具：

```java
@Tool("从完整经历流里按关键词检索过往消息")
public String search_cold_memory(
        @ToolMemoryId String userId,
        @P("搜索关键词") String keyword,
        @P("返回条数，默认5") int limit) {
    
    List<ColdMemoryEntry> hits = memoryStream.search(userId, keyword, limit).block();
    // 返回格式化的搜索结果，带时间戳、角色、内容
}
```

**检索的 SQL 逻辑**：
```sql
SELECT ms.id, ms.role, ms.content, ms.created_at
FROM cold_memory_fts
JOIN cold_memory ms ON cold_memory_fts.rowid = ms.id
WHERE cold_memory_fts MATCH ?              -- FTS5 MATCH 表达式
  AND ms.user_id = ?                         -- 用户过滤
ORDER BY rank                                -- FTS5 相关性排序
LIMIT 20;                                     -- 硬上限
```

**关键约束**：
- 单次请求最多调用 3 次 search_cold_memory（防止盲目搜索浪费 token）
- limit 最多 20（硬编码，防止一次读太多数据）
- 关键词采用 **OR 语义**，不是 AND：
  - 用户说"后端编程语言" → 搜"(后 端) OR (编 程 语 言)" 
  - 这样即使 LLM 的措辞与原文不完全一致，也能有基础召回

**这一层对用户的影响**：
- ✅ 当用户问"我们之前讨论过 X 吗"时，AI 可以从冷内存里找到
- ✅ 避免 AI 说"我没有记录"（应该搜一次再判断）
- ⚠️ 搜索结果的相关性取决于 LLM 选的关键词质量

---

## 五、记忆的完整生命周期

### 5.1 单轮对话中的时间序列

```
用户发起：POST /ai/chat
    ↓
【T0】请求开始
    → AIChatService.beforeStream()
    → 将用户 prompt 记录到冷内存（MemoryStream.append）
    ↓
【T1】System Prompt 冻结
    → SystemPromptComposer.compose()  [**Frozen Snapshot 开始**]
    → 同步读取 HotMemory.snapshot(userId) —— 获取 display_name、timezone 等
    → 同步读取 SoulStore.snapshot() —— 获取 AI 自身人格
    → 组装完整的 system prompt（包含已识别的用户信息）
    → 将此 prompt 传给 LLM
    ↓
【T2】LLM 流式输出
    → 每个 token 到达，经过 MoodEventProcessor 处理
    → LLM 识别到用户告知信息时，自动调用 update_hot_memory
        → HotMemoryStore.set() [反应式，用 boundedElastic 调度]
        → 该修改在 **这次请求中不会影响已冻结的 system prompt**
    → LLM 识别到需要检索时，自动调用 search_cold_memory
        → ColdMemoryStore.search() 返回过往消息
        → LLM 用搜索结果继续生成回复
    ↓
【T3】流完成
    → AIChatService.onStreamComplete()
    → 将 assistant 回复记录到冷内存（MemoryStream.append）  [**Frozen Snapshot 结束**]
    ↓
【T4】下一个请求开始
    → SystemPromptComposer.compose()  [**新的 Frozen Snapshot 开始**]
    → 重新读取 HotMemory.snapshot(userId)
    → **这次会看到上一个请求中修改后的 display_name、timezone 等**
    → 新的 system prompt 已包含更新后的用户信息
```

### 5.2 Frozen Snapshot 约束（最关键的机制）

> [!danger] 必读：Frozen Snapshot 约束
> 
> **定义**：System prompt 在每个请求的开始处通过 `SystemPromptComposer.compose()` 被 LC4J 读取**一次且仅一次**，然后在整个请求的生命周期内保持不变，直到下一个请求才重新读取。
> 
> **为什么这样设计**？
> 
> 为了实现"用户信息的修改要等到下一轮对话才生效"这一语义。例如：
> 
> ```
> 用户：我叫小张
>   ↓ LLM 识别，调用 update_hot_memory("display_name", "小张")
>   ↓ Hot Memory 被更新
>   但这个请求中，system prompt 仍然是之前冻结的版本（没有 display_name）
> AI：好的，请问怎么称呼您？
>   ↓ 请求结束
> 
> 用户：小张啊
>   ↓ 下一个请求开始
>   ↓ SystemPromptComposer.compose() 被重新调用
>   ↓ 重新读取 Hot Memory，这次看到 display_name=小张
> AI：小张，很高兴认识你！
> ```
> 
> **反面例子（如果没有 Frozen Snapshot）**：
> ```
> 用户：我叫小张
> AI: 【立刻看到 Hot Memory 有了 display_name】小张，很高兴认识你！
>    【但这时候系统提示里还说"请问对方叫什么"】
>    矛盾、混乱
> ```
> 
> **实现细节**：
> - `SystemPromptComposer.compose()` 没有手动缓存
> - LC4J 的 SystemPromptProvider 契约保证一次请求调用一次
> - 禁止在 `doOnNext` / 工具回调 / 流尾等地方重新调用 `compose()`
> 
> **对开发的约束**：
> - ❌ 不能在 `AIChatService.buildStream()` 的 `doOnNext` 里重新读取 Hot Memory 并修改 system prompt
> - ❌ 不能在工具执行结束后立刻重新组装 system prompt
> - ✅ 如果需要实时反应 Hot Memory 的修改，等到下一个请求再处理

### 5.3 多个用户的记忆隔离

每个 user_id 在三层内存中都有独立的数据：
- ChatMemory：`user_id` 作为 memoryId，LC4J 自动隔离
- HotMemory：`(user_id, key)` 联合主键，完全隔离
- ColdMemory：`user_id` + 时序索引，完全隔离

不同用户的对话完全不会串联。

---

## 六、数据持久化层：SQLite + HikariCP

### 6.1 为什么选 SQLite？

- **无需外部依赖**：一个文件即可，适合单机 Agent
- **ACID 保证**：事务确保数据一致性
- **FTS5 支持**：内置全文搜索引擎，无需额外的 Lucene 或 Elasticsearch
- **足够的并发**：WAL 模式下支持多读单写

### 6.2 连接池：HikariCP

所有三层内存都共享一个 HikariCP 连接池：

```java
// MemoryDataSourceConfig.java
@Bean("memoryDataSource")
public DataSource memoryDataSource(MemoryStoreProperties props) {
    HikariConfig cfg = new HikariConfig();
    cfg.setJdbcUrl("jdbc:sqlite:" + props.getDbPath());  // ./data/zoufx-ai.db
    cfg.setMaximumPoolSize(5);      // SQLite 单写并发限制
    cfg.setMinimumIdle(1);
    cfg.setConnectionInitSql("PRAGMA journal_mode=WAL");  // 启用 WAL
    return new HikariDataSource(cfg);
}

@Bean("memoryJdbcTemplate")
public JdbcTemplate memoryJdbcTemplate(@Qualifier("memoryDataSource") DataSource ds) {
    return new JdbcTemplate(ds);
}

@Bean("memoryTxTemplate")
public TransactionTemplate memoryTxTemplate(@Qualifier("memoryDataSource") DataSource ds) {
    return new TransactionTemplate(new DataSourceTransactionManager(ds));
}
```

**关键配置**：
- **Pool size = 5**：SQLite 的单写并发限制（一次只有一个写者）
- **WAL 模式**：Write-Ahead Logging，允许并发读 + 单写
- **connectionInitSql**：每个新连接自动执行 `PRAGMA journal_mode=WAL`

### 6.3 事务处理

**Cold Memory 的写入必须在事务内**：
```java
// 确保主表和 FTS 索引同时写入
tx.executeWithoutResult(status -> {
    jdbc.update("INSERT INTO cold_memory (...) VALUES (...)", ...);
    jdbc.update("INSERT INTO cold_memory_fts (rowid, content) VALUES (last_insert_rowid(), ...)", ...);
});
```

**Hot Memory 的 UPSERT**：
```java
jdbc.update("""
    INSERT INTO hot_memory (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
""", userId, key, value, now);
```

---

## 七、Token 成本分析

### 7.1 整体 Token 消耗结构

v0.12 的每次 `POST /ai/chat` 请求中，向 LLM 注入的 system prompt + context 由以下部分组成：

| 部分 | Token 数量 | 增长模式 | 说明 |
|-----|-----------|---------|------|
| **ROLE + 日期** | ~50 | 常数 | "你是一个和人类一样..." + 当前日期 |
| **工具定义** | ~400-500 | 常数 | update_hot_memory + search_cold_memory 的 prompt instructions |
| **响应规则 + 情绪标记** | ~200 | 常数 | GLOBAL_RULES + mood section |
| **小计（基础固定）** | **650-750** | **常数** | |
| **SOUL 部分** | 100-400 | 配置时确定 | v0.11 新增，AI 自身人格/原则/习惯（如启用） |
| **Hot Memory（用户画像）** | 初期 20 → 最多 450 | 线性缓增，有上限 | display_name(20-50) + language(10-30) + timezone(10-20) + role(20-100) + interests(30-150) + tone(20-100) |
| **ChatMemory（20条滑窗）** | ~1600 | **恒定** | 平均每条消息 80 tokens × 20 条 = 1600 tokens（🔑 关键！） |
| **ColdMemory（触发式）** | 搜索结果 5 条 × ~100 = 500（临时） | 触发式，不累积 | 仅在 search_cold_memory 工具被调用时注入 |

### 7.2 Token 增长趋势与预估

```
【新用户 - 第1轮对话】
  基础(650) + SOUL(200) + HotMemory(50) + ChatMemory(200)  = ~1100 tokens

【用户积累中期 - 第20轮对话】
  基础(650) + SOUL(200) + HotMemory(200⬆️信息增加) + ChatMemory(1600)  = ~2650 tokens

【长期稳定状态 - 第100+轮对话】
  基础(650) + SOUL(200) + HotMemory(450⬆️上限) + ChatMemory(1600↔️恒定！)  = ~2900 tokens
  
【触发 search_cold_memory 工具时】
  = 基础 + SOUL + HotMemory + ChatMemory + 搜索结果(500)  = 临时增加
  （工具返回后不再存在，不累积）
```

### 7.3 成本曲线分析

```
Token
数量
  ^
  │         ╱─────────────── 稳定在 ~2900（不再增长）
2900├────╱
  │   ╱  ⬆️ SOUL 配置完成 / Hot Memory 所有字段填满
2650├──╱
  │ ╱  ⬆️ 用户画像字段逐渐被填充
1600├─╱
  │╱  ⬆️ ChatMemory 20条窗口逐步填满
1100├
  └──────────────────────────→ 对话轮数
  初期   中期        长期（稳定）
 (1-5)  (5-30)    (30+)
```

**关键观察**：
- **初期 → 中期**：线性缓增（~100-200 tokens/轮）
- **中期 → 长期**：增速放缓，逐步趋稳
- **长期稳定**：始终维持在 ~2900 tokens 左右，**不会指数级上升**

### 7.4 v0.12 的成本控制设计

#### 7.4.1 **ChatMemory 滑动窗口（🔑 核心防护）**

```java
private static final int WINDOW_SIZE = 20;  // 硬编码
```

**为什么这是关键**：
- 无论对话进行 100 轮还是 1000 轮，LLM 看到的总是**最后 20 条消息**
- 总 token 消耗中，~55-60% 来自 ChatMemory，且**恒定不变**
- 这是**防止 token 爆炸的核心机制**

**对比**（如果没有滑动窗口）：
```
纯累积模式：第 n 轮的 token 消耗 ≈ 初期基础 + HotMemory + ChatMemory × n
可能到第 100 轮就爆炸（LLM token limit）

滑动窗口模式：第 n 轮的 token 消耗 = 初期基础 + HotMemory + ChatMemory（20条固定）
长期稳定在 2900 tokens 左右
```

#### 7.4.2 **Hot Memory 字段有上限**

仅支持 6 个固定字段（display_name / language / timezone / role / interests / tone），每个字段长度有实际限制（通常 20-150 tokens）。即使全部填满，总计也只是线性增长到 ~450 tokens 上限。

#### 7.4.3 **ColdMemory 隔离**

冷内存不会自动注入 system prompt，仅在 `search_cold_memory` 工具被显式调用时才临时注入搜索结果。这样：
- 基础 prompt 不受冷内存数据量影响
- 搜索结果是按需加载，临时性质
- 不会对每次请求都增加成本

### 7.5 后续优化空间（if token 成为瓶颈）

| 优化方向 | 影响 | 实施难度 |
|--------|------|---------|
| 缩小 ChatMemory 窗口（20 → 10） | 减少 ~800 tokens/请求 | 低（配置项） |
| 去掉低频 Hot Memory 字段（interests/tone） | 减少 ~200 tokens/请求 | 低（配置+工具改造） |
| 使用向量检索替代 search_cold_memory | 减少无关搜索结果的注入 | 高（需要向量数据库） |
| 压缩 Cold Memory 格式（去掉时间戳等元数据） | 减少 ~20% | 中（需要调整格式） |

> [!note] 成本评估总结
> **v0.12 不会面临 token 爆炸问题**。大部分 token 花在 ChatMemory 保持上下文连贯上，这是**必要的成本**。后续若真遇到 LLM token limit 压力，可按上表选择性优化，但目前无此必要。

---

## 八、线程模型与反应式约束

### 7.1 同步 vs 反应式的分界

| 场景 | 需要同步还是反应式 | 原因 |
|-----|------------------|------|
| **Hot Memory 读取**（system prompt 组装） | 同步 | SystemPromptComposer.compose() 在 event loop 上运行，不能 .block() |
| **Hot Memory 写入**（工具调用） | 可反应式 | LC4J 工具线程是独立的，可以 .block() 反应式 API |
| **Cold Memory 写入**（append-only） | 反应式（异步） | 应该不阻断主流程，写失败也不影响对话 |
| **Cold Memory 读取**（search_cold_memory） | 反应式 + block | 工具调用时 .block() 是合规的 |

### 7.2 代码示例

**❌ 错的做法（会被 Reactor NonBlockingHook 拦截）**：
```java
@Component
public class SystemPromptComposer {
    public String compose(Object memoryId) {
        // ❌ 这会抛 BlockingOperationError
        Map<String, String> hotMemory = hotMemoryStore.snapshot(userId).block();
    }
}
```

**✅ 对的做法（直接同步查询）**：
```java
@Component
public class SqliteHotMemoryStore implements HotMemoryStore {
    @Override
    public Map<String, String> snapshot(String userId) {
        Map<String, String> result = new HashMap<>();
        jdbc.query("SELECT key, value FROM hot_memory WHERE user_id = ?",
                   rs -> { result.put(rs.getString("key"), rs.getString("value")); },
                   userId);
        return result;  // 同步返回
    }
}
```

**✅ 对的做法（工具中 block 是合规的）**：
```java
@Component
public class HotMemoryUpdateTool {
    @Tool("...")
    public String update_hot_memory(...) {
        // ✅ LC4J 工具线程可以 block
        hotMemoryStore.set(userId, key, value).block();
        return "已记下";
    }
}
```

---

## 八、常见操作与调试

### 8.1 检查某用户的记忆

```bash
# 查看热内存（用户画像）
sqlite3 ./data/zoufx-ai.db "SELECT key, value FROM hot_memory WHERE user_id='xxx-uuid';"

# 查看最近 5 条冷内存
sqlite3 ./data/zoufx-ai.db "SELECT created_at, role, content FROM cold_memory WHERE user_id='xxx-uuid' ORDER BY id DESC LIMIT 5;"

# 全文搜索冷内存（中文）
sqlite3 ./data/zoufx-ai.db "SELECT ms.content FROM cold_memory_fts JOIN cold_memory ms ON cold_memory_fts.rowid = ms.id WHERE cold_memory_fts MATCH '\"我 喜 欢\"' AND ms.user_id='xxx-uuid';"

# 查看工作记忆（当前对话窗口）
sqlite3 ./data/zoufx-ai.db "SELECT role, content FROM chat_memory WHERE user_id='xxx-uuid' ORDER BY id;"
```

### 8.2 调试：记忆没有被更新

**症状**：用户告诉 AI 他的名字，但 AI 后续还在问名字。

**排查步骤**：

1. **检查工具是否被调用**：
   - 查看后端日志，搜 `update_hot_memory` 或 `📝`
   - 若无日志 → LLM 没有识别到信号或 system prompt 里的工具说明不够清晰

2. **检查数据是否写入**：
   ```bash
   sqlite3 ./data/zoufx-ai.db "SELECT * FROM hot_memory WHERE user_id='xxx';"
   ```
   - 若无数据 → 工具被调用但数据库写入失败（检查权限、磁盘空间）
   - 若有数据但值错误 → LLM 传的参数有问题（如传了"我叫小张"而不是"小张"）

3. **检查是否使用的最新记忆**：
   - 模拟下一个请求的 system prompt 组装：读取 hot_memory snapshot
   - 确认最新的 Hot Memory 值已包含在 system prompt 里

### 8.3 调试：冷内存搜索没有召回

**症状**：用户问"我们之前讨论过 X 吗"，LLM 调用了 search_cold_memory 但没有找到。

**排查步骤**：

1. **检查冷内存是否有相关内容**：
   ```bash
   sqlite3 ./data/zoufx-ai.db "SELECT COUNT(*) FROM cold_memory WHERE user_id='xxx';"
   ```
   - 若为 0 → 没有历史，正常返回"没找到"

2. **检查 FTS5 索引是否正常**：
   ```bash
   sqlite3 ./data/zoufx-ai.db "SELECT cold_memory_fts.rowid, rank FROM cold_memory_fts WHERE cold_memory_fts MATCH '\"美 式\"';"
   ```
   - 若无结果 → FTS 索引有问题，检查写入时的 tokenization 是否正确

3. **手动验证 codepoint split**：
   - 原内容："美式咖啡"
   - 写入 FTS 的形式应为："美 式 咖 啡"
   - 查询时："美式" 应被 split 成"美 式"，MATCH 时用 phrase `"美 式"`

---

## 九、未来扩展方向（v0.2 及之后）

### 9.1 向量检索（v0.2）

**现状**：冷内存只支持基于字面匹配的 FTS5 搜索。

**问题**：
- 用户说"后端相关"，原文是"Java 工程师"，字面不匹配，FTS5 搜不到
- 需要**语义相似性**而不只是关键词匹配

**v0.2 方案**：
- 新增 `vector_embedding` 表，存储每条 ColdMemoryEntry 的向量
- 使用向量数据库（Pinecone / Milvus 等）或 SQLite 的向量扩展
- 搜索时同时进行 FTS5（字面）+ Vector（语义）的 Hybrid Recall，融合排序

### 9.2 记忆压缩与提炼（v0.2 末或 v0.3）

**现状**：冷内存无限增长，越来越多的对话堆积。

**问题**：
- 搜索效率下降
- Token 窗口竞争（历史太多，LLM 看不完）

**v0.2/v0.3 方案**：
- Consolidation Engine：定期分析冷内存
- 将重复的、相关的片段合并，提炼成结构化的"事件记录"
- 写入 HotMemory 作为新的字段（如"用户提过的技术栈列表"、"用户的主要兴趣领域"）
- 老的冷内存行可以归档或删除

### 9.3 多租户与权限（v0.3）

**现状**：单 user_id 隔离，假设一个 Agent 对应一个用户。

**v0.3 方案**：
- 新增 `workspace_id`，支持多用户共享一个 Agent（如团队协作）
- 细粒度的访问控制：某用户只能看自己的记忆，某管理员可以跨用户查询

---

## 十、参考与相关文档

- **[[拟人化AI Agent-v0.12]]**：完整的函数式模块架构说明，包括 memory 模块详设
- **[[CLAUDE.md]]**：项目开发约束、已知瓶颈
- **SystemPromptComposer 源码注释**：Frozen Snapshot 约束的详细说明
- **Memory 模块源码**：SqliteChatMemoryStore / SqliteHotMemoryStore / SqliteColdMemoryStore 的具体实现

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v1.0 | 2026-05-19 | 初版：三层记忆设计、生命周期、工具调用机制、Frozen Snapshot 约束 |
