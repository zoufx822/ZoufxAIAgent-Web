---
title: 拟人化 AI Agent —— v0.01：持久化 + userId + 接口抽象 + 身份识别
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.01
aliases:
  - Humanlike AI Agent v0.01 Plan
  - ZoufxAIAgent v0.01 实施
---

> [!note] 文档定位
> v0.01 详细实施方案。顶层架构、设计哲学与 v0.01~v6 路线见 [[拟人化AI Agent-总设计方案]]。
> v0.1 及后续版本待 v0.01 完成后另立文档（`拟人化AI Agent-v1.md` 等）。

> [!tip] 一句话定义
> 把"==AI 重启后还记得 + 砍掉会话边界 + 留好接口口子 + 第一次见面会主动问称呼=="这四件事一起做掉的最小切片。

---

## 一、目标与边界

### 做

| # | 内容 |
|---|---|
| 1 | **持久化**：`InMemoryChatMemoryStore` → 基于 SQLite 的实现，重启不丢 |
| 2 | **砍 sessionId、改 userId**：后端记忆分区键从 sessionId 切到 userId（前端 sidebar 的 session 概念保留为纯 UI） |
| 3 | **接口抽象**：抽一个 `MemoryStore` 业务接口，业务代码绑接口，方便后续切换实现 |
| 4 | **身份识别（"无眼"拟人化）**：记忆为空时 AI 主动问称呼 |

### 不做（留给后续版本）

详细路线见 [[拟人化AI Agent-总设计方案#十、与当前项目的距离评估|总设计方案 v0.01~v6 路线]]。

> [!warning] 边界原则
> v0.01 只解决"AI 失忆"问题，不动认知架构。

---

## 二、关键设计决策

### 2.1 前端 session 与后端 userId 的职责切分（最重要的概念解耦）

| 概念 | 含义 | 存在哪里 | 是否影响记忆 |
|---|---|---|---|
| **前端 sessionId** | UI sidebar 的"多开聊天框"分组 | `lib/store.ts` 的 `sessions[]`，zustand persist 到 localStorage | ❌ 不影响（纯 UI） |
| **后端 userId** | 唯一记忆分区键 | localStorage `userId` + 后端 SQLite `chat_messages.user_id` | ✅ 一个 userId 一个连续记忆池 |

> [!example] 含义
> 用户在 Convo A 跟 AI 聊"我是 Java 工程师"，切到 Convo B 问"你还记得我做什么的吗？"——AI 会回答"Java 工程师"。这是用户要的 ==无会话边界==。

> [!warning] 如果用户希望 sidebar 不同 session 之间记忆隔离，需要明确否决这个设计——但这违背总设计方案里的"取消会话逻辑"立场。

### 2.2 userId 生成策略

- 前端首次访问：`crypto.randomUUID()`，写入 localStorage 的 `userId` 键
- 旧用户（localStorage 没有 userId）：首次进入时同样生成
- 不做登录注册（拟人化方向，先做单设备本地态）；多设备同步是后话

### 2.3 SQLite 选型

- 驱动：`org.xerial:sqlite-jdbc`（成熟、零运维、单文件）
- 文件位置：`./data/zoufx-ai.db`，通过 `ai.memory.store.db-path` 可配
- 启用 WAL：`jdbc:sqlite:./data/zoufx-ai.db?journal_mode=WAL`（并发读 + 单写）
- 加 `/data/` 到 `.gitignore`

### 2.4 WebFlux 阻塞约束

- LC4J 调用 `ChatMemoryStore` 在框架自己的调度器上（与 `@Tool` 同一情境），对 event loop 无影响——直接 JDBC 即可
- 我们直接调用的接口（如清空记忆）从 controller 走 `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())`

### 2.5 身份识别机制（"无眼"拟人化）

> [!tip] 设计灵感
> 人有眼睛，第一时间识别对方；认不出来就先确认身份再沟通。AI 没有"眼睛"（视觉/面部识别），但可以用 ==记忆是否为空== 作为"是否认识此人"的判断锚点。

#### 实现路径

| 角色 | 行为 |
|---|---|
| 前端 | localStorage 没 userId → 立即生成 UUID 并写回（保证 LC4J 的 `@MemoryId` 总有值，不变动） |
| 后端 `MemoryStore` | 新增 `boolean isEmpty(userId)` 方法（COUNT 查询，开销极小） |
| 后端 `SystemPromptComposer` | `compose(memoryId)` 时调用 `memoryStore.isEmpty(userId)`：为空 → 注入"陌生人迎接"片段；非空 → 跳过（AI 看自己历史就知道你是谁） |

#### 陌生人迎接 prompt 片段（草拟）

```
## 身份识别
你目前不认识对方（没有任何过往对话）。请像一位礼貌的人那样：
- 自然地融入"问好 + 询问称呼"，不要打断对方的诉求；
- 如果对方直接抛出问题，先简短回答，再以一句话追问"方便先问下怎么称呼您？"；
- 不要重复"你好"或机械地反复要名字——一次询问就够。
```

> [!tip] 为什么这样设计
> 所有逻辑都内化在 LLM 行为里（通过 system prompt + 记忆状态），前端只负责 UUID 持久化。这是最符合"拟人化"的实现——==AI 自己决定如何打招呼，没有硬编码的前端 UI 流程==。

### 2.6 v0.01 阶段的固有限制：身份"短期记忆"

> [!warning] 决策已定（用户选 A）：接受限制
> v0.01 阶段没有 UserProfile 这种结构化身份持久化层，所以 ==AI"知道你是谁"的能力 = 你的自我介绍是否还在最近 N 条消息（默认 20）的滑动窗口内==。

#### 具体表现

- 用户首次自我介绍 "我是张三" → AI 在接下来 20 条消息内都知道
- 第 21 条消息开始 → 自我介绍滑出窗口 → 下次 `compose()` 看到 `isEmpty=false` 但实际历史里已没有名字 → AI 可能会再次问候并询问称呼

> [!note]- 这不是 bug，是 v0.01 的边界
> 短期工程缓解（**不在 v0.01 做**，仅备忘）：
> - 把 `ai.memory.max-messages` 从 20 调到 100~200
> - 在 SystemPromptComposer 里加一句"看到用户提过名字就一直用它称呼对方"

---

## 三、数据模型

### 3.1 SQLite 表

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    role        TEXT    NOT NULL,        -- 'system' / 'user' / 'assistant' / 'tool'
    content     TEXT    NOT NULL,        -- LC4J ChatMessage JSON 序列化
    created_at  INTEGER NOT NULL          -- epoch millis
);

CREATE INDEX IF NOT EXISTS idx_user_created ON chat_messages(user_id, created_at);
```

> [!tip] 为什么不展开 ChatMessage 字段？
> LC4J 的 `ChatMessage` 是接口（UserMessage / AiMessage / SystemMessage / ToolExecutionResultMessage 等多种实现），结构差异大；最稳妥是用 LC4J 自带的 `ChatMessageSerializer.messagesToJson` / `messagesFromJson` 序列化整体。v0.01 不必为单字段查询优化。

### 3.2 MemoryStore 业务接口

```java
package com.zoufx.ai.agent.memory;

import dev.langchain4j.data.message.ChatMessage;
import java.util.List;

/**
 * 记忆存储业务接口。LC4J 的 ChatMemoryStore 是技术接口（Object memoryId），
 * 这里抽一层窄接口面向业务（String userId），便于后续扩展。
 */
public interface MemoryStore {
    List<ChatMessage> loadByUserId(String userId);
    void saveByUserId(String userId, List<ChatMessage> messages);
    void deleteByUserId(String userId);

    /** 用于"陌生人识别"——记忆为空 = AI 不认识此人。COUNT 查询，开销极小。 */
    boolean isEmpty(String userId);
}
```

### 3.3 SqliteChatMemoryStore（同时实现两个接口）

```java
@Component
public class SqliteChatMemoryStore implements ChatMemoryStore, MemoryStore {

    @Override public List<ChatMessage> getMessages(Object memoryId) {
        return loadByUserId(memoryId.toString());
    }
    @Override public void updateMessages(Object memoryId, List<ChatMessage> msgs) {
        saveByUserId(memoryId.toString(), msgs);
    }
    @Override public void deleteMessages(Object memoryId) {
        deleteByUserId(memoryId.toString());
    }

    @Override public List<ChatMessage> loadByUserId(String userId) { /* SQLite SELECT + ChatMessageDeserializer */ }
    @Override public void saveByUserId(String userId, List<ChatMessage> msgs) { /* DELETE + INSERT in TX */ }
    @Override public void deleteByUserId(String userId) { /* DELETE */ }
}
```

> [!warning] `updateMessages` 的语义是"用全量替换"
> LC4J 每次都传完整列表。所以 SQLite 实现要在事务里 DELETE + 批量 INSERT。

---

## 四、改动清单

### 4.1 后端

#### 新增文件

| 路径 | 用途 |
|---|---|
| `memory/MemoryStore.java` | 业务接口 |
| `memory/SqliteChatMemoryStore.java` | 实现 LC4J `ChatMemoryStore` + 业务 `MemoryStore` |
| `config/properties/MemoryStoreProperties.java` | `ai.memory.store.*` 配置 |
| `resources/db/schema.sql` | 建表脚本（启动时执行一次） |

#### 修改文件

| 路径 | 改动 |
|---|---|
| `pom.xml` | 加 `org.xerial:sqlite-jdbc`（最新稳定版） |
| `model/ChatRequest.java` | `sessionId` → `userId`（字段直接更名） |
| `assistant/ChatAssistant.java` | `@MemoryId String sessionId` → `@MemoryId String userId` |
| `service/AIChatService.java` | 方法签名 `chat(sessionId, ...)` → `chat(userId, ...)`；日志改 userId；`clearSession` 改名 `clearUserMemory` |
| `controller/AIChatController.java` | 入参 `getSessionId()` → `getUserId()`；删除端点改路径 `/user/{userId}/memory` |
| `config/ai/MemoryConfig.java` | `chatMemoryStore` Bean 从 `InMemoryChatMemoryStore` → `SqliteChatMemoryStore` |
| `config/ai/SystemPromptComposer.java` | 注入 `MemoryStore`，在 `compose(memoryId)` 中检查 `isEmpty(userId)`，为空则拼接"陌生人迎接"片段（实现 2.5 节身份识别机制） |
| `application.yml` | 加 `ai.memory.store.db-path: ./data/zoufx-ai.db` |
| `.gitignore` | 加 `/data/` |

### 4.2 前端

| 路径 | 改动 |
|---|---|
| `lib/store.ts` | 顶层加 `userId: string`（首次启动 `crypto.randomUUID()` 生成并持久化）；`sessions[]` 与 `currentSessionId` 保留，仅作 UI 分组用 |
| `lib/chat-stream.ts` | 请求体 `{ prompt, userId, thinking }`，去掉 sessionId |
| `hooks/use-chat-stream.ts` | 调用 chat-stream 时传 `userId`（从 store 取） |
| `lib/store.ts` 的 zustand persist | 加 `version: 2` + `migrate` 回调：旧 localStorage 没有 userId 时生成新值，sessions 数据保留 |

---

## 五、依赖与配置

### 5.1 pom.xml 增加

```xml
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.50.3.0</version>
</dependency>
```

### 5.2 application.yml 增加

```yaml
ai:
  memory:
    max-messages: 20      # 已有
    store:
      db-path: ./data/zoufx-ai.db
```

---

## 六、验证

### 6.1 持久化验证（核心目标）

1. `mvn spring-boot:run` 启动后端
2. `pnpm dev` 启动前端，浏览器访问 `localhost:3000`
3. 检查 localStorage 自动生成 `userId`
4. 发消息：`我叫张三`，AI 回应
5. **Ctrl+C 关后端，重启**
6. 同浏览器同 sidebar 任意 session 再发消息：`我是谁？`
7. ✅ AI 回答"你叫张三"

### 6.2 跨 session UI 共享记忆验证

1. sidebar 新建 Convo A，发消息：`我喜欢喝美式`
2. sidebar 新建 Convo B，发消息：`我喝咖啡有什么习惯`
3. ✅ AI 在 Convo B 回答"喜欢美式"——证明 ==无会话边界==

### 6.3 多 userId 隔离验证

1. Chrome 正常窗口跑一遍 6.1
2. Chrome 隐身窗口（无 localStorage 共享）打开同地址
3. 隐身窗口发：`我是谁？`
4. ✅ AI 回答不知道——证明 userId 隔离

### 6.4 SQLite 落盘验证

- 用 sqlite3 CLI 打开 `./data/zoufx-ai.db`
- `SELECT user_id, role, substr(content,1,50) FROM chat_messages ORDER BY id DESC LIMIT 10;`
- ✅ 看到刚才的消息

### 6.5 身份识别验证（"无眼"拟人化）

1. 清空 localStorage（或用全新 Chrome 隐身窗口）→ 触发新 UUID 生成
2. **不要**先打招呼，直接发问题：`今天股市怎么样`
3. ✅ AI 应当在回答的同时（或之后）自然追问 "方便先问下怎么称呼您？"
4. 用户回 `我是张三`
5. 继续问几个问题（保持在 20 条窗口内）
6. ✅ AI 知道并称呼"张三"
7. **重启服务**，同浏览器问 `我是谁？`
8. ✅ AI 仍记得"张三"（持久化 + 窗口未滑出）
9. 已知限制验证：连发 20+ 条无关消息把"我是张三"挤出窗口，再问 `我是谁？`
10. ⚠️ AI 可能再次问候 + 询问称呼——这是 ==v0.01 已知限制==

---

## 七、风险与开放问题

| # | 决策点 | 我的建议 | 理由 |
|---|---|---|---|
| 1 | 前端 sessionId 概念是否完全保留？ | **保留作 UI 概念，从 API 中删除** | 用户立场是"取消会话逻辑"指的是后端记忆边界；UI 侧边栏分组是产品体验问题，不冲突 |
| 2 | userId 生成方式 | **localStorage UUID** | 单设备本地态最简单；多设备同步是后话 |
| 3 | SQLite vs Postgres | **SQLite** | v0.01 个人 AI 单机，零运维 |
| 4 | 记忆导出端点（OpenClaw 启示） | **加一个 `GET /user/{userId}/memory/export`** | 成本小，调试/透明性收益大 |
| 5 | `clearSession` 端点 | **改名 `/user/{userId}/memory` DELETE，语义改为"清空记忆"** | 与 userId 模型一致 |
| 6 | 旧前端用户的 localStorage 兼容 | **加 zustand persist migrate**：sessions 保留，userId 缺失则生成 | 不丢用户已有的对话历史（UI 层） |
| 7 | 身份识别交给 LLM 还是前端硬流程？ | **LLM**（system prompt + 记忆是否为空判断） | 拟人化的本质是让 AI 自己处理识别行为；前端硬流程会让交互生硬 |
| 8 | 陌生人迎接是"礼貌打断"还是"自然融入"？ | **自然融入**（先答用户的诉求，再追问称呼） | 人和你刚认识时也不会卡死流程；prompt 里明确写"不要打断对方诉求" |
| 9 | 身份记得多久（v0.01 阶段）？ | **接受滑窗限制**（用户已选 A） | v0.01 没结构化 UserProfile |

---

## 八、估时

| 阶段 | 估时 |
|---|---|
| 后端（接口 + SQLite 实现 + 配置 + 单元测试） | 3-4 小时 |
| 前端（store 改动 + migrate） | 1-2 小时 |
| 联调与验证 | 1-2 小时 |
| **合计** | ==半天到一天== |
