---
phase: 05-analytics
plan: 03
subsystem: ui
tags: [analytics, components, recharts, area-chart, pivot-table, summary-stats, responsive]

# Dependency graph
requires:
  - phase: 05-analytics
    plan: 01
    provides: "analytics computation helpers, PivotRow/WeeklySavingsEntry types"
  - phase: 05-analytics
    plan: 02
    provides: "useAnalytics hook, GET /api/envelopes/analytics endpoint, Recharts library"
  - phase: 01-foundation
    provides: "Card component, formatCents, design system tokens"

provides:
  - "SummaryStats component: four stat cards (spent, budget, remaining, status)"
  - "WeeklyPivotTable component: scrollable per-envelope weekly spending table"
  - "SavingsChart component: Recharts AreaChart with cumulative savings"
  - "AnalyticsPage orchestrator component wiring all three sections"
  - "Updated analytics route rendering client-side AnalyticsPage"

affects:
  - phase: 06-billing
    impact: "Analytics page complete -- billing phase may add cost tracking visualizations"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recharts AreaChart with CSS-variable-derived hex colors for Tailwind v4 compatibility"
    - "Responsive grid (2-col mobile, 4-col desktop) for stat cards"
    - "Scrollable table with tabular-nums for aligned currency columns"

# File tracking
key-files:
  created:
    - src/components/envelopes/SummaryStats.tsx
    - src/components/envelopes/WeeklyPivotTable.tsx
    - src/components/envelopes/SavingsChart.tsx
    - src/components/envelopes/AnalyticsPage.tsx
  modified:
    - src/app/envelopes/analytics/page.tsx
    - src/lib/envelopes/hooks.ts
    - src/lib/envelopes/firestore.ts

# Decisions
decisions:
  - id: "05-03-01"
    decision: "Literal hex values for Recharts instead of CSS variables"
    rationale: "Recharts SVG rendering may not resolve CSS custom properties correctly in Tailwind v4; hex values (#6b8e6f, #4a5568) match design tokens exactly"
  - id: "05-03-02"
    decision: "Number(value ?? 0) for Recharts Tooltip formatter"
    rationale: "Recharts v3 types define formatter value as number | undefined; defensive conversion prevents runtime errors"

# Metrics
metrics:
  duration: "4 min"
  completed: "2026-02-10"
---

# Phase 5 Plan 3: Analytics Page UI Summary

**Analytics page UI with SummaryStats cards, WeeklyPivotTable, SavingsChart (Recharts AreaChart), and AnalyticsPage orchestrator replacing placeholder route.**

## What Was Done

### Task 1: SummaryStats and WeeklyPivotTable components

**SummaryStats.tsx** -- Four stat cards in a responsive 2x2/4x1 grid using the existing Card component:
- Total Spent (primary color)
- Total Budget (primary color)
- Remaining (sage green if positive, red-700 if negative)
- Status ("On Track" in sage or "{n}/{total}" in amber)

**WeeklyPivotTable.tsx** -- Horizontally scrollable table with:
- Header row: Week | envelope titles | Total
- Body rows: per-week spending per envelope with formatCents
- Zero-spend cells rendered in muted text (text-text-secondary/50)
- Empty state message when no transaction data exists

Both components use design system tokens (clsx for conditional styles, formatCents for currency).

### Task 2: SavingsChart, AnalyticsPage, and route update

**SavingsChart.tsx** -- Recharts AreaChart showing cumulative savings over time:
- ResponsiveContainer at 300px height
- CartesianGrid, XAxis (weekLabel), YAxis (formatCents)
- Tooltip with formatted currency display
- Sage green (#6b8e6f) area fill at 15% opacity
- Empty state for no data

**AnalyticsPage.tsx** -- Client-side orchestrator component:
- Calls useAnalytics() hook for data
- Loading and error states
- Three sections: This Week (SummaryStats), Weekly Spending (WeeklyPivotTable), Savings Growth (SavingsChart)
- Section headings match existing font-display pattern

**page.tsx** -- Replaced placeholder with AnalyticsPage import. Renamed default export to AnalyticsRoute to avoid name collision with the client component. Preserved metadata export.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Recharts Tooltip formatter type error**
- **Found during:** Task 2 (build verification)
- **Issue:** Recharts v3 types define Tooltip formatter value as `number | undefined`, not `number`
- **Fix:** Changed `(value: number)` to `(value) => [formatCents(Number(value ?? 0)), "Savings"]`
- **Files modified:** SavingsChart.tsx
- **Commit:** e13fcc7

**2. [Rule 3 - Blocking] Fixed pre-existing lint issues in hooks.ts and firestore.ts**
- **Found during:** Task 2 (lint verification)
- **Issue:** Biome formatting errors (import line length in hooks.ts, string concatenation and formatting in firestore.ts) from plan 05-02
- **Fix:** Applied Biome auto-fixes (import line breaking, template literals, formatting)
- **Files modified:** src/lib/envelopes/hooks.ts, src/lib/envelopes/firestore.ts
- **Commit:** e13fcc7

## Commits

| Hash | Message |
|------|---------|
| 5015223 | feat(05-03): add SummaryStats and WeeklyPivotTable components |
| e13fcc7 | feat(05-03): add AnalyticsPage, SavingsChart, and update analytics page route |

## Verification Results

- `npm run build` -- PASS (all routes compile including /envelopes/analytics)
- `npm run lint` -- PASS (Biome clean, 190 files checked)
- `npx tsc --noEmit` -- PASS (no type errors)
- All four component files exist in src/components/envelopes/
- Analytics page.tsx imports and renders AnalyticsPage component
- No console.log or debugger statements in new files
- No hardcoded colors outside Recharts SVG (uses design system tokens throughout)
- Empty states render when data arrays are empty

## Next Phase Readiness

Phase 5 (Analytics) is now complete. All three plans delivered:
1. **05-01**: Analytics computation helpers (pure functions)
2. **05-02**: Analytics API route and useAnalytics hook
3. **05-03**: Analytics page UI (this plan)

Phase 6 (Billing) is the final phase. No blockers from analytics work.
