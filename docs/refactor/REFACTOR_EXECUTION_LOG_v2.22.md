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

## Decisions / ADRs
### ADR-001: Use `parentEventId` as structure truth
- Decision: tree rebuild derives structure from `parentEventId`; `childEventIds` used only as ordering hint.
- Status: pending on this baseline (may cherry-pick from later).

### ADR-002: Remove PlanSlate double state
- Decision: avoid `value/useState` mirroring Slate internal state; avoid `editorKey` remount.
- Status: pending.

## Rollback Playbook
- Revert single commit: `git revert <sha>`.
- Reset a branch to known-good tag: `git reset --hard refactor-good-...`.
- Restore WIP stash: `git stash list` then `git stash pop`.
