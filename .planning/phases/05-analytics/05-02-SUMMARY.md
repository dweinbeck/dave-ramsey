---
phase: 05-analytics
plan: 02
subsystem: api
tags: [analytics, api-route, swr-hook, recharts, firestore, typescript]

# Dependency graph
requires:
  - phase: 05-analytics
    plan: 01
    provides: "computeWeeklySavingsBreakdown, buildPivotRows, analytics types"
  - phase: 01-foundation
    provides: "verifyUser auth pattern, envelopeFetch, SWR hook pattern"
  - phase: 02-envelope-management
    provides: "firestore collection refs, query helpers, computeEnvelopeStatus"

provides:
  - "GET /api/envelopes/analytics endpoint returning AnalyticsPageData"
  - "getAnalyticsData server-side aggregation function"
  - "useAnalytics SWR hook for client-side data fetching"
  - "Recharts library available for chart rendering"

affects:
  - phase: 05-analytics
    plan: 03
    impact: "UI components will consume useAnalytics hook and render with Recharts"

# Tech tracking
tech-stack:
  added: [recharts]
  patterns: [parallel-firestore-queries, swr-data-hook]

# File tracking
key-files:
  created:
    - src/app/api/envelopes/analytics/route.ts
  modified:
    - src/lib/envelopes/types.ts
    - src/lib/envelopes/firestore.ts
    - src/lib/envelopes/hooks.ts
    - package.json

# Decisions
decisions:
  - id: "05-02-01"
    decision: "getAnalyticsData uses parallel Firestore queries (3 concurrent) for efficiency"
    context: "Summary needs current-week transactions, pivot needs all transactions, both need envelopes"
  - id: "05-02-02"
    decision: "Summary on-track count uses raw spending without overage allocations"
    context: "Simplification for analytics overview; home page shows allocation-adjusted status"
  - id: "05-02-03"
    decision: "useAnalytics hook does not return mutate (read-only data)"
    context: "Analytics is display-only; no client-side mutations needed"

# Metrics
metrics:
  duration: "3 min"
  completed: "2026-02-10"
---

# Phase 5 Plan 2: Analytics API and Hooks Summary

**Server-side analytics aggregation with parallel Firestore queries, REST endpoint, SWR hook, and Recharts installed.**

## What Was Done

### Task 1: Copy updated utilities + Install Recharts
- Appended analytics types (`WeeklySavingsEntry`, `PivotRow`, `AnalyticsPageData`) to `types.ts`
- Added `computeWeeklySavingsBreakdown` and `buildPivotRows` functions to `firestore.ts`
- Added `getWeekNumber` to week-math imports in `firestore.ts`
- Installed `recharts` (v3.7.0) as a dependency

### Task 2: Analytics API route + getAnalyticsData + useAnalytics hook
- Added `getAnalyticsData` async function to `firestore.ts` with parallel Firestore queries
  - Fetches envelopes, current-week transactions, and all transactions concurrently
  - Computes summary (spent, budget, remaining, on-track count)
  - Builds pivot table rows via `buildPivotRows`
  - Computes weekly savings breakdown via `computeWeeklySavingsBreakdown`
- Created `GET /api/envelopes/analytics` route following existing auth pattern
- Added `useAnalytics` SWR hook to `hooks.ts` for client-side data fetching

## Decisions Made

1. **Parallel Firestore queries** -- `getAnalyticsData` issues 3 concurrent queries (envelopes, current-week transactions, all transactions) via `Promise.all` for efficiency
2. **Raw spending for on-track count** -- Analytics summary does not factor in overage allocations (simplification; home page shows allocation-adjusted status)
3. **Read-only hook** -- `useAnalytics` does not expose `mutate` since analytics is display-only

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes
- `npm run build` passes (new route visible in build output as `f /api/envelopes/analytics`)
- `recharts` present in package.json
- API route file exists at `src/app/api/envelopes/analytics/route.ts`
- `useAnalytics` hook exported from `hooks.ts`
- `getAnalyticsData` function exported from `firestore.ts`

## Commits

| Hash | Message |
|------|---------|
| 3ee2651 | feat(05-02): copy analytics utilities and install Recharts |
| ea8641c | feat(05-02): add analytics API route, getAnalyticsData, and useAnalytics hook |

## Next Phase Readiness

Plan 05-03 (Analytics UI Components) is unblocked:
- `useAnalytics` hook ready for consumption by page components
- `Recharts` library installed for chart rendering
- `AnalyticsPageData` type defines the exact response shape for UI binding
- Analytics page route (`/envelopes/analytics`) already exists from Phase 1
