# Refactor Master Plan v2.22 (Single Source of Truth)

**日期**: 2025-12-30  
**状态**: ✅ 进行中（唯一实施口径）  
**位置**: `docs/refactor/`（执行入口）

> 目的：把“审计结论 / 实施步骤 / 执行日志”分离，但统一口径。
>
> - 本文档 = **唯一实施口径**（术语、API 命名、Epic 顺序、验收标准）。
> - 其他文档（audits / designs）= **论证与背景**（可以提案，但不得成为最终口径）。
> - 执行日志 = **记录已做**（commit 级 Why/Scope/Risk/Validation/Rollback）。

---

## 0. North Star（不变式）

1) **Domain 单一数据源**：领域数据（events/tree/history/indexes）只能有一个真相来源（EventHub/EventService 体系），UI 不允许自建“第二份真相缓存”。
2) **编辑器正确性优先**：Slate 编辑器的 source-of-truth 是 `editor.children`；禁止 React state 镜像 value、禁止 key 强制 remount 来“修复”。
3) **管线态归属**：保存/同步/去抖/并发/环回防护（E 类）归服务层（pipeline/store），UI 只持有最小会话态与展示态。
4) **可回滚、可验证**：每一步改动必须能单独验证与回滚；不要“大爆炸合并”。

5) **ADR-001（树结构真相）**：树结构以 `parentEventId` 为唯一真相；`childEventIds` 视为 legacy 兼容字段，不再自动维护，也不得作为结构/正确性/排序的依赖（兄弟顺序以 `position` 为主，兜底 `createdAt/id`）。

---

## 1. 文档职责边界（防口径分叉）

- **实施口径（唯一）**：本文档。
- **字段契约（canonical vs derived / time/title 等硬规则）**：[docs/refactor/EVENT_FIELD_CONTRACT.md](EVENT_FIELD_CONTRACT.md)
- **执行记录**：[docs/refactor/REFACTOR_EXECUTION_LOG_v2.22.md](REFACTOR_EXECUTION_LOG_v2.22.md)
- **Refactor 文档入口索引**：[docs/refactor/REFRACTOR_DOCS_INDEX_v2.22.md](REFRACTOR_DOCS_INDEX_v2.22.md)
- **ToastUI Calendar 简化审计（TimeCalendar）**：[docs/refactor/TUI_CALENDAR_SIMPLIFICATION_AUDIT_2026-01-03.md](TUI_CALENDAR_SIMPLIFICATION_AUDIT_2026-01-03.md)
- **代码结构/命名诊断（迁移路线图）**：[docs/refactor/CODE_STRUCTURE_AND_NAMING_DIAGNOSIS_2026-01-02.md](CODE_STRUCTURE_AND_NAMING_DIAGNOSIS_2026-01-02.md)
- **整理后的全量目标目录树（执行用）**：[docs/refactor/CODE_STRUCTURE_TARGET_TREE_2026-01-02.md](CODE_STRUCTURE_TARGET_TREE_2026-01-02.md)
- **useState 诊断（问题清单/分类法）**：[docs/refactor/USE_STATE_DIAGNOSIS_v2.22.md](USE_STATE_DIAGNOSIS_v2.22.md)
- **EventService v2 设计（域层/codec/unknown-block 体系）**：[docs/refactor/EventService 架构诊断与重构设计_v2_2025-12-30.md](EventService%20%E6%9E%B6%E6%9E%84%E8%AF%8A%E6%96%AD%E4%B8%8E%E9%87%8D%E6%9E%84%E8%AE%BE%E8%AE%A1_v2_2025-12-30.md)
- **EditModal 架构审计（模块拆分路线）**：[docs/refactor/EVENTEDITMODAL_V2_ARCH_REVIEW_2025-12-29.md](EVENTEDITMODAL_V2_ARCH_REVIEW_2025-12-29.md)

> 规则：audits/designs 可以提出候选方案，但必须在“本文档的口径表”里定稿后才能进入执行。

---

## 2. 术语与 API 口径（唯一命名表）

### 2.1 状态分类（A/B/C/D/E）

- (A) UI 临时态：开关/hover/弹窗
- (B) 编辑器会话态：selection/focus/IME/键盘命令（高频、成组变化）
- (C) 领域数据真相：events/tree/history/indexes
- (D) 派生/缓存：可由 (C) 推导
- (E) 持久化/同步管线态：debounce/inflight/local-guard/flush

> 口径：UI 可以持有 (A)(B)；(C)(E) 必须在服务层；(D) 默认用 selector/memo（必要时在服务层做 cache）。

### 2.2 EventHub / EventService 的读取方式（口径）

- **目标形态（推荐）**：UI 读取领域数据采用“订阅 + selector”，避免 UI 自己异步拉取并缓存。
- **短期允许**：如果已有 `EventHub` 的订阅机制，UI Hook 可以在内部持有最小 state 来触发 re-render；但对外语义必须是“订阅视图”，而非“第二份真相”。

> 重要：本文档不强制具体实现细节（`useSyncExternalStore` 或内部 state），但强制对外语义：UI 不直接 `EventService.getAllEvents()` 维护一份 `allEvents` 真相。

**建议的对外 Hook 命名（统一口径）**

- `useEventHubEvent(eventId)`：按 id 获取单个事件（订阅更新）
- `useEventHubQuery(selector, deps?)`：按 selector 查询（订阅更新）
- `useEventHubSnapshot()`：一次性快照（只用于只读场景/初始化，不做长期真相）

> 说明：各 audits 文档里出现的 `useEventHubSubscription/useEventHubCache/useEventHubGet` 属于历史/候选命名；实施以本文为准。

---

## 3. Epic 路线图（按收益/风险排序）

### Epic 0：基线与安全护栏（已在执行日志中持续维护）

**验收**
- 任意一步变更都有明确 rollback 方式
- 关键流程手工 smoke 覆盖（Plan/TimeLog/Calendar）

### Epic 1：编辑器正确性（Slate 单一状态源）

**目标**
- 消除 Slate value 镜像与 remount 反模式

**验收**
- 输入不丢 selection/focus
- 刷新/切页后层级与顺序稳定

### Epic 2：领域数据单一数据源（从 UI 拉取迁移到订阅视图）

**目标**
- TimeLog / TimeCalendar / PlanManager / EventEditModalV2 等不再直接异步拉取并 `setState(allEvents)` 作为真相

**验收**
- UI 不直接调用 `EventService.getAllEvents/getTimelineEvents` 来维护长期状态
- 更新能自动反映到所有订阅页面（无需手动 reload/version bump）

### Epic 3：EditModal 重构落地（draft/persistence 拆分 + LogTab 去复制化）

**目标**
- 先抽 `useEventEditPersistence`，把 save/cancel/delete 与管线态边界收敛
- 然后做 “single core / multi shell”：Modal 与 Tab 共享同一核心逻辑

**验收**
- Modal 与 LogTab 行为一致（保存/取消/删除/异常处理）
- 回归风险下降：修 bug 不需改两份逻辑

### Epic 4：EventService v2（codec/registry/unknown-block）

**目标**
- 按 v2 设计推进 ElementRegistry / EventLogCodec / Unknown-block 安全阀

**验收**
- Outlook 回读永不崩、不丢、可再同步

---

## 4. 执行纪律（每次提交必须满足）

- 1 commit = 1 logical change
- 每次提交要写：Why / Scope / Risk / Validation / Rollback
- 合并前至少通过：类型检查 + 相关单测（如有）+ 手工 smoke

---

## 5. 当前 Next Actions（执行清单）

> 这部分会随执行推进更新；具体“做过什么”只写进 Execution Log。

1) 统一 EventHub 读取口径：确定 UI 使用 `useEventHubEvent/useEventHubQuery`（命名与语义）
2) 按 Epic 2 迁移一个页面（建议从影响面最小的一个开始），跑 smoke
3) 推进 Epic 3：抽 `useEventEditPersistence`，先让 Modal/Tab 共用
