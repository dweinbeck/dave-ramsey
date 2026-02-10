---
phase: 03-transactions
plan: 01
subsystem: api
tags: [date-fns, zod, week-math, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: week-math utilities (getWeekRange, formatWeekLabel), types (transactionSchema)
provides:
  - getWeekNumber utility for week-of-year display
  - transactionUpdateSchema for PATCH transaction validation
  - TransactionUpdateInput type
  - TransactionsPageData response type
affects: [03-02 transaction CRUD, 03-03 transaction UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wrapper functions around date-fns with US convention defaults"
    - "Partial update schemas (all fields optional) for PATCH endpoints"

key-files:
  created: []
  modified:
    - src/lib/envelopes/week-math.ts
    - src/lib/envelopes/__tests__/week-math.test.ts
    - src/lib/envelopes/types.ts
    - src/lib/envelopes/__tests__/types.test.ts

key-decisions:
  - "getWeek with firstWeekContainsDate:1 means Dec 31, 2025 is week 1 (same week as Jan 1, 2026)"
  - "transactionUpdateSchema uses same per-field constraints as transactionSchema but all optional"

patterns-established:
  - "US week numbering: weekStartsOn:0 + firstWeekContainsDate:1 for consistent week-of-year"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 3 Plan 1: getWeekNumber + Transaction Update Types Summary

**getWeekNumber utility wrapping date-fns getWeek with US conventions, plus transactionUpdateSchema and TransactionsPageData type for transaction editing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T19:34:06Z
- **Completed:** 2026-02-10T19:35:50Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- getWeekNumber returns correct US-convention week-of-year number for any date (5 test cases)
- transactionUpdateSchema validates partial transaction updates with all fields optional (6 test cases)
- TransactionsPageData type shapes the transaction list API response
- All 66 tests pass with zero failures, lint and build clean

## Task Commits

Each task was committed atomically (TDD pattern):

1. **Task 1 RED: Failing getWeekNumber tests** - `7ad92a8` (test)
2. **Task 1 GREEN: Implement getWeekNumber + transaction types** - `09f7f12` (feat)

_TDD task with RED-GREEN commits. No refactor needed -- implementation is minimal wrapper._

## Files Created/Modified
- `src/lib/envelopes/week-math.ts` - Added getWeekNumber wrapping date-fns getWeek with US options
- `src/lib/envelopes/__tests__/week-math.test.ts` - Added 5 test cases for getWeekNumber (various dates, year boundary)
- `src/lib/envelopes/types.ts` - Added transactionUpdateSchema, TransactionUpdateInput, TransactionsPageData
- `src/lib/envelopes/__tests__/types.test.ts` - Added 6 test cases for transactionUpdateSchema validation

## Decisions Made
- getWeek with `firstWeekContainsDate: 1` means Dec 31, 2025 falls in week 1 (the week containing Jan 1, 2026) -- verified against date-fns output
- transactionUpdateSchema reuses same per-field constraints as transactionSchema but makes all fields optional for PATCH semantics

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- getWeekNumber ready for week selector UI display ("Week N: M/D - M/D")
- transactionUpdateSchema ready for PATCH /api/envelopes/transactions/[id] endpoint
- TransactionsPageData ready for GET /api/envelopes/transactions response typing

---
*Phase: 03-transactions*
*Completed: 2026-02-10*
