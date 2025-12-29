# EventEditModalV2 架构健康诊断与 PRD 对齐审计（2025-12-29）

> 目的：评估 EventEditModalV2 的架构健康度（简洁、组件化、正确、可维护），识别 legacy/adhoc 风险；并对照 PRD 给出 MECE 的实现完成度与偏差清单。

## 1. 结论摘要（TL;DR）

- **整体定位**：EventEditModalV2 是“事件编辑的全栈聚合点”（UI + 表单状态 + 同步策略 + 父子事件 + EventTree + 编辑器 + AI 图片提取），已经超出单一组件可维护的复杂度阈值。
- **保存语义（事实）**：当前实现核心是“**编辑器内部节流/blur flush → 更新本地 formData**；**点击保存按钮 → 统一持久化（EventHub → EventService）**；取消/关闭视为丢弃”。同时存在少量例外（例如 syncMode 变化会立即 updateFields）。
- **主要健康风险**：
  1) **入口调用契约不一致**：EventEditModalV2 已改为“只收 eventId 并自行加载”，因此“新建事件必须先落库/进 EventHub”；TimeCalendar 做到了，但 TimeLog 的新建入口仍是“模板 + 打开 Modal”，会导致 Modal 内部读取不到事件（高风险）。
  2) **单一实现分叉**：LogTab 复制了 EventEditModalV2 的大段实现，形成双维护点，未来必然分叉。
  3) **组件内职责过载**：同步模式/日历映射/父子事件规则/Timer 行为/AI 提取等与 UI 强耦合，导致修改任一功能都可能引入回归。

## 2. 现状结构（事实梳理）

### 2.1 入口与调用点（现状）

- TimeCalendar：选择时间段后 **立即创建事件**（EventHub.createEvent），再打开 EventEditModalV2。
- TimeLog：存在“新建事件 Modal”与“编辑事件 Modal”两个入口；其中“编辑”入口是已有 eventId；“新建”入口当前仍基于“newEventTemplate + 打开 Modal”，与 EventEditModalV2 的 eventId-only 契约存在冲突（见 §4.1）。
- App.tsx：Timer 编辑使用 EventEditModalV2，但仍保留旧 v1 overlay 编辑 UI（属于 legacy 并存）。
- LogTab：宣称“基于 EventEditModalV2”，但实际是**复制式复用**，不是组件复用。

### 2.2 数据流（代码实际）

- UI 层：formData（useState）作为编辑过程中的临时态。
- TitleSlate：onChange（在其内部以 debounce/blur 策略触发）回传 Slate JSON，EventEditModalV2 将其缓存到 titleRef，避免 setState 导致重渲染/失焦。
- ModalSlate：onChange 回传 Slate JSON 字符串，EventEditModalV2 写入 formData.eventlog。
- “保存”按钮：handleSave 统一组装 updatedEvent，走 EventHub.createEvent / EventHub.updateFields 持久化。
- 例外：syncMode 变化会立即 EventHub.updateFields（避免远程同步以旧值覆盖）。

> 备注：组件头部的“禁止直接调用 EventService”的架构宣言与实现并不完全一致（例如组件内部加载事件当前直接走 EventService.getEventById）。

## 3. 保存语义与边界（PRD 对齐要点）

### 3.1 当前实现的保存语义

- **编辑器输入**：更新本地 formData（TitleSlate/ModalSlate 内部节流 + blur flush），不保证持久化。
- **保存按钮**：统一持久化（EventHub → EventService）。
- **取消/关闭**：丢弃本地 formData 改动（下次打开从持久化层重载）。
- **例外（即时持久化）**：syncMode 修改会立即 updateFields（避免 UI 与 DB 不一致/远程覆盖）。

### 3.2 需要在 PRD 中明确的“新建事件”契约

由于 EventEditModalV2 只接收 eventId 并自行加载：

- 新建入口必须满足其一：
  1) **先创建事件**（EventHub.createEvent / EventService.createEvent），再打开 Modal；
  2) 或者改回“允许传入 initialEvent 草稿对象”的模式（当前不是）。

当前 TimeCalendar 已按 (1) 实现；TimeLog 新建入口仍偏向 (2)（但组件不支持），因此需要修正。

## 4. 架构健康度评估（MECE）

### 4.1 Correctness（正确性）

- **P0：TimeLog 新建入口与 eventId-only 契约冲突**
  - 现状：TimeLog 打开“新建事件 Modal”时仅生成 newEventTemplate，并未确保事件已存在于 EventService/EventHub。
  - 影响：Modal 内部按 eventId 加载事件可能失败，导致 formData 初始化与 eventId 脱节（潜在 ID 乱序/保存目标错误）。
  - 建议：与 TimeCalendar 一致：打开前先 createEvent，并在取消时删除 newlyCreatedEventId（避免产生空事件）。

- **P1：保存语义表述不一致**
  - 代码注释中仍出现“三层保存架构”历史描述，但实际已移除 5 秒自动保存持久化。
  - 建议：统一注释/PRD 文案，避免维护者按旧语义改动。

### 4.2 Simplicity（简洁）

- **P1：组件过载**
  - 同一文件承担：编辑器集成、EventTree、父子事件同步配置、Timer 交互、同步模式 UI、标签映射日历、AI 图片提取等。
  - 结果：调试日志/状态机分支非常厚，回归风险高。

### 4.3 Modularity（组件化）

- **P0：LogTab 复制式复用**
  - 现状：LogTab.tsx 几乎复制 EventEditModalV2.tsx 的结构与逻辑。
  - 风险：任何 bugfix / 行为变更都要“双修”，且极易分叉。
  - 建议：抽出“可复用的 Editor+Form core”（无 modal 外壳），Modal 与 TabPage 分别做容器。

### 4.4 Maintainability（可维护）

- **P1：调试日志与渲染追踪器残留**
  - EventEditModalV2 内存在 renderTracker/eventRefTracker 等大量 console 日志，会掩盖真正异常并放大性能噪音。
  - 建议：用 build-time flag 或统一 logger 开关收敛。

- **P2：边界类型复杂（eventlog/location/title）**
  - eventlog 在历史上经历 string / slateJson / EventLog 对象混用；location 也可能是对象。
  - 建议：把“类型归一化”集中在 Service/Storage 边界（写入/读取时），UI 层只持有一种形态。

## 5. PRD 完成度对照（高层）

| 模块 | PRD 期望 | 代码现状 | 结论 |
|---|---|---|---|
| 保存机制 | 三层（含 5 秒 autosave、关闭即保存） | autosave 持久化已移除；保存按钮统一持久化；关闭/取消丢弃 | PRD 需要更新 |
| TimeCalendar 集成 | 选择时间段打开 Modal | 已实现“先创建再打开”+ initialStartTime/EndTime | OK |
| TimeLog 集成 | 打开 Modal 编辑/新建 | 编辑 OK；新建入口契约不一致 | 需要修复 |
| Timer 集成 | 统一 Timer 接口 | App 统一接口存在，但仍有 legacy v1 overlay | 部分（需清理 legacy） |
| Tab 详情页复用 | 复用同一实现 | LogTab 复制式实现 | 需要重构 |

## 6. 最小重构路线（不改变 UX 的前提下）

1) **统一新建入口契约**：所有新建事件入口先 createEvent，再打开 EventEditModalV2；取消时删除 newlyCreatedEventId。
2) **抽离“EditorCore”**：把 title/eventlog/标签/时间/地点/参会人 + handleSave 的核心逻辑抽到一个无 UI 外壳的组件（或 hooks），LogTab/Modal 复用。
3) **收敛持久化策略**：明确哪些字段“即时持久化”（如 syncMode），其余只在保存按钮持久化。
4) **删/迁移 legacy**：App.tsx 旧 v1 overlay 明确迁移/删除计划（避免双入口长期并存）。

---

## 7. 证据索引（便于追溯）

- 保存语义与 handleSave：src/components/EventEditModal/EventEditModalV2.tsx
- TitleSlate/ModalSlate 数据更新：src/components/ModalSlate/TitleSlate.tsx, src/components/ModalSlate/ModalSlate.tsx
- TimeLog 调用点：src/pages/TimeLog.tsx
- TimeCalendar 调用点：src/features/Calendar/TimeCalendar.tsx
- LogTab 复制式实现：src/pages/LogTab.tsx
