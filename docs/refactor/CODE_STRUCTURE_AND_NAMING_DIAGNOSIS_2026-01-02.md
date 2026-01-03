# 代码结构与命名诊断（Refactor 子计划）

**日期**：2026-01-02  
**状态**：🟡 诊断完成，等待分阶段执行  
**口径**：本文仅定义“代码放置/命名/迁移路线图”，对外 API 口径仍以 [docs/refactor/REFACTOR_MASTER_PLAN_v2.22.md](REFACTOR_MASTER_PLAN_v2.22.md) 为准。

---

## 0. 目标（为什么现在做）

当前 repo 的主要风险不是“功能缺少”，而是：

- 关键服务文件（尤其 EventService）过大，导致改动冲突率高、定位成本高。
- 同一类逻辑散落在多个目录（services/utils/components 等），后续重构时容易出现“规则漂移”。
- `eventlog` 同时被用作“数据对象概念”和“代码目录名”，造成理解歧义。

本子计划的目标：

1) **单一责任入口不变**：`EventService.normalizeEvent/normalizeEventLog` 仍是唯一对外入口（责任主体不变）。
2) **实现可拆可测**：把大文件中的可复用/可测试实现拆成小模块，降低冲突。
3) **目录名消除歧义**：避免“数据对象名”和“目录名”同名导致误读。
4) **分阶段、可回滚**：每一步都能独立验证与回滚，不做“大爆炸搬家”。

---

## 1. 术语澄清（避免误解）

- **EventLog（对象/字段）**：指事件内容的数据结构（`slateJson/html/plainText/...`）。
- **eventlog（目录/模块）**：只是源码文件夹命名，用于放“处理 EventLog 的实现代码”。

为了减少歧义，建议把源码目录从 `src/services/eventlog/` 改名为更明确的：

- `src/services/eventlogProcessing/`（推荐，覆盖“清洗/解析/codec/识别/压缩”等处理逻辑）

> 说明：改名不改变责任归属；EventService 仍负责执行 normalize，只是把实现放到更合理的位置。

---

## 2. 现状速览（仅聚焦结构问题）

从当前结构看：

- `src/services/`：集中放了领域服务（EventService/EventHub/TimeHub/Storage/...），整体方向正确。
- `src/utils/`：工具较多且按主题混放（time/calendar/event/...），可读性随规模增长下降。
- `src/components/`：组件目录层级较深，局部存在业务/通用混杂（不是本计划第一优先级）。
- `src/services/eventlog/`：已经开始承担“EventLog 处理模块”角色，但命名会误导（看起来像数据对象本身）。

---

## 3. 主要问题清单（为什么会‘乱套’）

1) **“规则漂移”的风险**：当同一处理规则（例如 Outlook HTML 清洗）在多个地方出现时，会逐渐分叉。
2) **大文件阻碍协作**：核心逻辑聚集在 `EventService.ts`，多人并行重构冲突概率极高。
3) **命名造成误读**：`eventlog` 既像“对象”，又像“模块”，阅读时会下意识把它当成“第二个责任主体”。

---

## 4. 建议的目标结构（最小化改动版本）

> 目标：不改对外 API，只调整实现组织。

### 4.1 Service 层（责任入口）

- `src/services/EventService.ts`：对外 API + 编排（仍是 normalize 的唯一入口/责任主体）。
- `src/services/EventHub.ts` / `TimeHub.ts`：订阅与读写口径不变。

### 4.2 EventLog 处理实现（内部实现层）

- `src/services/eventlogProcessing/`（建议新增并迁移）
  - `outlookHtmlCleanup.ts`（已存在逻辑，可迁移）
  - `htmlToSlateJsonWithRecognition.ts`（计划迁移）
  - `parseHtmlNode.ts`（计划迁移）
  - 后续：`eventlogCompression.ts` / `signatureStrip.ts` / `blockTimestampExtract.ts` 等

> 约束：该目录里的模块 **不允许 import EventService**；需要的依赖通过参数注入，避免循环依赖。

### 4.3 Integrations（外部系统）

把外部系统相关服务归拢，降低 services 根目录的“杂物密度”（建议后续 P1 执行）：

- `src/services/integrations/microsoft/`（Graph/Outlook/Calendar 相关）
- `src/services/integrations/ai/`（AI 代理等）

### 4.4 Pages / Features（Plan / TimeLog / TimeCalendar / TimeVisual 的放置口径）

你提到的几个“页面级模块”（Plan、TimeLog、TimeCalendar、TimeVisual）确实容易和 `services/` 混在一起。这里给一个**全局统一口径**（可落地、低冲突）：

- **`src/pages/`**：放“页面入口组件”（路由/窗口/Tab 级别），尽量薄：组合 UI + 调用 hooks/services。
- **`src/features/<FeatureName>/`**：放“功能模块包”（该功能专属的组件/状态/hook/样式/工具）。
- **`src/services/`**：放“领域服务 + 编排 + I/O”（数据读写、同步、规范化），不放 UI。

落到这 4 个模块上：

- **Plan 模块**：
  - `src/pages/Plan/`（页面入口）
  - `src/features/Plan/`（Plan 业务 UI + hooks + helpers）

- **TimeLog 模块**：
  - `src/pages/TimeLog/`（页面入口）
  - `src/features/TimeLog/`（时间轴 UI + hooks + 视图模型）

- **TimeCalendar 模块**：
  - `src/pages/TimeCalendar/`（页面入口）
  - `src/features/Calendar/`（已经存在；建议继续把 TimeCalendar 的“功能包”放这里）

- **TimeVisual 模块（如果要做）**：
  - `src/pages/TimeVisual/`（页面入口）
  - `src/features/TimeVisual/`（图表/可视化专属 UI + hooks）

> 备注：如果你更偏好“全部放到 Pages”，也可以做到，但建议至少保留 `features/` 作为“可复用的功能包”，否则 Pages 会很快变成第二个 components 大杂烩。

### 4.5 全量架构树（目标形态，作为“放置位置”的单一口径）

下面是一棵**“应该把什么放哪里”**的目标树（不是要求一次性搬家；用于后续 P1/P2/P3 每次搬迁时对齐口径）：

```text
src/
  pages/                      # 页面入口（薄编排）
    HomePage/
    TimeLog/                  # TimeLog 页面入口（可把现有 TimeLog.tsx/LogTab.tsx 逐步归拢）
    TimeCalendar/             # TimeCalendar 页面入口
    Plan/                     # Plan 页面入口
    TimeVisual/               # TimeVisual 页面入口（未来）

  features/                   # 功能模块包（一个功能一个目录）
    Calendar/                 # ✅ 已存在：TimeCalendar 相关
    TimeLog/                  # 建议新增：时间轴/筛选/视图模型
    Plan/                     # 建议新增：PlanManager 相关 UI + hooks
    TimeVisual/               # 建议新增：可视化相关

  components/                 # 跨功能可复用 UI 组件（不要承载业务编排）
    common/
    shared/

  services/                   # 领域服务（读写/同步/规范化/编排）
    EventService.ts           # ✅ 单一责任入口：normalize / create / update 等编排
    EventHub.ts
    TimeHub.ts

    sync/                     # 同步编排（建议后续归拢：ActionBasedSyncManager 等）
    eventlogProcessing/       # ✅ EventLog 处理实现（清洗/解析/codec/压缩等），禁止 import EventService
    eventTree/                # EventTree / Node / Stats 相关（建议把 EventTree/ 统一到一个目录名）
    storage/                  # IndexedDB/SQLite/Cache 等
    search/
    integrations/
      microsoft/
      ai/

  hooks/                      # 跨功能 hooks（订阅/查询/复用逻辑）
  utils/                      # 通用工具（与 UI/服务无关）
    time/
    calendar/
    event/
    eventlog/                 # 仅放“纯数据结构/纯算法工具”；避免放 I/O 或 HTML 适配

  types/
  styles/
  lib/
```

这个树的核心约束只有两条：

1) **UI 模块（Plan/Time*）可以在 Pages/Features，但不要进 services。**
2) **Sync/EventlogProcessing/EventTree 等“数据与编排”必须在 services。**

---

## 5. 改名与搬迁策略（分阶段执行，不爆炸）

### P0（现在就做，低风险）— 目录改名但保持兼容

目标：把“目录命名歧义”先解决，同时避免一次性改大量 import。

做法（推荐“兼容垫片/shim”）：

1) 新增 `src/services/eventlogProcessing/`，把新代码只往这里放。
2) 保留旧目录 `src/services/eventlog/` 作为兼容层：
   - 旧目录文件仅做 re-export（或薄包装），内部转调到 `eventlogProcessing`。
3) 等全仓库 import 全部迁移后，再删除旧目录。

验收：`npm run typecheck` + `npm run test -- --run` 全绿。

### P1（中风险）— 迁移 EventService 内部 HTML→Slate 实现

目标：把 `htmlToSlateJsonWithRecognition/parseHtmlNode` 抽离到 `eventlogProcessing/`，EventService 仅保留薄接线。

验收：已有 Outlook 回归矩阵测试继续通过。

### P2（中风险）— utils 按主题归拢

目标：把 `src/utils/` 按领域主题分子目录，例如：

- `src/utils/time/*`
- `src/utils/calendar/*`
- `src/utils/event/*`
- `src/utils/eventlog/*`

> 注：`utils/eventlog/*` 这里建议只放“纯算法/纯数据”层面的工具（例如解析/格式化/字段 helpers）。
> Outlook HTML 清洗、HTML→Slate 这种“适配器/codec”更建议放在 `services/eventlogProcessing/`，避免未来又出现“规则漂移”。

验收：只做移动+import 更新，不改行为。

### P3（可选）— components 结构清理

目标：把 `components/common`、`components/shared`、`components/*` 的边界明确化（这通常需要 UI owner 参与，建议最后做）。

---

## 6. 执行纪律（避免越改越乱）

- **唯一入口**：外部代码只调用 `EventService.normalizeEvent/normalizeEventLog`；不要在 UI/manager 里直接调用内部 adapter。
- **每一步独立验证**：每次只做“移动/改名/薄接线”，不要顺便重写逻辑。
- **保留回滚路径**：P0/P1 都可以通过 revert 单 commit 回滚。

---

## 7. 下一步建议（最短路径）

1) 先做 P0：引入 `eventlogProcessing/` + 兼容层（避免一次性改全仓库 import）。
2) 再做 P1：把 HTML→Slate 两个核心函数迁移出去（仍由 EventService 调用）。
3) 每完成一阶段，都在 Execution Log 记账（Why/Scope/Risk/Validation/Rollback）。

---

## 8. 全量目标目录树（执行用）

为避免“搬运时口径不一致”，完整的目标目录树与第一版搬运映射清单单独收敛在：

- [docs/refactor/CODE_STRUCTURE_TARGET_TREE_2026-01-02.md](CODE_STRUCTURE_TARGET_TREE_2026-01-02.md)
