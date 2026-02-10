# Phase 5: Analytics - Research

**Researched:** 2026-02-10
**Domain:** Analytics dashboard, summary statistics, pivot table aggregation, savings growth visualization, charting libraries, compute-on-read data aggregation
**Confidence:** HIGH

## Summary

Phase 5 builds the analytics page at `/envelopes/analytics` with three distinct features: (1) current-week summary stats (total spent, total budget, total remaining, on-track indicator), (2) a weekly pivot table showing spending by envelope across weeks, and (3) a cumulative savings growth visualization. The analytics page is read-only -- no mutations, no forms, no modals -- making this primarily a data aggregation and display challenge.

The codebase already has strong foundations for this work. The `computeEnvelopeStatus`, `computeSavingsForWeek`, and `computeCumulativeSavingsFromData` pure functions in `firestore.ts` handle the core savings math. The `listEnvelopesWithRemaining` function already computes per-envelope spent/remaining/status for the current week. The `transactionsForUserInWeek` query helper supports fetching transactions by date range. The `getWeekRange`, `getWeekNumber`, and `formatWeekLabel` week-math utilities handle all date operations. The key new work is: (a) a server-side analytics aggregation function that computes all three data sets in a single API call, (b) a weekly pivot table UI component, and (c) a savings growth chart.

For the savings growth visualization (ANL-03), Recharts 3.7.0 is the standard choice. It officially supports React 19 via peer dependencies, integrates naturally as React components with Tailwind styling, and provides `AreaChart` / `LineChart` with minimal configuration. The alternative -- hand-rolling SVG line charts -- would save a dependency but require 150-200 lines of custom code for axes, labels, tooltips, and responsive behavior that Recharts handles out of the box. Given the project already depends on 15+ libraries and Recharts is the dominant React charting library, adding it is justified. However, there is a viable zero-dependency alternative: a CSS-based bar/progress visualization showing week-by-week savings as horizontal bars, which avoids adding any new dependency and stays consistent with the project's minimal UI style. The planner should choose between these approaches.

**Primary recommendation:** Build a single `GET /api/envelopes/analytics` endpoint that returns summary stats, pivot table data, and savings-by-week breakdown in one response. Use Recharts `AreaChart` for the savings growth visualization. Compute everything server-side from raw Firestore data (consistent with existing compute-on-read architecture). Keep the analytics page as a thin client component that fetches data via SWR and renders three sections.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | ^3.7.0 | Savings growth AreaChart/LineChart visualization | Official React 19 support (`react: ^19.0.0` peer dep). Dominant React charting library. Composable React components. SVG-based, SSR-friendly. |
| swr | 2.4.0 (installed) | Client-side data fetching for analytics endpoint | Already established pattern for all envelope data fetching |
| date-fns | 4.1.0 (installed) | Week iteration, date formatting for pivot table | Already used throughout; `addWeeks`, `startOfWeek`, `format`, `getWeek` |
| firebase-admin | 13.6.0 (installed) | Firestore queries for transaction aggregation | All server-side data operations use this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | 2.1.1 (installed) | Conditional styling for pivot table cells, status indicators | Already used in StatusBadge, Card, Button |
| react | 19.2.3 (installed) | `useState` for week range selection on analytics page | Standard React patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts AreaChart | Hand-rolled SVG line chart | Saves ~200KB dependency but requires 150-200 lines of custom code for axes, labels, tooltips, responsiveness. Higher maintenance burden. Appropriate if the project has a strict zero-new-dependency policy. |
| Recharts AreaChart | CSS horizontal bars (no library) | Zero dependencies. Each week's savings rendered as a styled `<div>` with width proportional to savings amount. Simpler but less visually impressive. Good fallback if Recharts proves problematic. |
| Recharts AreaChart | Chart.js via react-chartjs-2 (5.3.1) | Also supports React 19. Canvas-based (not SVG), which means no SSR and harder Tailwind integration. Chart.js is imperative; Recharts is declarative/composable. Recharts is more idiomatic React. |
| Single analytics API endpoint | Separate endpoints per section | Three endpoints would mean three SWR hooks and three round-trips. Since all three sections need overlapping data (envelopes + transactions across weeks), a single endpoint avoids redundant Firestore queries and reduces client complexity. |
| Server-side aggregation | Client-side aggregation (fetch raw transactions) | Sending all historical transactions to the client would expose data unnecessarily and grow linearly with usage. Server-side aggregation returns only the computed summaries (~5-20KB regardless of transaction volume). |

**Installation:**
```bash
# In personal-brand repo only (UI lives there)
npm install recharts
```

Note: Recharts 3.x requires `react-is` as a peer dependency. React 19 ships its own `react-is`, so this should resolve automatically. If not, `npm install react-is` explicitly.

## Architecture Patterns

### Recommended Project Structure

**personal-brand repo (UI + API routes):**
```
src/
├── app/
│   ├── api/
│   │   └── envelopes/
│   │       └── analytics/
│   │           └── route.ts              # NEW: GET analytics data
│   └── envelopes/
│       └── analytics/
│           └── page.tsx                  # MODIFY: replace placeholder with AnalyticsPage component
├── components/
│   └── envelopes/
│       ├── AnalyticsPage.tsx             # NEW: main analytics client component
│       ├── SummaryStats.tsx              # NEW: current-week summary cards
│       ├── WeeklyPivotTable.tsx          # NEW: spending by envelope per week
│       └── SavingsChart.tsx              # NEW: cumulative savings growth chart (Recharts)
├── lib/
│   └── envelopes/
│       ├── types.ts                      # MODIFY: add AnalyticsPageData type
│       ├── firestore.ts                  # MODIFY: add getAnalyticsData function
│       └── hooks.ts                      # MODIFY: add useAnalytics hook
```

**dave-ramsey repo (shared utilities):**
```
src/
└── lib/
    └── envelopes/
        ├── firestore.ts                  # MODIFY: add getAnalyticsData, computeWeeklySavingsBreakdown
        ├── types.ts                      # MODIFY: add analytics response types
        └── __tests__/
            └── firestore.test.ts         # MODIFY: add tests for new computation helpers
```

### Pattern 1: Single Analytics Endpoint with Parallel Firestore Queries

**What:** One API endpoint that computes all analytics data server-side by fetching envelopes and all historical transactions in parallel, then aggregating into three result sections.

**When to use:** Always for the analytics page -- avoid multiple round-trips for overlapping data.

**Example:**
```typescript
// GET /api/envelopes/analytics
export async function getAnalyticsData(userId: string): Promise<AnalyticsPageData> {
  const today = new Date();
  const { start, end } = getWeekRange(today);
  const weekStartStr = format(start, "yyyy-MM-dd");
  const weekEndStr = format(end, "yyyy-MM-dd");

  // Parallel fetch: envelopes + current-week transactions + all historical transactions
  const [envSnap, currentTxSnap, allTxSnap] = await Promise.all([
    envelopesForUser(userId).get(),
    transactionsForUserInWeek(userId, weekStartStr, weekEndStr).get(),
    transactionsCol().where("userId", "==", userId).get(),
  ]);

  // Compute summary stats from current-week data
  // Compute pivot table from all transactions grouped by week + envelope
  // Compute savings breakdown from all transactions using existing helpers

  return { summary, pivotTable, savingsBreakdown };
}
```

### Pattern 2: Pivot Table Data Structure

**What:** Server returns a flat, serializable structure that the client renders as a table with weeks as rows and envelopes as columns.

**When to use:** For ANL-02 weekly pivot table.

**Example:**
```typescript
// Response type -- flat and serializable (no Maps)
type PivotRow = {
  weekStart: string;        // "2026-01-05" (YYYY-MM-DD)
  weekLabel: string;        // "Week 2: 1/5/2026 - 1/11/2026"
  cells: Record<string, number>;  // envelopeId -> sum of transaction amounts in cents
  totalCents: number;       // sum across all envelopes for this week
};

type AnalyticsPageData = {
  summary: {
    totalSpentCents: number;
    totalBudgetCents: number;
    totalRemainingCents: number;
    onTrackCount: number;
    totalEnvelopeCount: number;
  };
  envelopes: { id: string; title: string }[];  // column headers
  pivotRows: PivotRow[];                        // rows, newest week first
  savingsByWeek: {
    weekStart: string;
    weekLabel: string;
    savingsCents: number;
    cumulativeCents: number;
  }[];
};
```

### Pattern 3: Recharts AreaChart for Savings Growth

**What:** Use Recharts `AreaChart` with a `monotone` curve to show cumulative savings over time.

**When to use:** For ANL-03 savings tracker visualization.

**Example:**
```typescript
"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "@/lib/envelopes/format";

type SavingsChartProps = {
  data: { weekLabel: string; cumulativeCents: number }[];
};

export function SavingsChart({ data }: SavingsChartProps) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
        />
        <YAxis
          tickFormatter={(v) => formatCents(v)}
          tick={{ fontSize: 12, fill: "var(--color-text-secondary)" }}
        />
        <Tooltip
          formatter={(value: number) => [formatCents(value), "Savings"]}
        />
        <Area
          type="monotone"
          dataKey="cumulativeCents"
          stroke="var(--color-sage)"
          fill="var(--color-sage)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

### Pattern 4: CSS-Only Savings Visualization (Zero-Dependency Alternative)

**What:** If Recharts is rejected, render savings as horizontal progress bars with Tailwind.

**When to use:** Alternative to Recharts if zero new dependencies is preferred.

**Example:**
```typescript
function SavingsBar({ weekLabel, savingsCents, maxCents }: {
  weekLabel: string;
  savingsCents: number;
  maxCents: number;
}) {
  const widthPct = maxCents > 0 ? (savingsCents / maxCents) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-text-secondary truncate">{weekLabel}</span>
      <div className="flex-1 h-5 bg-sage/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-sage/60 rounded-full transition-all"
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="w-16 text-xs text-right font-medium text-sage">
        {formatCents(savingsCents)}
      </span>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Client-side aggregation of raw transactions:** Do not send all historical transactions to the client for aggregation. This leaks data volume information and grows unbounded. Always aggregate server-side.
- **Separate API calls per section:** Do not create `/api/envelopes/analytics/summary`, `/api/envelopes/analytics/pivot`, and `/api/envelopes/analytics/savings` as separate endpoints. The underlying Firestore queries overlap heavily -- a single endpoint avoids redundant reads and billing.
- **Re-querying data that `computeCumulativeSavings` already knows how to fetch:** The analytics endpoint needs the same envelope + transaction data that the existing savings computation uses. Extend the existing pure helpers rather than writing new Firestore queries.
- **Denormalized aggregation documents:** Do not create pre-computed weekly summary documents in Firestore. The data set is small (personal budgeting = ~5-20 envelopes, ~10-50 transactions/week), and compute-on-read is an established project decision.
- **Dynamic Recharts imports without "use client":** Recharts components use browser APIs (SVG, DOM). They must be in a client component. The chart component file must have `"use client"` at the top.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Savings growth chart with axes, labels, tooltips | Custom SVG path generation with manual axis calculation | Recharts `AreaChart` / `LineChart` | Recharts handles responsive container, axis labels, tick formatting, tooltips, gradients, and accessibility. Custom SVG is 150-200 lines for equivalent functionality. |
| Week iteration from earliest to current | Manual date arithmetic with `new Date()` | `addWeeks` from date-fns + existing `getWeekRange` | Already established in `computeCumulativeSavingsFromData`. Reuse the same iteration pattern. |
| Currency formatting in chart tooltips | Inline `(v / 100).toFixed(2)` in tooltip formatters | Existing `formatCents()` utility | Single source of truth for dollar formatting. Already imported across components. |
| Responsive chart container | CSS `width: 100%` on `<svg>` with manual resize listeners | Recharts `ResponsiveContainer` | Handles resize observation, debouncing, and proper SVG viewBox management. |

**Key insight:** The analytics phase is primarily about aggregation and display, not new data models or mutations. The computation helpers already exist for savings. The pivot table is a new grouping of existing data. The summary stats are a subset of what `listEnvelopesWithRemaining` already computes. Resist the urge to build new infrastructure -- extend what exists.

## Common Pitfalls

### Pitfall 1: N+1 Firestore Queries in Week Iteration

**What goes wrong:** Iterating over weeks and querying transactions per-week creates O(W) Firestore reads where W is the number of historical weeks.
**Why it happens:** The `computeCumulativeSavingsFromData` pure function takes pre-fetched data, but the `computeCumulativeSavings` Firestore function fetches all transactions in one query. When building the pivot table, developers might fetch transactions week-by-week instead of fetching all and grouping client-side (server-side, within the API route).
**How to avoid:** Fetch ALL transactions for the user in a single query, then group by week in-memory. Firestore reads are billed per document, not per query, so one large query costs the same as many small ones but with much lower latency.
**Warning signs:** Multiple `transactionsForUserInWeek` calls in a loop inside the analytics function.

### Pitfall 2: Serialization of Firestore Timestamps in API Response

**What goes wrong:** The analytics response includes Firestore `Timestamp` objects that don't serialize to JSON cleanly.
**Why it happens:** Envelope documents have `createdAt` as a Firestore `Timestamp`. If envelope data is included in the analytics response without conversion, `JSON.stringify` produces `{"_seconds":...,"_nanoseconds":...}` instead of a usable date string.
**How to avoid:** Convert all Timestamps to strings (YYYY-MM-DD) during server-side aggregation, before returning the response. The existing `computeCumulativeSavings` function already does this pattern: `format(createdAt, "yyyy-MM-dd")`.
**Warning signs:** `_seconds` appearing in API response JSON.

### Pitfall 3: Recharts Hydration Mismatch in Next.js

**What goes wrong:** Recharts components use browser APIs for layout measurement. If rendered during SSR, the initial server HTML won't match the client hydration.
**Why it happens:** Next.js App Router server components render on the server by default. Recharts needs the DOM.
**How to avoid:** Ensure the chart component file has `"use client"` directive. The analytics page itself (`page.tsx`) can remain a server component that renders an `<AnalyticsPage />` client component. The chart is nested inside the client component tree.
**Warning signs:** "Text content does not match" hydration warnings. Chart rendering as empty on first load.

### Pitfall 4: Empty State When No Historical Data Exists

**What goes wrong:** The pivot table and savings chart render empty/broken when a user has no past weeks (brand new user or first week of usage).
**Why it happens:** The analytics endpoint returns empty arrays for `pivotRows` and `savingsByWeek`, but the chart component might try to render axes and labels on empty data.
**How to avoid:** Always check for empty data before rendering chart/table. Show a meaningful empty state message like "Analytics will appear after your first complete week." Both the summary stats component and the chart component need explicit empty state handling.
**Warning signs:** Chart component crashing or showing empty axes with no data points.

### Pitfall 5: Inconsistent Savings Computation Between Home Page and Analytics

**What goes wrong:** The savings total on the analytics page differs from the savings banner on the home page.
**Why it happens:** The analytics endpoint computes savings independently from `computeCumulativeSavings` (used by home page), and if the logic diverges, numbers won't match.
**How to avoid:** Reuse the same `computeSavingsForWeek` and `computeCumulativeSavingsFromData` pure helpers for both analytics savings computation and home page savings. The analytics endpoint should return both per-week and cumulative totals, with the cumulative total guaranteed to match the home page value. Write a test that verifies the analytics cumulative total equals the sum of per-week savings.
**Warning signs:** Users noticing different savings numbers on different pages.

### Pitfall 6: Overage Allocations Not Accounted For in Pivot Table

**What goes wrong:** The pivot table shows raw transaction amounts per envelope without considering overage allocations, making spending appear different from what envelope cards show.
**Why it happens:** The pivot table aggregates `envelope_transactions` by `envelopeId`, but when a user reallocated from envelope A to cover envelope B's overage, the allocation is stored in a separate `envelope_allocations` collection.
**How to avoid:** For the MVP pivot table, display raw transaction spending (not net-of-allocations). This is actually correct for "how much did I spend per envelope per week" -- allocations are a budgeting mechanism, not a spending correction. The pivot table answers "where did my money go" while allocations answer "how did I budget for it." Document this design choice explicitly. If desired later, an "Allocations" column could be added.
**Warning signs:** Confusion about why pivot table totals differ from envelope card "remaining" values.

## Code Examples

### Analytics Data Computation (Server-Side Pure Function)

```typescript
// Extend firestore.ts with a new pure computation function
// Source: adaptation of existing computeCumulativeSavingsFromData pattern

type WeeklySavingsEntry = {
  weekStart: string;
  weekLabel: string;
  savingsCents: number;
  cumulativeCents: number;
};

export function computeWeeklySavingsBreakdown(
  envelopes: SavingsEnvelope[],
  transactions: { envelopeId: string; amountCents: number; date: string }[],
  earliestWeekStart: string,
  currentWeekStart: string,
): WeeklySavingsEntry[] {
  if (envelopes.length === 0) return [];

  const entries: WeeklySavingsEntry[] = [];
  let cumulativeTotal = 0;
  let weekStart = earliestWeekStart;

  while (weekStart < currentWeekStart) {
    const weekStartDate = new Date(`${weekStart}T00:00:00`);
    const nextWeekDate = addWeeks(weekStartDate, 1);
    const weekEnd = format(
      new Date(nextWeekDate.getTime() - 86_400_000),
      "yyyy-MM-dd",
    );

    const weekTransactions = transactions.filter(
      (t) => t.date >= weekStart && t.date <= weekEnd,
    );

    const weekSavings = computeSavingsForWeek(
      envelopes,
      weekTransactions,
      weekStart,
      weekEnd,
    );

    cumulativeTotal += weekSavings;
    const weekNum = getWeekNumber(weekStartDate);

    entries.push({
      weekStart,
      weekLabel: `Wk ${weekNum}`,
      savingsCents: weekSavings,
      cumulativeCents: cumulativeTotal,
    });

    weekStart = format(nextWeekDate, "yyyy-MM-dd");
  }

  return entries;
}
```

### Pivot Table Data Grouping

```typescript
// Pure function: group transactions into pivot rows
type PivotRow = {
  weekStart: string;
  weekLabel: string;
  cells: Record<string, number>;  // envelopeId -> amountCents
  totalCents: number;
};

export function buildPivotRows(
  transactions: { envelopeId: string; amountCents: number; date: string }[],
  earliestWeekStart: string,
  currentWeekEnd: string,
): PivotRow[] {
  const rows: PivotRow[] = [];
  let weekStart = earliestWeekStart;

  while (weekStart <= currentWeekEnd) {
    const weekStartDate = new Date(`${weekStart}T00:00:00`);
    const nextWeekDate = addWeeks(weekStartDate, 1);
    const weekEnd = format(
      new Date(nextWeekDate.getTime() - 86_400_000),
      "yyyy-MM-dd",
    );

    const weekTxns = transactions.filter(
      (t) => t.date >= weekStart && t.date <= weekEnd,
    );

    if (weekTxns.length > 0 || weekStart <= currentWeekEnd) {
      const cells: Record<string, number> = {};
      let totalCents = 0;

      for (const txn of weekTxns) {
        cells[txn.envelopeId] = (cells[txn.envelopeId] ?? 0) + txn.amountCents;
        totalCents += txn.amountCents;
      }

      const weekNum = getWeekNumber(weekStartDate);
      rows.push({
        weekStart,
        weekLabel: `Wk ${weekNum}`,
        cells,
        totalCents,
      });
    }

    weekStart = format(nextWeekDate, "yyyy-MM-dd");
  }

  return rows.reverse(); // newest first
}
```

### SWR Hook for Analytics

```typescript
// hooks.ts addition
export function useAnalytics() {
  const { user } = useAuth();

  const { data, error, isLoading } = useSWR<AnalyticsPageData>(
    user ? "/api/envelopes/analytics" : null,
    async (url: string) => {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return envelopeFetch<AnalyticsPageData>(url, token);
    },
  );

  return { data, error, isLoading };
}
```

### Summary Stats Component

```typescript
"use client";

import { Card } from "@/components/ui/Card";
import { formatCents } from "@/lib/envelopes/format";

type SummaryStatsProps = {
  totalSpentCents: number;
  totalBudgetCents: number;
  totalRemainingCents: number;
  onTrackCount: number;
  totalEnvelopeCount: number;
};

export function SummaryStats({
  totalSpentCents,
  totalBudgetCents,
  totalRemainingCents,
  onTrackCount,
  totalEnvelopeCount,
}: SummaryStatsProps) {
  const isOnTrack = onTrackCount === totalEnvelopeCount && totalEnvelopeCount > 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card variant="default" className="text-center">
        <p className="text-xs text-text-secondary">Total Spent</p>
        <p className="text-lg font-semibold text-primary font-display">
          {formatCents(totalSpentCents)}
        </p>
      </Card>
      <Card variant="default" className="text-center">
        <p className="text-xs text-text-secondary">Total Budget</p>
        <p className="text-lg font-semibold text-primary font-display">
          {formatCents(totalBudgetCents)}
        </p>
      </Card>
      <Card variant="default" className="text-center">
        <p className="text-xs text-text-secondary">Remaining</p>
        <p className={clsx(
          "text-lg font-semibold font-display",
          totalRemainingCents >= 0 ? "text-sage" : "text-red-700"
        )}>
          {formatCents(totalRemainingCents)}
        </p>
      </Card>
      <Card variant="default" className="text-center">
        <p className="text-xs text-text-secondary">Status</p>
        <p className={clsx(
          "text-lg font-semibold font-display",
          isOnTrack ? "text-sage" : "text-amber"
        )}>
          {isOnTrack ? "On Track" : `${onTrackCount}/${totalEnvelopeCount}`}
        </p>
      </Card>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 2.x (React 16-18 only) | Recharts 3.x (React 16-19 support, redux-based state) | Recharts 3.0 (2025) | Clean React 19 peer dep support. No more `react-is` workaround needed. |
| Canvas-based charts (Chart.js) | SVG-based charts (Recharts) for React apps | Ongoing trend | SVG integrates with React's component model, supports CSS variables, better for SSR-compatible rendering |
| Firestore aggregation queries (`count()`, `sum()`, `average()`) | Still limited to count/sum/average on single fields | GA since Firebase 10.5 | NOT usable for pivot tables (need group-by which Firestore doesn't support). Compute-on-read remains correct. |

**Deprecated/outdated:**
- Recharts 2.x: Still works but 3.x is the active version with React 19 support built in
- Firestore `collectionGroup` for cross-collection queries: Not relevant here since all data is in flat top-level collections with `userId` filtering

## Open Questions

1. **Recharts bundle size impact**
   - What we know: Recharts 3.x depends on `@reduxjs/toolkit`, `react-redux`, `immer`, `victory-vendor`, and several other packages. This is a non-trivial addition to the bundle.
   - What's unclear: The actual impact on the personal-brand app's build size after tree-shaking. Recharts supports tree-shaking but the Redux dependency is heavy.
   - Recommendation: Install Recharts and check the build output. If the bundle increase is unacceptable (>100KB gzipped added), fall back to the CSS-only bar visualization alternative documented above. The analytics page is a single route, so the cost is only paid when that page is loaded (automatic code splitting in Next.js).

2. **Pivot table performance with many weeks of data**
   - What we know: A user active for 1 year would have ~52 weeks of data. The pivot table with 52 rows x 20 envelopes = 1040 cells. The Firestore query fetches all historical transactions in one read.
   - What's unclear: At what point does the analytics page become slow? Likely >2 years / >5000 transactions.
   - Recommendation: For MVP, fetch all data and render all rows. Add pagination (show last N weeks) only if users report slowness. Firestore query cost scales with document count, not time range, so the bottleneck is client rendering, not data fetching.

3. **Whether allocations should appear in pivot table**
   - What we know: Pivot table shows "sum of transactions per envelope per week." Overage allocations are separate from transactions. The home page shows remaining = budget - spent + received - donated.
   - What's unclear: Should the pivot table show raw spending (transaction amounts) or adjusted spending (net of allocations)?
   - Recommendation: Show raw transaction spending. The pivot table answers "where did money go" not "how was it budgeted." This matches the requirement text ("values: sum of transactions per envelope per week"). Document this clearly in the UI.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `/Users/dweinbeck/Documents/dave-ramsey/src/lib/envelopes/firestore.ts` -- existing computation helpers (`computeSavingsForWeek`, `computeCumulativeSavingsFromData`, `computeEnvelopeStatus`)
- Codebase analysis: `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/firestore.ts` -- copied helpers and Firestore operations
- Codebase analysis: `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/hooks.ts` -- existing SWR patterns
- npm registry: `recharts@3.7.0` peer dependencies confirm React 19 support (`react: ^19.0.0`)
- npm registry: `react-chartjs-2@5.3.1` peer dependencies confirm React 19 support

### Secondary (MEDIUM confidence)
- [Recharts GitHub releases](https://github.com/recharts/recharts/releases) -- version 3.7.0 is latest stable
- [react-chartjs-2 React 19 support issue](https://github.com/reactchartjs/react-chartjs-2/issues/1235) -- version 5.3.0+ supports React 19
- [Next.js + Recharts integration guide](https://app-generator.dev/docs/technologies/nextjs/integrate-recharts.html) -- confirms "use client" requirement

### Tertiary (LOW confidence)
- Web search for "recharts bundle size" -- results vary, no authoritative measurement for 3.x. Recommendation to validate with actual build.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Recharts 3.7.0 confirmed React 19 support via npm peer deps. All other libraries already installed.
- Architecture: HIGH -- Follows established patterns (single API endpoint, SWR hook, client components) with proven computation helpers.
- Pitfalls: HIGH -- Identified from codebase analysis (Timestamp serialization, savings consistency) and known Next.js/React patterns (hydration, empty states).
- Visualization choice: MEDIUM -- Recharts is the standard choice but bundle size impact is unverified. CSS fallback documented.

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable domain, slow-moving ecosystem)
