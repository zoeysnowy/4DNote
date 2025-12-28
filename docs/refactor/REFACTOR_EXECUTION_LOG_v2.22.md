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

## Decisions / ADRs
### ADR-001: Use `parentEventId` as structure truth
- Decision: tree rebuild derives structure from `parentEventId`; `childEventIds` used only as ordering hint.
- Status: pending on this baseline (may cherry-pick from later).

### ADR-002: Remove PlanSlate double state
- Decision: avoid `value/useState` mirroring Slate internal state; avoid `editorKey` remount.
- Status: implemented (v2.22 baseline).

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
