
# 空白事件清理与 Placeholder 生命周期：规范与实施方案

## 0. 目标与约束

### 目标
1) **用户体验**：编辑器永远可用空行（placeholder），不会因“删到空”而跳焦点/乱 selection。  
2) **数据健康**：canonical 数据中不长期存在“所有字段都空白”的事件。  
3) **历史正确**：  
- 从未有过实质内容的空白事件被清理：**不写 EventHistory**  
- 曾经有过实质内容的事件变空并被清理：**写 delete history**，并在 snapshot/附件模式中展示其**最富有状态（best snapshot）**  
4) **架构一致**：页面负责 placeholder 会话态；EventService 负责空白判定/清理/删除/广播/同步；EventHistory 在 commit/delete 统一写入。

### 核心约束（Copilot 必须遵守）
- UI 的 placeholder **不等价**于数据库事件（Event）。  
- “删到空”不等价于立刻 delete；清理发生在**提交点**（blur/flush/离开等）或延迟（debounce）且可取消。  
- 所有删除必须走 `EventService.deleteEvent(...)`（包含 reason/source），禁止页面直写 storage。  
- EventHistory 写入应由 **commit hook / delete** 驱动，不应在内部连带更新中散落调用。

---

## 1. 定义：什么是“空白事件”（Blank Canonical Event）

### 1.1 参与判定的“用户意义字段”（Allowlist）
只看对用户有意义的字段（不要靠 ignorelist 猜）：

- `title`
- `eventLog`（语义文本，非原始 HTML）
- `tags`
- `timeSpec` / `startTime/endTime/isAllDay`（若适用）
- `location`
- `isTask/isCompleted/priority/dueDateTime`（若适用）

### 1.2 空白判定函数（必须全局一致）
```ts
function isBlankCanonical(e: Event): boolean {
  return (
    isEmptyText(e.title) &&
    isEmptyEventLog(e.eventLog) &&   // 用语义文本或 canonical 结构判断
    (e.tags?.length ?? 0) === 0 &&
    isEmptyTime(e.timeSpec, e.startTime, e.endTime, e.isAllDay) &&
    isEmptyText(e.location) &&
    isDefaultTaskFields(e)
  );
}
```

#### eventLog “空”的判定（推荐）
- 使用 `extractTextFromEventLog(e.eventLog)` 得到纯文本 `t`
- `isEmptyEventLog`：`t.trim().length === 0`  
（不要用 “block 数量/paragraph count”）

---

## 2. 关键概念：PlaceholderRow 与 Event 的解耦

### 2.1 PlaceholderRow（UI-only）
- 仅存在于页面会话（PlanSlate/Tag/TimeLog 的 reducer/store）
- 不写入 storage，不进入同步，不进 history
- 作用：承载光标/空行、输入法 composition、用户“准备输入”的交互

推荐结构：
```ts
type Row =
  | { kind: "event"; eventId: string }
  | { kind: "placeholder"; clientRowId: string; scopeKey: string };
```

### 2.2 Draft（可选，若你必须落库）
如果某些页面必须提前创建实体（例如需要立刻拿到 id 做引用），允许创建 Draft Event：

- `lifecycle: "draft"`
- draft 默认不进入搜索/统计/同步/历史（或策略性跳过）
- draft 只有在首次获得“实质内容”后才升级为 active

> 推荐优先方案：**不落库 placeholder**；只有用户第一次输入/设置字段时才 `createEvent`。

---

## 3. 清理时机：提交点（Commit Points）与延迟清理

### 3.1 PlanSlate 提交点列表（必须实现）
PlanSlate 中触发“清理空白事件检查”的时机（至少满足）：

1) `onBlur`：离开编辑器/行  
2) `onFlush`：保存管线 flush（debounce 到期或强制 flush）  
3) `onEnterNewLine`：用户按 Enter 生成新行（旧行可被清理）  
4) `onNavigate`：上下移动焦点到另一行（旧行可被清理）  
5) `onUnmount / routeChange`：离开页面前

原则：
- “删到空”的瞬间不清理；清理由提交点统一执行。
- 提交点清理必须可取消：用户若又输入了内容，本轮清理跳过该事件。

### 3.2 其他页面（Tag/TimeLog）
同样采用提交点清理：例如输入框 blur、添加完成、离开页面、flush。

---

## 4. 删除与清理：领域层（EventService）统一负责

### 4.1 删除入口（唯一）
```ts
type DeleteReason = "blank-cleanup" | "user-delete" | "cascade" | "repair";

type HistorySource =
  | "user"
  | "ui-command"
  | "local-normalize"
  | "sync-inbound"
  | "sync-outbound"
  | "backfill"
  | "repair"
  | "temp-id-mapping"
  | "blank-cleanup";

interface DeleteOptions {
  reason: DeleteReason;
  source: HistorySource;
  transactionId?: string;
  cascade?: boolean;
}
```

```ts
async function deleteEvent(eventId: string, opts: DeleteOptions): Promise<void>
```

**禁止**页面层直接操作 storage 或直接写 history。

### 4.2 清理入口（按 scope 批量）
```ts
type CleanupScope =
  | { kind: "plan"; planId: string }
  | { kind: "tag"; tagId: string }
  | { kind: "timeRange"; start: string; end: string }
  | { kind: "eventIds"; ids: string[] };

interface CleanupOptions {
  reason: "blank-cleanup";
  source: "blank-cleanup" | "ui-command";
  debounceMs?: number;         // 可选，service 内可不实现，由页面控制
  maxDeletesPerRun?: number;   // 防止卡顿
  transactionId?: string;
}

async function cleanupBlankEvents(scope: CleanupScope, opts: CleanupOptions): Promise<{ deletedIds: string[] }>
```

---

## 5. History 规则：从未有内容 vs 曾有内容

### 5.1 事件元数据（建议新增/保证存在）
```ts
interface EventMeta {
  createdAt: string;
  updatedAt: string;

  // 是否曾经非空（由 service 在 commit 时维护）
  lastNonBlankAt?: string; // undefined 表示从未非空

  // best snapshot（两种实现选其一）
  bestSnapshot?: EventSnapshot;        // 直接内联
  bestSnapshotScore?: number;
}
```

维护规则（在 commit hook）：
- 若 `!isBlankCanonical(after)`：
  - `meta.lastNonBlankAt = now`
  - 若 `contentScore(after) > bestScore`：更新 bestSnapshot/bestScore

### 5.2 删除时的 history 决策（关键）
```ts
function shouldWriteHistoryOnDelete(before: Event, opts: DeleteOptions): boolean {
  if (opts.source === "sync-inbound") return false; // 默认不记回流（可配置）
  if (opts.reason === "repair") return false;

  // blank-cleanup 特例：
  if (opts.reason === "blank-cleanup") {
    return Boolean(before.meta?.lastNonBlankAt); // 曾经非空才记
  }

  // user-delete 永远记
  if (opts.reason === "user-delete") return true;

  return true;
}
```

效果：
- **从未有内容的空白事件**被清理：不写 history  
- **曾有内容的事件**变空后被清理：写 delete history（含 best snapshot）

---

## 6. Snapshot（附件）模式：记录“最富有状态”的策略

### 6.1 contentScore（语义计分，必须稳定）
```ts
function contentScore(e: Event): number {
  let s = 0;
  const title = (e.title ?? "").trim();
  if (title) s += 10;

  const text = extractTextFromEventLog(e.eventLog).trim();
  if (text.length > 0) s += 5;
  if (text.length > 50) s += 5;
  if (text.length > 200) s += 10;

  const tags = e.tags?.length ?? 0;
  s += Math.min(tags, 10) * 2;

  if (hasTime(e)) s += 4;
  if ((e.location ?? "").trim()) s += 2;
  if (e.isTask) s += 1;
  if (e.isCompleted) s += 1;

  return s;
}
```

### 6.2 best snapshot 维护（推荐两阶段实现）
**阶段 1（最小侵入，先能用）**：仅在 delete 时计算并写入 history  
- `best = chooseBest(before, before.meta.bestSnapshot)`  
- history delete log 带 `bestSnapshot`

**阶段 2（更完善）**：每次 commit 更新 `bestSnapshot`
- commit hook 对比 score，必要时更新 event.meta.bestSnapshot

### 6.3 delete history 的数据结构建议
```ts
interface EventSnapshot {
  eventId: string;
  capturedAt: string;
  title?: string;
  tags?: string[];
  eventLog?: EventLog;
  timeSpec?: any;
  location?: string;
  // 可选：只存可展示字段，避免过大
  score: number;
}

interface EventChangeLog {
  id: string;
  timestamp: string;
  operation: "create" | "update" | "delete";
  eventId: string;
  source: HistorySource;
  reason?: DeleteReason;
  transactionId?: string;

  changes?: Record<string, { before: any; after: any }>;

  // delete 特有
  deleteSnapshot?: EventSnapshot;      // 用 bestSnapshot
}
```

---

## 7. PlanSlate 的推荐交互流程（伪代码）

### 7.1 首次输入：placeholder → createEvent
```ts
onUserInput(row):
  if row.kind === "placeholder":
    const eventId = await EventService.createEvent({ /* fields from input */ }, { source:"user" })
    replaceRow(row, { kind:"event", eventId })
  else:
    EventService.updateEvent(row.eventId, patchFromInput, { source:"user" })
```

### 7.2 删到空：event 行先变“空行”，提交点再清理
```ts
onDeleteContentToEmpty(row):
  // UI 允许变空，但不要立刻 delete
  markRowMaybeBlank(row.eventId) // session flag
  // selection 保持在该行

onCommitPoint():
  const ids = session.maybeBlankIds
  const actuallyBlank = ids.filter(id => EventService.peekIsBlank(id) ?? true) // 或读最新快照再判断
  await EventService.cleanupBlankEvents({ kind:"eventIds", ids: actuallyBlank }, { reason:"blank-cleanup", source:"blank-cleanup" })
  // 对于被删除的 event 行，UI 将其替换为 placeholder row，并做 cursorIntent 到合适位置
```

### 7.3 始终保证末尾有 placeholder
```ts
ensureTrailingPlaceholder(scopeKey):
  if lastRow.kind !== "placeholder":
    appendPlaceholder(scopeKey)
```

---

## 8. 与同步/回流的关系（防止“删空 → 同步回来 → 又产生噪音”）

- `source: "sync-inbound"` 的 update/delete 默认 **不写 history**（除非你未来配置审计）。  
- `blank-cleanup` 属于本地维护行为，建议：
  - 同步层面仍然同步删除（否则跨设备空白不会消失）
  - 但 history 层面按规则：从未非空不记，曾非空记 delete（snapshot best）

---

## 9. 实施顺序（Copilot 按此落地）

### Step 1：补齐 `isBlankCanonical` 与 `contentScore`
- 放在 EventService 或独立 `EventContentSemantics` 模块（纯函数）
- eventLog 使用 `extractTextFromEventLog`（语义文本）

### Step 2：新增/维护 `meta.lastNonBlankAt`（commit hook）
- 在 EventService 的 batch commit 末尾：如果 after 非空则更新

### Step 3：实现 `deleteEvent` 的 history 规则（shouldWriteHistoryOnDelete）
- blank-cleanup + neverNonBlank ⇒ 不写 history
- everNonBlank ⇒ 写 delete history（带 snapshot）

### Step 4：PlanSlate 改为 UI-only placeholder
- 停止“空白行也创建 event”
- 首次输入才 createEvent
- 提交点调用 cleanup（而不是实时删）

### Step 5：实现 `cleanupBlankEvents(scope)`
- 初期只支持 `eventIds` 范围即可（最小侵入）
- 后续扩展 plan/tag/timeRange 扫描

### Step 6（可选）：持续维护 bestSnapshot
- commit hook 内更新 meta.bestSnapshot/bestScore

---

## 10. Copilot 的短指令（可直接粘贴）

请实现“UI placeholder 与 Event 解耦”的空白事件清理方案：
- 页面层（PlanSlate/Tag/TimeLog）使用 UI-only placeholder 行；首次输入才 createEvent
- EventService 提供 `isBlankCanonical`、`contentScore`、`deleteEvent({reason,source})`、`cleanupBlankEvents(scope)`
- 删除 blank 时区分：从未非空（meta.lastNonBlankAt 不存在）⇒ 不写 history；曾非空 ⇒ 写 delete history，并附带 bestSnapshot（按 contentScore 选择）
- 清理在提交点执行（blur/flush/enter/navigate/unmount），不要在“变空瞬间”立即删，以免焦点/selection 乱跳
