---
title: 拟人化 AI Agent —— v0.13：System Prompt 模块化重构 + Hot Memory 分层
tags:
  - AI
  - Agent
  - 拟人化
  - 实施方案
  - v0.13
  - 重构
aliases:
  - Humanlike AI Agent v0.13 Plan
  - ZoufxAIAgent v0.13 实施
---

> [!note] 文档定位
> v0.13 一次解决三个 v0.11/v0.12 遗留问题：
> 1. ==System Prompt 层模块化重构==（`SystemPromptComposer` 单类大杂烩 + 难扩展）
> 2. ==提示词常量外化 + UserImpression 字段单一来源==（display_name 不再特殊化；user-impression 字段集 + directive 收敛到 `UserImpressionFields` 常量类）
> 3. ==Hot Memory 数据模型分层==（`hot_memory` 加 `type` 字段，user-impression 收敛为子类，为未来 significant-event 等留骨架）
>
> 顶层架构与版本路线见 [[拟人化AI Agent-总设计方案]]；前置实现见 [[拟人化AI Agent-v0.11]] 与 [[拟人化AI Agent-v0.12]]；下一阶段见 [[拟人化AI Agent-v0.14]]。
> v0.13 不动 Recall 路径，也不引入向量库；不增加任何对外可观察的新功能，纯是把"模型边界 / 模块边界 / 配置边界"理顺。

> [!tip] 一句话定义
> 把 v0.12 的「`SystemPromptComposer` 单类大杂烩 + 字符串常量散落 + hot_memory 等价于 user-impression」三个问题一次性解决：**编排器 + `PromptSection` 模块化、SOUL 文案进 yml + user-impression 字段收敛到 `UserImpressionFields` 常量类（单一来源）、hot_memory 加 type 字段把 user-impression 收敛为子类**——为后续版本铺好底座。

> [!info] 文档结构说明
> 章节 一→二→三 是 v0.13 的目标全景与术语对齐；四~六章按 ==功能/改造单元== 组织实施细节，**每章内部统一为「理念 → 数据库改动 → 代码改动 → 配置 → 验证」结构**，与 v0.11 / v0.12 文档同款。

> [!warning] v0.13 在路线图中的位置
> v0.13 是 ==v0.12 与 v0.14 之间的「纯重构 + 数据模型分层」版本==——它==不引入新功能==（UserImpression 内在维度留给 v0.14），也==不动认知架构==，只做三件事：
> 1. **重构 A**：把过程式塞满的 `SystemPromptComposer` 拆成「编排器 + N 个 `PromptSection`」
> 2. **重构 B**：SOUL 文案进 yml + user-impression 字段集合并到 `UserImpressionFields` 单一来源（display_name 不再特殊）
> 3. **数据模型 C**：hot_memory 加 type 字段，user-impression 收敛为子类
>
> 改动覆盖 Schema + Prompt + 配置层，==零侵入 LC4J 框架契约==、==零改动 Recall 路径==、==零改动 SOUL 字段语义==，确保后续版本不受影响。开发流程允许==清库重启==免迁移成本。

---

## 一、v0.11 / v0.12 遗留盘点与 v0.13 回应

v0.11 落地了 SOUL + UserProfile 多字段 + status/mood；v0.12 完成了函数式模块架构重构。留到 v0.13 的有==四类痛点==：

| v0.11 / v0.12 遗留 | 表现 | v0.13 回应 |
|---|---|---|
| `SystemPromptComposer` 单类 260 行 + 6 段过程式拼接 | 类内同时承担"角色 / 全局上下文 / SOUL / UserProfile / 工具集 / 响应规则 / Mood"七件事，新增段落必须改 Composer 类本体，违反开闭原则 | 抽象 `PromptSection` 接口；Composer 退化为按 `order()` 收集与拼接的编排器；为后续段落（recall 召回片段 / cognitive load / heartbeat 提醒）预留扩展点 |
| 常量散落在 Composer 内部（`ROLE` / `STRANGER_GREETING` / `GLOBAL_RULES` / `KEY_TEMPLATES`） | 修改提示词要改 Java 源码、重新编译、重启；与已外化到 yml 的 `soul.seed` / `mood.keywords` 风格分裂 | `ROLE` 并入 `soul.seed.role`；`STRANGER_GREETING` 并入 `soul.seed.principles`（"陌生 / 已认识"通用人际行为原则）；`GLOBAL_RULES` ==移除==（现代模型对静态/动态问题判断已足够准，规则属过度防御）；`KEY_TEMPLATES` 收敛为 `UserImpressionFields.FIELDS` 常量（Java 单一来源，==不进 yml== —— 见 5.1 痛点 1） |
| display_name 与其他 user-impression 字段被特殊化处理 | Composer 内一段大块"称呼锚"特殊路径，其他字段降级为单行"- 对方的XXX：{value}" | 所有字段统一抽象为 `(数据值, 行为指令模板)` 对——display_name 改名 `username`，与 language / role / interests / tone 平等渲染；"三态判定"瓦解为"段是否出现"隐式信号 + SOUL principles 兜底 |
| `hot_memory` 表 = user-impression 字典 | 表名是 hot_memory 但实际只能装一种东西，未来"重要事件"无处可栖 | 表加 `type` 列，PK 改为 `(user_id, type, key)`；`user-impression` 是 v0.13 落地的唯一 type；schema 为未来 `significant-event` 等留骨架 |

> [!warning] v0.13 不做但后续版本会做
> ==向量检索 / Hybrid 召回 / 三维加权 Recall== 是 v0.2 范畴。
> ==UserImpression 内在维度扩展 + 主动了解模式== 是 [[拟人化AI Agent-v0.14|v0.14]] 范畴。
> ==`significant-event` 等其他 hot_memory type== 留到后续版本：v0.13 只把骨架（type 列）建好，操作语义和工具不展开。
> ==LLM 评分 Importance / Consolidation Engine / Reflection / 主动 Nudges== 是 v0.3 范畴。

---

## 二、v0.13 工作范围与本文档导航

### 2.1 v0.13 包含项（章节索引）

| 类型 | 编号 | 名称 | 主要解决 v0.11/v0.12 哪个短板 | 详见章节 |
|---|---|---|---|---|
| 工程改造 | 改造 A | **`SystemPromptComposer` 模块化重构（`PromptSection` 抽象）** | 单类大杂烩 + 难扩展 | 第四章 |
| 工程改造 | 改造 B | **SOUL 文案进 yml + UserImpression 字段收敛到 `UserImpressionFields` 单一来源** | 常量散落 + display_name 特殊化 | 第五章 |
| 数据模型 | 改造 C | **hot_memory 加 type 字段、user-impression 收敛为子类** | hot_memory 概念越权（混淆"重要记忆"与"用户画像"） | 第六章 |
| 工程改造 | 改造 D | **yml 命名空间重整（spring.ai.* / ai.retry / ai.web-search 全部按业务模块归位）** | 配置散落、借用 Spring AI 官方命名空间未来易冲突、retry 跨模块耦合 | 第六章半（6A） |

### 2.2 v0.13 不做（留给后续版本）

- ❌ 向量检索 / Hybrid / 三维加权 Recall（v0.2）
- ❌ UserImpression 内在维度扩展 + 主动了解模式（[[拟人化AI Agent-v0.14|v0.14]]）
- ❌ Importance LLM 评分 / Consolidation / Reflection（v0.3）
- ❌ 其他 hot_memory type（`significant-event` 等）的写入工具与读出 Section

> [!warning] 边界原则
> v0.13 改的是「system prompt 怎么拼装」+「hot_memory 怎么分类」
> - ==不引入新功能==、==不改 SOUL 字段语义==、==不改 Recall 路径==
> - 整个 ChatMemory 滑窗、LC4J 装配链路、SSE 事件协议、前端 hook 全部一行不动
> - 开发流程允许==清库重启==免迁移，不写 backfill 代码

---

## 三、核心概念术语速查（先对齐再读后续）

### 3.1 hot_memory 的本质重新审视（核心概念）

==hot_memory 是父概念，user-impression 是其中一类==。

人类记忆类比：
- 看到一个老朋友 → 自然想起：他的名字、职业、上次聊到他爸去世这件大事
  - 名字、职业 = ==user-impression==（结构化画像）
  - 上次聊到他爸去世 = ==significant-event==（叙事性事件，v0.13 暂不实现）
- 提到某个话题 → 检索式回忆：之前他提过类似的事
  - 这是 ==cold_memory==（recall 路径，v0.2 展开）

| 概念 | 定义 | 写入方式 | 在 prompt 中的呈现 |
|---|---|---|---|
| **hot_memory** | 见到此人就立刻浮现、不需检索的常驻记忆 | LLM 通过专用工具主动晶化 | 系统提示词每次注入 |
| **cold_memory** | 提到相关话题时才会被检索出来 | 自动 append 对话原文 | 按需 recall（v0.2 引入向量） |

| `hot_memory.type` 值 | 语义 | 写入模式 | 操作 | v0.13 |
|---|---|---|---|---|
| `user-impression` | 稳定的用户画像属性 | 结构化 KV，新值覆盖旧值（UPSERT） | username / language / role / interests / tone | ✅ 实现 |
| `significant-event`（未来） | 重要事件 / 承诺 / 状态 | 叙事性，append-only 多条共存 | 父亲去世 / 正在备考 / 承诺过的事 | ❌ 仅 schema 骨架 |
| 其他未来类型 | long-term-goals / emotional-state / relationship-context 等 | TBD | TBD | ❌ |

### 3.2 概念与物理对应

| 架构概念 | 物理实体 | v0.11/v0.12 状态 | v0.13 状态 |
|---|---|---|---|
| System Prompt 组装 | `SystemPromptComposer.compose()` | 单类内部 6 段过程式拼接 + 硬编码常量 | 编排器 + 多个 `PromptSection` Bean（接口 + 顺序号），常量外化 |
| 提示词"角色"段 | `ROLE` 字段（Composer 静态常量） | 一行硬编码 | 并入 `soul.seed.role` + `enabled-keys`，由 `SoulPromptSection` 在「## 关于你自己」段开头渲染（review 后取消"Composer 顶部独立"方案） |
| 陌生人迎接段 | `STRANGER_GREETING` 字段 + Composer 内特殊路径 | 4 行硬编码 | 并入 `soul.seed.principles`（"陌生 / 已认识"通用人际行为原则，永久注入） |
| 全局响应规则 | `GLOBAL_RULES` 字段 | 1 行硬编码 | ==移除==——现代模型对静态/动态问题判断已足够准，规则属过度防御 |
| Hot Memory 注入模板 | `KEY_TEMPLATES` Map | Java 内 LinkedHashMap 硬编码 5 条，散在 Composer 内部 | 收敛到 `memory/api/UserImpressionFields.FIELDS`（仍是 LinkedHashMap），作为 ==字段集 + directive 的单一 Java 来源==——不进 yml（理由见 5.1 痛点 1） |
| Hot Memory 表 | `hot_memory(user_id, key, value)` | 单维 KV | 加 `type` 列，PK 三元组；user-impression 是首批 type |
| 当前日期 | `DATE_FMT` + `LocalDate.now()` 散落在 `compose()` | Composer 类内 + tool prompt 内 `{today}` 占位符 | 顶部一行注入==保留==（每请求 `LocalDate.now()` 动态）；==移除 tool prompt `{today}` 占位符替换机制==——LLM 看顶部日期自行组装 |
| `update_hot_memory` 工具 | `HotMemoryUpdateTool` | 通用工具名，但实际只管 user-impression | 改名 `UserImpressionUpdateTool` + `@Tool` 名改 `update_user_impression`；未来其他 type 加专用工具 |

### 3.3 最容易踩的认知坑

> [!warning] 核心误区
> - **`PromptSection` 不是替代 `SystemPromptComposer`**：`SystemPromptComposer` 仍然存在并作为唯一 LC4J `SystemMessageProvider` 注入点（保持 Frozen Snapshot 契约）。`PromptSection` 是它内部新引入的「段」抽象——Composer 不再写 `appendSoulSection() / appendIdentitySection() / appendMoodSection()` 这种过程式方法，而是收集所有 `PromptSection` Bean 按 `order()` 调 `render()`。==契约不变，只是把「段」模块化==。
> - **display_name 不再特殊**：v0.11/v0.12 里 display_name 被实现成完整的"称呼锚"指令段。v0.13 起所有 user-impression 字段都是 `(数据, directive 模板)` 同构；display_name 改名 `username`，与 language/role/interests/tone 平等渲染。它的"指令性 prompt"作为 directive 文案外化到 yml，并不消失，只是不再走特殊代码路径。
> - **"三态判定"瓦解**：v0.11/v0.12 的 Composer 用"display_name 是否有值 + chat memory 是否为空"判定三态（已认识 / 完全初识 / 沉默接续）。v0.13 用更隐式的信号：「## 关于对方」段是否出现 = 是否已认识（一元开关）；"如何对待陌生 / 已认识的人"的行为风格作为 SOUL principles 永久注入，由 LLM 通过 chat memory 自然感知初识。==没有"三态分支"了，状态机藏在「段是否出现 + SOUL 原则」里==。
> - **`username` 不要混淆 SOUL 的 `name`**：`UserImpressionFields.FIELDS` 中的 `username` 是==对方==的称呼（写入 hot_memory 表），`ai.soul.seed.name` 是==AI 自己==的名字（写入 soul_profile 表）。两者分属不同表，通过 type 列和表名区分，命名不冲突。

### 3.4 `PromptSection` 注入顺序总览（v0.13 落地形态）

```
┌──────────────────────────────────────────────────────────────────┐
│            SystemPromptComposer.compose(memoryId)                │
│                                                                  │
│  顶部唯一一行（不走 Section，由 Composer 直接拼装）：               │
│    「当前日期：{LocalDate.now()}」                                 │
│                                                                  │
│  按 order() 升序，逐个调用 PromptSection.render(memoryId) →       │
│                                                                  │
│  order=10  SoulPromptSection           「## 关于你自己」          │
│            (soul/builder/)              你是 {role}（段开头单行） │
│                                         name/tone/principles/...  │
│  order=20  IdentityPromptSection       「## 关于对方」             │
│            (chat/builder/)              遍历 user-impression       │
│                                         fields，按 directive 渲染 │
│  order=30  ToolsPromptSection          「## 可用工具」             │
│            (chat/builder/)              聚合 ToolPrompt Bean       │
│  order=40  MoodPromptSection           「## 情绪标记」             │
│            (chat/builder/)                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

> [!tip] 顶部仅"当前日期"一行不走 PromptSection
> 「当前日期」由 Composer 计算 `LocalDate.now()` 拼装——无条件出现的简单字面，留在编排层最直接。
>
> v0.13 review 改进：原方案让 role 也在 Composer 顶部独立渲染（"你是 {role}。"提到第一行），但代价是 Composer 需要依赖 `SoulStore`、`soul.seed.role` 在 enabled-keys 缺席需 javadoc 额外说明——收益仅是视觉上提到第一行（LLM 角度差异微弱）。改进后 role 作为正常 enabled-key 由 `SoulPromptSection` 在段开头渲染，==Composer 退化到只管"日期 + Section 编排"==。

### 3.5 PromptSection 归属规则

==单一模块的 Section 归该模块 builder；跨模块协调的 Section 一律落 `chat/builder/`==。

| Section | 依赖 Store | 归属 | 理由 |
|---|---|---|---|
| `SoulPromptSection` | 仅 `SoulStore` | `soul/builder/` | 单一模块 |
| `IdentityPromptSection` | `HotMemoryStore`（user-impression）+ `UserImpressionFields.FIELDS` 常量 | `chat/builder/` | 协调多源数据，本质是 chat 编排层职责 |
| `ToolsPromptSection` | 聚合所有 `ToolPrompt` Bean | `chat/builder/` | 跨工具模块聚合，chat 编排 |
| `MoodPromptSection` | `MoodProperties` | `chat/builder/` | mood 与 chat 强相关，无独立 mood 模块 |

`memory/hot/builder/` 子包==不引入==——hot_memory 模块当前没有自己专属的 Section（Identity 跨模块归 chat）。

---

## 四、改造 A：`SystemPromptComposer` 模块化重构（`PromptSection` 抽象）

### 4.1 理念

**解决的痛点**：
- v0.12 的 `SystemPromptComposer` 是 260 行的"过程式编排函数"：`compose()` 顺序调 `appendSoulSection / appendIdentitySection / renderTools / appendMoodSection`，所有「段」都是 Composer 的私有方法。
- 新增段（v0.2 recall 召回 / v0.3 cognitive load）必须改 Composer 本体——违反开闭原则，也违反 v0.12 的"按业务模块聚合"思路。

**v0.13 思路**：
1. 抽象 `PromptSection` 接口：`int order()` + `String render(@Nullable String memoryId)`。
2. 各业务模块自建 `PromptSection` 实现（归属规则见 3.5）。
3. `SystemPromptComposer` 退化为编排器：构造时注入 `List<PromptSection>`，`compose()` 顶部拼"你是 {role}"+"当前日期"两行后，按 `order()` 升序串行调用 `render()`，==不再持有任何业务逻辑==。
4. 保留 LC4J `SystemMessageProvider` 契约（`Function<Object, String>` + Frozen Snapshot），调用方零感知。

> [!warning] PromptSection 的契约
> - `render(memoryId)` 返回 ==null 或空串== 表示本段在当前请求不应出现（如 SOUL 在 enabled-keys 为空时跳过；Identity 在没有任何 hot 字段有值时跳过）。
> - `render` 由 LC4J 在 ==WebFlux event loop== 上同步调用，==禁止 `.block()` 反应式 Mono==——所有 Store 读必须用同步签名（与 v0.1 9.3.4 节同款约束）。
> - 各 `PromptSection` 实现 ==必须无状态==——多请求复用同一 Bean，状态藏在注入的 Store 里。

#### 4.1.1 设计决策：Section 收集方式

==构造注入 `List<PromptSection>`==，Spring 自动收集所有 Bean。Composer 内部 ==构造时一次性排序==并冻结：

```java
public SystemPromptComposer(List<PromptSection> sections, SoulStore soulStore) {
    this.sections = sections.stream()
            .sorted(Comparator.comparingInt(PromptSection::order))
            .toList();
    this.soulStore = soulStore;
}
```

> [!tip] 排序一次性发生在 Bean 初始化时
> 每次 `compose()` 不重新排序——避免每个请求多一次 `Comparator` 调用。

### 4.2 数据库改动

==无==。改造 A 是纯代码层重构，零 schema 变更。

### 4.3 代码改动

#### 4.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `chat/api/PromptSection.java` | 接口定义：`int order()` + `String render(@Nullable String memoryId)` |
| `chat/builder/IdentityPromptSection.java` | 渲染「## 关于对方」段，遍历 `UserImpressionFields.FIELDS`（详见第五、六章） |
| `chat/builder/ToolsPromptSection.java` | 聚合所有 `ToolPrompt` Bean，渲染「## 可用工具」段（无 `{today}` 替换，详见 4.3.4） |
| `chat/builder/MoodPromptSection.java` | 渲染情绪标记指令（迁移自 `Composer.appendMoodSection`） |
| `soul/builder/SoulPromptSection.java` | 渲染「## 关于你自己」（迁移自 `Composer.appendSoulSection`） |

#### 4.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `chat/config/SystemPromptComposer.java` | ==重构==：删掉所有 `appendXxxSection / renderTools / ROLE / STRANGER_GREETING / GLOBAL_RULES / KEY_TEMPLATES` 字段；构造注入 `List<PromptSection>` + `SoulStore`；`compose()` 内部仅做"顶部两行 + 按 order 串行 render + 拼接"。预估行数：260 → 约 60。 |
| `chat/config/AssistantConfig.java` | 工具引用：`HotMemoryUpdateTool` → `UserImpressionUpdateTool`（详见改造 C）；其余不动（仍把 `Composer.asProvider()` 传给 `AiServices.builder().systemMessageProvider(...)`） |
| `tool/api/ToolPrompt.java` | ==文档注释==：删除"可使用 `{today}` 占位符"那一句（机制移除，详见 4.3.4） |
| `tool/impl/TavilySearchTool.java` | `promptInstructions()` 内文案改写：把"沈阳 `{today}` 天气"改成自然语言"（系统提示词顶部已注入今日日期，请把具体日期写进搜索关键词，不要只写'今天'）" |

#### 4.3.3 接口与编排器设计

```java
package com.zoufx.ai.agent.chat.api;

import org.jspecify.annotations.Nullable;

/**
 * System prompt 的可组合「段」。各业务模块自建实现，由 SystemPromptComposer
 * 按 order 升序串行调 render 拼接。
 *
 * 契约：
 *   - render 由 LC4J 在 event loop 上同步内联调用 —— 禁止 .block() Mono
 *   - 返回 null / 空串 = 本段在当前请求跳过
 *   - 实现必须无状态（多请求复用同一 Bean）
 */
public interface PromptSection {
    int order();
    @Nullable String render(@Nullable String memoryId);
}
```

```java
package com.zoufx.ai.agent.chat.config;

@Component
public class SystemPromptComposer {

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("yyyy 年 M 月 d 日", Locale.CHINA);

    private final List<PromptSection> sections;
    private final SoulStore soulStore;

    public SystemPromptComposer(List<PromptSection> sections, SoulStore soulStore) {
        this.sections = sections.stream()
                .sorted(Comparator.comparingInt(PromptSection::order))
                .toList();
        this.soulStore = soulStore;
    }

    public Function<Object, String> asProvider() {
        return memoryId -> compose(memoryId == null ? null : memoryId.toString());
    }

    public String compose(@Nullable String memoryId) {
        StringBuilder sb = new StringBuilder();
        // 顶部两行：role + 当前日期（无条件出现，不走 PromptSection）
        soulStore.get("role").ifPresent(role -> sb.append("你是").append(role).append("。\n"));
        sb.append("当前日期：").append(LocalDate.now().format(DATE_FMT)).append("\n\n");

        for (PromptSection sec : sections) {
            String rendered = sec.render(memoryId);
            if (rendered != null && !rendered.isBlank()) {
                sb.append(rendered);
                if (!rendered.endsWith("\n")) sb.append("\n");
            }
        }
        return sb.toString();
    }
}
```

#### 4.3.4 `{today}` 占位符机制移除

==`ToolPrompt.promptInstructions()` 中的 `{today}` 占位符替换机制全部移除==。

| 项 | 内容 |
|---|---|
| 移除原因 | LLM 已通过系统提示词顶部「当前日期」获得日期；工具 prompt 内再做 Java 层字符串替换是冗余胶水；移除后 `ToolsPromptSection.render()` 简化为单纯字符串拼接 |
| 影响代码 | `SystemPromptComposer.renderTools(today)` → `ToolsPromptSection` 内单纯拼接，无 `today` 参数；`TavilySearchTool.promptInstructions()` 中"沈阳 `{today}` 天气"改为自然语言"具体日期"（详见 4.3.2） |
| LLM 行为 | LLM 看顶部"当前日期"自己组装搜索关键词；对现代模型完全没难度 |

### 4.4 配置

无新增 yml。改造 A 是纯代码层重构。常量外化部分由[[#五、改造 B：SOUL 文案进 yml + UserImpression 字段收敛到 `UserImpressionFields` 单一来源|改造 B]]承担。

### 4.5 验证

#### 段顺序与拼接

1. 启动后端（清库重启），开 LC4J DEBUG 日志（`logging.level.[dev.langchain4j]=DEBUG`）
2. POST /ai/chat 任意消息
3. ✅ 看 LC4J 发给 LLM 的 system message——结构应为：
   - 顶部唯一一行：「当前日期：YYYY 年 M 月 D 日」
   - 然后依次出现「## 关于你自己」（段开头是「你是 一个会持续记得对方的 AI 对话搭档。」）、「## 关于对方」（视 hot 是否有值）、「## 可用工具」、「## 情绪标记」
   - ==`## 响应规则` 段已消失==

#### Frozen Snapshot 不退化

1. 用户 A 发起对话，开 ChatMemory 留痕
2. 在响应流尚未结束时（thinking 阶段），并发 PUT `/admin/soul/role` 改 role
3. ✅ 本轮响应中 LLM 不感知新 role（snapshot 已冻结）
4. ✅ 下轮请求 system prompt 顶部出现新 role

#### Bean 装配健康

1. 启动日志包含 4 个 `PromptSection` Bean 注册（Soul / Identity / Tools / Mood）
2. ✅ 无循环依赖 / 无 `NoSuchBeanDefinitionException`

#### `{today}` 占位符无残留

1. ✅ system prompt 中不再出现字面 `{today}` 字符串
2. ✅ TavilySearchTool 实测对"今天沈阳天气"提问时，LLM 能从顶部「当前日期」读出真实日期并写入搜索关键词

---

## 五、改造 B：SOUL 文案进 yml + UserImpression 字段收敛到 `UserImpressionFields` 单一来源

### 5.1 理念

**解决的两个痛点**：

**痛点 1**：v0.12 的 `SystemPromptComposer` 持有四组硬编码字符串：`ROLE`（角色定义）、`STRANGER_GREETING`（陌生人迎接 4 行）、`GLOBAL_RULES`（响应规则 1 行）、`KEY_TEMPLATES`（hot 字段注入模板 5 条）。这些==本质上是 prompt 文案==，混在 Composer 内部既违反"一处编辑"原则，也让新增字段必须改 Composer 本体。

> [!warning] 为什么 user-impression 字段 ==不== 进 yml（v0.13 review 后的决策修正）
> 初稿方案是把字段集 + directive 全部外化到 `ai.memory.hot.user-impression.fields` yml Map（与 SOUL/mood 风格对齐）。review 时识别出这是个错误抽象——拆开后：
> - **SOUL**（人格 seed）：运行期可通过管理 API 改、持久化到 DB、可能漂移 → **性质是 data**，适合 yml + DB 双写
> - **user-impression 字段集**：这个 Agent ==能记关于用户的哪些类型属性== → **性质是 schema**，不该运行期变
>
> 而且 yml 化是 ==半成品==：白名单可动态，但 LC4J `@Tool` / `@P` 注解必须编译期常量，仍是字面字符串——维护 yml + Java 注解两边反而引入不一致风险。
>
> v0.13 终版决策：==`ROLE` / `STRANGER_GREETING` 并入 SOUL yml seed==（性质相符）；==`KEY_TEMPLATES` 收敛到 `UserImpressionFields.FIELDS` Java 常量==（schema 性质 + 注解同源）；==`GLOBAL_RULES` 直接移除==。各按其性质归位，不强求"全部进 yml"的视觉一致性。

**痛点 2**：display_name 与其他 user-impression 字段（language / role / interests / tone）的处理方式不对称：
- display_name 有完整指令段（如何称呼、每轮使用一次、被问"我是谁"如何回答）
- 其他字段只有单行"对方的 XXX：{value}"

实质上**所有字段都应该有自己的"行为指令"**——例如 language 应指导 LLM 用同语言回复，role 应指导 LLM 在相关话题中引用对方专业视角。v0.11 写了一半。

v0.13 把这五个字段统一抽象为 `(数据值, 行为指令模板)` 对，全部收敛到 `UserImpressionFields.FIELDS` 这一份 LinkedHashMap 常量。

**v0.13 思路（统一抽象）**：

==每个 user-impression 字段 = (数据值, 行为指令模板)==。

| 字段（v0.13 终版） | 数据值 | 行为指令（已写入后如何驱动 LLM） |
|---|---|---|
| `username` | "张三" | 直接用此称呼，每轮自然使用一次，被问"我是谁"时明确回答 |
| `language` | "中文" | 用同样的语言回复，除非对方明确要求切换 |
| `role` | "Java 后端开发" | 讨论相关领域时可引用对方的专业视角，不刻意炫耀 |
| `interests` | "围棋, 古典音乐" | 举例时优先选这些领域 |
| `tone` | "简洁、不要废话" | 回复风格按此调整 |

字段集相对 v0.11 的调整：
- `display_name` ==改名 `username`==（避开与 `soul.seed.name` 的 AI 自身名字在日志 / 代码评审中的视觉冲突）
- ==删除 `timezone`==（数据使用价值低，与对话主线场景关联弱）
- 其他字段保留，但每个都配上完整 directive

==没有特殊路径==——`IdentityPromptSection` 简单遍历 `UserImpressionFields.FIELDS`，对有值的字段渲染其 directive。display_name 的"行为指令性内容"不消失，只是作为 `username` 的 directive 放入 `UserImpressionFields`。

#### 5.1.1 "三态判定"瓦解为"段是否出现 + SOUL 原则"

| 用户状态 | 旧设计（v0.11/v0.12） | 新设计（v0.13） |
|---|---|---|
| 已认识（hot 有 username） | 走"称呼锚"特殊路径，注入完整指令段 | `IdentityPromptSection` 渲染「## 关于对方」段（含 username directive + 其他字段 directive） |
| 完全初识（hot 空 + chat memory 空） | 走"陌生人迎接"特殊路径 | 「## 关于对方」段不出现；SOUL principles 中含通用人际原则，LLM 通过 chat memory 自感知初识 |
| 认识但未告知名字（hot 空 + chat memory 非空） | 沉默接续 | 同上，行为差异由 LLM 通过 chat memory 自然推断 |

"如何对待陌生 / 已认识的人"==作为 AI 自身人际行为风格==并入 `soul.seed.principles`，永久存在系统提示词中。LLM 通过「`## 关于对方` 段是否出现 + chat memory 是否空」两个信号判断当前状态。

#### 5.1.2 「何时写」与「写完后怎么用」内聚到 FieldSpec（v0.13 review 改进）

v0.12 的工具 prompt 把"何时写"和"写完后 LLM 怎么用"揉在一起，散在文本里。v0.13 经过两轮 review 收敛：

| 信息 | 初版（5.1.2 切分） | 改进 1（合并 FieldSpec） | 改进 2（编译期常量 + fail-fast） |
|---|---|---|---|
| 字段渲染 directive | 1 处（FIELDS） | 1 处（FieldSpec） | 1 处 |
| 字段识别 detection rule | 1 处（promptInstructions 纯文本） | 同 FIELDS | 同 FIELDS |
| 字段白名单字面 | 2 处（promptInstructions + @P） | 2 处（WHITELIST_LITERAL + @P） | ==1 处==（@P 编译期拼接 `WHITELIST_LITERAL`） |
| **加字段总同步处** | **3 处** | **2 处** | ==**2 处 + 启动 fail-fast 保障**== |

终版做到把每字段元信息收敛到 `FieldSpec`，==并把 `@P` 注解字面值也通过编译期常量复用==：

```java
public record FieldSpec(
        /** 写后渲染模板（IdentityPromptSection 用） */
        String renderDirective,
        /** 何时写、怎么整理（UserImpressionUpdateTool.promptInstructions 用） */
        String detectionRule
) {}
```

`promptInstructions()` 用 `.formatted()` 注入两个动态段（识别规则段 + 白名单字面）：

```java
return """
        ==必须触发==：...

        各字段的识别与写入规则：

        %s
        调用规则：
        - key 必须从以下白名单中选：%s
        - value 只传==事实本身==...
        - 反模式：...
        """.formatted(
                UserImpressionFields.renderDetectionRules(),
                UserImpressionFields.whitelistLiteral()
        );
```

同步处与同步保障：

| 改动 | 在哪改 | 保障 |
|---|---|---|
| 加字段 / 改 directive / 改 detection rule | 仅改 `UserImpressionFields.FIELDS` | - |
| 加字段时的白名单字面 | 同步 `UserImpressionFields.WHITELIST_LITERAL` 字面（加新字段名） | ==静态块 fail-fast 校验==：如果与 `FIELDS.keySet()` 不一致，类加载阶段直接抛 `IllegalStateException` |
| `@P` 注解 | ==无需手工同步==（编译期拼接 `WHITELIST_LITERAL`） | - |
| `@Tool` 注解 | 不含字段白名单（仅描述工具用途），加字段无关 | - |

> [!note] 关键技巧：`@P` 编译期字面拼接
> LC4J 的 `@Tool(...)` / `@P(...)` 是 Java 注解，元素值==必须是编译期常量==。方法调用
> （如 `whitelistLiteral()`）即使返回常量字符串==也不算==编译期常量——但 `public static final String`
> 字段 + 字面拼接是编译期常量。所以：
>
> ```java
> @P("属性字段名。必须从白名单选：" + UserImpressionFields.WHITELIST_LITERAL) String key
> ```
>
> 合法。`WHITELIST_LITERAL` 与 `FIELDS.keySet()` 是隐式契约——靠静态块 fail-fast assertion 保障：
>
> ```java
> static {
>     // ... 填充 FIELDS ...
>     String dynamic = String.join(" / ", FIELDS.keySet());
>     if (!WHITELIST_LITERAL.equals(dynamic)) {
>         throw new IllegalStateException("WHITELIST_LITERAL 与 FIELDS keys 不一致 ...");
>     }
> }
> ```
>
> 加字段忘改 `WHITELIST_LITERAL` → 类加载失败，绝对不会带 bug 上线。

**加字段流程（v0.14+）**：
1. 在 `UserImpressionFields.FIELDS` 静态块加一项 `m.put("xxx", new FieldSpec(directive, detectionRule))`
2. 在 `UserImpressionFields.WHITELIST_LITERAL` 字面加 `" / xxx"`（漏改的话启动 fail-fast 兜底）

#### 5.1.3 各字段的写入触发规则

v0.13 强化"主动观察"——LLM 不仅在对方明确告知时写，更要从对话内容中识别相关信号：

| 字段 | 写入规则 |
|---|---|
| `username` | 对方自我介绍 / 自报姓名时写入 |
| `language` | 从对方当前消息识别其使用的语言；==如果该字段尚未记录则立即写入==；之后==仅在对方明确要求切换==（如"改用英文回答"）时更新 |
| `role` | 从对话中提到的工作 / 技术栈 / 行业线索整理出对方的身份/职业，写入一个简洁标签 |
| `interests` | 从对方主动提到的爱好 / 关注领域整理为简短标签集合 |
| `tone` | 从对方对回复风格的反馈或要求（"简洁点"、"详细点"）整理写入 |

反模式（明确禁止）：==单次零散信号就武断推断==。例如对方说"今天写了几行代码"不能直接断定职业；需要明确或多次信号才整理写入。

#### 5.1.4 ROLE 并入 soul.seed.role 的合理性

v0.11 给 SOUL 引入 enabled-keys 时已经包含 `name / tone / principles / forbidden_patterns / quirks`，==缺一个"角色定义"位==。`role` 字段同时承担 v0.12 `ROLE` 常量 + 描述"小Z 是怎样的存在"的双重职责。

**v0.13 review 改进：role 进入 `enabled-keys`，与其他字段对称处理**。

初版方案让 role 在 `SystemPromptComposer` 顶部单独拼一行 `"你是 {role}。"`（不走 SoulPromptSection），收益只是 role 在 prompt 视觉上提到第一行。代价：
- Composer 为了 role 多依赖一个 `SoulStore` 字段（整个类只用这一次）
- `soul.seed.role` 有但 `enabled-keys` 没有——seed 与 enabled-keys 不对称，需 javadoc + yml 注释额外说明
- role 字段本质是"AI 是什么样的存在"（与 name/tone 同性质），不属于 Composer 编排层职责

review 后调整：
- `role` 加入 `enabled-keys`（顺序放最前）
- `SoulPromptSection` 渲染时把 role 作为 ==「## 关于你自己」段开头单行== 输出："你是 {role}。"，之后接 name/tone/principles/...
- `SystemPromptComposer` 删除 `SoulStore` 依赖，顶部只剩 "当前日期" 一行——本类退化为==纯 Section 编排器==

输出格式对比（role=小Z 类比）：

```
# 初版（Composer 顶部）
你是一个会持续记得对方的 AI 对话搭档。
当前日期：2026 年 5 月 21 日

## 关于你自己
你叫小Z。你的说话风格是：温和、克制...

# 终版（role 进 SoulPromptSection）
当前日期：2026 年 5 月 21 日

## 关于你自己
你是一个会持续记得对方的 AI 对话搭档。

你叫小Z。你的说话风格是：温和、克制...
```

LLM 角度差异微弱（role 信息都能正确摄入），但工程清晰度显著提升。

#### 5.1.5 GLOBAL_RULES 移除的正确理由

==移除==。v0.12 的内容是"静态知识问题（语法、概念、历史常识）直接回答，不要滥用工具"——本质是抑制工具滥用。但**现代模型对静态/动态问题的判断已足够准**，这条规则属于过度防御。删掉后行为不会退化。

#### 5.1.6 设计决策：SOUL 的多行字符串用 `\|`（保留换行）还是 `>`（折叠）

==统一用 `\|`（block literal scalar）==——提示词中换行 / 列表符号语义重要，==必须保留==。`>` 会把换行折叠成空格，会破坏列表渲染。此约束仅对 SOUL 等仍在 yml 的 prompt 文案适用；user-impression 字段的 directive 用 Java text block，无此问题。

#### 5.1.7 设计决策：mood yml 路径归类到 `ai.soul.mood`

==yml 命名上 `ai.mood` → `ai.soul.mood`，Java 侧组件不合并==。

理由：
- **概念上 mood 是 SOUL（人格）的延伸**——"这个 AI 能展现哪些情绪 tag"和"这个 AI 的 tone / quirks / principles"一样，都是人格谱的一部分。yml 层把它放到 `ai.soul` 下表达这层归属关系，避免顶层一堆并列的 `ai.xxx` 节让"人格相关"配置散落。
- **Java 侧仍保持独立 `MoodProperties` + `MoodPromptSection`**——mood 是==动态 state==（每轮回复都变，走 SSE 实时事件路径），SOUL 是==静态 trait==（写一次基本不动，走 system prompt 注入路径），处理流程完全不同。硬合并会让一个静态注入模块多出一条"每轮变化的副输出"路径，反而拧巴。
- **保持 trait vs state 分离**：心理学上 trait（持久人格特质）与 state（当下情绪状态）本就是两个维度，组件职责切分与该区分对齐。

落地：
- `MoodProperties.@ConfigurationProperties` 的 `prefix` 从 `ai.mood` 改成 `ai.soul.mood`
- `application.yml` 中 mood 节作为 `ai.soul` 下的子节缩进
- `SoulProperties`（prefix=`ai.soul`）和 `MoodProperties`（prefix=`ai.soul.mood`）是两个独立 `@ConfigurationProperties` 类——Spring 按 prefix 各自绑定，`SoulProperties` 没有 `mood` 字段，不会捕获 `ai.soul.mood` 子节
- `MoodPromptSection.order()=40` 不变；Section 仍归 `chat/builder/`（处理流程归属优先于命名归属）

### 5.2 数据库改动

==无==（hot_memory schema 调整属于改造 C，见第六章）。

### 5.3 代码改动

#### 5.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `memory/api/UserImpressionFields.java` | ==字段集 + (directive + detectionRule) FieldSpec 的单一来源==：`public static final Map<String, FieldSpec> FIELDS`（LinkedHashMap，保留声明顺序）。供 `UserImpressionUpdateTool` 校验白名单 + 拼接 promptInstructions、`IdentityPromptSection` 渲染时遍历共用 |

```java
package com.zoufx.ai.agent.memory.api;

public final class UserImpressionFields {

    public record FieldSpec(String renderDirective, String detectionRule) {}

    /** 字段名 → FieldSpec。LinkedHashMap 保留声明顺序。 */
    public static final Map<String, FieldSpec> FIELDS;

    static {
        LinkedHashMap<String, FieldSpec> m = new LinkedHashMap<>();
        m.put("username", new FieldSpec(
                """
                        对方的称呼是「{}」。这是你已经认识的人——
                        - 直接称呼对方为「{}」，不要问名字、不要确认；
                        - 每轮回复中至少自然地使用一次这个称呼（除非对方明确要求别叫名字）；
                        - 如果对方问"我是谁""你还记得我吗"之类的问题，明确回答对方就是「{}」，
                          不要敷衍说"刚开始聊天""没有记录"。
                        """,
                "对方自我介绍 / 自报姓名时写入"
        ));
        m.put("language", new FieldSpec(
                "对方使用的语言是 {}。请用同样的语言回复，除非对方明确要求切换。\n",
                "从对方当前消息识别其使用的语言；如果该字段尚未记录则立即写入；之后仅在对方明确要求切换时更新"
        ));
        // role / interests / tone 同上模式
        FIELDS = Collections.unmodifiableMap(m);
    }

    /** 拼接 promptInstructions 中的"各字段识别规则"段（"- key —— rule\n" 多行） */
    public static String renderDetectionRules() {
        StringBuilder sb = new StringBuilder();
        for (var e : FIELDS.entrySet()) {
            sb.append("- ").append(e.getKey()).append(" —— ").append(e.getValue().detectionRule()).append("\n");
        }
        return sb.toString();
    }

    /** 拼接白名单字面（"username / language / ..."） */
    public static String whitelistLiteral() { return String.join(" / ", FIELDS.keySet()); }

    private UserImpressionFields() {}
}
```

> [!note] 归属选择
> 放 `memory/api/`（与 `HotMemoryType` 同侧）的理由：它本质定义的是"hot_memory 的 user-impression type 的字段 schema"，与 `HotMemoryType` 都属于 hot_memory 的元数据。`IdentityPromptSection` 和 `UserImpressionUpdateTool` 跨模块共用，依赖 api 比依赖 property 更自然。

> [!warning] 为什么不抽成 `@ConfigurationProperties` 进 yml
> 见 5.1 痛点 1 中的 review 修正说明：字段集是 schema 性质，不该 per-env / per-run 可变；且 LC4J `@Tool` / `@P` 注解必须编译期常量，yml 化只能动态半边，反而引入维护两边的不一致风险。Java 常量 + 同模块就近一致比"yml 风格统一"更重要。

#### 5.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `application.yml` | 删 `ai.memory.hot.enabled-keys`；==不==新增 user-impression yml 段（字段集走 `UserImpressionFields` 常量类）；扩 `ai.soul.seed.role` 一项；`ai.soul.seed.principles` 扩"陌生 / 已认识"行为原则 |
| `soul/property/SoulProperties.java` | ==不动==（不在 enabled-keys 加 role，因为 role 走 Composer 顶部不进「## 关于你自己」段） |
| `tool/property/UserProfileProperties.java` | ==删除==（字段集合不再需要 `@ConfigurationProperties` 承载） |
| `tool/impl/HotMemoryUpdateTool.java` → `tool/impl/UserImpressionUpdateTool.java` | 类改名（详见改造 C 6.3.2）；`promptInstructions()` 走 `.formatted()` 注入 `UserImpressionFields.renderDetectionRules()` + `whitelistLiteral()`（v0.13 review 改进，从纯字面改为动态拼接）；白名单读 `UserImpressionFields.FIELDS.keySet()` |
| `chat/builder/IdentityPromptSection.java` | 实现：读 `hotMemoryStore.snapshot(userId, HotMemoryType.USER_IMPRESSION)`，遍历 `UserImpressionFields.FIELDS` 按 `getValue().renderDirective()` 渲染 |

#### 5.3.3 `IdentityPromptSection` 实现

```java
package com.zoufx.ai.agent.chat.builder;

@Component
@RequiredArgsConstructor
public class IdentityPromptSection implements PromptSection {

    private final HotMemoryStore hotMemoryStore;

    @Override public int order() { return 20; }

    @Override
    @Nullable
    public String render(@Nullable String userId) {
        if (userId == null) return null;
        Map<String, String> snap = hotMemoryStore.snapshot(userId, HotMemoryType.USER_IMPRESSION);
        if (snap.isEmpty()) return null;

        StringBuilder sb = new StringBuilder("## 关于对方\n\n");
        boolean any = false;
        for (Map.Entry<String, FieldSpec> e : UserImpressionFields.FIELDS.entrySet()) {
            String value = snap.get(e.getKey());
            if (value == null || value.isBlank()) continue;
            String directive = e.getValue().renderDirective();
            sb.append(directive.replace("{}", value));
            if (!directive.endsWith("\n")) sb.append("\n");
            sb.append("\n");
            any = true;
        }
        return any ? sb.toString() : null;
    }
}
```

> [!note] directive 中可能多处 `{}`
> 例如 `username` 的 directive 出现 4 次 `{}`——`String.replace("{}", value)` 全部替换。

#### 5.3.4 `UserImpressionUpdateTool.promptInstructions()` 终版

字段相关段（识别规则、白名单）走 `.formatted()` 从 `UserImpressionFields` 动态拼接：

```java
@Override
public String promptInstructions() {
    // 识别规则段 + 白名单字面 由 UserImpressionFields 动态拼接——
    // 加字段时只改 UserImpressionFields.FIELDS，本方法的字面文本无需同步
    return """
            ==必须触发==：识别到对方的任何画像属性时，立刻调用 update_user_impression(key, value)。

            各字段的识别与写入规则：

            %s
            调用规则：
            - key 必须从以下白名单中选：%s
            - value 只传==事实本身==（如 "Java 后端" 而不是 "我是 Java 后端"）
            - 一轮内可调用多次（同时识别多个字段）
            - 调用是后台动作，回复对方时无需说"我已记下"
            - 反模式：
              - 写白名单外的 key——会被拒绝
              - 单次零散信号就武断推断（如对方说"今天写了几行代码"不能直接断定职业；
                需要明确或多次信号才整理写入）
              - 在回复里说"好的我会记住"但实际==没调工具==
            """.formatted(
                    UserImpressionFields.renderDetectionRules(),
                    UserImpressionFields.whitelistLiteral()
            );
}
```

`@P` 注解通过 `WHITELIST_LITERAL` 编译期常量拼接，加字段时==无需手工同步==：

```java
@Tool("用户印象更新：识别到对方的属性（姓名/语言/职业/兴趣/对话风格）时调用，写入长期记忆。"
    + "包括对方明确告知，也包括对话内容中明确或多次出现的相关信号。")
public String update_user_impression(
        @ToolMemoryId String userId,
        // 白名单字面通过 UserImpressionFields.WHITELIST_LITERAL 编译期拼接——
        // 加字段时只改 UserImpressionFields 一处，本注解自动跟随
        @P("属性字段名。必须从白名单选：" + UserImpressionFields.WHITELIST_LITERAL) String key,
        @P("属性值。只传事实本身，不带「我是」「我叫」「我在」等前缀") String value) {
    if (!UserImpressionFields.FIELDS.containsKey(key.trim())) { ... }  // 白名单校验
    ...
}
```

> [!note] `WHITELIST_LITERAL` 的设计权衡
> 这是一个"故意冗余的编译期常量"——`String.join(" / ", FIELDS.keySet())` 完全等价（{@code whitelistLiteral()} 方法形式仍保留给 `.formatted()` 用），但 ==`@P` 注解必须编译期常量==，方法调用不行。
> 折中：维护一份 `public static final String` 字面，靠==静态块 fail-fast 校验==与 FIELDS keys 同步——加字段忘改 `WHITELIST_LITERAL` → 类加载失败。比起"全字面手工同步"和"全方法动态（@P 无法用）"两端都更平衡。
>
> `@Tool` 注解描述只写工具用途（"用户印象更新：..."），不列字段白名单，==加字段无关==。

### 5.4 配置

`application.yml` 增量（==仅 SOUL 部分==；user-impression 字段集走 `UserImpressionFields` 常量类，==不进 yml==）：

```yaml
ai:
  memory:
    hot:
      # v0.13 删除：旧 ai.memory.hot.enabled-keys（语义被 UserImpressionFields.FIELDS.keySet() 完全吸收）
      # v0.13 不新增：user-impression 字段集 + directive 在 com.zoufx.ai.agent.memory.api.UserImpressionFields
      # 理由见第五章 5.1 痛点 1 的 review 修正说明（字段集是 schema 不是 config + 注解必须编译期常量）
  soul:
    # enabled-keys 加 role 在最前（v0.13 review 后改进：与其他字段对称处理）
    enabled-keys:
      - role
      - name
      - tone
      - principles
      - forbidden_patterns
      - quirks
    seed:
      # ====== v0.13 新增：角色定义（SoulPromptSection 段开头单行渲染） ======
      role: 一个会持续记得对方的 AI 对话搭档
      name: 小Z
      tone: 温和、克制、有研究工具的严谨感，不卖萌、不堆 emoji
      # ====== v0.13 扩展：principles 加"陌生 / 已认识"通用人际行为原则 ======
      principles: |
        - 信息密度高于装饰，回答尽量精炼
        - 留白要有但不刻意；段落短而紧凑
        - 工具调用对外可见；思考过程不掩饰
        - 不直接给医学/法律/财务建议，必要时提示边界
        - 系统提示词中如果出现「## 关于对方」段，意味着你已认识此人，不要表现得像初次相遇；
          如果该段不存在且对话历史也空，自然地融入问候和询问称呼（一次就够），
          不要打断对方的诉求；不要重复"你好"或机械地反复要名字
      # ... forbidden_patterns / quirks 同 v0.11 不变
    # ====== v0.13 新增：mood yml 路径归类到 soul.mood 子节（详见 5.1.7） ======
    # 概念上 mood 是人格延伸，但 Java 侧 MoodProperties / MoodPromptSection 仍独立（处理流程不同）
    mood:
      enabled: true
      keywords:
        - 好奇
        - 温和
        - 严肃
        # ... 其余词条同 v0.11 不变
      tail-buffer-size: 32
```

> [!note] mood 从 `ai.mood` 挪到 `ai.soul.mood`
> 这是==仅命名归类==的纯配置改动——Java 类 `MoodProperties` 的 `prefix` 跟着改成 `ai.soul.mood`，但 `SoulProperties` / `MoodProperties` 仍是两个独立的 `@ConfigurationProperties` 类，`MoodPromptSection` 也仍归 `chat/builder/`。原因与场景拆解见 5.1.7。

### 5.5 验证

#### 提示词输出与 v0.12 对比

1. 启动 v0.13（清库重启），POST 任意消息
2. ✅ LC4J DEBUG 日志中 system message：「你是 ... + 当前日期 + 关于你自己 + 关于对方 + 可用工具 + 情绪标记」六部分；==`## 响应规则` 段已消失==

#### username 与其他字段对称渲染

1. 通过工具或手工 SQL 给 user A 写入 `username=张三 / language=中文 / role="Java 后端开发"`
2. POST /ai/chat 用 A 发消息
3. ✅ 「## 关于对方」段内三个字段按 `UserImpressionFields.FIELDS` 声明顺序各自渲染完整 directive（username 整段含 4 处替换，language / role 各自整段）

#### 主动观察行为验证

1. user 发"我刚跑完一个 Spring Boot 项目部署，挺累的"
2. ✅ LLM 调 `update_user_impression(key="role", value="Java 后端开发")`（明确信号 + 整理为简洁标签）
3. user 发"我今天写了几行代码"
4. ✅ LLM ==不==贸然写 role（单次零散信号，遵守反模式）

#### language 首次自动 + 切换更新

1. 全新用户首条消息为英文 "Hello, who are you?"
2. ✅ LLM 调 `update_user_impression(key="language", value="English")`
3. 后续 user 发 "Now please reply in Chinese"
4. ✅ LLM 调 `update_user_impression(key="language", value="中文")`

#### `update_user_impression` 工具改名链路

1. ✅ 启动日志：`update_hot_memory` 工具名不再出现
2. ✅ LLM 实际调用日志显示 `📝 update_user_impression [userId=...] role=Java 后端开发`

---

## 六、改造 C：hot_memory 加 type 字段、user-impression 收敛为子类

### 6.1 理念

**核心洞察**：==hot_memory 是父概念，user-impression 只是其中一类==。

| 概念 | 定义 | 类比人类记忆 | 写入方式 |
|---|---|---|---|
| **hot_memory** | 见到此人就立刻浮现、不需检索的常驻记忆 | 看到老朋友自然记起他的名字 + 上次他爸去世 + 他在备考 | LLM 通过专用工具主动晶化 |
| ↳ `user-impression` | 稳定的用户画像属性（结构化字段） | 名字、职业、母语 | UPSERT 结构化 KV |
| ↳ `significant-event`（未来） | 重要事件 / 承诺 / 状态（叙事性） | 上次他爸去世、正在备考 | Append-only 多条共存 |
| **cold_memory** | 提到相关话题时才会被检索出来 | 想到围棋时才记起他也下围棋 | 自动 append 对话原文 |

v0.13 把 `hot_memory` 表加 `type` 列，让"重要记忆"有了==分类骨架==。v0.13 只落地 `user-impression` 一种 type，schema 为未来扩展留位。

### 6.2 数据库改动

==清库重启==（开发期允许，免迁移代码维护成本）。

新 schema：

```sql
CREATE TABLE hot_memory (
    user_id    TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, type, key)
)
```

字段语义按 type 而定：
- `user-impression`：`key` = 字段名（有限枚举 username/language/role/interests/tone）；`value` = 字段值（如 "张三"/"中文"）
- 未来 `significant-event`：`key` = 事件 ID（如 `evt_2026_03_15_father_passed` 或 UUID）；`value` = 事件描述全文

### 6.3 代码改动

#### 6.3.1 新增文件

| 路径 | 用途 |
|---|---|
| `memory/api/HotMemoryType.java` | 类型常量类（v0.13 仅 `USER_IMPRESSION`，未来扩展位） |

```java
package com.zoufx.ai.agent.memory.api;

/**
 * hot_memory.type 字段的常量值。
 *
 * 不用枚举：type 在 DB 落字符串、yml 配字符串、prompt 写字符串，
 * 全链路自然；用枚举反而处处要转换。
 */
public final class HotMemoryType {
    public static final String USER_IMPRESSION = "user-impression";
    // 未来扩展位：
    // public static final String SIGNIFICANT_EVENT = "significant-event";

    private HotMemoryType() {}
}
```

#### 6.3.2 修改文件

| 路径 | 改动 |
|---|---|
| `memory/api/HotMemoryStore.java` | 三个方法签名加 `String type` 参数 |
| `memory/impl/SqliteHotMemoryStore.java` | schema 加 type 列；PK 改三元组；所有 SQL 加 type 谓词 |
| `tool/impl/HotMemoryUpdateTool.java` → `tool/impl/UserImpressionUpdateTool.java` | 类改名；`@Tool` 名改 `update_user_impression`；调 store 时传 `HotMemoryType.USER_IMPRESSION`；白名单读 `UserImpressionFields.FIELDS.keySet()` |
| `chat/config/AssistantConfig.java` | `HotMemoryUpdateTool` 引用替换为 `UserImpressionUpdateTool` |
| `memory/controller/MemoryController.java` | 若有 hot_memory 相关端点，签名同步加 type；若无则不动 |

#### 6.3.3 `HotMemoryStore` 新签名

```java
public interface HotMemoryStore {
    Optional<String> get(String userId, String type, String key);
    Map<String, String> snapshot(String userId, String type);   // 仅返回该 type 下的 KV
    Mono<Void> set(String userId, String type, String key, String value);
}
```

==v0.13 不加 `snapshotAll(userId)` 跨 type 一次性读==——用不到，YAGNI。

#### 6.3.4 `UserImpressionUpdateTool` 调用 store

```java
hotMemoryStore.set(userId, HotMemoryType.USER_IMPRESSION, trimmedKey, trimmedValue).block();
```

#### 6.3.5 工具改名的边界澄清

==v0.13 不做通用 `update_hot_memory(type, key, value)`==。理由：
- LLM 用专用工具（语义明确的工具名 + 专用 prompt）比通用工具准确率高得多
- 不同 type 的操作语义本就不同（user-impression 是 UPSERT 结构化字段；future significant-event 会是 append 事件流，工具签名都不一样）
- 未来加 type 时新增专用工具（如 `record_significant_event(description)`），不挤一起

### 6.4 配置

无新增 yml。user-impression 字段集 + directive 由改造 B 的 `UserImpressionFields` Java 常量类承担。

### 6.5 验证

#### Schema 升级

1. 清库重启 v0.13
2. ✅ SQLite 查 `PRAGMA table_info(hot_memory);` 返回包含 `type` 列；PK 为三元组 `(user_id, type, key)`

#### type 隔离

1. 用户 A 通过工具写入 `username=张三`
2. ✅ `SELECT * FROM hot_memory WHERE user_id='A';` 显示一行：`type='user-impression', key='username', value='张三'`
3. ✅ `hotMemoryStore.snapshot("A", HotMemoryType.USER_IMPRESSION)` 返回 `{username=张三}`；`snapshot("A", "significant-event")` 返回空 Map

#### 工具改名

1. ✅ LLM 调用日志显示 `update_user_impression`，==不==出现旧的 `update_hot_memory`
2. ✅ 白名单错误信息显示新的字段集（username / language / role / interests / tone）

---

## 六A、改造 D：yml 命名空间重整（按业务模块归位）

### 6A.1 理念

**解决的三类痛点**：

**痛点 1：借用 Spring AI 官方命名空间**。`spring.ai.anthropic` / `spring.ai.openai` 这两个前缀==实际是本项目自己定义==的 `@ConfigurationProperties` 类——pom.xml 里没有任何 `spring-ai` 依赖（项目走 LangChain4J）。仅仅是历史上"借用了 Spring AI 命名风格"。
- 风险：未来如果引入 Spring AI 做某个边缘场景（如 embedding 子模块），它的 starter 会自动绑定 `spring.ai.openai.*`，与本项目同名前缀==冲突==——Spring 把同一份配置同时绑到两个不同类上，行为难调试。
- 必须趁早收回到本项目自有的命名空间。

**痛点 2：active provider 选择悬挂在 ai 顶层**。`ai.provider` 与 `ai.memory / ai.soul / ai.web-search` 同级，==但它本质是 LLM 层的内部事务==（决定加载哪个 ModelConfig）。放顶层让"LLM 相关配置"散落（一部分在 `spring.ai.*`，一部分在 `ai.provider`，一部分在 `ai.retry.llm`）。

**痛点 3：retry 配置跨模块耦合**。原 `ai.retry` 节同时含 `.llm`（LLM 重试）和 `.tavily`（工具重试）两个子节，对应一个混合的 `chat/property/RetryProperties` 类。两者归属完全不同模块，集中放反而：
- 增删一个工具的 retry 要改这个公共类
- chat 模块里出现 LLM 和 Tavily 的 retry 配置类，违反"Properties 类归对应业务模块"

### 6A.2 yml 结构对照

| v0.12 前缀 | v0.13 前缀 | 归属变化 |
|---|---|---|
| `spring.ai.anthropic` | `ai.llm.providers.anthropic` | 收回自有命名空间 + 归 LLM 层 |
| `spring.ai.openai` | `ai.llm.providers.openai` | 同上 |
| `ai.provider` | `ai.llm.provider` | 顶层 → LLM 层内部 |
| `ai.retry.llm` | `ai.llm.retry` | 拆解集中节，LLM 部分内移 |
| `ai.retry.tavily` | `ai.tools.web-search.tavily.retry` | 拆解集中节，工具 retry 就近内嵌 |
| `ai.memory` | `ai.memory`（不变） | - |
| `ai.soul` | `ai.soul`（不变） | - |
| `ai.mood` | `ai.soul.mood` | 见 5.1.7（mood 是人格延伸） |
| `ai.web-search` | `ai.tools.web-search` | 工具统一归 `ai.tools.*` 子树 |
| `ai.web-search.tavily` | `ai.tools.web-search.tavily` | 同上 |

### 6A.3 设计原则

> [!note] 三条命名原则
> - **借用结束**：所有 `spring.ai.*` 收回到 `ai.*`——本项目用 LangChain4J，不蹭 Spring AI 命名空间
> - **active vs configuration set 分离**：`ai.llm.provider`（选哪个）+ `ai.llm.providers.*`（每个怎么配），单复数对仗一目了然
> - **retry 就近原则**：retry 配置跟着被重试对象走（LLM 在 `ai.llm.retry`，Tavily 在 `ai.tools.web-search.tavily.retry`），删除原跨模块的集中式 `ai.retry`
> - **不过度抽象 tools**：当前只有 web-search 有真配置（hot_memory 工具等是纯 LLM 工具无 yml），但 `ai.tools.*` 命名空间预占住，未来工具增多时无需再次重命名

### 6A.4 Java 类布局调整

**核心：Properties 类按 yml prefix 归到对应业务模块的 `property/` 子包**。

| 类 | v0.12 位置 | v0.13 位置 | 备注 |
|---|---|---|---|
| `AnthropicProperties` | `llm/property/` | 不动 | 仅 prefix 改 |
| `OpenAiProperties` | `llm/property/` | 不动 | 仅 prefix 改 |
| `RetryProperties` | `chat/property/` | ==删除== | 拆解为两类 |
| `LlmRetryProperties`（新增） | - | `llm/property/` | prefix=`ai.llm.retry`，扁平字段（无嵌套类） |
| `TavilySearchProperties` | `tool/property/` | 不动 | 加内嵌 `Retry` static class |
| `ChatMemoryProperties` | `chat/property/` | ==删除== | 改名挪包 |
| `MemoryProperties`（新增） | - | `memory/property/` | prefix=`ai.memory`，承接 ChatMemoryProperties |
| `MoodProperties` | `chat/property/` | `soul/property/` | prefix=`ai.soul.mood`，跟随 yml 归类 |
| `WebSearchProperties` | `tool/property/` | 不动 | 仅 prefix 改到 `ai.tools.*` |

**结果**：`chat/property/` 子包==整个被清空删除==——chat 是编排层，无独占 yml 节，不该有 Properties 类。

### 6A.5 代码改动

| 文件 | 改动 |
|---|---|
| `llm/property/AnthropicProperties.java` | `prefix=spring.ai.anthropic` → `ai.llm.providers.anthropic` |
| `llm/property/OpenAiProperties.java` | `prefix=spring.ai.openai` → `ai.llm.providers.openai` |
| `llm/property/LlmRetryProperties.java` | **新建**，扁平字段 `maxAttempts / minBackoff / maxBackoff` |
| `memory/property/MemoryProperties.java` | **新建**，承接 `ChatMemoryProperties`（同 prefix） |
| `soul/property/MoodProperties.java` | **新建**（从 chat 挪），prefix=`ai.soul.mood` |
| `tool/property/WebSearchProperties.java` | prefix → `ai.tools.web-search` |
| `tool/property/TavilySearchProperties.java` | prefix → `ai.tools.web-search.tavily` + 加内嵌 `Retry` 类 |
| `llm/config/AnthropicModelConfig.java` | `@ConditionalOnProperty(name="ai.provider")` → `"ai.llm.provider"` |
| `llm/config/OpenAiModelConfig.java` | 同上 |
| `tool/config/TavilySearchConfig.java` | `@ConditionalOnProperty(prefix="ai.web-search")` → `"ai.tools.web-search"`；去掉 `RetryProperties` 注入，改读 `tavilyProps.getRetry()` |
| `chat/service/AIChatService.java` | import 改 `soul/property/MoodProperties` + `llm/property/LlmRetryProperties`；字段 `retryProperties` → `llmRetryProperties`；`buildRetrySpec` 去掉 `.getLlm()` 解构 |
| `chat/builder/MoodPromptSection.java` | import 跟随 MoodProperties 挪包 |
| `memory/config/MemoryConfig.java` | import 改 `memory/property/MemoryProperties` + 字段类型改名 |
| `chat/property/RetryProperties.java` | **删除** |
| `chat/property/ChatMemoryProperties.java` | **删除** |
| `chat/property/MoodProperties.java` | **删除**（挪到 soul） |
| `chat/property/`（整个子包） | **删除空目录** |
| `resources/META-INF/additional-spring-configuration-metadata.json` | 所有 `spring.ai.*` 条目改成 `ai.llm.providers.*`；`ai.provider` → `ai.llm.provider` |

### 6A.6 验证

#### 编译与启动

1. ✅ `mvn clean compile` 通过（52 文件全编译）
2. ✅ 启动日志中 Bean 装配正常：`Creating thinkingChatModel [openai]` / `Tavily 网络检索 engine 已就绪`
3. ✅ 启动==无== `Property 'spring.ai.openai...' is invalid` 之类警告

#### 配置生效

1. 用 `OPENAI_API_KEY=xxx` 启动 → `ai.llm.provider=openai` 触发 `OpenAiModelConfig`
2. ✅ `OpenAiProperties.baseUrl` 正确读到 `https://api.deepseek.com/v1`
3. ✅ LLM 调用失败时按 `ai.llm.retry.max-attempts=2` 重试
4. ✅ Tavily 调用失败时按 `ai.tools.web-search.tavily.retry.max-attempts=2` 重试

#### chat/property/ 子包不复存在

1. ✅ `ls src/main/java/com/zoufx/ai/agent/chat/property/` 返回 No such file or directory
2. ✅ 全代码 grep `chat\.property` 无任何 import 残留

---

## 七、前端

> [!tip] v0.13 前端零改动
> v0.13 是纯后端重构 + 数据模型分层——==SSE 协议、`MemoryController` GET 端点输出格式（如有）、Heartbeat / StatePanel 数据 plumbing 全部一行不动==。前端无感知。

---

## 八、依赖

### 8.1 后端

==无新增依赖==。v0.13 全部用 Spring 已有的注入机制（`List<PromptSection>` 自动收集）+ `@ConfigurationProperties` + 现有 LC4J `@Tool`。

`@Nullable` 注解使用 `org.jspecify.annotations.Nullable`（Spring 6.x / Spring Boot 4.x 推荐的现代标准，替代已废弃的 `org.springframework.lang.Nullable`）。

### 8.2 前端

==无新增依赖==。

### 8.3 pom.xml 版本同步

依据 CLAUDE.md 约束，==`pom.xml` 的 `<version>` 同步升级为 `0.13.0-SNAPSHOT`==。

---

## 九、风险与开放问题

| # | 决策点 | 建议 | 理由 |
|---|---|---|---|
| 1 | `PromptSection` 接口 `render` 返回 String 还是 `Optional<String>` | String + nullable | 与 LC4J `SystemMessageProvider` 风格保持一致；`Optional<String>` 让调用方多写 isPresent，收益不抵 |
| 2 | 老库升级路径 | ==清库重启==，不写 backfill | v0.x 测试期约定；写 backfill 代码反而是技术债 |
| 3 | `ToolPrompt` 与 `PromptSection` 关系 | `ToolPrompt` 不变（专门描述工具）；`ToolsPromptSection`（新增）聚合所有 `ToolPrompt` Bean 渲染「## 可用工具」段 | 不引入二维抽象，二者职责清晰 |
| 4 | yml 多行 `\|` 块标量在反引号 / 缩进 / Tab 上的坑 | 必须 ==仅用空格缩进==（YAML 禁止 Tab）；多行内的反引号原样保留即可 | Spring `@ConfigurationProperties` 解码无需特殊处理 |
| 5 | 改造 A/B/C 灰度 | 一次性切换，无 feature flag | 三项强耦合（Composer 重构 + 常量外化 + Schema 加 type）；切一半反而难维护；清库重启允许干净切换 |
| 6 | 重构后 LLM 输出对比 | 改造 A/B/C 完成后做 ==prompt 字面 diff==：v0.13 system prompt 与 v0.12 同输入下，结构应一致减「响应规则」段、user-impression 字段渲染应对称化 | 防止重构带来内容缺失 |
| 7 | `{today}` 占位符移除后 TavilySearchTool 表现 | 实测验证：LLM 是否能从顶部「当前日期」读出日期写入搜索关键词 | 现代模型完全没难度，但要做最终用例验证 |
| 8 | `username` 与 SOUL 的 `name` 命名冲突 | DB / 日志中通过 type 列 / 表名区分；代码中 `UserImpressionFields.FIELDS.get("username")` 与 `SoulStore.get("name")` 调用路径完全不同 | 已规避 |
| 9 | 通用 `update_hot_memory(type, key, value)` 工具是否合理 | ==否==，按 type 拆专用工具 | LLM 准确率 + 不同 type 操作语义不同 + 未来扩展不挤压 |
| 10 | 主动观察推断的"宽严"边界 | 工具 prompt 中明确禁止"单次零散信号就武断推断"，但不堵死推断本身 | 既要让 role/interests/tone 能被主动整理，又防止过度推断；边界由 LLM 在 prompt 引导下自判 |
| 11 | user-impression 字段是否 yml 化（==review 后修正==） | ==否==，硬编码 `UserImpressionFields.FIELDS` 常量 | 性质是 schema 不是 config（与 SOUL 不同）；LC4J `@Tool` / `@P` 必须编译期常量，yml 化是半成品反而引入维护两边的不一致风险；详见 5.1 痛点 1 |
| 12 | `MemoryController.GET /hot` 的 type 参数默认值 | ==必填==（无默认值），强制调用方显式选择 | v0.14+ 加新 type 时避免旧前端不传 type 看不到新 type 数据的"语义漂移" |
| 13 | `SystemPromptComposer` 单 Section 失败的容错 | try/catch 包装 `sec.render()`，失败 Section 跳过 + `log.error` 留痕，其余 Section 正常注入 | 降级而非中断——LLM 最坏退化为"忘了某条信息"还能继续工作；失败留痕方便排查 |
| 14 | `@Nullable` 注解依赖来源 | 显式声明 `org.jspecify:jspecify:1.0.0` 依赖 | 不依赖 Spring 传递关系；若上游断链可第一时间编译失败而非运行时 |
| 15 | mood yml 路径是否合并入 SOUL | ==yml 路径归类==到 `ai.soul.mood`，==Java 侧不合并== | 概念上 mood 是人格延伸（trait→state 谱），yml 归类更清晰；但 mood 是动态 state，SOUL 是静态 trait，处理流程完全不同，硬合并组件职责变拧巴；详见 5.1.7 |
| 16 | `spring.ai.*` 前缀是否保留 | ==否==，全部收回到 `ai.llm.providers.*` | 借用 Spring AI 官方命名空间但项目不依赖 spring-ai；未来引入会冲突；详见 6A.1 痛点 1 |
| 17 | retry 配置是否保留集中式 `ai.retry` | ==否==，拆解为就近：`ai.llm.retry` + `ai.tools.web-search.tavily.retry` | 跨模块耦合的公共类（chat/property/RetryProperties）违反"Properties 类归对应业务模块"，新增工具 retry 时改公共类；详见 6A.1 痛点 3 |
| 18 | `ai.tools.*` 子树是否过度抽象 | ==预占==，当前仅 web-search 有真配置 | hot_memory 工具等是纯 LLM 工具无 yml；未来工具增多时无需再次重命名 |
| 19 | UserImpressionFields 是否合并 detection rule | ==合并==到 `FieldSpec(renderDirective, detectionRule)` | 初版三处同步（FIELDS / promptInstructions 文本 / @P 字面）；review 后并入 FIELDS + `.formatted()` 动态拼接，同步处降为 2（FIELDS / @P 字面）；详见 5.1.2 |
| 20 | @P 注解白名单字面是否能消除手工同步 | ==能==，用编译期常量 `WHITELIST_LITERAL` + 静态块 fail-fast 校验 | LC4J 注解要求编译期常量，但 `public static final String` 字面拼接合法；`@P("..." + UserImpressionFields.WHITELIST_LITERAL)` 自动跟随；FIELDS keys 与 WHITELIST_LITERAL 一致性靠类加载时 assertion 兜底（漏改直接挂）；详见 5.1.2 / 5.3.4 |
| 21 | role 是否走 Composer 顶部独立渲染 | ==否==，与其他 enabled-keys 字段对称，由 `SoulPromptSection` 在「## 关于你自己」段开头单行渲染 | 初版让 role 在 Composer 顶部独立处理，代价：Composer 单为 role 依赖 SoulStore + seed/enabled-keys 不对称需 javadoc 额外说明；收益仅是视觉上提到第一行，LLM 角度差异微弱；调整后 Composer 退化为纯 Section 编排器；详见 5.1.4 |

---

## 十、估时

| 阶段（对应章节） | 估时 |
|---|---|
| 改造 A：`PromptSection` 抽象 + Composer 重构 + 4 个 Section 落地 | 0.5-1 天 |
| 改造 B：常量外化到 yml + UserImpression 字段统一处理 + 工具 prompt 切分 | 0.5 天 |
| 改造 C：hot_memory schema 加 type + 接口签名调整 + 工具改名 | 0.5 天 |
| 改造 D：yml 命名空间重整 + Properties 类按业务模块归位 + chat/property 子包清空 | 0.3 天 |
| 联调验证（章节 4.5 / 5.5 / 6.5 / 6A.6 全套，含字面 diff） | 0.5 天 |
| pom.xml 版本同步 + git 提交 | 0.1 天 |
| **合计** | ==1.5-2.5 天== |

---

## 十一、与后续版本的衔接（仅信息性，本次不规划）

> [!note]- v0.13 留下的扩展点
> - `PromptSection` 接口已就位，v0.14 的 ImpressionGuidanceSection / v0.2 的 Recall 召回片段可作为新 Section 接入，无需改 Composer
> - `hot_memory.type` 列已就位，v0.x 后续版本可添加 `significant-event` 等新 type，加专用写入工具 + 专用 PromptSection 即可
> - UserImpression 的字段集收敛在 `UserImpressionFields.FIELDS`（`FieldSpec(renderDirective, detectionRule)`），v0.14 新增字段流程：在 FIELDS 静态块加一项 `FieldSpec` + 更新 `WHITELIST_LITERAL` 字面（漏改启动 fail-fast）。`@P` 注解通过编译期常量拼接自动跟随，==无需手工同步==
> - `HotMemoryType` 常量类已就位，未来 type 加常量项即可

---

## 十二、相关链接与引用

- **[[CLAUDE.md]]**：项目开发约束、线程模型、已知瓶颈
- **[[拟人化AI Agent-v0.11]]**：UserProfile 多字段、SOUL、情绪系统的初始落地
- **[[拟人化AI Agent-v0.12]]**：函数式模块架构 + HikariCP 连接池
- **[[拟人化AI Agent-v0.14]]**：UserImpression 内在维度扩展 + 主动了解模式（v0.13 的后继版本）
- **[[拟人化AI Agent-v0.2]]**：Recall 引擎升级（向量 + Hybrid + 三维加权）
- **[[拟人化AI Agent-总设计方案]]**：全版本路线图与顶层愿景

---

## 版本历史

| 版本 | 日期 | 变更 |
|-----|------|------|
| v0.13 | 2026-05-21 | **System Prompt 模块化重构 + Hot Memory 分层 + yml 命名空间重整**：`PromptSection` 抽象；SOUL 文案进 yml（ROLE / STRANGER 并入 seed.role / seed.principles）；display_name → username 与其他字段对称处理（删 timezone）；user-impression 字段集 + directive 收敛到 `UserImpressionFields` Java 常量类单一来源（review 后从 yml 改回，理由见 5.1 痛点 1）；hot_memory 加 type 字段，user-impression 收敛为 type 子类；`MemoryController.GET /hot` 的 type 改为必填 query param；移除 GLOBAL_RULES；移除 `{today}` 占位符机制（顶部日期一行保留 `LocalDate.now()` 动态注入）；`UserImpressionUpdateTool` 接管 `update_user_impression`；强化主动观察（role/interests/tone 从对话中识别）；`SystemPromptComposer` 加单 Section 容错降级；显式声明 jspecify 依赖；**mood yml 路径归类到 `ai.soul.mood`（仅命名归类，Java 侧 `MoodProperties` / `MoodPromptSection` 仍独立，详见 5.1.7）**；**改造 D：yml 命名空间全面重整——`spring.ai.*` → `ai.llm.providers.*`（收回自有命名空间）、`ai.provider` → `ai.llm.provider`、`ai.retry.*` 拆解为就近（`ai.llm.retry` + `ai.tools.web-search.tavily.retry`）、`ai.web-search` → `ai.tools.web-search`；Properties 类按 yml prefix 归对应业务模块的 property 子包，`chat/property/` 子包整个删除（新增 `LlmRetryProperties` / `MemoryProperties`，`MoodProperties` 挪 soul/property）；详见 6A 章**；**`UserImpressionFields` 收敛为 `Map<String, FieldSpec>`，把 detection rule 也并入 FieldSpec，`promptInstructions` 走 `.formatted()` 动态拼接（同步处从 3 降为 2，详见 5.1.2）；新增 `WHITELIST_LITERAL` 编译期常量 + 静态块 fail-fast 校验，`@P` 注解通过编译期拼接自动跟随，加字段时 `@P` 字面无需手工同步**；**role 改为正常 enabled-key，由 `SoulPromptSection` 在段开头渲染（取消 Composer 顶部独立处理 + SoulStore 依赖；Composer 退化为纯 Section 编排器，详见 5.1.4）**；清库重启免迁移 |
