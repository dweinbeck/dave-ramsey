# Milestone v1: Digital Envelopes MVP

**Status:** SHIPPED 2026-02-10
**Phases:** 1-6
**Total Plans:** 18

## Overview

Digital Envelopes is a weekly envelope budgeting mini-app embedded in dan-weinbeck.com. The roadmap progressed from foundational infrastructure (routing, week math, data isolation) through core object management (envelopes), core actions (transactions), the signature complex workflow (overage reallocation), read-only views (analytics), and finally monetization gating (billing). Each phase delivered a coherent, verifiable capability that built on the previous.

## Phases

### Phase 1: Foundation

**Goal**: Users can navigate to `/envelopes` routes inside the existing site shell with working sub-navigation, and all backend infrastructure for week math, data isolation, and cents-based storage is established
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-07
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Routing shell, sub-navigation, placeholder pages, main nav link
- [x] 01-02-PLAN.md — Week math utilities (TDD: getWeekRange, getRemainingDaysPercent, getStatusLabel, formatWeekLabel)
- [x] 01-03-PLAN.md — Zod types, Firestore collection helpers, formatCents utility

**Completed:** 2026-02-10

### Phase 2: Envelope Management

**Goal**: Users can create, edit, delete, and reorder envelopes with weekly budgets, see them as styled cards on the home page with a personalized greeting, and track cumulative savings
**Depends on**: Phase 1
**Requirements**: ENV-01, ENV-02, ENV-03, ENV-04, ENV-05, ENV-06, HOME-01, HOME-02, HOME-03, HOME-04
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Envelope CRUD functions + savings computation (TDD, dave-ramsey repo)
- [x] 02-02-PLAN.md — API routes, client-side Firestore helpers, SWR hooks (personal-brand repo)
- [x] 02-03-PLAN.md — Home page UI: greeting, envelope cards, create/edit/delete, reorder, savings (personal-brand repo)

**Completed:** 2026-02-10

### Phase 3: Transactions

**Goal**: Users can record, edit, and delete transactions from both the home page inline form and the dedicated transactions page, with week-based filtering and immediate balance updates
**Depends on**: Phase 2
**Requirements**: TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, HOME-05
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — getWeekNumber utility + transactionUpdateSchema + TransactionsPageData type (TDD, dave-ramsey repo)
- [x] 03-02-PLAN.md — Transaction CRUD functions, API routes, useTransactions SWR hook (both repos)
- [x] 03-03-PLAN.md — Transactions page UI + inline home page transaction form (personal-brand repo)

**Completed:** 2026-02-10

### Phase 4: Overage Reallocation

**Goal**: When a transaction causes an envelope to go negative, users are guided through a reallocation workflow to cover the overage from other envelopes, with full validation and atomic persistence
**Depends on**: Phase 3
**Requirements**: INFRA-06, OVR-01, OVR-02, OVR-03, OVR-04, OVR-05
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — Allocation validation schemas + validateAllocations + extended balance computation (TDD, dave-ramsey repo)
- [x] 04-02-PLAN.md — Firestore allocation CRUD, cascading deleteTransaction, allocation API route, reusable Modal component (both repos)
- [x] 04-03-PLAN.md — OverageModal + DonorAllocationRow components, overage detection in EnvelopesHomePage + TransactionsPage (personal-brand repo)

**Completed:** 2026-02-10

### Phase 5: Analytics

**Goal**: Users can view summary stats and a weekly breakdown of their spending across all envelopes, plus track cumulative savings growth over time
**Depends on**: Phase 3
**Requirements**: ANL-01, ANL-02, ANL-03
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Analytics computation helpers + types (TDD, dave-ramsey repo)
- [x] 05-02-PLAN.md — Analytics API route, getAnalyticsData, useAnalytics hook, install Recharts (personal-brand repo)
- [x] 05-03-PLAN.md — Analytics page UI: SummaryStats, WeeklyPivotTable, SavingsChart, AnalyticsPage (personal-brand repo)

**Completed:** 2026-02-10

### Phase 6: Billing Integration

**Goal**: The app monetizes through the existing credits system with a free trial week, weekly charging on first access, and graceful read-only degradation for unpaid weeks
**Depends on**: Phase 2
**Requirements**: BILL-01, BILL-02, BILL-03
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — Billing module (checkEnvelopeAccess), types, tool pricing activation (personal-brand repo)
- [x] 06-02-PLAN.md — API route billing gates (8 mutations + 3 GET responses) (personal-brand repo)
- [x] 06-03-PLAN.md — UI read-only mode: ReadOnlyBanner + disable mutations in all pages (personal-brand repo)

**Completed:** 2026-02-10

---

## Milestone Summary

**Decimal Phases:** None (no urgent insertions needed)

**Key Decisions:**
- AuthGuard (not AdminGuard) for envelopes — all authenticated users
- date-fns v4 with weekStartsOn:0 via WEEK_OPTIONS constant
- Zod import from "zod/v4" (repo convention)
- Pure computation helpers extracted for testability without Firestore mocks
- Compute-on-read for envelope balances (no denormalized remaining field)
- Copied dave-ramsey utilities into personal-brand (self-contained, not cross-repo import)
- Native HTML dialog element for Modal (built-in focus trap and Escape handling)
- Map-based allocation state for O(1) lookups in OverageModal
- Recharts with literal hex values (Tailwind v4 CSS variable compatibility)
- Billing check placed inside try block before body parsing
- GET endpoints run billing check in parallel with data fetch via Promise.all

**Issues Resolved:** None — all phases executed cleanly with minimal deviations

**Issues Deferred:** None

**Technical Debt Incurred:** None identified in verification reports

---

*For current project status, see .planning/PROJECT.md*
