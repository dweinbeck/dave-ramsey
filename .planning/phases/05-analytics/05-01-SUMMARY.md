---
phase: 05-analytics
plan: 01
subsystem: api
tags: [analytics, pure-functions, tdd, typescript, pivot-table, savings-chart]

# Dependency graph
requires:
  - phase: 02-envelope-management
    provides: "computeSavingsForWeek, computeCumulativeSavingsFromData, SavingsEnvelope type"
  - phase: 01-foundation
    provides: "getWeekNumber from week-math.ts, date-fns week iteration patterns"
provides:
  - "computeWeeklySavingsBreakdown pure function for per-week savings with cumulative totals"
  - "buildPivotRows pure function for weekly transaction pivot table"
  - "WeeklySavingsEntry, PivotRow, AnalyticsPageData response types"
affects: [05-02 analytics API endpoint, 05-03 analytics UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Week iteration with addWeeks/format for per-week aggregation (same as computeCumulativeSavingsFromData)"
    - "Pure computation helpers for analytics data aggregation (no Firestore dependency)"

key-files:
  created: []
  modified:
    - "src/lib/envelopes/types.ts"
    - "src/lib/envelopes/firestore.ts"
    - "src/lib/envelopes/__tests__/firestore.test.ts"

key-decisions:
  - "computeWeeklySavingsBreakdown reuses same week iteration pattern as computeCumulativeSavingsFromData (intentional duplication for different output shapes)"
  - "buildPivotRows omits empty weeks (no zero-transaction rows in pivot table)"
  - "buildPivotRows returns newest-first order (reverse chronological for table display)"
  - "computeWeeklySavingsBreakdown returns oldest-first order (chronological for chart x-axis)"

patterns-established:
  - "Analytics computation as pure functions: testable without Firestore, same pattern as existing helpers"
  - "Week label format: 'Wk N' using getWeekNumber for consistent display"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 5 Plan 1: Analytics Computation Helpers Summary

**Pure computation helpers (computeWeeklySavingsBreakdown, buildPivotRows) with TDD and analytics response types (AnalyticsPageData, PivotRow, WeeklySavingsEntry)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T22:32:21Z
- **Completed:** 2026-02-10T22:34:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added WeeklySavingsEntry, PivotRow, and AnalyticsPageData types for the analytics API response
- Implemented computeWeeklySavingsBreakdown: per-week savings with running cumulative total, delegating to existing computeSavingsForWeek
- Implemented buildPivotRows: groups transactions by week and envelope, newest-first, omitting empty weeks
- Full TDD coverage with 11 new tests (6 for savings breakdown, 5 for pivot rows)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add analytics response types** - `0a383cf` (feat)
2. **Task 2 RED: Failing tests for analytics helpers** - `72fc99d` (test)
3. **Task 2 GREEN: Implement both functions** - `51bd1f6` (feat)

_TDD Task 2 produced 2 commits (test, feat). Refactor phase skipped -- code follows existing patterns cleanly._

## Files Created/Modified
- `src/lib/envelopes/types.ts` - Added WeeklySavingsEntry, PivotRow, AnalyticsPageData types
- `src/lib/envelopes/firestore.ts` - Added computeWeeklySavingsBreakdown and buildPivotRows pure functions, imported getWeekNumber and new types
- `src/lib/envelopes/__tests__/firestore.test.ts` - Added 11 tests in two new describe blocks

## Decisions Made
- Intentionally duplicated week iteration pattern from computeCumulativeSavingsFromData rather than extracting shared iterator (same logic, different output shapes -- extraction would add complexity without benefit)
- buildPivotRows uses `weekStart <= currentWeekEnd` boundary condition (inclusive of end week) vs computeWeeklySavingsBreakdown using `weekStart < currentWeekStart` (exclusive of current week) -- different semantics for different use cases
- No refactoring commit needed -- new code follows established patterns exactly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Pure computation functions ready for use in analytics API endpoint (plan 05-02)
- Types ready for import in API route and UI components
- All 88 tests pass (77 existing + 11 new), no regressions

---
*Phase: 05-analytics*
*Completed: 2026-02-10*
