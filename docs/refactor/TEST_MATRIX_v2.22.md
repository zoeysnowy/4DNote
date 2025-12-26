# Test Matrix (v2.22)

Goal: enumerate user operations, expected outcomes, and where we validate them (manual/unit/integration/e2e).

## Plan (PlanManager + PlanSlate)
- Indent/Outdent (Tab/Shift+Tab)
  - Expect: parent/child links correct; sibling order stable; refresh stable.
  - Validate: Manual; Unit (TreeEngine); Integration (serialization).
- Multi-line delete
  - Expect: deletion persists after refresh; no ghost reappearing.
  - Validate: Manual; Integration (PlanManager save intent).
- Placeholder/empty line behavior
  - Expect: placeholders never persist; never become parents.
  - Validate: Integration.

## TimeLog
- Initial load
  - Expect: list renders; no blank page.
  - Validate: Manual; Integration (EventHub subscription once implemented).
- Create/edit note
  - Expect: save persists after refresh; no event_history explosion.
  - Validate: Manual.

## TimeCalendar
- View switching
  - Expect: no timers/polling CPU spikes; view stable.
  - Validate: Manual; Performance sampling.
- Create/edit/drag events
  - Expect: updates persist; no duplicate loads; no stale overwrite.
  - Validate: Manual.

## Sync/Persistence
- Basic local edits
  - Expect: bounded event_history growth; IndexedDB stable.
  - Validate: Manual + unit for trimming.

## Performance Budgets (sanity)
- No setInterval polling for cross-window sync.
- No DOM cleanup loops at 500ms unless strictly necessary.
