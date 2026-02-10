---
phase: 06-billing-integration
plan: 01
subsystem: billing
tags: [firestore, billing, credits, weekly-access, debitForToolUse]

# Dependency graph
requires:
  - phase: 05-analytics
    provides: AnalyticsPageData type, complete envelope API surface
provides:
  - EnvelopeBilling, EnvelopeAccessResult, BillingStatus types
  - checkEnvelopeAccess() function for weekly billing enforcement
  - dave_ramsey tool pricing activated at 100 credits
  - billing field on HomePageData, TransactionsPageData, AnalyticsPageData
affects: [06-02, 06-03 -- API route integration, UI readonly mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Weekly billing access check with free trial week and 402 readonly degradation"
    - "envelope_billing/{uid} Firestore doc tracks firstAccessWeekStart and paidWeeks"

key-files:
  created:
    - src/lib/envelopes/billing.ts (personal-brand)
  modified:
    - src/lib/envelopes/types.ts (both repos)
    - src/lib/envelopes/firestore.ts (both repos)
    - src/lib/billing/tools.ts (personal-brand)

key-decisions:
  - "Default billing placeholder { mode: 'readwrite' } in firestore return objects until API routes integrate checkEnvelopeAccess()"
  - "EnvelopeBilling doc created in Firestore transaction to prevent race conditions on first access"
  - "402 statusCode check on debitForToolUse error for readonly degradation"
  - "dave_ramsey tool pricing set to 100 credits (costToUsCentsEstimate: 0 since no external API cost)"

patterns-established:
  - "Billing access pattern: checkEnvelopeAccess(uid, email) called before API response"
  - "Free trial week: firstAccessWeekStart === currentWeekStart"
  - "Idempotency key format: envelope_week_{weekStart}"

# Metrics
duration: 4min
completed: 2026-02-10
---

# Phase 6 Plan 1: Billing Module Summary

**checkEnvelopeAccess() with free trial week, weekly debit via debitForToolUse, and graceful readonly degradation on 402**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-10T23:20:47Z
- **Completed:** 2026-02-10T23:24:53Z
- **Tasks:** 3
- **Files modified:** 6 (across 2 repos)

## Accomplishments
- Billing types (EnvelopeBilling, EnvelopeAccessResult, BillingStatus) defined in both repos
- checkEnvelopeAccess() handles full billing lifecycle: free week, already-paid, charge, 402 readonly
- HomePageData, TransactionsPageData, AnalyticsPageData updated with billing field
- dave_ramsey tool pricing activated at 100 credits per weekly access

## Task Commits

Each task was committed atomically:

1. **Task 1: Add billing types to types.ts (both repos)** - `09645b2` (dave-ramsey) / `242ca1e` (personal-brand) (feat)
2. **Task 2: Create billing.ts with checkEnvelopeAccess()** - `85802ff` (personal-brand) (feat)
3. **Task 3: Activate dave_ramsey tool pricing** - `c5997cb` (personal-brand) (feat)

## Files Created/Modified
- `src/lib/envelopes/types.ts` (both repos) - Added EnvelopeBilling, EnvelopeAccessResult, BillingStatus types; added billing field to page data types
- `src/lib/envelopes/firestore.ts` (both repos) - Added default billing placeholder to return objects
- `src/lib/envelopes/billing.ts` (personal-brand) - New file: checkEnvelopeAccess() with free week, payment, and readonly logic
- `src/lib/billing/tools.ts` (personal-brand) - Updated dave_ramsey: label, active, creditsPerUse, costToUsCentsEstimate

## Decisions Made
- Default billing placeholder `{ mode: "readwrite" }` added to firestore return objects so existing code compiles; API routes will override with real billing status in later plans
- EnvelopeBilling doc created inside a Firestore transaction to prevent race conditions when two requests arrive simultaneously on first access
- 402 error detection uses statusCode property (matching existing debitForToolUse error convention)
- dave_ramsey costToUsCentsEstimate set to 0 because there is no external API cost for envelopes (pure Firestore reads/writes)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added default billing placeholder to firestore return objects**
- **Found during:** Task 1 (billing types)
- **Issue:** Adding required `billing: BillingStatus` field to HomePageData, TransactionsPageData, AnalyticsPageData broke existing functions that return those types without a billing field
- **Fix:** Added `billing: { mode: "readwrite" as const }` to the return objects of `listEnvelopesWithRemaining` (both repos) and `getAnalyticsData` (personal-brand). This is a safe default that will be overridden by real billing checks in later plans.
- **Files modified:** `src/lib/envelopes/firestore.ts` (both repos)
- **Verification:** `npx tsc --noEmit` passes in both repos
- **Committed in:** `09645b2` / `242ca1e` (Task 1 commits)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain TypeScript compilation. Default readwrite is safe and will be replaced when API routes integrate checkEnvelopeAccess() in later plans.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- checkEnvelopeAccess() is ready for integration into all envelope API routes (next plans)
- API routes will call checkEnvelopeAccess(uid, email) and spread the result into responses
- UI components will need to read billing.mode to disable mutations when readonly

---
*Phase: 06-billing-integration*
*Completed: 2026-02-10*
