---
phase: 01-foundation
plan: 02
subsystem: date-math
tags: [date-fns, vitest, tdd, week-math, typescript]

# Dependency graph
requires:
  - phase: none
    provides: greenfield project
provides:
  - "getWeekRange: Sunday-to-Saturday date range for any date"
  - "getRemainingDaysPercent: fraction of week remaining (1.0 Sunday to 1/7 Saturday)"
  - "getStatusLabel: Over/Watch/On Track based on remaining vs proportional budget"
  - "formatWeekLabel: M/D/YYYY - M/D/YYYY week range string"
affects:
  - 01-03 (types plan may import week-math for date utilities)
  - 02-envelope-management (home page cards use getStatusLabel and getRemainingDaysPercent)
  - 03-transactions (week selector uses formatWeekLabel and getWeekRange)
  - 05-analytics (weekly pivot table uses getWeekRange)

# Tech tracking
tech-stack:
  added: [date-fns@4.1.0, vitest@3.2.4, typescript@5.9.3]
  patterns: [TDD red-green-refactor, weekStartsOn:0 convention, WEEK_OPTIONS constant]

key-files:
  created:
    - src/lib/envelopes/week-math.ts
    - src/lib/envelopes/__tests__/week-math.test.ts
    - package.json
    - tsconfig.json
    - vitest.config.ts
    - .gitignore
  modified: []

key-decisions:
  - "Used date-fns v4 startOfWeek/endOfWeek with explicit weekStartsOn:0 for all week math"
  - "getRemainingDaysPercent counts remaining days including today (Sunday=7/7, Saturday=1/7)"
  - "getStatusLabel uses proportional budget (weeklyBudget * remainingDaysPercent) as threshold"

patterns-established:
  - "WEEK_OPTIONS constant: single source of truth for weekStartsOn:0 across all functions"
  - "TDD workflow: failing tests committed first, implementation committed separately"
  - "Vitest with @/ path alias matching tsconfig paths"

# Metrics
duration: 4min
completed: 2026-02-10
---

# Phase 1 Plan 2: Week Math Utilities Summary

**TDD-driven week math with date-fns v4: getWeekRange, getRemainingDaysPercent, getStatusLabel, formatWeekLabel -- 20 tests, all passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-10T14:01:26Z
- **Completed:** 2026-02-10T14:05:46Z
- **Tasks:** 2 (RED + GREEN; no REFACTOR needed)
- **Files modified:** 6

## Accomplishments
- Established project scaffolding (package.json, tsconfig, vitest, .gitignore)
- Installed date-fns v4.1.0 as the only new production dependency
- Built all four week math functions with comprehensive TDD coverage
- 20 tests covering edge cases: year boundaries, week start/end, zero/negative remainings, proportional budget thresholds

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests for all 4 functions** - `5fcf955` (test)
2. **GREEN: Implement all 4 functions** - `1b08488` (feat)

_No REFACTOR commit needed -- implementation was already minimal and clean._

**Plan metadata:** (pending)

## Files Created/Modified
- `src/lib/envelopes/week-math.ts` - Four exported functions: getWeekRange, getRemainingDaysPercent, getStatusLabel, formatWeekLabel (62 lines)
- `src/lib/envelopes/__tests__/week-math.test.ts` - 20 tests across 4 describe blocks (153 lines)
- `package.json` - Project config with date-fns, vitest, typescript dependencies
- `tsconfig.json` - TypeScript strict mode with @/ path alias
- `vitest.config.ts` - Vitest config with @/ alias resolution
- `.gitignore` - node_modules, dist, env files

## Decisions Made
- **date-fns v4 with explicit weekStartsOn:0**: Even though 0 is the default, we set it explicitly via a `WEEK_OPTIONS` constant to prevent accidental locale overrides. This follows the RESEARCH.md recommendation.
- **getRemainingDaysPercent includes today**: Sunday returns 7/7 (full week ahead including today), Saturday returns 1/7 (just today remaining). This means the value is always > 0.
- **getStatusLabel uses >= for On Track threshold**: When remaining exactly equals the proportional budget, the user is "On Track" rather than "Watch". This is the more encouraging interpretation.
- **No REFACTOR phase**: Implementation followed the RESEARCH.md code example closely and was already minimal. Adding a refactor commit would have been empty noise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Project scaffolding (package.json, tsconfig, vitest, .gitignore)**
- **Found during:** Task 1 (RED phase)
- **Issue:** Repository had no package.json, tsconfig.json, vitest config, or .gitignore -- could not write or run tests
- **Fix:** Initialized Node.js project, installed date-fns + vitest + typescript, created tsconfig.json with @/ paths, created vitest.config.ts, created .gitignore
- **Files created:** package.json, package-lock.json, tsconfig.json, vitest.config.ts, .gitignore
- **Verification:** `npm test` runs successfully, `npm run build` passes
- **Committed in:** 5fcf955 (RED phase commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Scaffolding was necessary to execute TDD. No scope creep -- these are minimal infrastructure files required by any TypeScript project with tests.

## Issues Encountered
- An external process created `src/lib/envelopes/types.ts` during execution with a broken import (`@google-cloud/firestore`). This was subsequently fixed by the same external process. The file is not part of plan 01-02 and will be addressed in plan 01-03.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Week math utilities are the single source of truth for all date calculations
- All four functions are exported and ready for import by Phase 2+ features
- Test infrastructure (Vitest) is established and working
- Plan 01-03 (Zod types, Firestore helpers, formatCents) can proceed immediately

---
*Phase: 01-foundation*
*Completed: 2026-02-10*
