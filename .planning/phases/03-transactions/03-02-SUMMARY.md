---
phase: 03-transactions
plan: 02
subsystem: api
tags: [firestore, crud, api-routes, swr, nextjs, transactions]
depends_on:
  requires: [03-01]
  provides: [transaction-crud, transaction-api-routes, useTransactions-hook]
  affects: [03-03, 04-01]
tech-stack:
  added: []
  patterns: [ownership-verification, cross-envelope-validation, swr-week-keying]
key-files:
  created:
    - /Users/dweinbeck/Documents/personal-brand/src/app/api/envelopes/transactions/route.ts
    - /Users/dweinbeck/Documents/personal-brand/src/app/api/envelopes/transactions/[transactionId]/route.ts
  modified:
    - src/lib/envelopes/firestore.ts
    - /Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/firestore.ts
    - /Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/types.ts
    - /Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/week-math.ts
    - /Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/hooks.ts
key-decisions:
  - id: 03-02-01
    decision: "useTransactions SWR key includes both weekStart and weekEnd for correct cache invalidation on week navigation"
duration: 4 min
completed: 2026-02-10
---

# Phase 3 Plan 2: Transaction CRUD + API Routes + SWR Hook Summary

Transaction Firestore CRUD (create/update/delete/list) with ownership verification, 4 API route handlers (GET/POST/PUT/DELETE), and useTransactions SWR hook keyed by week range.

## Performance

- **Duration:** 4 minutes
- **Tasks:** 2/2 completed
- **Deviations:** 0

## Accomplishments

1. Added 4 transaction CRUD functions to firestore.ts in both dave-ramsey and personal-brand repos:
   - `createTransaction` -- verifies envelope ownership before creating
   - `updateTransaction` -- verifies transaction ownership and new envelope ownership when changing envelopeId
   - `deleteTransaction` -- verifies ownership, includes Phase 4 TODO for cascade-delete of allocations
   - `listTransactionsForWeek` -- queries by userId + date range, ordered by date descending

2. Synced types and utilities from dave-ramsey to personal-brand:
   - `transactionUpdateSchema` and `TransactionUpdateInput` for partial transaction updates
   - `TransactionsPageData` response type for GET endpoint
   - `getWeekNumber` function in week-math.ts

3. Created transaction API routes in personal-brand following existing envelope route patterns:
   - `GET /api/envelopes/transactions?weekStart=...&weekEnd=...` -- list transactions for a week
   - `POST /api/envelopes/transactions` -- create transaction with Zod validation
   - `PUT /api/envelopes/transactions/[transactionId]` -- partial update with ownership check
   - `DELETE /api/envelopes/transactions/[transactionId]` -- delete with ownership check

4. Added `useTransactions(weekStart, weekEnd)` SWR hook keyed by both parameters for correct cache behavior when navigating weeks.

## Task Commits

| # | Task | Repo | Commit | Key Files |
|---|------|------|--------|-----------|
| 1 | Transaction CRUD functions (dave-ramsey) | dave-ramsey | `2c1124e` | src/lib/envelopes/firestore.ts |
| 1 | Transaction CRUD functions + types (personal-brand) | personal-brand | `0b3260e` | src/lib/envelopes/firestore.ts, types.ts |
| 2 | API routes + SWR hook + utilities sync | personal-brand | `8bf6ad8` | transactions/route.ts, [transactionId]/route.ts, hooks.ts, week-math.ts |

## Files Created

- `/Users/dweinbeck/Documents/personal-brand/src/app/api/envelopes/transactions/route.ts` -- GET + POST handlers
- `/Users/dweinbeck/Documents/personal-brand/src/app/api/envelopes/transactions/[transactionId]/route.ts` -- PUT + DELETE handlers

## Files Modified

- `src/lib/envelopes/firestore.ts` (dave-ramsey) -- added 4 transaction CRUD functions, updated type imports
- `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/firestore.ts` -- same CRUD functions synced
- `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/types.ts` -- added transactionUpdateSchema, TransactionUpdateInput, TransactionsPageData
- `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/week-math.ts` -- added getWeekNumber, getWeek import
- `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/hooks.ts` -- added useTransactions hook, updated type import

## Decisions Made

1. **useTransactions SWR key includes both weekStart and weekEnd** -- Ensures navigating between weeks properly invalidates and refetches cached data. Key format: `/api/envelopes/transactions?weekStart=${weekStart}&weekEnd=${weekEnd}`.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- dave-ramsey: `tsc --noEmit` passes, 66/66 tests pass
- personal-brand: `npm run build` succeeds, both new API routes registered as dynamic (server-rendered)

## Next Phase Readiness

- Transaction CRUD fully available for Plan 03-03 (Transaction UI)
- `useTransactions` hook ready for UI consumption with week-based SWR caching
- Phase 4 cascade-delete TODO is documented in `deleteTransaction`
