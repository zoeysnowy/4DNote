
# 目标

修复 EventHistory 的两类核心问题：

1) **漏记（记录不到）**：用户确实做了变更，但没有落到 history。  
2) **塞爆（无实质更新也记录）**：内部同步/回流带来“等价更新”，产生大量 update 记录。

---

# 一、现状诊断（基于你当前 EventHistoryService 代码）

## (A) 漏记的主要原因

### A1. `saveLog()` 是 fire-and-forget，失败只打日志（调用方不可感知）
现状：
- `logCreate/logUpdate/logDelete` 都调用 `saveLog(log)`，而 `saveLog` 内部 `this.saveLogToStorage(log).catch(...)` 直接吞掉错误（只 log）。
- `getStorageManager()` 可能返回 null（初始化窗口期），此时只打印 “StorageManager 未初始化” 并 return，**历史直接丢失**。

影响：
- 启动早期、切换页面、或 storage 初始化慢时很容易漏记。
- 你说“经常记录不到”非常符合这个现象。

### A2. `logUpdate` 只在 `extractChanges(before, after)` 非空才记录
这本来是对的，但当前 `extractChanges` 有两个会导致“误判为无变更”的机制：
- `allKeys = new Set(Object.keys(after))`：如果调用方传入的 patch **没有包含真正变化的字段**（例如变化发生在更底层，但 patch 里没体现，或被上层 normalize 吞了），则不会检测到变化。
- 对 `description` 直接跳过（认为它是外部同步字段），对 `eventlog` 又采用 “Block-Level paragraph 数量” 这种非常粗的比较：**同内容替换/删除/重排可能不改变计数** → 变更被判为无变更 → 漏记。

### A3. `logCreate/logDelete` 是同步返回值，但真实持久化是异步
调用者以为“记录成功”，但落库失败或丢弃时没有机制补偿。

---

## (B) History 塞爆的主要原因（无实质更新也被记录/大量 update）

### B1. 去重策略是“1秒内重复同一事件”的缓存，但没有真正用于写入过滤
你有 `recentCallsCache` 及定期清理，但在展示的代码片段中：
- 没看到它在 `logUpdate`/`saveLog` 里参与“拒绝写入”决策（可能后面有，但目前看不出）
- 即便参与，它也只能挡住极短时间内重复调用，挡不住“同步回流隔几秒/几分钟回来”的等价更新。

### B2. 等价更新来自：同步字段/自动字段/外部系统回写
你已经在 `ignoredFields` 忽略了：
- `updatedAt`, `position`, `fourDNoteSource`, `_isVirtualTime`, sync 元字段等

但仍然会塞爆的典型原因是：
- “回写”带来的字段变化并不在 ignoredFields 中（例如外部系统把 HTML 排版改了、签名时间戳变化、空数组/undefined 互转、对象字段顺序不同、序列化差异等）。
- `eventlog` 使用“块数量”判断会漏记真实变更，但反过来 `before/after` 存的是完整对象/文本时，其他字段深度比较又可能把序列化差异当作变更，产生大量噪音。

### B3. `source` 语义不被强制使用
你目前 `source` 是 string，但没有明确规范：
- 哪些 source 视为“用户意图变更”（应记）
- 哪些 source 是“外部回流/内部修复”（默认不记或低优先级记）
导致调用点只要传错 source，就会把回流当成用户变更，历史暴涨。

---

## (C) 结构性问题：EventHistoryService 承担了“变更判定”和“写入可靠性”两件事，但两者都不够强

1) 变更判定（diff）分散在 `extractChanges`，且耦合特例（description/eventlog/title/tags）  
2) 写入可靠性没有队列/重试/ack，初始化窗口期直接丢弃

---

# 二、设计目标（Copilot 实施时对齐）

## 目标 1：History 写入“可保证”而不是“尽力而为”
- 允许异步，但必须 **至少一次（at-least-once）** 落库；必要时允许去重。
- 初始化窗口期不丢：要么排队，要么写到临时 buffer，等 StorageManager ready 后 flush。

## 目标 2：等价更新不入库（尤其是 sync 回流）
- 必须有统一、可复用的“实质变更判定”函数（semantic diff），而不是依赖 patch 是否包含字段、或依赖序列化细节。

## 目标 3：把“变更来源 source”变成强约束（不是随便写字符串）
- 建议改为枚举/联合类型，并定义策略表：哪些来源默认记录、哪些默认跳过、哪些只记录结构类变更。

---

# 三、实施方案（分 4 个阶段，按收益/风险排序）

## Phase 1（立即止血）：可靠写入 + 初始化窗口期不丢

### 1.1 引入内存队列（pendingLogs）与“ready gate”
新增：
- `static ready = false`
- `static pendingLogs: EventChangeLog[] = []`
- `static maxPendingLogs = 5000`（防止无限增长）

修改行为：
- `initialize(sm)` 成功后：`ready=true`，`flushPendingLogs()` 把队列写入 storage（批量/逐条）。
- `saveLog(log)`：
  - 如果 `!ready` 或 `getStorageManager()==null`：入队（并记录告警），不直接丢弃
  - ready 后正常写入

> 这一步能显著减少“记录不到”。

### 1.2 `saveLogToStorage` 支持批量（可选，但很建议）
在 StorageManager 增加：
- `createEventHistoryBatch(logs: EventChangeLog[])`
避免 flush 队列时逐条写造成性能问题。

### 1.3 写入失败重试（最小实现）
- 对每条 log 写入失败：重入队列，最多重试 N 次（记录 retryCount 到 metadata）。

---

## Phase 2（核心治理）：引入“语义变更判定”与“来源策略”

### 2.1 统一变更来源类型（强约束）
把 `source: string` 改成（示例）：

```ts
type HistorySource =
  | "user"
  | "ui-command"
  | "local-normalize"
  | "sync-inbound"        // 外部回流
  | "sync-outbound"
  | "backfill"
  | "repair"
  | "temp-id-mapping";
```

并引入策略表：

```ts
const HISTORY_POLICY: Record<HistorySource, {
  record: boolean;
  allowOperations?: ChangeOperation[];
  minImportance?: "any" | "structural" | "content";
}> = {
  user: { record: true, minImportance: "any" },
  "ui-command": { record: true, minImportance: "any" },
  "sync-inbound": { record: false },          // 默认不记，或仅 structural
  "sync-outbound": { record: false },
  "local-normalize": { record: false },
  repair: { record: false },
  backfill: { record: false },
  "temp-id-mapping": { record: true, minImportance: "structural" },
};
```

> 这一步能解决你提到的“内部同步到外部回来后塞爆 history”的大头：默认不记录回流。

### 2.2 引入 `semanticDiff(before, afterPatch, context)`：只比较“实质字段”
核心原则：
- 只对 **允许记录的字段集合** 做比较（allowlist），不要用 ignorelist 去猜（ignorelist 永远补不完）。
- eventlog/title/tags 等特殊字段在这里做统一语义比较（例如比较提取后的纯文本、或比较 canonical 结构 hash）。

建议 allowlist（示例，按你的业务）：
- `title`, `eventLog`, `tags`, `startTime/endTime/isAllDay`, `location`, `priority`, `isCompleted`, `dueDateTime`, `timeSpec`

其余字段（同步元数据、排序 position、内部标记）一律不参与历史。

### 2.3 eventlog 的比较方式升级（避免“计数法”）
当前：block paragraph 数量相同 → 当作无变化（会漏记）。  
建议：改成以下之一（按性能/准确度权衡）：

**选项 A（推荐，简单稳定）**：比较“提取纯文本（忽略元数据）”的 hash  
- 你已经有 `extractTextFromEventLog`，可用它输出文本，再计算稳定 hash（例如 murmur/xxhash 或简单字符串 hash）。
- 对回流导致的 HTML 排版变化，通常不会影响文本 → 不记。
- 对真正内容变化 → 记。

**选项 B（更精确）**：比较 Slate node 的“结构化摘要 hash”
- 将 Slate JSON 归一化：移除 createdAt/updatedAt/_isVirtualTime 等元字段，仅保留 `type + children.text + marks`，生成 canonical JSON，再 hash。
- 代价更高但更精确。

> 不建议继续用 “block-level paragraph count”。

---

## Phase 3（体系化）：History 记录从“散落调用”收敛到“写入提交点（commit hook）”

### 3.1 在 EventService 的 WriteContext / batch commit 处统一调用 history
要求（强约束）：
- **只有 commit 才能写 history**，不要在各种内部连带 update 中到处 `EventHistoryService.logUpdate`
- commit 能拿到：
  - 本次 batch 的 `source`
  - `before`（从 storage 或 ctx snapshot）
  - `after`（最终 canonical）
  - `affectedIds`
  - 是否为 reparent/结构变更

这样可以避免：
- 内部连带更新（父 childEventIds 修复）写出一堆无意义 history
- 同一用户动作被拆成多个 update，重复写 history

### 3.2 history 记录粒度：每个 event 一条还是 batch 一条？
建议仍保持“每个 event 一条”，但 messageKey/transactionId 相同，方便 UI 合并展示。

在 `EventChangeLog` 增加：
- `transactionId`（同一次 commit 共享）
- `origin`（tabId/deviceId）
- `source`（强类型）
- `importance`（any/structural/content）

---

## Phase 4（可选增强）：去重与压缩（防止极端场景爆量）

即使过滤了 sync 回流，用户频繁输入也可能产生大量 update。可做两种压缩：

### 4.1 “时间窗合并”同一事件的多条 update
规则（示例）：
- 同 eventId + source=user + 30 秒内的 update，合并成 1 条（保留 first.before + last.after + 合并 changes）
- 适合输入法/连续编辑。

### 4.2 “等价日志去重”（基于内容 hash）
为每条日志生成：
- `dedupeKey = hash(eventId + operation + semanticChangesHash + source + timeBucket)`
存储层可加唯一索引（或应用层查询最近 N 秒同 dedupeKey）。

---

# 四、具体改动清单（Copilot 可直接照做）

## 1) EventHistoryService：新增队列与 flush
- `static pendingLogs: EventChangeLog[]`
- `static ready: boolean`
- `static flushPendingLogs()`：initialize 后调用
- `saveLog()`：ready 前入队，ready 后写库；失败重试入队

## 2) source 改成强类型 + 策略表
- 替换 `source: string` 为 `HistorySource`
- `shouldRecord(source, operation, importance)` 统一判断
- 默认 `sync-inbound` 不记录（或仅记录 structural）

## 3) semanticDiff 改造 extractChanges
- 由 ignorelist → allowlist
- eventlog 使用文本/结构 hash
- title/tags 使用 canonical compare（你已有 `isTitleEqual/isTagsEqual` 可复用）
- description 默认不参与（保持你当前设计，但要确保回流不靠 description 触发噪音）

## 4) 在 EventService commit 点统一记录
- 新增：`EventService.commitBatch(...)` 内部最后一步调用 `EventHistoryService.logBatch(...)`
- 删除/弱化散落在 create/update 内部的 history 调用（尤其是“连带更新父事件”那种）

## 5) StorageManager：增加批量写入（推荐）
- `createEventHistoryBatch(logs)` 或 `createOrUpdateEventHistoryBatch(logs)`

---

# 五、风险点与验收标准

## 风险点
- source 迁移：需要把所有调用点改成强类型（一次性工作量不小，但最关键）
- semanticDiff：要注意性能；hash 计算应尽量线性、避免频繁 JSON.parse（可缓存 parsed slate）
- commit hook：需要 EventService 有明确的 batch/transaction 概念（推荐先做 WriteContext）

## 验收标准（必须满足）
1) 启动早期/StorageManager 初始化慢：历史不会丢（最多延迟写入）。  
2) “sync-inbound 回流”默认不产生 update history（除非确实发生实质性内容变更且策略允许）。  
3) 连续输入编辑：history 不会每个字符一条（至少能通过合并/去重显著降低）。  
4) eventlog 内容变更能稳定记录；纯元数据变化不记录。  
5) history 记录与一次用户动作对齐（同 transactionId），不会被内部连带更新污染。

---

# 六、给 Copilot 的短指令（可复制）

请将 EventHistory 改成“commit 记录 + 语义 diff + source 策略 + 队列可靠写入”：
- 初始化前写入进入 pendingLogs，initialize 后 flush；写入失败重试，禁止直接丢弃
- source 改为强类型，默认 `sync-inbound` 不记录
- 用 allowlist + eventlog 文本/结构 hash 做 semanticDiff，禁止用 blockCount 作为唯一判定
- 在 EventService 的 batch commit 点统一写 history，内部连带更新不得独立写 history
