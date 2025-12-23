
# 背景与目标

当前模块的核心痛点不是“`useState` 太多”，而是**状态语义混乱 + 多源真相 + 编辑器/树/持久化耦合**，导致键盘操作（Tab/Shift+Tab）与层级管理长期不稳定。解决优先级应当是：

1. **统一真相源（single source of truth）**  
2. 抽离**可测试的纯逻辑层**（EventTreeEngine）  
3. 将状态按类别收敛到 **`useReducer`（会话态）+ 自建 store/service（领域数据与管线态）**  
4. 最后再考虑是否需要 Redux（通常不需要）

---

# (1) 为什么 Redux 不合适（至少不是现在的第一选择）

## 1. Redux 解决的是“状态分发/共享”，不是“正确性/一致性”
- 当前问题主要来自：  
  - 事件树推导（`parentEventId/childEventIds/bulletLevel/position`）在多处重复计算  
  - Tab/Shift+Tab 既改 Slate 又试图直接 flush/save，造成时序竞态  
  - `items/editorItems/pendingEmptyItems` 等形成**多源真相**
- Redux 把 `useState` 搬到 store 并不会消除这些竞态与重复推导；反而可能让“错误的耦合”在全局变得更难追踪。

## 2. Redux 对“编辑器会话态”并不友好
编辑器中大量状态是**短生命周期、与 selection/focus/IME 相关、需要命令式 ref** 的会话态（例如 cursor restore、composition、anchor DOMRect）。这些：
- 放 Redux 会导致高频 dispatch、无意义重渲染、调试噪音
- 仍然离不开 `ref`/imperative API（Slate/DOM），Redux 无法替代

## 3. 先做正确的分层，未来再上 Redux 也不晚
如果未来确实出现以下需求：跨页面共享、复杂异步队列、可回放调试（time-travel）等，再考虑 Redux 也合理。  
但在当前阶段，最佳 ROI 是：
- 抽 EventTreeEngine
- 统一保存管线
- 用 `useReducer`/自建 store 收敛状态机

> 结论：Redux 不是“错”，只是**优先级不对**，且不能直接解决现在的结构性问题。

---

# (2) 我们接下来如何“自建”（详细方案）

## 总体分层（目标架构）

- **PlanSlate（Slate 编辑器层）**  
  只负责：键盘/输入 → 更新 Slate value/metadata → 抛出 onChange  
  不直接负责：持久化、事件树全量重算、广播同步

- **PlanManager（页面编排层）**  
  只负责：收集编辑快照、驱动 UI、决定何时保存（debounce policy）  
  不再负责：到处 DFS/重算 bulletLevel、散落的 flush 定时器

- **EventService（领域服务层）**  
  负责：normalize、存储、广播同步、对外提供查询/写入 API  
  内部调用 **EventTreeEngine（纯函数）** 统一树逻辑

- **EventTreeEngine（纯逻辑层，可单元测试）**  
  负责：build tree、排序、bulletLevel、orphan/cycle 检测、reparent 影响范围计算

---

# useState 分类方法（处理依据与决策规则）

将所有状态按 5 类贴标签，每类有清晰“放哪儿”的决策：

| 类别 | 定义 | 生命周期/特征 | 推荐容器 | 处理依据 |
|---|---|---|---|---|
| (A) UI 临时态 | 纯界面开关/hover/弹窗 | 丢了不影响数据正确性 | 继续 `useState` | 不需要事务一致性，不跨模块共享 |
| (B) 编辑器会话态 | selection/focus/IME/键盘命令 | 高频、需要原子更新，常常“成组变化” | `useReducer` + 少量 `useRef` | 典型状态机：一次键盘动作会更新 2+ state |
| (C) 领域数据（真相） | events/items/树结构 | 必须一致，可批处理/可回放 | 自建 store 或 service（EventService） | single source of truth，避免多源 |
| (D) 派生/缓存 | map/filter/view arrays | 可从 (C) 推导 | `useMemo`/selector（必要时缓存） | 不应作为独立 state |
| (E) 持久化/同步管线态 | pending patches、debounce、inflight、local-update guard | 与 DB/同步时序强相关 | 自建 pipeline（store/service），多用 `useRef` | 避免闭包陈旧与环回 |

决策口诀：
- **一次用户动作要同时改 2+ 个状态** → 放 reducer（B）
- **可以由别的状态推导** → 不要 state（D）
- **影响保存/同步/一致性** → 放服务层/自建 store（C/E）
- **丢了不影响正确性** → 留 `useState`（A）

---

# PlanManager：已识别 state 的分类建议（以当前代码为依据）

> 说明：下面是“应该怎么管”，不是强制一步到位。推荐按“收益最大、侵入最小”顺序迁移。

## A. 建议继续 useState（UI 临时态）
- `selectedItemId`：右侧 Modal/详情打开哪个事件
- `showTagReplace`、`replacingTagElement`：替换标签 UI
- `showUnifiedPicker`、`activePickerIndex`、`isSubPickerOpen`：picker 面板 UI
- `searchQuery`：输入框值（也可并入 reducer 的 filters，但没必要）

处理依据：纯 UI，不影响树/保存正确性。

## B. 建议并入 useReducer（会话态/模式态：经常成组变化）
- `currentFocusedLineId`
- `currentFocusedMode`
- `currentIsTask`
- `currentSelectedTags`（若与 focus/插入操作绑定，建议跟 focus 一起归 reducer）
- `dateRange`（影响展示/快照）
- `activeFilter`
- `hiddenTags`
- `snapshotVersion`（更适合 reducer 的 action 触发，而非独立 state）

处理依据：这些状态之间存在“模式耦合”（focus 变化常伴随 mode/isTask/tags 变化），需要原子更新与可预测状态机。

## C/E. 建议移出 React state：进入自建 store / service（领域真相 + 管线态）
- `items`：不应与 `editorItems` 同时作为真相
- `pendingEmptyItems`：草稿/未落库事件集合，属于领域数据
- 保存/同步相关的 ref/缓存（例如：pending changes、debounce timer、local update guard、snapshot cache 等）：应统一成 pipeline 对象（service 内或 store 内）

处理依据：这些决定了“数据正确性”和“保存时序”，放组件 state 容易形成多源真相与竞态。

## D. 建议保持派生（useMemo/selector），不要独立 useState
- `itemsMap`：派生 OK（未来可由 `eventsById` 直接提供）
- `filteredItems`：派生 OK
- `existingTags`：若由 TagService 提供订阅更佳
- `editorItems`：目前是 `useState + async effect`，建议最终改为 selector/派生；若必须 async，则用 reducer/store 的 async action 并带 requestId 防竞态

处理依据：派生值作为 state 容易造成“旧值覆盖新值”。

---

# PlanSlate：已识别状态的分类建议（以当前实现模式为依据）

## B. 强烈建议 useReducer：Mention/Search + KeyCommand + Cursor Intent + Flush Policy
- Mention/Search 会话态：
  - `open/close`、`kind(time/search)`、`query`、`initialStart/end`、`anchor`  
  处理依据：一个动作会同时改变多个字段；关闭时必须清理一组字段。
- Key command / Cursor restore：
  - Tab/Shift+Tab 之后的 selection/focus 恢复是“命令式副作用”，应通过 reducer 记录 **cursorIntent**，再由 effect 消费。
- Flush policy：
  - 结构变化（parent/indent）是高优先级保存；普通输入是 debounce 保存。  
  处理依据：将“何时 flush”从各 handler 里收敛出来，避免 setTimeout/竞态。

## A. 可继续 useState：小型 UI 开关
- 仅影响局部展示、且不影响保存/树的开关/hover 等。

## Ref：必须 useRef（不要进 reducer/store）
- DOMRect/anchor element refs
- timers
- Slate editor 实例/imperative API refs

处理依据：命令式句柄不适合 state；放 state 只会制造重渲染与闭包问题。

---

# 自建实现细节（可执行的落地步骤）

## Step 1：先做 PlanSlate 的 `useReducer`（最小侵入、立刻减少 setTimeout）
- 创建 `usePlanSlateSession()` hook：返回 `{state, dispatch}`  
- 将 mention/menu、cursorIntent、flushRequest 迁移到 reducer
- 用 `useLayoutEffect`/`requestAnimationFrame` 消费 cursorIntent（focus/select）
- Tab/Shift+Tab handler 不再手动 `setTimeout(flush)`，只 `dispatch({type:"FLUSH_REQUEST", priority:"high"})`

验收标准：
- Tab/Shift+Tab 后 selection 恢复路径一致（不靠散落 setTimeout）
- Mention 打开/关闭不再遗留临时状态

## Step 2：抽 `EventTreeEngine` 纯函数模块（集中树逻辑）
- `buildEventTree(events)`：输出 `sortedIds/bulletLevels/orphans/cycles`
- `computeReparentEffect(eventsById, {movedId,newParentId})`：输出子树 bulletLevel 更新建议
- 给这两个函数写单元测试（Tab/Shift+Tab 规格用例）

验收标准：
- 初始化、snapshot、增量更新都只依赖 TreeEngine 产物，不再多处 DFS

## Step 3：建立 PlanStore（或把领域态下沉到 EventService）
- 领域真相：`eventsById` + `view(sortedIds/bulletLevels)`
- 管线态：`pendingPatches/inflight/localUpdateGuards/debounce`
- React 侧只订阅 slice（或由 PlanManager 读取 view + dispatch patch）

验收标准：
- `items/editorItems/pendingEmptyItems` 不再互相“打架”，真相源唯一
- 保存节奏统一由 pipeline 控制

---

# 什么时候才需要 Redux（可选条件）

只有在完成上述分层后，依然存在：
- 多页面共享同一份领域数据且订阅关系复杂
- 需要 time-travel/审计来定位同步冲突
- 存在复杂异步队列（重试/冲突解决/离线同步）需要统一中间件

才建议引入 Redux。否则自建 store（或 EventService 内部状态 + subscribe）已经足够，并且更贴合编辑器场景。

---

# 总结（给 Copilot 的一句话结论）

“`useState` 多”不是问题本身。当前应该优先做：**单一真相源 + TreeEngine 纯逻辑 + 会话态 reducer + 保存管线下沉到服务/store**。Redux 在此阶段无法直接修复键盘层级与同步正确性，可能增加复杂度。
