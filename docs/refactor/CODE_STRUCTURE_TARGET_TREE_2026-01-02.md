# 整理后的目标目录树（Refactor 附录：全量架构树）

**日期**：2026-01-02  
**状态**：🟡 提案（用于指导后续搬运；不要求一次性完成）  
**口径**：对外责任/API 仍以 [docs/refactor/REFACTOR_MASTER_PLAN_v2.22.md](REFACTOR_MASTER_PLAN_v2.22.md) 为准；本文只定义“放哪里 + 为什么”。

---

## 0. 读过哪些权威架构口径（作为本提案的依据）

- App 根组件与分层原则：`docs/architecture/APP_ARCHITECTURE_PRD.md`
- EventService 职责与 normalize 中枢：`docs/architecture/EVENTSERVICE_ARCHITECTURE.md`
- EventHub/TimeHub（缓存/订阅/事件更新广播）：`docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md`
- 时间口径（TimeSpec / TimeHub / TimeSpec 格式）：`docs/architecture/TIME_ARCHITECTURE.md`
- 存储分层（StorageManager / IndexedDB / SQLite / 文件系统）：`docs/architecture/STORAGE_ARCHITECTURE.md`
- 同步口径（ActionBasedSyncManager 为当前主入口）：`docs/PRD/ACTIONBASEDSYNCMANAGER_PRD.md` + `docs/architecture/SYNC_MECHANISM_PRD.md`

---

## 1. 总原则（决定“放哪儿”的硬规则）

1) **服务层唯一真相**：events / tree / history / indexes / pipeline state 的真相在 `src/services/`（EventService/EventHub/TimeHub + Storage/Sync）。
2) **UI 不做第二份真相**：页面/组件只负责展示与交互；需要长期数据真相时通过 hooks 订阅（`eventsUpdated` / EventHub/TimeHub）。
3) **Feature 归属清晰**：Plan / TimeLog / TimeCalendar / TimeVisual 这类“产品模块”应按 feature 收敛，避免散落在 components/utils。
4) **Adapter/Codec 不放 utils**：Outlook HTML 清洗、HTML→Slate、签名编解码等属于“领域处理管线”，应放 `services/*Processing`（例如 `eventlogProcessing/`）。

---

## 2. 目标目录树（完整提案）

> 这是“最终整理后”的目标形态；执行时我们会按 P0/P1/P2 分阶段搬运，并用 shim 过渡，避免一次性改大量 import。

```text
src/
  App.tsx
  index.tsx

  pages/                                # 页面入口（薄编排：路由/窗口/Tab）
    HomePage/
    Plan/                               # Plan 页面入口（组合 features/Plan）
    TimeLog/                             # TimeLog 页面入口（组合 features/TimeLog）
    TimeCalendar/                        # TimeCalendar 页面入口（组合 features/Calendar）
    TimeVisual/                          # TimeVisual 页面入口（未来/已有则迁入）

  features/                              # 功能模块包（一个产品模块一个目录）
    Calendar/                             # ✅ 已存在：TimeCalendar 功能包
      TimeCalendar.tsx
      components/
      hooks/
      styles/
      index.ts
      README.md

    TimeLog/                              # 建议新增：TimeLog 功能包
      components/                         # 目前散落在 src/components/TimeLog/* 的可迁入
      hooks/
      viewModels/                         # 列表/筛选/渲染用派生模型（非真相）
      styles/
      index.ts

    Plan/                                 # 建议新增：Plan 功能包
      components/                         # 目前 src/components/PlanManager.tsx 等可迁入
      hooks/
      helpers/                            # 目前 src/utils/planManager*.ts 可迁入（如果不再是全局通用）
      styles/
      index.ts

    TimeVisual/                            # 建议新增：时间可视化功能包（图表/统计/展示）
      components/
      hooks/
      styles/
      index.ts

  components/                             # 跨 feature 可复用 UI（不承载业务编排）
    common/
    shared/
    ModalSlate/
    SlateCore/
    EventEditModal/                       # 如果该模块被多个页面复用，可暂留；长期可迁入 features/Editor

  hooks/                                  # 跨功能 hooks（订阅/查询/复用逻辑）

  services/                                # 领域服务（读写/同步/规范化/编排）
    EventService.ts                        # ✅ normalize 中枢 + CRUD 编排（唯一责任入口）
    EventHub.ts                            # eventId -> Event cache + eventsUpdated 协作
    TimeHub.ts                             # eventId -> Time snapshot + setEventTime

    sync/                                  # 同步编排（ActionBasedSyncManager 等）
      ActionBasedSyncManager.ts
      guards/
      queue/
      strategies/

    eventlogProcessing/                    # ✅ EventLog 处理管线（adapter/codec/识别/压缩等）
      outlookHtmlCleanup.ts
      htmlToSlateJsonWithRecognition.ts
      parseHtmlNode.ts
      signatureStrip.ts
      eventlogCompression.ts

    eventTree/                             # EventTree / Node / Stats 统一归拢
      engine/                              # 纯逻辑层（可测试）
      EventNodeService.ts
      stats/

    storage/                               # StorageManager + IndexedDB/SQLite/File 等

    search/
    ai/
    integrations/
      microsoft/
      ai/

  utils/                                  # 与 UI/服务无关的纯工具（可被任意层安全使用）
    time/
    calendar/
    event/
    text/
    dom/

  config/
  constants/
  types/
  styles/
  lib/
  assets/
```

---

## 3. 关键目录边界说明（避免“搬完又乱”）

### 3.1 `pages/` vs `features/`

- `pages/`：只做页面级“组合与布局”（路由/窗口/Tab）；不放复杂业务逻辑。
- `features/<X>/`：放模块自己的 UI + hooks + helpers；默认该目录内的东西不被其他 feature 直接引用。

### 3.2 `features/<X>/helpers` vs `utils/*`

- 放 `features/<X>/helpers`：只为该 feature 服务的 helper（例如 PlanManager 的过滤/排序/显示规则）。
- 放 `utils/*`：跨模块稳定通用、与领域服务无关的纯函数（例如时间格式化、字符串工具）。

### 3.3 `services/eventlogProcessing` vs `utils/eventlog`

- `services/eventlogProcessing`：Outlook/HTML/Slate 编解码、签名、压缩等“管线处理”，与 normalize 强绑定。
- `utils/eventlog`：如果存在，只放 EventLog 的纯数据结构辅助（例如字段判定/浅格式化），不要放 I/O、不要放 HTML adapter。

---

## 4. 搬运映射（第一版清单：从当前结构到目标树）

> 这是“可执行”的搬运 checklist：我们每次只做少量 Move + Import 更新，保持 typecheck+tests 全绿。

### UI / Feature

- `src/components/PlanManager.tsx` → `src/features/Plan/components/PlanManager.tsx`
- `src/utils/planManagerFilters.ts` → `src/features/Plan/helpers/planManagerFilters.ts`（如果不再被其它模块复用）
- `src/utils/planManagerHelpers.ts` → `src/features/Plan/helpers/planManagerHelpers.ts`
- `src/pages/TimeLog.tsx` → `src/pages/TimeLog/TimeLogPage.tsx`（页面入口命名可选）
- `src/components/TimeLog/*` → `src/features/TimeLog/components/*`
- `src/features/Calendar/TimeCalendar.tsx` 保持在 `features/Calendar`（页面入口在 `pages/TimeCalendar/*` 调用它）

### Services

- `src/services/eventlog/*` → 作为 shim 目录保留；真实实现迁移到 `src/services/eventlogProcessing/*`（✅ P0 已开始落地）
- `src/services/ActionBasedSyncManager.ts` → `src/services/sync/ActionBasedSyncManager.ts`（建议用 shim 过渡，避免大规模 import 变更）
- `src/services/EventTree/*` + `src/services/EventNodeService.ts` + `src/services/eventTreeStats.ts` → `src/services/eventTree/*`（统一命名与归属）

### Utils

- `src/utils/timeUtils.ts` → `src/utils/time/timeUtils.ts`（示例；以实际文件为准）

---

## 5. 执行顺序建议（避免大爆炸）

- P0：命名歧义优先解决（shim/re-export），例如 `eventlogProcessing/`（✅ 已做一部分）。
- P1：搬 services 内部实现（HTML→Slate 等），EventService 做薄接线。
- P2：搬 UI 的 feature 目录（Plan/TimeLog/TimeCalendar），优先“移动文件+改 import”，不改逻辑。
- P3：最后整理 `utils/` 与 `components/` 边界。

> 验收：每一步都必须 `npm run typecheck` + `npm run test -- --run` 全绿。
