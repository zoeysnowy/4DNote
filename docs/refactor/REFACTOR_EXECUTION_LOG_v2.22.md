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
- No shims/compat layers: refactors must update imports to TypeScript path aliases (`@frontend/*`, `@backend/*`, `@shared/*`) in the same commit.
- Every change must state:
  - **Why** (bug/risk addressed)
  - **Scope** (files/modules)
  - **Risk** (low/med/high)
  - **Validation** (tests + manual smoke)
  - **Rollback** (how to revert)

### Policy: No "compat patches" pre-release
- This app is not considered “released”; we do **not** accumulate long-lived compatibility shims.
- If a path is clearly legacy (e.g. localStorage→DB migrations, dual-write, fallback shims), prefer **deletion** over “one more patch”.
- localStorage is allowed only for **UI settings** and **cross-window bridge keys** (Widget). Domain truth lives in services/storage.

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
| 2025-12-28 | EventTree: ADR-001 parent truth via `parentEventId` | Prevent tree structure drift by deriving hierarchy from `parentEventId` and sorting siblings by `position` (fallback: `createdAt`/`id`); do not rely on legacy `childEventIds` | Low | `npx vitest run src/services/EventTree/TreeEngine.test.ts` | aa74135 | Files: `src/services/EventTree/TreeEngine.ts`, `src/services/EventTree/TreeEngine.test.ts` |
| 2025-12-28 | EventTree: ADR-001 reparent subtree fix | Ensure `computeReparentEffect` collects affected subtree via `parentEventId` (not stale `childEventIds`) | Low | `vitest run src/services/EventTree/TreeEngine.test.ts` | 3a34601 | Files: `src/services/EventTree/TreeEngine.ts`, `src/services/EventTree/TreeEngine.test.ts` |
| 2025-12-28 | EventTree: migrate consumers to ADR-001 | Align EventService tree helpers + EventTree UI components to build edges/subtrees from `parentEventId` (avoid stale `childEventIds` + reduce N+1) | Med | `vitest run src/services/EventTree/TreeEngine.test.ts` (sanity) | c309982 | Files: `src/services/EventService.ts`, `src/components/EventTree/*` |
| 2025-12-28 | Plan Snapshot: DFS sorting via EventTreeAPI | Snapshot mode sorting must follow ADR-001 (structure from `parentEventId`), avoid traversing `childEventIds` directly | Low | Manual smoke: Snapshot dateRange renders, order stable | (local) | File: `src/components/PlanManager.tsx` |
| 2025-12-28 | EventRelationSummary: ADR-001 + remove N+1 | Derive siblings/children via EventTreeAPI (parent truth) and load all events once (avoid N+1 `getEventById`) | Low | Typecheck: no TS errors in file | (local) | File: `src/components/EventTree/EventRelationSummary.tsx` |
| 2025-12-28 | EventTree UI: stop using childEventIds | CustomEventNode progress uses direct children derived from EventTreeAPI (ADR-001) instead of `event.childEventIds` | Low | Typecheck: no TS errors in files | (local) | Files: `src/components/EventTree/EventTreeCanvas.tsx`, `src/components/EventTree/CustomEventNode.tsx` |
| 2025-12-28 | LogTab/EventEditModal: reduce childEventIds reads | Prefer ADR-001-derived `childEvents` for display/logging; avoid `.childEventIds.length` as truth | Low | Manual smoke: Notetree label shows child count | (local) | Files: `src/pages/LogTab.tsx`, `src/components/EventEditModal/EventEditModalV2.tsx` |
| 2025-12-28 | App Timer: ADR-001 hardening | Detect standalone-timer re-run via `getChildEvents()` (parent truth); keep `childEventIds` writes explicitly as legacy hint only (no correctness dependency) | Low | Typecheck: no TS errors in file | (local) | File: `src/App.tsx` |
| 2025-12-31 | Epic 2: introduce `useEventHubSnapshot/useEventHubQuery` | Provide a single UI-facing subscription view hook (wraps `eventsUpdated` refresh) to reduce component-owned “second truth” caches | Low | Typecheck: no TS errors in new hooks | (local) | Files: `src/hooks/useEventHubSnapshot.ts`, `src/hooks/useEventHubQuery.ts` |
| 2025-12-31 | Epic 2: migrate UpcomingEventsPanel to subscription view | Remove local all-events cache + manual `eventsUpdated` listener; rely on snapshot hook and service updates | Med | Manual smoke: panel renders, filter works, checkbox toggles persist | (local) | File: `src/components/UpcomingEventsPanel.tsx` |
| 2025-12-31 | Epic 2: migrate DailyStatsCard to subscription view | Remove local events cache + manual `eventsUpdated` listener; derive daily stats from snapshot events | Low | Manual smoke: open card, change date, stats update on event changes | (local) | File: `src/components/DailyStatsCard.tsx` |
| 2025-12-31 | Epic 2: migrate ContentSelectionPanel note loader | Replace on-demand `getAllEvents()` with `useEventHubSnapshot` for important notes + derived child counts | Low | Manual smoke: expand Event section, notes list loads/refreshes on updates | (local) | File: `src/components/ContentSelectionPanel.tsx` |
| 2025-12-31 | Epic 2: migrate MentionMenu (@ mention) | Replace per-keystroke `getAllEvents()` with subscription snapshot filtering; keep hashtag path on TagService | Low | Manual smoke: type @ and search; list updates without async fetch | (local) | File: `src/components/LogSlate/MentionMenu.tsx` |
| 2025-12-31 | Docs/Comments: EventEditModalV2 data source wording | Remove outdated claim that `props.event` comes from `getAllEvents()`; align with “subscription view / on-demand read” | Low | N/A (comment only) | (local) | File: `src/components/EventEditModal/EventEditModalV2.tsx` |
| 2025-12-31 | Epic 2 (UI reads): migrate remaining low-risk getAllEvents() call sites | Record the latest low-risk architecture unification changes (migrating remaining getAllEvents read paths) into the refactor execution log | Low | Manual smoke: confirm all relevant components use the new snapshot approach | (local) | |
| 2025-12-31 | `src/components/RAGDemo.tsx` | Replaced the duplicate-title check's direct `EventService.getAllEvents()` read with `useEventHubSnapshot({ enabled: true })`. | Low | Manual smoke: confirm duplicate detection works correctly | (local) | |
| 2025-12-31 | `src/components/EventTree/EventRelationSummary.tsx` | Replaced one-off `EventService.getAllEvents()` loading + `allEvents` state with `useEventHubSnapshot({ enabled: true })`. | Low | Manual smoke: confirm parent/child info is derived correctly | (local) | |
| 2025-12-31 | Test infra: Vitest excludes | Ensure `npm test -- --run` does not execute vendored/dependency test suites (nested `node_modules`, tui.calendar) | Low | `npm test -- --run` (now runs only repo tests) | (local) | File: `vite.config.ts` |
| 2026-01-01 | Optional time fields hardening + missed derivation | Remove remaining “time required” assumptions in key views; implement derived missed (no persistence) based on planned `endTime` for tasks | Med | `npm test -- --run` | (local) | Files: `src/pages/TimeLog.tsx`, `src/pages/LogTab.tsx`, `src/components/PlanManager.tsx`, `src/services/EventHistoryService.ts` |
| 2026-01-01 | Optional-time hardening (EditModal + Sync + Storage) | Remove remaining non-null assertions / unsafe `Date` parsing around optional `startTime/endTime`; keep any midnight normalization confined to outbound sync payload (no persistence) | Med | `npm test -- --run` | (local) | Files: `src/components/EventEditModal/EventEditModalV2.tsx`, `src/services/ActionBasedSyncManager.ts`, `src/services/storage/IndexedDBService.ts`, `src/utils/relativeDateFormatter.ts` |
| 2026-01-01 | Docs: align + dedupe EventHub/TimeHub architecture | Prevent doc drift and conflicting implementation plans; keep architecture docs aligned to current “eventsUpdated + hooks” practice and keep topic boundaries tight | Low | `npm test -- --run` | (local) | Files: `docs/architecture/EVENTHUB_TIMEHUB_ARCHITECTURE.md`, `docs/architecture/EVENTSERVICE_REFACTOR_OPTIMIZATION_v2.18.8.md`, `docs/refactor/REFRACTOR_DOCS_INDEX_v2.22.md` |
| 2026-01-01 | Epic 2: introduce `useEventHubEvent` | Complete the unified UI-facing hook set; enable low-risk migrations away from ad-hoc per-component event lookups | Low | `npm test -- --run` | (local) | File: `src/hooks/useEventHubEvent.ts` |
| 2026-01-02 | TimeLog Note: respect TimeGap time + normalize optional time fields | Notes created from TimeGap should persist the user-selected anchor time (set `startTime`), and “no-time” notes should use `undefined` (not `''`) to match the Event optional-time contract | Low | `npm run typecheck` | (local) | File: `src/pages/TimeLog.tsx` |
| 2026-01-02 | Sync/Auth: remove service/UI localStorage token writes; move MS tokens to metadata | Fix Electron login flow where UI/service both wrote tokens to localStorage; ensure token persistence is service-owned (IndexedDB metadata) and `auth-state-changed(false)` fires on auth failure | Med | `npm run typecheck` | (local) | Files: `src/services/MicrosoftCalendarService.ts`, `src/features/Calendar/components/CalendarSync.tsx` |
| 2026-01-02 | UI Auth: centralize auth truth in AuthStore; localStorage only as Widget bridge | Fix drift where StatusBar/Widget inferred auth from localStorage/window probes; make App the single auth-event ingress, AuthStore the UI truth, and keep `4dnote-outlook-authenticated` only for cross-window widget bridge | Low | `npm run typecheck` | (local) | Files: `src/state/authStore.ts`, `src/App.tsx`, `src/components/AppLayout.tsx` |
| 2026-01-02 | UI SyncStatus: centralize sync status in SyncStatusStore; App owns bridge writes | Fix duplicated sync status state (StatusBar reading/writing localStorage + listening events) causing inconsistent UI after HMR; make App the single listener for `action-sync-started/completed` and keep localStorage only for Widget bridge | Low | `npm run typecheck` | (local) | Files: `src/state/syncStatusStore.ts`, `src/App.tsx`, `src/components/AppLayout.tsx` |
| 2026-01-02 | Widget: event-driven auth/sync bridge; reduce polling | Fix widget auth indicator stuck “未连接” when microsoftService is unavailable in widget window; remove pointless 1s global-service polling and reduce auth/sync polling to low-frequency fallback (storage event is primary) | Low | `npm run typecheck` | (local) | File: `src/pages/DesktopCalendarWidget.tsx` |
| 2026-01-02 | Widget: merge auth+sync fallback loops | Reduce wakeups and duplicated listeners by merging the auth bridge + sync-status bridge into a single localStorage-driven effect with one low-frequency fallback interval | Low | `npm run typecheck` | (local) | File: `src/pages/DesktopCalendarWidget.tsx` |
| 2026-01-02 | Widget: reduce bridge log noise | Keep logs only on meaningful bridge changes (auth change / sync completion updates / errors) to avoid periodic console spam from fallback polling | Low | `npm run typecheck` | (local) | File: `src/pages/DesktopCalendarWidget.tsx` |
| 2026-01-02 | Calendar: remove duplicate sync listeners + App polling | Keep App as the single ingress for `action-sync-started/completed`; remove TimeCalendar’s redundant sync listeners and drop App’s 10s lastSyncTime polling in favor of event payload updates | Low | `npm run typecheck` | (local) | Files: `src/features/Calendar/TimeCalendar.tsx`, `src/App.tsx` |
| 2026-01-02 | Calendar: widget-only localStorage bridge | Prevent main app from treating legacy localStorage event storage as truth; restrict localStorage polling + storage listener + timer fallback reads to `isWidgetMode` only (timer uses `4dnote-global-timer`) | Low | `npm run typecheck` | (local) | File: `src/features/Calendar/TimeCalendar.tsx` |
| 2026-01-02 | Calendar: timer bridge cleanup | In widget mode, drive timer live updates from `4dnote-global-timer` only (drop legacy localStorage event storage dependency) and prevent timer tick from triggering high-frequency `loadEvents()` reloads | Low | `npm run typecheck` | (local) | File: `src/features/Calendar/TimeCalendar.tsx` |
| 2026-01-02 | Timer: replace legacy localStorage events write with pending-upserts | Stop mutating legacy localStorage event storage on beforeunload; persist only a small “pending event upserts” bridge and flush it on next startup via EventService | Low | `npm run typecheck` | (local) | File: `src/App.tsx` |
| 2026-01-02 | Cleanup: delete legacy localStorage migration | Remove unused legacy localStorage→StorageManager migration module (`dataMigration.ts`) per pre-release policy (no compat patches) | Low | `npm run typecheck` | (local) | File: `src/utils/dataMigration.ts` |
| 2026-01-02 | Cleanup: remove legacy events-key remnants (const/test/debug/BC) | Fully eliminate remaining references to the deprecated localStorage events key; avoid name collision by renaming cross-tab BroadcastChannel | Low | `npm run typecheck` | (local) | Files: `src/constants/storage.ts`, `src/services/EventService.ts`, `src/__tests__/time/timehub.basic.test.ts` |
| 2026-01-03 | Calendar: title pipeline hardening + month-view indicator alignment | Prevent Slate JSON/timestamp fragments leaking into UI titles by enforcing resolver-derived display title; fix month-view indicator misalignment caused by over-broad Task CSS resetting default-event margins/height | Med | `npm run build` | (local) | Files: `src/utils/TitleResolver.ts`, `src/utils/calendarUtils.ts`, `src/pages/LogTab.tsx`, `src/components/EventEditModal/EventEditModalV2.tsx`, `src/styles/calendar.css` |
| 2026-01-03 | Plan: move PlanManager into feature folder (shim) | Start codebase "feature boundary" cleanup without breaking existing imports | Low | `npm run typecheck`; `npm run test -- --run` | d0989ec | New home: `src/features/Plan/components/PlanManager.tsx`; compat shim: `src/components/PlanManager.tsx` |
| 2026-01-03 | Plan: move plan manager helpers into feature folder (shims) | Keep Plan helper logic under the Plan feature boundary while avoiding import churn | Low | `npm run typecheck`; `npm test -- --run` | 89bf1cf | New home: `src/features/Plan/helpers/*`; compat shims: `src/utils/planManagerFilters.ts`, `src/utils/planManagerHelpers.ts` |
| 2026-01-03 | Services: rename `EventTree` folder to `eventTree` | Align services folder casing with target structure and prevent Windows/TS “only in casing” collisions | Med | `npm run typecheck`; `npm test -- --run` | bd235ae | Updated imports across EventService + EventTree UI components |
| 2026-01-03 | EventTree: move `EventNodeService` under `services/eventTree` (shim) | Align EventTree-related services under a single folder without repo-wide import churn | Low | `npm run typecheck`; `npm test -- --run` | 13d8d90 | New home: `src/services/eventTree/EventNodeService.ts`; compat shim: `src/services/EventNodeService.ts` |
| 2026-01-03 | EventTree: move `eventTreeStats` under `services/eventTree/stats` (shim) | Keep EventTree stats helpers grouped under `eventTree` while avoiding import churn | Low | `npm run typecheck`; `npm test -- --run` | 52a0c6b | New home: `src/services/eventTree/stats/eventTreeStats.ts`; compat shim: `src/services/eventTreeStats.ts` |
| 2026-01-03 | Sync: move ActionBasedSyncManager into services/sync (shim) | Keep sync orchestration grouped under `services/sync` while avoiding a repo-wide import churn | Low | `npm run typecheck`; `npm test -- --run` | 29cc0f1 | New home: `src/services/sync/ActionBasedSyncManager.ts`; compat shim: `src/services/ActionBasedSyncManager.ts` |
| 2026-01-03 | TimeLog: move pages/components into feature folder (shims) | Continue codebase feature-boundary cleanup; keep old import paths working while relocating TimeLog domain UI | Low | `npm run typecheck`; `npm test -- --run` | 8d13a61 | New home: `src/features/TimeLog/pages/*`, `src/features/TimeLog/components/*`; compat shims: `src/pages/TimeLog*.tsx`, `src/components/TimeLog/*` |
| 2026-01-03 | Pages: move DesktopCalendarWidget into `pages/Calendar` (shim) | Reduce `src/pages` clutter by moving the desktop calendar widget window page into `src/pages/Calendar/WidgetWindow.tsx` while keeping legacy imports working via a shim | Low | `npx tsc --noEmit`; `npm test -- --run` | ac23942 | New home: `src/pages/Calendar/WidgetWindow.tsx`; compat shim: `src/pages/DesktopCalendarWidget.tsx` |
| 2026-01-03 | Pages: move WidgetSettings into `pages/Calendar` (shims) | Reduce `src/pages` clutter by moving the widget settings window page (and CSS) into `src/pages/Calendar/WidgetSettings.tsx` while keeping legacy imports working via shims | Low | `npx tsc --noEmit`; `npm test -- --run` | 1108318 | New home: `src/pages/Calendar/WidgetSettings.tsx`, `src/pages/Calendar/WidgetSettings.css`; compat shims: `src/pages/WidgetSettings.tsx`, `src/pages/WidgetSettings.css` |
| 2026-01-03 | Pages: move EventEditorWindow into `pages/Event` (shims) | Reduce `src/pages` clutter by moving the standalone event editor window page into `src/pages/Event/EditorWindow.tsx` while keeping legacy imports working via shims | Low | `npx tsc --noEmit`; `npm test -- --run` | b4bdf4f (+ 656b5ce) | New home: `src/pages/Event/EditorWindow.tsx`, `src/pages/Event/EditorWindow.css`; compat shims: `src/pages/EventEditorWindow.tsx`, `src/pages/EventEditorWindow.css` |
| 2026-01-03 | Pages: move LogTab into `pages/Event` (shims) | Reduce `src/pages` clutter by moving the event detail tab page into `src/pages/Event/DetailTab.tsx` while keeping legacy imports working via shims | Low | `npx tsc --noEmit`; `npm test -- --run` | 80f0f38 (+ 65e5b81) | New home: `src/pages/Event/DetailTab.tsx`, `src/pages/Event/DetailTab.css`; compat shims: `src/pages/LogTab.tsx`, `src/pages/LogTab.css` |
| 2026-01-03 | Pages: move HomePage into `pages/Home` (shim) | Finish P1 pages cleanup by relocating `src/pages/HomePage/*` into `src/pages/Home/*` and keeping the legacy `./pages/HomePage` import working via a shim | Low | `npx tsc --noEmit`; `npm test -- --run` | ff20db4 (+ 30bd75f) | New home: `src/pages/Home/*`; compat shim: `src/pages/HomePage/index.ts` |
| 2026-01-03 | Timer: move TimerCard into `features/Timer` (shims) | Establish Timer feature boundary while keeping legacy imports working | Low | `npx tsc --noEmit`; `npm test -- --run` | (local) | New home: `src/features/Timer/components/TimerCard.tsx`, `src/features/Timer/components/TimerCard.css`, `src/features/Timer/index.ts`; compat shims: `src/components/TimerCard.tsx`, `src/components/TimerCard.css` |
| 2026-01-03 | P0 cleanup: remove services shims (EventTree + Sync) | Enforce the no-shim policy retroactively by deleting services-level re-export shims and migrating consumers to `@backend/*` imports | Low | `npm run typecheck`; `npm test -- --run` | (local) | Deleted: `src/services/ActionBasedSyncManager.ts`, `src/services/EventNodeService.ts`, `src/services/eventTreeStats.ts`; updated imports (incl. dynamic imports) to `@backend/*` |
| 2026-01-03 | P0 cleanup: remove Plan shims | Enforce the no-shim policy retroactively by deleting Plan-level re-export shims and migrating consumers to `@frontend/*` imports | Low | `npm run typecheck`; `npm test -- --run` | (local) | Deleted: `src/components/PlanManager.tsx`, `src/utils/planManagerHelpers.ts`, `src/utils/planManagerFilters.ts`; updated imports to `@frontend/features/Plan/*` |
| 2026-01-03 | P0 cleanup: remove TimeLog shims | Enforce the no-shim policy retroactively by deleting TimeLog page/component re-export shims and importing the feature implementation directly | Low | `npm run typecheck`; `npm test -- --run` | (local) | Deleted: `src/pages/TimeLog.tsx`, `src/pages/TimeLog_new.tsx`, `src/components/TimeLog/*`; App imports `@frontend/features/TimeLog/pages/TimeLogPage` |
| 2026-01-03 | P0 cleanup: remove remaining Pages/CSS shims | Enforce the no-shim policy retroactively by deleting pages-level re-export/CSS-import shims and importing the real modules directly via `@frontend/*` | Low | `npm run typecheck`; `npm test -- --run` | (local) | Deleted: `src/pages/DesktopCalendarWidget.tsx`, `src/pages/WidgetSettings.tsx/.css`, `src/pages/EventEditorWindow.tsx/.css`, `src/pages/LogTab.tsx/.css`, `src/pages/HomePage/index.ts`, `src/components/TimerCard.css`; migrated imports in App + TimeLogPage |
| 2026-01-03 | P2-1: move EventTree UI into `features/Event` (no shims) | Start P2 feature-boundary cleanup from a low-risk UI component move; remove legacy `src/components/EventTree` location | Low | `npx tsc --noEmit`; `npm test -- --run` | abe2e9e | Moved: `src/components/EventTree/*` → `src/features/Event/components/EventTree/*`; updated imports in `src/pages/Event/DetailTab.tsx` and `src/components/EventEditModal/EventEditModalV2.tsx` |
| 2026-01-03 | P1: add missing pages entrypoints + delegate App page rendering | Align `src/pages/*` shape to the target tree and keep App orchestration thin by moving per-page layout/containers into pages entrypoints | Low | `npx tsc --noEmit`; `npm test -- --run` | 641d319 | Added `src/pages/Plan|TimeLog|Tag|Settings|Calendar/index.tsx`; renamed `src/pages/Home/index.ts` → `.tsx` |
| 2026-01-04 | P2-2: move Tag UI into `features/Tag` (no shims) | Establish Tag feature boundary per target tree; remove legacy `src/components/TagManager` + `src/components/HierarchicalTagPicker` locations | Low | `npx tsc --noEmit`; `npm test -- --run` | 87ca372 | Moved: `TagManager` + CSS + `HierarchicalTagPicker/*` → `src/features/Tag/*`; updated imports in Tag page + Event/TimeLog/EditModal |
| 2026-01-04 | P2-3: move ContactModal into `features/Contact` (no shims) | Establish Contact feature boundary per target tree; remove legacy `src/components/ContactModal` location | Low | `npx tsc --noEmit`; `npm test -- --run` | b72f9ff | Moved: ContactModal + CSS + tests → `src/features/Contact/*`; updated imports to `@frontend/*` + `@backend/*` |
| 2026-01-04 | P2-4: move Dashboard UI into `features/Dashboard` (no shims) | Establish Dashboard feature boundary per target tree; remove legacy `src/components/DailyStatsCard` + `src/components/UpcomingEventsPanel` locations | Low | `npx tsc --noEmit`; `npm test -- --run` | 3c9d16b | Moved: DailyStatsCard + UpcomingEventsPanel + CSS → `src/features/Dashboard/*`; updated imports in App + Home + Plan |
| 2026-01-04 | P2-5: move EventEditModalV2 into `features/Event` (no shims) | Continue Event feature boundary per target tree; remove legacy `src/components/EventEditModal` location | Low | `npx tsc --noEmit`; `npm test -- --run` | 0e16f2a | Moved: `src/components/EventEditModal/*` → `src/features/Event/components/EventEditModal/*`; updated imports in App/TimeCalendar/Plan/TimeLog/EditorWindow; added `src/features/Event/index.ts` |
| 2026-01-04 | P2-5 follow-up: Event modal demo + import cleanup (no shims) | Restore a clean baseline after moving EventEditModalV2 by relocating demo dropdowns under `features/Event` and fixing stale imports | Low | `npx tsc --noEmit`; `npm test -- --run` | 58fe5fc | Moved: `src/components/EventEditModalV2Demo/*` → `src/features/Event/components/EventEditModalV2Demo/*`; fixed imports in EventTabManager + EditModal types/hooks + TimeLog/Event pages |
| 2026-01-04 | P2-6: move EventTabManager into `features/Event` (no shims) | Continue Event feature boundary by relocating tabbed editor UI out of `src/components` and updating consumers to `@frontend/*` imports | Low | `npx tsc --noEmit`; `npm test -- --run` | 9f24f70 | Moved: `src/components/EventTabManager/*` → `src/features/Event/components/EventTabManager/*`; updated TimeLogPage import; exported EventTabManager from `src/features/Event/index.ts` |
| 2026-01-04 | P3-1: align `components/` taxonomy (layout/common) | Match target tree by moving layout + page shell components into `src/components/layout` and `src/components/common` and updating imports to `@frontend/*` | Low | `npx tsc --noEmit`; `npm test -- --run` | 4d0bb29 | Moved: `src/components/AppLayout.*` → `src/components/layout/*`, `src/components/PageContainer.*` → `src/components/common/*`; updated imports in App + Calendar/TimeLog/Tag pages |
| 2026-01-04 | P3-2: move common UI into `components/common` | Match target tree by moving common UI components into `src/components/common` and migrating imports to `@frontend/components/common/*` | Low | `npx tsc --noEmit`; `npm test -- --run` | 206233d | Moved: `Logo.*`, `ColorPicker.tsx`, `ErrorBoundary.tsx` → `src/components/common/*`; updated TagManager ColorPicker import |
| 2026-01-04 | P3-3: move shared UI into `components/shared` | Match target tree by moving shared UI components into `src/components/shared` and migrating imports to `@frontend/components/shared/*` | Low | `npx tsc --noEmit`; `npm test -- --run` | (local) | Moved: `StatusLineContainer.*`, `SyncNotification.*` → `src/components/shared/*`; updated imports in App + PlanManager |

## Decisions / ADRs
### ADR-001: Use `parentEventId` as structure truth
- Decision: tree rebuild derives structure from `parentEventId`; sibling order uses `position` (fallback: `createdAt`/`id`); legacy `childEventIds` must not be used to derive structure/correctness.
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
