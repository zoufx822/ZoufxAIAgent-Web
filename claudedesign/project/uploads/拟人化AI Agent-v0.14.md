---
title: 拟人化 AI Agent —— v0.14：UserImpression 内在维度 + significant-event / commitment 两个新 type
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.14
aliases:
  - Humanlike AI Agent v0.14 Plan
  - ZoufxAIAgent v0.14 实施
---

> [!note] 文档定位
> v0.14 在 v0.13 / v0.135 已就位的 `PromptSection` SPI + `hot_memory.type` 维度 + 单一 `ChatAssistant` 装配上做三件事：
> 1. UserImpression 字段从「外表 5 字段」扩到「外表 + 内在 10 字段」+ Impression Completeness 阈值机制 + 三段式主动了解模式
> 2. 启用 `hot_memory.type=significant-event`（重要经历，append-only）
> 3. 启用 `hot_memory.type=commitment`（双方承诺，append-only）
>
> 前置：[[拟人化AI Agent-v0.13]]（PromptSection / hot_memory.type / yml 命名空间）、[[拟人化AI Agent-v0.135]]（LLM Profile 化 / 单 ChatAssistant / capability 接口 / ChatController 收敛 HTTP 入口）。下一阶段：[[拟人化AI Agent-v0.2]]（Recall 引擎升级）。

> [!tip] 一句话定义
> AI 不再只是知道"你叫什么、做什么"——会==主动了解人==、==记得共享的经历==、==记得双方的承诺==。

> [!important] v0.13.1 已合并的 username 分支处理（v0.14 实施时必须遵守）
> v0.13.1 临时方案：`IdentityPromptSection` 在 username 缺失时段开头注入"本轮引一次问称呼"指令。
> v0.14 合并方向（已拍板）：
> 1. **删除** v0.13.1 的 `UNKNOWN_USERNAME_DIRECTIVE` 常量 + `if (!knowsUsername)` 分支，`IdentityPromptSection` 退化回 v0.13 原设计「只渲染已识别字段」
> 2. `UserImpressionFields.FieldSpec` 增加 `nameForUser` 字段（如 username → "称呼"、role → "你做什么的"），供 stranger mode-prompt 动态拼出人话
> 3. `ImpressionGuidanceSection` 的 stranger mode-prompt ==动态生成==：按 `FIELDS` 声明顺序找未填的前 1~2 字段，注入"本轮自然引一次问 {nameForUser}"——所有字段统一机制
> 4. 通用约束块（"至少引一次"、"不打断对方主线诉求"、"已问过未答就别追问"、反模式枚举）从 v0.13.1 抄过来作为 stranger mode 通用部分
> 5. username 仍是优先级最高字段（FIELDS 声明顺序第 1），自然被优先问到，但==不再是硬编码特殊路径==

---

## 一、v0.13 遗留 → v0.14 回应

| v0.13 遗留 | 表现 | v0.14 回应 |
|---|---|---|
| `user-impression` 只有"外表 5 字段" | 知道对方"叫张三、Java 后端、爱围棋"，但==不知道他是怎样的人==——回答风格千篇一律 | 加 5 个内在维度：personality / habits / hobbies / values / communication_style |
| AI 永远被动 | 除 v0.13.1 起 IdentityPromptSection 兜底问称呼外，其他字段全靠用户主动告知 | 引入 Impression Completeness 阈值 + 三段式主动了解模式（stranger / half-known / fully-known）+ 深度话题拒答策略 |
| `hot_memory.type` 维度建好骨架但只跑 user-impression | "重要经历"和"承诺"无处安放——AI 记不住"上次提到对方父亲去世"、"我答应帮对方梳理 React 学习路径" | 启用 `significant-event`（叙事性事件，append-only）+ `commitment`（==对话双方==的承诺，append-only） |

> [!warning] v0.14 不做
> - 向量检索 / Hybrid / 三维加权 Recall（v0.2）
> - LLM 评分 Importance / Consolidation / Reflection / 主动 Nudges（v0.3）
> - 承诺履行状态追踪（pending / fulfilled / broken）（v0.3 Reflection）
> - ==v0.14 的"主动了解"≠"主动行为"==：AI 只在被触发的对话回合内调整提示词倾向，不会自己开口、不会跨会话推送。真正的"主动循环"是 v0.6 Heartbeat 范畴

---

## 二、核心概念

### 2.1 hot_memory 三种 type 全景

| `hot_memory.type` | 语义 | 写入模式 | 写入工具 | 渲染段 | 状态 |
|---|---|---|---|---|---|
| `user-impression` | 稳定的用户画像属性 | 结构化 KV，UPSERT 后写胜 | `update_user_impression(key, value)` | `IdentityPromptSection` | v0.13 已落地；v0.14 扩 5 内在字段 |
| `significant-event` | 重要经历 / 共享事件 | 叙事性，append-only（key=UUID） | `record_significant_event(description)` | `SignificantEventSection` | v0.14 新增 |
| `commitment` | ==对话双方做出的承诺== | 叙事性，append-only（key=UUID；value 必须以承诺方为前缀） | `record_commitment(description)` | `CommitmentSection` | v0.14 新增 |

> [!note] 不做通用 `update_hot_memory(type, key, value)` 工具
> 沿用 v0.13 决策：专用工具（语义明确的工具名 + 专用 prompt）比通用工具准确率高得多；append-only 与 UPSERT 操作语义本就不同。

### 2.2 PromptSection 注入顺序

```
顶部一行：当前日期（Composer 直接拼）
order=10  SoulPromptSection             「## 关于你自己」
order=20  IdentityPromptSection         「## 关于对方」                ← v0.14 加 5 内在字段
order=22  SignificantEventSection       「## 你与对方共享的重要经历」  ← v0.14 新增
order=24  CommitmentSection             「## 双方做出的承诺」          ← v0.14 新增
order=26  ImpressionGuidanceSection     「## 你对对方的了解程度」      ← v0.14 新增
order=30  ToolsPromptSection            「## 可用工具」
order=40  MoodPromptSection             「## 情绪标记」
```

22 / 24 / 26 三个新 Section 都属于"对方画像层"，注入到 Identity 之后、Tools 之前。

### 2.3 关键认知点

- **"主动了解模式"不是"主动行为"**：仍只在用户开口后说话；调整提示词倾向≠跨会话推送
- **内在字段不靠"提取"**：与外表字段同款机制——LLM 在合适时机通过 `update_user_impression` 工具 UPSERT 写入。Hot Memory ==不做派生抽词==
- **significant-event / commitment 不是 cold_memory**：cold 走 Recall 路径（v0.2 引入向量），靠"提到话题"被检索；hot 是"见到此人就该浮现"的常驻记忆，每请求 system prompt 注入
- **承诺是双向的**：AI 答应对方的 + 对方答应 AI 的，都进 commitment 表；靠 value 文本前缀区分（"我（AI）答应..." / "{对方称呼} 答应..."），==schema 不加 side 列==
- **承诺无履行状态**：v0.14 只记原始文本，履行追踪是 v0.3 Reflection 范畴

---

## 三、功能 1：UserImpression 内在维度 + 主动了解模式

### 3.1 理念

人类不只通过"做什么的、叫什么名字"认识一个人，还需要"==他是怎样的人=="——做事急还是慢、看问题结构化还是直觉、希望被怎样对待。AI 缺乏这层，回答就只能是"对正确职业画像的标准回答"，无法做到"对你这个人的回答"。

另一边，==AI 永远是被动==——v0.14 引入阈值机制让 AI 在了解不足时==在被触发的回合内==主动追问 + 对深度话题礼貌拒答。

### 3.2 设计决策

**内在 5 字段选哪些**（沿用"了解一个人时最先问什么"经验维度）：

| 字段 | 含义 | 信号示例 | 排除项 |
|---|---|---|---|
| `personality` | 性格特征 | "我做事比较慢热" / "我容易紧张" | MBTI 类型（学术化 / 易标签化） |
| `habits` | 行为习惯 | "我每天早上跑步" / "习惯先列清单" | 日程安排（临时性事实） |
| `hobbies` | 活动层爱好（vs `interests` 话题层） | "学钢琴" / "周末爬山" / "玩 Dota" | interests 是话题层兴趣，hobbies 是活动层实操，允许两边都写 |
| `values` | 在意的价值 | "真诚比客套重要" / "效率第一" | 政治立场 / 宗教信仰（敏感） |
| `communication_style` | 期望的互动模式（vs `tone` AI 自身语气） | "直接说不用客套" / "希望多举例" | 与 tone 严格区分：tone = AI 输出语气，communication_style = 对方期望模式 |

**fill_ratio 三档阈值**（fill_ratio = 已填非空字段数 / `FIELDS.size()`，v0.14 后 = 已填数 / 10）：

| mode | 阈值 | 行为倾向 |
|---|---|---|
| `stranger` | fill_ratio < 0.3 | 本轮自然引一次问未填字段 + 深度话题拒答 |
| `half-known` | 0.3 ≤ fill_ratio < 0.7 | 每 2~3 轮自然追问 + 深度话题可答但明示"基于目前了解" |
| `fully-known` | fill_ratio ≥ 0.7 | 不再主动追问，持续观察新信号 |

阈值与文案均落 yml（`ai.memory.hot.user-impression.*`），用户可调。

**几个不做的小决策**：

- 不引入 LLM 评分 fill_ratio——避免每次 `compose()` 多一次 LLM 调用（v0.3 范畴）
- 不抽 `ImpressionCompletenessEvaluator` 接口——单 Section 内私有方法即可（YAGNI）
- 深度话题拒答覆盖面默认是"个性化判断 / 情感建议 / 人生选择 / 投资建议"，文案在 yml stranger mode-prompt 内

### 3.3 代码改动

| 操作 | 文件 | 要点 |
|---|---|---|
| 修改 | `memory/api/UserImpressionFields.java` | `WHITELIST_LITERAL` 字面同步扩到 10 字段；`FIELDS` 静态块新增 5 个 `FieldSpec`；`FieldSpec` record 新增 `nameForUser` 字段（用于 stranger mode-prompt 动态拼"问 {nameForUser}"） |
| 修改 | `tool/impl/UserImpressionUpdateTool.java` | 仅扩 `@Tool` 描述文案为"外表与内在"，`promptInstructions()` 方法体不动（detection rule 已从 FIELDS 动态拼接） |
| 新建 | `memory/property/ImpressionProperties.java` | `@ConfigurationProperties("ai.memory.hot.user-impression")`，承载 `Completeness {strangerThreshold, fullyKnownThreshold}` + `Map<String, String> modePrompts` |
| 新建 | `chat/impl/ImpressionGuidanceSection.java` | 实现 `PromptSection` order=26；读 user-impression snapshot 算 fill_ratio → 落档 → 注入 mode-prompt；stranger 段==动态拼=="问 {nameForUser}"（按 FIELDS 顺序找未填的前 1~2 个） |
| 修改 | `chat/impl/IdentityPromptSection.java` | 删除 v0.13.1 的 `UNKNOWN_USERNAME_DIRECTIVE` 常量 + `if (!knowsUsername)` 分支，退化回 v0.13 原设计"只渲染已识别字段" |
| 修改 | `application.yml` | 加 `ai.memory.hot.user-impression.{completeness, mode-prompts}` 子节 |

> [!warning] WHITELIST_LITERAL 与 FIELDS 必须配套
> v0.13 已就位的 fail-fast 静态块在 `FIELDS` 初始化后会校验 `WHITELIST_LITERAL.equals(String.join(" / ", FIELDS.keySet()))`，漏改启动直接抛 `IllegalStateException`。

> [!note] `@P` 注解仍能拼接 WHITELIST_LITERAL
> `WHITELIST_LITERAL` 是 `public static final String` 编译期常量，方法调用不是。`@P("...必须从白名单选：" + UserImpressionFields.WHITELIST_LITERAL)` 这种字面拼接仍然合法——v0.13 已确立的范式。

### 3.4 配置示例

```yaml
ai:
  memory:
    hot:
      user-impression:
        completeness:
          stranger-threshold: 0.3
          fully-known-threshold: 0.7
        mode-prompts:
          # stranger 段需含一个 {fieldQuestion} 占位（或类似约定），
          # ImpressionGuidanceSection 代码动态拼"本轮自然引一次问 {nameForUser}"
          stranger: |
            你对对方几乎了解不足。在本轮回复里：
            - 先正面回应对方主线诉求（不打断、不绕题）
            - 然后自然地引一次问对方的某个画像信息（具体问哪个字段由系统注入：{fieldQuestion}）
            - 如果 chat memory 显示你之前已经问过该字段且对方没正面答，==别再追问==
            - 反模式：明明该问却通篇绕过、完全不引向认识——是错的，至少引一次
            - 如果对方提出"个性化判断 / 情感建议 / 人生选择 / 投资建议"等深度话题，
              礼貌说明"我们刚认识不久，我想先了解你一些，再给意见会更靠谱"，然后顺势抛出问题
          half-known: |
            你已经认识对方一段时间，但对其内在仍不够了解。在合适的时机：
            - 自然地穿插一句追问，但不要每轮都问，每 2~3 轮一次
            - 当对方分享细节时，主动调 update_user_impression 写入推断到的字段
            - 深度话题可以尝试给意见，但要明示"基于我目前对你的了解"
          fully-known: |
            你已经较充分地了解对方。在回答时：
            - 使用对方习惯的称呼与沟通风格
            - 个性化判断 / 建议时显式引用你对对方的认知（如"你之前提过你做事偏谨慎"）
            - 仍在对话中持续观察新信号，必要时 update_user_impression 补充或修正
```

> [!note] yml 字符串风格
> 多行用 `|` 保留换行（`>` 会折叠空格破坏列表渲染）。下划线 key（如 `forbidden_patterns`）需 `"[...]"` 包裹防 relaxed binding 改写——本节无此场景但 v0.13 已遇到。

### 3.5 验证

- 全新 userId 发起对话：fill_ratio=0 → stranger mode → 自我介绍并问称呼 → 用户答"张三" → `update_user_impression(username=张三)` 触发；hot_memory 表新行可见
- 用户说"其实我比较慢热"→ AI 主动调 `update_user_impression(personality=慢热、初识时话少)`
- fill_ratio=0.1 时问"我该不该辞职"→ AI 礼貌拒答 + 抛 2~3 个了解性问题
- 灌入 5 字段（fill_ratio=0.5）后再问 → 切 half-known，给出"基于目前了解"的有保留意见
- 灌到 7 字段（fill_ratio=0.7）→ 切 fully-known，不再主动追问，回答引用已知字段
- 故意只改 `FIELDS` 不改 `WHITELIST_LITERAL` → 启动抛 `IllegalStateException`

---

## 四、功能 2：significant-event type（重要经历）

### 4.1 理念

人类记忆里"见到老朋友自然记起的东西"不止名字 / 职业——还有"上次他爸去世"、"他正在备考研究生"这类==叙事性人生事件==。这些==不属于结构化画像==，无法落进 user-impression 的 KV schema。没有这类记忆，AI 在对话中表现得像"每次都没看过对方的人生剧本"。

### 4.2 设计决策

- **写入界定**：留给 LLM 判断，但 `promptInstructions` 给出强信号 + 反模式
  - 命中：情绪显著的人生事件（亲人去世 / 重大成就 / 失败 / 婚恋 / 健康变化）/ 长期处境（在备考 / 在转行 / 异地分居）/ 第一次提到的带时间标记的具体经历
  - 反模式：临时性事实（"刚下班"）/ 偏好习惯（应写 hobbies / habits）/ 一次性闲聊
- **append-only + key=UUID**：`java.util.UUID.randomUUID().toString()`。无需排序语义（DB 按 `updated_at` DESC）、无需可读性（key 对 LLM 与用户都不可见）、并发零冲突
- **注入条数 N=5（yml 可调）**：超过的留 DB，等 v0.2 Recall 召回
- **不做 dedup**：detection rule 教育 LLM "第一次提到才写"；重复写不致命（注入会自然挤掉旧条目）。v0.3 Consolidation 真正合并

### 4.3 代码改动

| 操作 | 文件 | 要点 |
|---|---|---|
| 修改 | `memory/api/HotMemoryType.java` | 启用 `SIGNIFICANT_EVENT = "significant-event"`；==同时一次性加齐 `COMMITMENT = "commitment"`==（第五章用，避免改两次） |
| 修改 | `memory/api/HotMemoryStore.java` | 新增 `List<HotMemoryEntry> recent(String userId, String type, int limit)`——按 `updated_at DESC` 返回 |
| 修改 | `memory/impl/SqliteHotMemoryStore.java` | 实现 `recent`：`SELECT key, value, updated_at FROM hot_memory WHERE user_id=? AND type=? ORDER BY updated_at DESC LIMIT ?` |
| 新建 | `memory/model/HotMemoryEntry.java` | `record HotMemoryEntry(String key, String value, long updatedAt)`——与 `ColdMemoryEntry` 同位置/同性质 |
| 新建 | `memory/property/SignificantEventProperties.java` | `@ConfigurationProperties("ai.memory.hot.significant-event")`，单字段 `int recentInjectLimit = 5` |
| 新建 | `tool/impl/SignificantEventRecordTool.java` | `@Tool record_significant_event(@ToolMemoryId userId, @P description)`；UUID 作 key 调用 `hotMemoryStore.upsert`；`promptInstructions()` 写信号 + 反模式 |
| 新建 | `chat/impl/SignificantEventSection.java` | `PromptSection` order=22；读 recent N 条 → 渲染「## 你与对方共享的重要经历（最近 N 条）」+ bulleted 列表；N 条均为空时返回 null |
| 修改 | `chat/config/AssistantConfig.java` | `chatAssistant` Bean 的 `.tools(...)` 加入 `significantEventRecordTool` 参数（v0.135 起单一 Bean，只改一处） |
| 修改 | `application.yml` | 加 `ai.memory.hot.significant-event.recent-inject-limit: 5` |

### 4.4 验证

- 用户说"去年我父亲去世了"→ AI 主动调 `record_significant_event`，hot_memory 新行可见
- 同 userId 已有 3 条 → POST /ai/chat → system prompt 含「## 你与对方共享的重要经历（最近 3 条）」+ 列出 3 条
- 用户提到母亲，AI 自然引用"我记得你提过母亲一个人住"
- 写入 10 条 → 注入仅 5 条；yml 调到 10 → 全注入
- 用户说"我今天迟到了"→ AI 不调（反模式信号）

---

## 五、功能 3：commitment type（承诺）

### 5.1 理念

一个真实的对话搭档==会记得对话双方许下的承诺==：
- AI 答应过对方的（"上次我答应帮你梳理 React 学习路径"）
- 对方答应自己的（"上次你说这周内会把代码 review 完发给我"）

没有承诺记忆，AI 看起来要么"健忘"，要么"无脑兑现一切"。

### 5.2 设计决策

- **双向收录**：AI 答应对方 + 对方答应 AI + 双方共同约定，全进 commitment 表
- **承诺方靠 value 文本前缀区分**：`我（AI）答应{对方称呼}：...` / `{对方称呼}答应我：...` / `我们约定：...`——==schema 不加 side 列==。简化为单一字段，让 LLM 在 detection rule 里学会前缀。要求 `promptInstructions` 显式给出前缀模板
- **同样 append-only + UUID key + recent N（默认 5）**：复用功能 2 的 `HotMemoryStore.recent` 基础设施
- **无履行状态**：v0.14 只记原始承诺文本。AI 在对话中只能说"你之前承诺过 X"或"我之前答应过 X"，不能自动判定"做到 / 没做到"。v0.3 Reflection 加履行追踪

### 5.3 代码改动

复用功能 2 已建好的基础设施（`HotMemoryType.COMMITMENT` 常量、`HotMemoryStore.recent`、`HotMemoryEntry`）。

| 操作 | 文件 | 要点 |
|---|---|---|
| 新建 | `memory/property/CommitmentProperties.java` | `@ConfigurationProperties("ai.memory.hot.commitment")`，单字段 `int recentInjectLimit = 5` |
| 新建 | `tool/impl/CommitmentRecordTool.java` | `@Tool record_commitment(@ToolMemoryId userId, @P description)`；`@Tool` 描述 + `promptInstructions` 必须含承诺方前缀模板与正反例 |
| 新建 | `chat/impl/CommitmentSection.java` | `PromptSection` order=24；读 recent N → 渲染「## 双方做出的承诺（最近 N 条）」+ bulleted 列表 |
| 修改 | `chat/config/AssistantConfig.java` | `.tools(...)` 再加 `commitmentRecordTool`（与 4.3 节的 significantEventRecordTool 一起一次性补） |
| 修改 | `application.yml` | 加 `ai.memory.hot.commitment.recent-inject-limit: 5` |

### 5.4 验证

- 用户说"你这周帮我梳理 React 学习路径吧"→ AI 答应 → 调 `record_commitment(description="我（AI）答应{用户}：本周帮其梳理 React 学习路径")`
- 用户说"我这周内把代码 review 完发给你"→ AI 调 `record_commitment(description="{用户}答应我：本周内 review 完代码")`
- 下次对话注入「## 双方做出的承诺」段，两条都在
- 用户说"我们一起读 SICP 吧"→ AI 调 `record_commitment(description="我们约定：一起读 SICP")`
- 反模式：用户说"我帮你点杯咖啡"（即时性事实）→ AI 不调

---

## 六、配套改动

### 6.1 AssistantConfig 单一改动点（v0.135 起）

v0.135 已经把 thinkingAssistant / nonThinkingAssistant 合并为单一 `chatAssistant` Bean。v0.14 只需在该 Bean 的 `.tools(...)` 参数列表里追加两个新工具：

```java
public ChatAssistant chatAssistant(
        StreamingChatModel chatModel,
        ChatMemoryProvider chatMemoryProvider,
        TavilySearchTool tavilySearchTool,
        ColdMemorySearchTool coldMemorySearchTool,
        UserImpressionUpdateTool userImpressionUpdateTool,
        SignificantEventRecordTool significantEventRecordTool,  // ← v0.14 加
        CommitmentRecordTool commitmentRecordTool,              // ← v0.14 加
        SystemPromptComposer composer) {
    return AiServices.builder(ChatAssistant.class)
            .streamingChatModel(chatModel)
            .chatMemoryProvider(chatMemoryProvider)
            .systemMessageProvider(composer.asProvider())
            .tools(tavilySearchTool, coldMemorySearchTool, userImpressionUpdateTool,
                    significantEventRecordTool, commitmentRecordTool)
            .build();
}
```

### 6.2 pom.xml 版本同步

`0.13.5-SNAPSHOT` → `0.14.0-SNAPSHOT`。仅改项目自身 `<version>`（紧邻 `<name>ZoufxAIAgent</name>`），不动 LC4J / Spring Boot / 插件版本。

### 6.3 前端：零改动

v0.14 是后端 + 提示词层增量。前端潜在可见的变化（==本期不强制处理==）：

- `GET /ai/memory/hot/{userId}?type=user-impression` 返回的 Map 多 5 个内在字段
- `GET /ai/memory/hot/{userId}?type=significant-event` / `?type=commitment` v0.13 能调通但永远空，v0.14 起会返回 `Map<uuid, description>`（==不带时间序==——若前端要有序展示，等单独的"重要经历 / 承诺"展示设计稿）

> v0.135 起 HTTP 入口统一在 `ChatController`（原 MemoryController 已合并）；URL 全部归 `/ai/*` 命名空间。

---

## 七、风险与开放问题

| # | 决策点 | 建议 | 理由 |
|---|---|---|---|
| 1 | fill_ratio 计算每次 compose 都打一次 snapshot 是否重 | 不优化 | 单条 SELECT < 1ms；`IdentityPromptSection` / `ImpressionGuidanceSection` 都需要 snapshot，v0.14 暂忍受两次调用 |
| 2 | "深度话题拒答"覆盖面是否过宽 | yml 化提示词 → 易调；stranger 拒答，half-known 允许保留意见 | 避免一刀切；实测后微调 |
| 3 | 内在字段 UPSERT 后写胜会让历史标签漂移吗 | 是有意为之；v0.3 Consolidation 时可加变更日志 | LLM 自行决定如何"迭代描述" |
| 4 | append-only 不 dedup | v0.14 不做；detection rule 教育"第一次提到才写"，重复写也会被新条目自然挤掉 | v0.3 Consolidation 真正合并 |
| 5 | commitment 不追踪履行状态会让 AI 无脑兑现吗 | CommitmentSection 渲染段加说明"以下是双方承诺，但本系统不追踪履行" | 把履行判断责任交给 LLM 上下文推理 |
| 6 | UUID 作 key 需要索引吗 | 不需要 | PK `(user_id, type, key)` 已覆盖单点；测试期数据量小 |
| 7 | `recent` 方法是否需要扩到全部 type | 是——通用 append-only 基础设施 | user-impression 也能用（虽然语义是 UPSERT，方法不限） |
| 8 | I1（每轮至少用一次称呼）vs W4（信息密度高于装饰）冲突 | v0.14 实施后验证 ImpressionGuidanceSection 三段式是否自然解决；若 half-known 以上仍有问题再调 username 的 renderDirective | v0.13.1 /test-prompt TP-08 暴露过 |

---

## 八、与后续版本衔接

- `HotMemoryStore.recent(userId, type, limit)` 是通用 append-only 基础设施——v0.2 Recall 升级 / v0.3 Reflection 都可复用
- `HotMemoryEntry(key, value, updatedAt)` 已带 timestamp，承诺履行状态追踪（v0.3）只需 schema 加 status 列 + record 升级
- `UserImpressionFields.FieldSpec` 抽象继续支撑加字段（如 v0.x 加 `lifestyle` / `aspirations` 走相同流程）
- 三个新 Section 都是 `PromptSection` 实现，v0.2 Recall 召回片段 / v0.3 cognitive load 可作为新 Section 同序接入
- `ImpressionGuidanceSection` 的 fill_ratio 计算可在 v0.3 替换为 LLM 评分版本（抽 `ImpressionCompletenessEvaluator` 接口）

---

## 九、相关链接

- [[拟人化AI Agent-v0.13]] —— PromptSection SPI + `hot_memory.type` 维度 + yml 命名空间重整
- [[拟人化AI Agent-v0.135]] —— LLM Profile 化 / 单一 ChatAssistant / capability 接口 / ChatController 收敛 HTTP 入口
- [[拟人化AI Agent-v0.11]] —— UserProfile / SOUL / 情绪系统的初始落地
- [[拟人化AI Agent-v0.2]] —— Recall 引擎升级（向量 + Hybrid + 三维加权）
- [[拟人化AI Agent-总设计方案]] —— 全版本路线图与顶层愿景

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v0.14 | 2026-05-23 | 文档精简重写：从 1623 行（为 Haiku 准备的复制即用代码）压到 ~350 行（理念 + 设计决策 + Opus 级实现指南）。同步 v0.135 影响：单 chatAssistant Bean 注入 / pom 基准 0.13.5 / 前端 URL 归 /ai/* / 链接补 v0.135 |
| v0.14 草稿 | 2026-05-22 | 三大功能初稿，含完整文件代码与 27 步实施清单 |
