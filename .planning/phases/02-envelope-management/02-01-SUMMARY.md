---
phase: 02-envelope-management
plan: 01
subsystem: api
tags: [firestore, tdd, vitest, date-fns, envelope-crud, savings-computation]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Zod schemas, Firestore collection helpers, week-math utilities, Envelope/EnvelopeTransaction/OverageAllocation types"
provides:
  - "EnvelopeWithStatus and HomePageData computed display types"
  - "Pure computation helpers: computeEnvelopeStatus, computeSavingsForWeek, computeCumulativeSavingsFromData"
  - "Firestore CRUD: createEnvelope, updateEnvelope, deleteEnvelope, reorderEnvelopes"
  - "Firestore queries: listEnvelopesWithRemaining, computeCumulativeSavings"
  - "19 tests covering all computation logic"
affects: [02-02, 02-03, 03-transactions, 05-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure computation helpers extracted from Firestore-dependent functions for testability", "SavingsEnvelope type alias for shared function signatures"]

key-files:
  created:
    - "src/lib/envelopes/__tests__/firestore.test.ts"
  modified:
    - "src/lib/envelopes/types.ts"
    - "src/lib/envelopes/firestore.ts"

key-decisions:
  - "Extract pure computation helpers (computeEnvelopeStatus, computeSavingsForWeek, computeCumulativeSavingsFromData) for unit testing without Firestore mocks"
  - "Envelope createdAt comparison uses weekEnd (not weekStart) -- envelopes created mid-week count toward that week's savings"
  - "Per-envelope savings floored at 0 -- overspending one envelope does not reduce total savings"
  - "SavingsEnvelope type alias to reduce repetition across computation helper signatures"

patterns-established:
  - "Pure computation extraction: Firestore-dependent functions delegate computation to pure, testable helpers"
  - "Batch deletion with 450-op safety limit for Firestore batch writes"
  - "Parallel Firestore queries with Promise.all for read-heavy operations"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 2 Plan 1: Envelope CRUD Operations and Savings Computation Summary

**Envelope CRUD with TDD-driven pure computation helpers for status labels, weekly savings, and cumulative savings tracking**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T14:46:53Z
- **Completed:** 2026-02-10T14:51:45Z
- **Tasks:** 3 (TDD: RED, GREEN, REFACTOR)
- **Files modified:** 3

## Accomplishments
- Added EnvelopeWithStatus and HomePageData computed display types to types.ts
- Implemented 3 pure computation helpers (computeEnvelopeStatus, computeSavingsForWeek, computeCumulativeSavingsFromData) with 19 comprehensive tests
- Implemented 6 Firestore CRUD/query functions (createEnvelope, updateEnvelope, deleteEnvelope, reorderEnvelopes, listEnvelopesWithRemaining, computeCumulativeSavings)
- All 55 tests pass (36 existing + 19 new), zero lint errors

## Task Commits

Each task was committed atomically (TDD cycle):

1. **RED: Failing tests for computation helpers** - `0db8a51` (test)
2. **GREEN: Implement types and all functions** - `879544d` (feat)
3. **REFACTOR: Clean up dead code, extract SavingsEnvelope type** - `75cfe53` (refactor)

## Files Created/Modified
- `src/lib/envelopes/types.ts` - Added EnvelopeWithStatus and HomePageData computed display types
- `src/lib/envelopes/firestore.ts` - Added pure computation helpers, CRUD operations, query functions, SavingsEnvelope type alias
- `src/lib/envelopes/__tests__/firestore.test.ts` - 19 tests: 6 for envelope status, 6 for weekly savings, 7 for cumulative savings

## Decisions Made
- Extracted pure computation helpers from Firestore-dependent functions for unit testability without mocks
- Envelope createdAt comparison uses weekEnd (not weekStart) so envelopes created mid-week count toward that week's savings
- Per-envelope savings floored at 0 per week -- overspending one envelope does not subtract from total savings
- Added SavingsEnvelope type alias to reduce inline type repetition across three function signatures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed envelope createdAt comparison boundary**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Initial implementation compared `env.createdAt > weekStart` which excluded envelopes created mid-week from that week's savings
- **Fix:** Changed to `env.createdAt > weekEnd` so envelopes created during a week are included in that week's savings
- **Files modified:** src/lib/envelopes/firestore.ts
- **Verification:** Test "only counts envelopes that existed during each week" passes
- **Committed in:** 879544d (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix essential for correct savings computation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types and CRUD operations ready for API route wiring in 02-02 (personal-brand repo)
- Pure computation helpers can be imported by personal-brand repo or replicated as the plan specifies
- Existing collection helpers (envelopesForUser, transactionsForUserInWeek) support all query patterns needed by CRUD functions

---
*Phase: 02-envelope-management*
*Completed: 2026-02-10*
