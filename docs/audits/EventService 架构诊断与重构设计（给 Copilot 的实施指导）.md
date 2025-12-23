
# 目的

这份文档用于指导 Copilot（以及未来的代码改动）在不引入 Redux 的前提下，逐步修正 `EventService` 及其相关模块的架构问题，降低耦合与竞态，提升**事件树（parent/child/bulletLevel）一致性**与**保存/同步链路可预测性**。

---

# 一、现状诊断（主要不合理/冗余点）

> 下面每一条都按：**现象 → 风险 → 建议方向** 说明。

## (1) EventService 变成“上帝类”（God Service）

**现象**
- 同时负责：CRUD、双写存储（IndexedDB/SQLite）、同步队列、跨 tab 广播、Outlook/HTML 清洗、Slate/HTML/纯文本互转、签名字段、timestamp 迁移、EventHistory、Contact 派生更新、EventNodes/索引同步、树构建、backlinks 重建、统计表维护等。

**风险**
- 改一处会影响多条链路；难单测；debug 依赖日志与“经验修复”；性能不可控。

**建议方向**
- 不一定拆成多个 service 对外暴露，但内部必须拆成**明确子模块**（物理分文件 + 清晰边界），让复杂度可控。

---

## (2) 双向关系（`parentEventId` ↔ `childEventIds`）在多处维护

**现象**
- `createEvent/updateEvent` 在不同分支里分别：
  - 更新 child 的 `parentEventId`
  - 更新 oldParent/newParent 的 `childEventIds`
  - “确保包含/移除”
- 还存在 temp-id resolve 批量替换两边引用。

**风险**
- 连带更新导致多次写、多次广播、多次历史/统计/索引副作用。
- 容易出现短暂不一致（尤其在 debounce/pendingWrites/跨 tab 回流时）。
- 后续任何地方若只改一边就破坏一致性，迫使更多“ensure 修复逻辑”进入主路径。

**建议方向**
- 收敛为一个原子领域操作：`reparentEvent(childId, newParentId, options)`  
  在一个“写入上下文”中一次性 staging → commit，避免连带更新触发全套副作用。

---

## (3) 读路径/写路径 normalize 不对称（导致行为不可预测）

**现象**
- 写入时会补齐/转换 `html/plainText`（从 `slateJson` 等生成）。
- 读取时有注释“不要 normalizeEventLog”，但实际上仍有路径会做重型 normalize/迁移（或在转换函数里隐式发生）。
- 存在“字段缺失就提示跑修复工具”与“主路径自动迁移”混用。

**风险**
- 相同数据在不同读取 API 下表现不同，难 debug。
- 性能抖动（读取触发重型解析/DOM 操作）。
- 迁移逻辑被用户日常编辑触发，增加不确定性。

**建议方向**
- 强制规则：  
  - **写入路径负责 canonical 化**（写进去就是规范形态）  
  - **读取路径只做轻量转换与缺省值填充**，不做重型迁移/解析  
- 所有迁移/修复应移出主路径，进入 RepairService 或显式“写入前迁移”。

---

## (4) EventService 内含 DOM 操作（例如 `document.createElement`）

**现象**
- HTML decode/提取文本、Outlook 清洗使用 DOM。

**风险**
- 使核心服务绑定浏览器环境，难以在 Node/Worker 单测或迁移。
- 逻辑不可纯函数化，测试困难。

**建议方向**
- 将 HTML/Outlook 清洗放进 `EventLogHtmlAdapter`（可替换实现）。  
  核心存储/树/同步逻辑不依赖 DOM。

---

## (5) 广播体系重复：`window CustomEvent` + `BroadcastChannel` + `EventHub` 混用

**现象**
- 同一次更新可能被多个通道重复广播。
- 通过 `pendingLocalUpdates`（基于 eventId + 时间窗）做循环抑制。

**风险**
- 订阅者重复收到更新；跨 tab 回流造成“自己更新自己”的闭环。
- 基于时间窗的去重属于启发式：可能误杀/漏杀。

**建议方向**
- 统一为单一抽象层：`EventBroadcast.publish(message)`  
  - message 包含 `originTabId + seq + batchId`
  - 去重基于 messageKey（不是 eventId），避免批量更新时混乱
- 本 tab 与跨 tab 的消费都走同一个去重逻辑。

---

## (6) `pendingWrites`（read-your-own-writes）方向对，但会放大中间态副作用

**现象**
- 写入后将 event 放入 `pendingWrites` 以避免读取滞后。
- 内部连带更新调用 `getEventById` 可能读到“未完全 canonical / 未完成连带一致性”的中间态。

**风险**
- 后续推导/ensure 会基于中间态继续写入，扩大不一致。
- 竞态更难定位。

**建议方向**
- `pendingWrites` 只缓存 **canonical、已完成连带修正** 的对象。
- 更推荐“请求级写入上下文（WriteContext）”：  
  staged events 在 ctx 中可读，最后一次 commit 写库 + 一次广播。

---

## (7) 树逻辑半融合但不集中，降级策略可能污染数据

**现象**
- 存在多套 tree/bulletLevel 计算与降级（父缺失时依赖旧 bulletLevel）。
- 逻辑散落在 update、get tree、UI 层等。

**风险**
- Tab/Shift+Tab 等结构操作长期不稳定。
- 过滤视图导致父缺失时的“临时降级”如果写回 DB，会污染 canonical 数据。

**建议方向**
- 抽 `EventTreeEngine` 纯函数统一推导。  
- “父缺失”只允许作为**视图层降级**（UI 处理），不得写回 DB。

---

## (8) 大量“修复型逻辑”留在主路径（冗余且高风险）

**现象**
- timestamp 迁移、temp-id resolve、backlinks 全量重建、旧格式修复等在主路径出现或可被普通操作触发。

**风险**
- 主路径越来越慢；普通编辑触发重型工作；bug 面扩大。

**建议方向**
- 建立 `EventRepairService`（显式调用/工具触发），主路径只做轻量校验。

---

# 二、目标设计（建议的模块拆分与边界）

> 不要求一次性拆出去对外多个 service；**可以对外仍暴露 EventService**，但内部必须模块化、可测试。

## (1) 推荐的内部模块

### 1) EventService（Facade）
- 对外 API：`create/update/delete/get/query/reparent/batchApply/flush`
- 负责协调：storage、sync、broadcast、treeEngine、normalizer
- **不做**：DOM 清洗细节、树算法细节、repair 细节

### 2) EventNormalizer（轻量）
- 负责：字段缺省、类型兼容、时间字段规范化（不含重型 DOM 解析）

### 3) EventLogNormalizer（重型写入前规范化）
- 输入：任意 log（slateJson/html/plainText 的任意组合）
- 输出：canonical log（比如保证 html/plainText 与 slateJson 一致）
- 可依赖 `EventLogHtmlAdapter`（浏览器实现/可替换实现）

### 4) EventTreeEngine（纯函数）
- `buildEventTree(eventsById | events[]) -> {sortedIds, bulletLevels, orphans, cycles}`
- `computeReparentEffect(eventsById, {movedId, newParentId}) -> {affectedIds, patches}`
- `validateRelations(eventsById) -> issues`

### 5) EventBroadcast（统一发布/订阅）
- publish(message)：
  - `{type, eventIds, originTabId, seq, batchId, payloadHash?}`
- subscribe(handler)
- 去重与回流抑制在这里完成（不是在业务逻辑里 scattered）

### 6) SavePipeline / WriteContext（写入上下文）
- `ctx.stage(eventPatch)`：合并 patch
- `ctx.get(id)`：读取 staged 优先
- `ctx.commit()`：一次性写 storage、一次性广播、一次性写 history/stats/nodes

### 7) EventRepairService（显式修复/迁移工具）
- migrate timestamps
- rebuild backlinks
- resolve temp ids（可分页/增量）
- validate & repair parent/children consistency（离线跑）

---

# 三、关键原则（Copilot 必须遵守）

## 原则 1：Single Source of Truth
- canonical 数据以 `eventsById`（或 storage canonical event）为准。
- UI 的列表/过滤/层级缩进都来自 TreeEngine 输出的 view（`sortedIds/bulletLevels`）。
- **禁止**：同时维护多份“同义数据”（例如 items/editorItems/filteredItems）作为真相源。

## 原则 2：写入 canonical，读取轻量
- 写入前必须完成 log 规范化与必要的字段生成（canonical）。
- 读取不得触发重型 normalize/迁移（除非显式 Repair 路径）。

## 原则 3：连带更新必须批处理（一次 commit）
- `reparent`、childEventIds 修复、temp-id resolve 等属于“多事件一致性更新”，必须走 WriteContext：
  - staging → commit
  - 广播/同步/历史/索引/统计等副作用只触发一次

## 原则 4：树推导是纯函数
- 树结构、bulletLevel、排序，不允许在 UI/随机 service 分支里重复实现。
- 任何“ensure parent includes child”之类逻辑要么：
  - 作为 TreeEngine/RepairService 的明确功能
  - 要么在 `reparentEvent` 的原子操作里完成

## 原则 5：广播统一、可去重、可追踪
- 所有更新广播必须包含 `originTabId + seq + batchId`。
- 去重不依赖时间窗，不依赖 eventId map。

---

# 四、建议的对外 API（最小新增，最大收益）

## 1) `reparentEvent(childId, newParentId, options?)`
原子领域操作，用于 Tab/Shift+Tab、拖拽、批量调整层级等。

**行为**
- 更新 child.parentEventId
- 更新 oldParent.childEventIds（remove）
- 更新 newParent.childEventIds（add）
- 由 TreeEngine 计算受影响子树 bulletLevel 变化（如有需要可不落库，仅用于 view）

**实现要求**
- 必须使用 WriteContext
- 只能 commit 一次
- 只能广播一次（包含所有 affectedIds）

## 2) `batchApply(patches, {source, priority})`
用于 PlanSlate/PlanManager 将编辑快照（或 patch 队列）一次性提交。

**要求**
- 内部合并 patch
- 处理 write-time normalization（如必要）
- commit 一次

## 3) `getPlanView(scope) -> {eventsById, sortedIds, bulletLevels}`
Plan 页拿渲染所需的 view，避免在 UI 层重算树。

---

# 五、WriteContext（批处理提交）设计草案

> 这是减少竞态与冗余副作用的核心。

## 数据结构
- `staged: Map<eventId, CanonicalEvent>`（或 patch）
- `affectedIds: Set<eventId>`
- `sideEffects: {history: boolean, stats: boolean, nodes: boolean, sync: boolean, broadcast: boolean}`
- `meta: {origin, batchId, priority}`

## 主要方法
1) `stagePatch(eventId, patch)`
2) `stageEvent(event)`（直接放 canonical）
3) `get(eventId)`（staged 优先）
4) `commit()`
   - 写 storage（一次或按批次）
   - 写 history（一次）
   - 更新 stats/nodes（一次）
   - publish broadcast（一次：batch message）
   - record sync action（一次）

## 规则
- 内部连带更新（例如更新父 childEventIds）使用 `ctx.stagePatch(...)`，并设置 `muteSideEffects`（即 sideEffects 仅在最终 commit 执行）。
- `pendingWrites` 如保留，只能在 commit 结束后写入，确保 canonical。

---

# 六、EventTreeEngine（纯函数）职责与约束

## 输入
- `eventsById`（canonical）或 events array

## 输出（建议）
- `sortedIds: string[]`
- `bulletLevels: Map<string, number>`
- `orphans: string[]`（父缺失）
- `cycles: string[][]`（检测循环）

## 约束
- 不写库、不广播、不访问 DOM、不读全局状态
- 可单元测试

## 对“父缺失”的处理
- 输出 `orphans` 供 UI 标记/降级
- **不得**写回 bulletLevel 修正到 DB（除非 RepairService 显式修复）

---

# 七、迁移计划（最小侵入的优先顺序）

## Step 1：统一广播层（低风险，高收益）
- 引入 `EventBroadcast.publish(message)`，现有三套广播改为单入口。
- 增加 origin/seq/batchId 去重机制。
- 保留旧订阅 API 的兼容转发（短期）。

## Step 2：引入 WriteContext（降低重复副作用与竞态）
- 先把 `updateEvent/createEvent` 内部“连带更新父子关系”改为 staging + 单 commit。
- 将 history/stats/nodes/sync/broadcast 从“每次 update 都触发”改为“commit 触发一次”。

## Step 3：抽 EventLogNormalizer（写入 canonical，读取轻量）
- 将 DOM/Outlook 清洗迁移到 adapter，EventService 不直接依赖 DOM。
- 确保 read path 不做重型 normalize。

## Step 4：抽 EventTreeEngine（集中树规则）
- 将零散树/bulletLevel 推导集中为纯函数。
- Plan 页统一通过 `getPlanView()` 获取 view。

## Step 5：把 repair/迁移移出主路径
- 建立 `EventRepairService`
- 主路径删除“隐式迁移/全量修复”触发点，只保留轻量校验与告警。

---

# 八、反模式清单（Copilot 需要避免）

- 在 UI 层/PlanManager/PlanSlate 自己 DFS 计算 bulletLevel、child list、树排序
- Tab/Shift+Tab 里直接调用多处 flush/save、setTimeout 强制写库
- updateEvent 内部递归调用 updateEvent 造成副作用叠加
- 读取 API 内部做 DOM 清洗、重型迁移
- 广播同时走 window + broadcastChannel + eventHub 三条路径（会重复）
- 用“时间窗 map”去重跨 tab 回流（不可预测）

---

# 九、验收标准（改完后应当成立的事实）

1) **一次 reparent 只产生一次 commit 与一次广播**（包含 affectedIds）。
2) 数据模型一致性可验证：  
   - 对任意 event：若 `parentEventId` 存在，则父的 `childEventIds` 必包含该 id（在 canonical 或通过 TreeEngine view 保证）。
3) UI 视图的 bulletLevel 由 TreeEngine 提供，不再依赖 DB 旧值。
4) 读取不再触发重型 normalize/迁移；重型工作仅发生在写入或 repair。
5) 跨 tab 更新不会重复回流触发本地再次写入（基于 messageKey 去重）。

---

# 十、给 Copilot 的一句话指令（可直接粘贴）

请不要用 Redux 仅为减少 useState。优先实现：`WriteContext`（批处理提交、一次副作用）、`EventBroadcast`（统一去重发布）、`EventLogNormalizer`（写入 canonical，读取轻量）、`EventTreeEngine`（纯函数树推导），并将 `reparentEvent` 作为唯一修改 parent/child 双向关系的原子 API。
