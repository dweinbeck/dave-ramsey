---
phase: 06-billing-integration
plan: 02
subsystem: billing
tags: [api-routes, billing-gates, 402, billing-status, server-enforcement]

# Dependency graph
requires:
  - phase: 06-billing-integration
    plan: 01
    provides: checkEnvelopeAccess(), EnvelopeAccessResult, BillingStatus types
provides:
  - All 8 mutation endpoints gated with 402 billing enforcement
  - All 3 GET endpoints include billing status in JSON response
  - Billing placeholders removed from Firestore helpers (billing now comes from API layer)
affects: [06-03 -- UI readonly mode can now read billing.mode from all GET responses]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutation billing gate: checkEnvelopeAccess() inside try, before body parsing, returns 402 if readonly"
    - "GET billing inclusion: Promise.all([checkEnvelopeAccess, dataFetch]) with billing spread into response"
    - "Firestore helpers return Omit<*PageData, 'billing'> since billing comes from API route layer"

key-files:
  created: []
  modified:
    - src/app/api/envelopes/route.ts (personal-brand)
    - src/app/api/envelopes/[envelopeId]/route.ts (personal-brand)
    - src/app/api/envelopes/transactions/route.ts (personal-brand)
    - src/app/api/envelopes/transactions/[transactionId]/route.ts (personal-brand)
    - src/app/api/envelopes/allocations/route.ts (personal-brand)
    - src/app/api/envelopes/reorder/route.ts (personal-brand)
    - src/app/api/envelopes/analytics/route.ts (personal-brand)
    - src/lib/envelopes/firestore.ts (personal-brand)

key-decisions:
  - "Billing check placed as FIRST thing inside try block, before params destructuring or body parsing"
  - "GET endpoints run billing check in parallel with data fetch via Promise.all for zero added latency"
  - "Firestore helpers return Omit<*PageData, 'billing'> -- billing is API-route concern, not data-layer"
  - "'reason' in access discriminated union check handles readwrite (optional reason) vs readonly (required reason)"

patterns-established:
  - "402 billing gate pattern: const access = await checkEnvelopeAccess(uid, email); if readonly -> 402"
  - "GET billing spread: { ...data, billing: { mode, reason } }"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 6 Plan 2: API Route Billing Gates Summary

**402 billing enforcement on all 8 mutation endpoints, billing status in all 3 GET responses, billing placeholders removed from Firestore layer**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T23:27:21Z
- **Completed:** 2026-02-10T23:29:47Z
- **Tasks:** 2
- **Files modified:** 8 (in personal-brand repo)

## Accomplishments
- All 8 mutation handlers (POST/PUT/DELETE) across 6 route files reject with 402 when billing access is readonly
- All 3 GET handlers include `billing: { mode, reason }` in their JSON response for client-side rendering
- `checkEnvelopeAccess` imported and called in all 7 envelope route files
- Default billing placeholders removed from `listEnvelopesWithRemaining` and `getAnalyticsData` -- billing is now exclusively an API route concern
- Firestore helper return types changed to `Omit<*PageData, "billing">` for clean separation

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate mutation endpoints with billing checks** - `279d05a` (feat)
2. **Task 2: Add billing status to GET responses** - `e220601` (feat)

## Files Modified
- `src/app/api/envelopes/route.ts` - Added billing import, 402 gate on POST, billing status in GET via Promise.all
- `src/app/api/envelopes/[envelopeId]/route.ts` - Added billing import, 402 gate on PUT and DELETE
- `src/app/api/envelopes/transactions/route.ts` - Added billing import, 402 gate on POST, billing status in GET via Promise.all
- `src/app/api/envelopes/transactions/[transactionId]/route.ts` - Added billing import, 402 gate on PUT and DELETE
- `src/app/api/envelopes/allocations/route.ts` - Added billing import, 402 gate on POST
- `src/app/api/envelopes/reorder/route.ts` - Added billing import, 402 gate on PUT
- `src/app/api/envelopes/analytics/route.ts` - Added billing import, billing status in GET via Promise.all
- `src/lib/envelopes/firestore.ts` - Removed billing placeholders from return objects, return types changed to Omit

## Decisions Made
- Billing check placed inside try block as first statement -- billing errors (Firestore issues) are caught by the existing catch block, while readonly returns 402 before any body parsing or business logic
- GET endpoints use Promise.all to run billing check in parallel with data fetch, adding zero latency to the response path
- `"reason" in access` pattern for discriminated union -- handles both readwrite (optional reason) and readonly (always has reason: "unpaid")
- Firestore helpers now return `Omit<*PageData, "billing">` since billing is an API-layer concern, not a data-layer concern

## Deviations from Plan

None -- plan executed exactly as written.

## Note on dave-ramsey repo
The dave-ramsey repo's `firestore.ts` still contains the default billing placeholder `{ mode: "readwrite" as const }` from 06-01. Since dave-ramsey is the shared utilities repo (not serving API routes), this is harmless and will be synced when needed. The personal-brand repo (where routes run) is fully updated.

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- All API routes now enforce billing server-side -- no mutation can bypass billing
- GET responses include `billing.mode` for UI to conditionally disable mutation controls
- Plan 06-03 (UI readonly mode) can read `billing.mode` from any GET response to show/hide editing controls

---
*Phase: 06-billing-integration*
*Completed: 2026-02-10*
