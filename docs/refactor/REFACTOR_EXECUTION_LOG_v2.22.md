# Refactor Execution Log (v2.22)

**Branch**: `baseline-f69784a` (baseline)

## Goals (North Star)
- Single source of truth for domain data: EventHub/EventService.
- Editor correctness first: Plan hierarchy/order stable across refresh/page switch.
- Pipeline safety: persistence/sync state (E) lives in services, not React state.
- Reduce accidental complexity: remove duplicate state, polling timers, and non-deterministic rebuilds.

## Non-goals
- New features/UI polish.
- Broad refactors without tests or rollback plan.

## Working Agreement
- Small commits (1 logical change per commit).
- After each green step: `git push`.
- Every change must state:
  - **Why** (bug/risk addressed)
  - **Scope** (files/modules)
  - **Risk** (low/med/high)
  - **Validation** (tests + manual smoke)
  - **Rollback** (how to revert)

## Safety Rails
- Always keep a clean baseline branch: `baseline-f69784a`.
- Work on feature branches: `refactor/<topic>`.
- Tag “known-good” points: `git tag refactor-good-YYYYMMDD-HHMM`.

## Smoke Test Checklist (manual)
### Plan
- Create parent + child + grandchild via Tab/Shift+Tab.
- Refresh and confirm hierarchy/order unchanged.
- Select multiple lines and Backspace: refresh and confirm deletion persists.

### TimeLog
- Open TimeLog and confirm content renders.
- Create a note event and confirm it persists after refresh.

### TimeCalendar
- Open calendar; switch month/week/day.
- Drag-create event -> open modal -> save.

### Sync/Storage (sanity)
- No rapid growth in IndexedDB for simple edits.
- No console spam loops.

## Test Strategy
- **Unit (Vitest)**: pure logic (EventTreeEngine/TreeEngine rebuild rules, normalize helpers).
- **Integration (Vitest + jsdom)**: key transforms/serialization for Slate nodes.
- **E2E (Playwright, later)**: user flows: Plan indent/delete/refresh, TimeLog load/edit, calendar create/edit.

## Change Log
| Date | Change | Why | Risk | Validation | Commit | Notes |
|---|---|---|---|---|---|---|
| 2025-12-26 | Created baseline branch | Establish stable starting point | Low | `git status` clean | f69784a | |
| 2025-12-27 | TimeLog LogSlate: Enter soft-break + blur cleanup + timestamp virtual node behavior | Fix caret lag/extra blank nodes; align “enter stays in-node” + “virtual node gets timestamp” | Med | Manual: TimeLog enter/newline, blur removes empties, caret not offset | 091d0dd | Key files: `src/components/LogSlate/LogSlate.tsx`, `src/utils/slateSerializer.ts`, `src/services/EventService.ts` |
| 2025-12-27 | TimeLog: remove placeholder/timestamp overlap | Disable Slate placeholder in TimeLog edit mode; keep timestamp-only paragraphs during blur cleanup | Low | Manual: edit mode no overlap, blur still cleans empties | 06c1bd5 | File: `src/components/LogSlate/LogSlate.tsx` |
| 2025-12-27 | ModalSlate: Enter soft-break (EventEditModal) | Keep Enter as in-paragraph newline; Ctrl/Meta+Enter creates new paragraph; unify via SlateCore | Med | Manual: EditModal Enter no new node; Ctrl+Enter new block | 63a5a95 | Files: `src/components/ModalSlate/ModalSlate.tsx`, `src/components/SlateCore/operations/paragraphOperations.ts` |
| 2025-12-27 | ModalSlate: fix Node.string runtime error | Use SlateNode.string (avoid DOM Node collision) | Low | Manual: no console error on typing | 0933c74 | File: `src/components/ModalSlate/ModalSlate.tsx` |
| 2025-12-28 | TimeLog: Slate mounting window ±2 days | Reduce Slate instance count by only mounting for active sticky date ±2 days + active editor; out-of-window uses HTML renderer | Low | Manual: scroll TimeLog confirms smooth editing in window, no lag from unmounted Slates | 8173d20 | File: `src/pages/TimeLog.tsx` |
| 2025-12-28 | PlanSlate: remove double state + no remount | Make Slate editor.children the single source of truth; remove React value mirror and `editorKey` forced remount; external sync uses Transforms replace | Med | Manual: Plan indent/delete + refresh/page switch stable | 7656b5b | File: `src/components/PlanSlate/PlanSlate.tsx` |
| 2025-12-28 | Plan: persist refresh order via `position` | Fix refresh reorder by (1) recomputing per-parent sibling `position` from current editor order before saving and (2) treating `position`/EventTree fields as change triggers | Med | Manual: reorder/indent then refresh => order matches input | ea4c8fd | Files: `src/components/PlanManager.tsx`, `src/utils/planManagerHelpers.ts` |
| 2025-12-28 | EventTree: ADR-001 parent truth via `parentEventId` | Prevent tree structure drift by deriving hierarchy from `parentEventId` and using `childEventIds` only as ordering hint (position-first) | Low | `npx vitest run src/services/EventTree/TreeEngine.test.ts` | aa74135 | Files: `src/services/EventTree/TreeEngine.ts`, `src/services/EventTree/TreeEngine.test.ts` |
| 2025-12-28 | EventTree: ADR-001 reparent subtree fix | Ensure `computeReparentEffect` collects affected subtree via `parentEventId` (not stale `childEventIds`) | Low | `vitest run src/services/EventTree/TreeEngine.test.ts` | 3a34601 | Files: `src/services/EventTree/TreeEngine.ts`, `src/services/EventTree/TreeEngine.test.ts` |
| 2025-12-28 | EventTree: migrate consumers to ADR-001 | Align EventService tree helpers + EventTree UI components to build edges/subtrees from `parentEventId` (avoid stale `childEventIds` + reduce N+1) | Med | `vitest run src/services/EventTree/TreeEngine.test.ts` (sanity) | c309982 | Files: `src/services/EventService.ts`, `src/components/EventTree/*` |
| 2025-12-28 | Plan Snapshot: DFS sorting via EventTreeAPI | Snapshot mode sorting must follow ADR-001 (structure from `parentEventId`), avoid traversing `childEventIds` directly | Low | Manual smoke: Snapshot dateRange renders, order stable | (local) | File: `src/components/PlanManager.tsx` |
| 2025-12-28 | EventRelationSummary: ADR-001 + remove N+1 | Derive siblings/children via EventTreeAPI (parent truth) and load all events once (avoid N+1 `getEventById`) | Low | Typecheck: no TS errors in file | (local) | File: `src/components/EventTree/EventRelationSummary.tsx` |
| 2025-12-28 | EventTree UI: stop using childEventIds | CustomEventNode progress uses direct children derived from EventTreeAPI (ADR-001) instead of `event.childEventIds` | Low | Typecheck: no TS errors in files | (local) | Files: `src/components/EventTree/EventTreeCanvas.tsx`, `src/components/EventTree/CustomEventNode.tsx` |
| 2025-12-28 | LogTab/EventEditModal: reduce childEventIds reads | Prefer ADR-001-derived `childEvents` for display/logging; avoid `.childEventIds.length` as truth | Low | Manual smoke: Notetree label shows child count | (local) | Files: `src/pages/LogTab.tsx`, `src/components/EventEditModal/EventEditModalV2.tsx` |
| 2025-12-28 | App Timer: ADR-001 hardening | Detect standalone-timer re-run via `getChildEvents()` (parent truth); keep `childEventIds` writes explicitly as legacy hint only (no correctness dependency) | Low | Typecheck: no TS errors in file | (local) | File: `src/App.tsx` |

## Decisions / ADRs
### ADR-001: Use `parentEventId` as structure truth
- Decision: tree rebuild derives structure from `parentEventId`; `childEventIds` used only as ordering hint.
- Status: implemented on this baseline (`aa74135`, follow-up `3a34601`).

### ADR-002: Remove PlanSlate double state
- Decision: avoid `value/useState` mirroring Slate internal state; avoid `editorKey` remount.
- Status: implemented (v2.22 baseline).

### ADR-003 (Proposed): Persistent PlanIndex / PlanStore (long-term, for large event volumes)
- Context: Plan/TimeLog/Snapshot flows frequently need “by date” views. Current approach often starts from `getAllEvents()` then filters + rebuilds bulletLevel/tree order in-memory; cold start cost grows with event count.
- Related PRD: `docs/PRD/SNAPSHOT_STATUS_VISUALIZATION_PRD.md` (Snapshot mode depends on a `dateRange` and uses EventHistory queries to compute “existing at start + created in range + ghost deletions”).

#### Definition: "by date plan" (aligned to Snapshot PRD intent)
- For day D, the Plan page is effectively comparing:
  - **Start snapshot**: state at end-of-day (or start-of-day) of D-1
  - **End snapshot**: state at end-of-day of D
- Snapshot UI needs both: the "end state list" and the “diff/status lines” from EventHistory between the two timestamps.

#### Proposed storage: PlanIndex table (SQLite / IndexedDB)
- Key: `dateKey` (e.g. `YYYY-MM-DD`) or a `snapshotId` (timestamp boundary)
- Value (minimal): ordered `eventId[]` + per-event `parentEventId` + per-event `position` (optional) + `updatedAt`/`version`
- Optional extras: precomputed `bulletLevel`, `rootIds`, and a compact children map (derived from parent ids) for fast render.

#### Update strategy (incremental)
- Source of change: EventHistory append-only stream.
- On new history ops, update only impacted dates and impacted subtree ranges (using `parentEventId` mapping).
- Keep an internal `lastIndexedHistoryId`/`lastIndexedTime` checkpoint.

#### Conflict resolution (must be explicit)
- Rule (recommended): **Event fields are truth; PlanIndex is a cache**.
  - On read: validate PlanIndex entries against current Event states (`updatedAt`/history watermark). If mismatch, rebuild that date index.
  - On write: Plan editing persists to Events (and EventHistory). PlanIndex consumes the history stream to converge.
- Rationale: avoids “two sources of truth”; PlanIndex becomes an accelerant, not a second domain model.

#### Migration / consistency notes
- Backfill: build PlanIndex for recent N days first; lazy-build older dates on demand.
- Repair: a `rebuildPlanIndex(dateKey)` admin/dev command for recovery.
- ADR-001 interaction: PlanIndex stores structure snapshot derived from `parentEventId` (never from `childEventIds`).

### ADR-004 (Proposed): EventGraphAPI for bidirectional links (separate from EventTree)
- Context: Tree relations (parent/child) and graph relations (linked/backlinks) have different invariants.
- Decision: keep tree logic in `EventTreeAPI`; add a dedicated graph layer to own link invariants.

#### Minimal interface (MVP)
- `addLink(aId, bId, { bidirectional: true })` → updates `linkedEventIds`/`backlinks` consistently
- `removeLink(aId, bId, { bidirectional: true })`
- `rebuildBacklinks(allEvents)` → one-time repair tool (derive backlinks from linkedEventIds)
- `getLinkedEvents(eventId, allEvents)` → returns neighbors (compatible with existing `EventService.getLinkedEvents` behavior)

#### Rules
- No mixing with tree structure: graph edges do not imply parent/child.
- Deduplicate + self-link guard.
- Backlinks are derived/maintained, not edited directly (optional strict mode).

## Audit: Remaining structural reads of `childEventIds` (needs migration to ADR-001)
Goal: eliminate code paths that *derive structure* (DFS/BFS/subtree/children) from `childEventIds`.

### High priority (correctness)
- `src/components/PlanManager.tsx` (Snapshot mode sorting): must not traverse `childEventIds` for DFS; should use `EventTreeAPI.toDFSList()` on the snapshot event set.

### Medium priority (correctness + perf)
- (done) `src/components/EventTree/EventRelationSummary.tsx`: migrated to `EventTreeAPI.buildTree()` + one-shot `getAllEvents()`.

### Low priority (UI-only / diagnostics)
- `src/components/EventEditModal/EventEditModalV2.tsx`, `src/pages/LogTab.tsx`: still carries legacy `childEventIds` fields in formData for compatibility, but avoid using it as structure truth in UI/logic.
- (done) `src/components/EventTree/CustomEventNode.tsx`: UI progress no longer uses `childEventIds`.

## Rollback Playbook
- Revert single commit: `git revert <sha>`.
- Reset a branch to known-good tag: `git reset --hard refactor-good-...`.
- Restore WIP stash: `git stash list` then `git stash pop`.

## TimeLog Optimization Targets (v2.22)
Source: `docs/audits/TimeLog 页面性能诊断与优化规范（保留默认展开阅读、跳转、timegap、压缩日期展开）.md`

### Constraints (must keep)
- Default expanded readable timeline (no per-item expand required).
- Read mode supports tag/mention/link jumps.
- Only one editor active at a time is acceptable; switching editor is seamless.
- TimeGap insertion UX stays.
- Compressed date ranges stay; user can expand a day and insert via TimeGap.

### Phase 1 (Stop-the-bleed performance)
- Read-only renderer for title/eventlog (no Slate editor mounted for reading).
- `activeEditorEventId` so only one `LogSlate` is mounted for editing.
- Click delegation for jump targets using `data-kind`/`data-value` (avoid per-token closures).

### Phase 2 (Structural: avoid "scroll gets slower")
- Incremental index (`eventsById`, `idsByDate`, `datesWithEvents`) to avoid full merge/sort/group on every load.
- Sparse timeline segments (`month-header` + `day` + `gap`) to keep DOM small while preserving compressed-day UX.
- Avoid per-render day-by-day scanning inside month/gap rendering.

### Phase 3 (Polish)
- Read-only render cache (LRU) keyed by `eventId + updatedAt` (upgrade to semantic hash later).
- Idle/frames scheduling for non-critical render work.
- Reduce React state churn (large Maps/Sets in refs; small selectors in state).
- Audit/replace `setTimeout`/polling with `requestAnimationFrame`/`queueMicrotask` where appropriate.
