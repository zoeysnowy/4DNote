# Refactor Docs Index v2.22

本页是 Refactor 目录的“文档入口索引”。实施时以 Master Plan 为唯一口径，其余为分册/审计/执行记录。

- 实施口径（唯一来源）：
  - [docs/refactor/REFACTOR_MASTER_PLAN_v2.22.md](REFACTOR_MASTER_PLAN_v2.22.md)

- 执行日志（记录已做什么，不承载口径）：
  - [docs/refactor/REFACTOR_EXECUTION_LOG_v2.22.md](REFACTOR_EXECUTION_LOG_v2.22.md)

- 分册入口（指针页）：
  - [docs/refactor/USE_STATE_DIAGNOSIS_v2.22.md](USE_STATE_DIAGNOSIS_v2.22.md)
  - [docs/refactor/EVENTEDITMODAL_V2_ARCH_REVIEW_2025-12-29.md](EVENTEDITMODAL_V2_ARCH_REVIEW_2025-12-29.md)
  - [docs/refactor/EventService 架构诊断与重构设计_v2_2025-12-30.md](EventService%20%E6%9E%B6%E6%9E%84%E8%AF%8A%E6%96%AD%E4%B8%8E%E9%87%8D%E6%9E%84%E8%AE%BE%E8%AE%A1_v2_2025-12-30.md)
  - [docs/refactor/CODE_STRUCTURE_AND_NAMING_DIAGNOSIS_2026-01-02.md](CODE_STRUCTURE_AND_NAMING_DIAGNOSIS_2026-01-02.md)
  - [docs/refactor/CODE_STRUCTURE_TARGET_TREE_2026-01-02.md](CODE_STRUCTURE_TARGET_TREE_2026-01-02.md)
  - normalizeEvent / Outlook 内容一致性（已合并至 EventService v2 分册）：[docs/audits/EventService 架构诊断与重构设计_v2_2025-12-30.md](../audits/EventService%20%E6%9E%B6%E6%9E%84%E8%AF%8A%E6%96%AD%E4%B8%8E%E9%87%8D%E6%9E%84%E8%AE%BE%E8%AE%A1_v2_2025-12-30.md)

- 关键架构口径（实现对齐的权威说明）：
  - EventHub/TimeHub（订阅视图、按 eventId 缓存、`eventsUpdated` 驱动）：[docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md](../architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md)
  - EventService 重构记录（从上文抽离的跑题段落，单独归档）：[docs/architecture/EVENTSERVICE_REFACTOR_OPTIMIZATION_v2.18.8.md](../architecture/EVENTSERVICE_REFACTOR_OPTIMIZATION_v2.18.8.md)

- 跨模块硬约束（避免读到 legacy 口径）：
  - Event 字段契约（canonical vs derived、time/title 等）：[docs/architecture/EVENT_FIELD_CONTRACT.md](../architecture/EVENT_FIELD_CONTRACT.md)
  - Event 字段写入审计（对照代码的风险点/写入点清单，口径必须服从字段契约）：[docs/audits/EVENT_FIELD_NORMALIZATION_AUDIT_2025-12-29.md](../audits/EVENT_FIELD_NORMALIZATION_AUDIT_2025-12-29.md)
  - EventTree PRD（ADR-001：`parentEventId` 为真相，`childEventIds` 为 legacy）：[docs/PRD/EVENTTREE_MODULE_PRD.md](../PRD/EVENTTREE_MODULE_PRD.md)

- 审计/设计分册原位置（需要时直接查看）：
  - [docs/audits/](../audits/)
