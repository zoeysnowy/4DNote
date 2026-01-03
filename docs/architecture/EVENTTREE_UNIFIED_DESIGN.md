# EventTree 统一架构设计（Legacy / 已弃用）

> 本文档为历史方案备份。
> 当前代码与文档真相以 ADR-001 为准：树结构唯一真相是 `parentEventId`。
> `childEventIds` 仅为历史字段（若仍存在则不维护、不依赖其正确性）。

## 为什么要标记为 Legacy

这份文档包含对“父子双向字段维护”（parentEventId + childEventIds）的实现叙述，会误导后续重构与新功能。
当前系统的结构一致性依赖于 `parentEventId` 的单向真相与基于它的派生查询/索引。

## 目前应该看哪些文档

- `docs/architecture/EVENT_FIELD_CONTRACT.md`：字段契约与 canonical/derived 纪律（最高优先级）
- `docs/architecture/EVENTSERVICE_ARCHITECTURE.md`：EventService/EventTree 的当前架构与 ADR-001 落地
- `docs/PRD/EVENTTREE_MODULE_PRD.md`：模块行为与测试口径

## 迁移/兼容提示

- 如果你在数据里看到 `childEventIds`：把它当作 legacy passthrough/cleanup 对象，不作为结构真相。
- 不要在写路径里维护“父子双向字段”。如需树结构变更，只更新 `parentEventId`，其余均应派生。
