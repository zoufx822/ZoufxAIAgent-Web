# Zoufx AI · 页面打磨清单

> 基于 `Zoufx AI.html` (3143 行) 的设计/工程评审。按优先级排列，供后续会话逐项优化。
> 记录日期：2026-06-24

---

## P0 · 功能性硬伤 ✅ 全部完成（2026-06）

- [x] **1. 中文输入法回车误发送** — onKeyDown 已加 `!e.nativeEvent.isComposing`。
- [x] **2. textarea 不自动长高** — 已实现 `autoGrow`（封顶 180）。
- [x] **3. 滚动锁定缺失** — 已加离底检测 `atBottom` + "回到底部"浮钮。
- [x] **4. 没有停止生成** — 发送键流式期间变 Stop，定时器登记可中断。

---

## P1 · 体验打磨

- [x] **5. Presence 悬浮区与正文边界生硬** — 已加底部渐变 mask（`.presence-float::after`），正文滚动柔和淡出。
- [x] **6. 浅色主题代码块过重 + 缺工具栏** — shiki 改双主题（亮 github-light／暗 github-dark 随主题切换）+ 1px border + 语言标签 + 复制按钮。

- [x] **7. 思考块折叠 peek 信息量太低** — peek 改为显示思考内容首句（`thinkPeek`），无句子时回退"X 字"。

- [ ] **8. 消息缺操作与错误态**
  - AI 回复无 hover actions（复制 / 重新生成）；
  - error 仅眼睛摇头 + 状态点变红，消息流里没有错误条目和重试入口；
  - 呼吸线（每 3 轮）可顺势携带时间标签（"昨天 23:41"）。

- [ ] **9. 工具卡 hover 展开布局跳动**
  flat 态 body 不在 DOM，hover 瞬间渲染导致下方正文被顶。
  *修法：flat 时保留 body（max-height:0 过渡），或改浮层预览。*

- [~] **10. 流式光标** — 已实现后按用户要求撤销（不保留 `▎`）。

---

## P2 · 细节与一致性

- [x] **11. "小Z"署名换行** — `.home-sig-name` 已加 `white-space:nowrap`。
- [ ] **12. 腮红色 `#f06070` 硬编码** — 全 UI 唯一硬编码高饱和色，不随主题切换，暗色下偏亮。进 token（亮/暗各一档，或 oklch 从 emotion 派生）。
- [ ] **13. 触达尺寸** — 发送按钮 30px、chips 28px、tool-head 行均低于 44px 移动标准；右栏 280px 无响应式收起（sidebar 有 ResizeObserver，StatePanel 没有）。
- [ ] **14. 命名冲突** — "记忆锚点"同时指左侧会话列表和右栏三层摘要，两个概念共用一名。右栏缺面板级标题（如"小Z 的记事本"）。
- [ ] **15. 可访问性** — think 折叠行、tool-head 是 `div onClick`，缺 `role="button"`/`tabIndex`/`aria-expanded`；回顾浮层无 focus trap。（眼睛 aria-label 已做得好。）
- [ ] **16. 表格与滚动条** — 表格 th 背景 `var(--sidebar)` 白底上几乎不可见；3px 滚动条偏细，长对话不易拖拽。

---

### 建议优化顺序
1. **P0 · 1/2/3** — 各十几行改动，直接影响可用性。
2. **5 + 6** — 视觉收益最大。
3. 其余按场景需要逐项推进。
