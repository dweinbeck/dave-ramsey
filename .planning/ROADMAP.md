# Roadmap: Digital Envelopes

## Overview

Digital Envelopes is a weekly envelope budgeting mini-app embedded in dan-weinbeck.com. The roadmap progresses from foundational infrastructure (routing, week math, data isolation) through core object management (envelopes), core actions (transactions), the signature complex workflow (overage reallocation), read-only views (analytics), and finally monetization gating (billing). Each phase delivers a coherent, verifiable capability that builds on the previous.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Routes, sub-nav, week math, data isolation, and privacy infrastructure
- [x] **Phase 2: Envelope Management** - Envelope CRUD, home page cards, greeting, savings tracking
- [ ] **Phase 3: Transactions** - Transaction CRUD from both entry points, week selector, transaction list
- [ ] **Phase 4: Overage Reallocation** - Modal component, overage detection, donor allocation, cascading cleanup
- [ ] **Phase 5: Analytics** - Summary stats, weekly pivot table, savings visualization
- [ ] **Phase 6: Billing Integration** - Free week, weekly credit charging, read-only enforcement

## Phase Details

### Phase 1: Foundation
**Goal**: Users can navigate to `/envelopes` routes inside the existing site shell with working sub-navigation, and all backend infrastructure for week math, data isolation, and cents-based storage is established
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-07
**Success Criteria** (what must be TRUE):
  1. User navigates to `/envelopes`, `/envelopes/transactions`, and `/envelopes/analytics` and sees pages rendered inside the existing site shell with matching layout
  2. Sub-navigation tabs (Home / Transactions / Analytics) are visible on all envelope pages with the active tab highlighted
  3. Week math utilities correctly compute week ranges starting Sunday, remaining-days percentage, and status labels for any given date
  4. Every API route enforces per-user data isolation server-side (userId derived from session, never accepted from client) and all monetary values use integer cents
  5. No merchant or description data appears in server logs, and no third-party analytics scripts load on envelope pages
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Routing shell, sub-navigation, placeholder pages, main nav link
- [x] 01-02-PLAN.md — Week math utilities (TDD: getWeekRange, getRemainingDaysPercent, getStatusLabel, formatWeekLabel)
- [x] 01-03-PLAN.md — Zod types, Firestore collection helpers, formatCents utility

### Phase 2: Envelope Management
**Goal**: Users can create, edit, delete, and reorder envelopes with weekly budgets, see them as styled cards on the home page with a personalized greeting, and track cumulative savings
**Depends on**: Phase 1
**Requirements**: ENV-01, ENV-02, ENV-03, ENV-04, ENV-05, ENV-06, HOME-01, HOME-02, HOME-03, HOME-04
**Success Criteria** (what must be TRUE):
  1. User can create an envelope with a title and weekly budget, and it appears as a styled card on the home page matching the site's Card component
  2. User can edit an envelope's title and weekly budget, and can delete an envelope (with cascading cleanup of related data)
  3. User can reorder envelopes and set per-envelope rollover policy (carry surplus vs reset), and these settings persist across sessions
  4. Home page displays a greeting banner ("Hi {name}! Today is {weekday}...") with an overall on-track indicator aggregated across all envelopes
  5. Cumulative savings total (unspent budget accumulated across weeks) is displayed prominently on the home page
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Envelope CRUD functions + savings computation (TDD, dave-ramsey repo)
- [x] 02-02-PLAN.md — API routes, client-side Firestore helpers, SWR hooks (personal-brand repo)
- [x] 02-03-PLAN.md — Home page UI: greeting, envelope cards, create/edit/delete, reorder, savings (personal-brand repo)

### Phase 3: Transactions
**Goal**: Users can record, edit, and delete transactions from both the home page inline form and the dedicated transactions page, with week-based filtering and immediate balance updates
**Depends on**: Phase 2
**Requirements**: TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, HOME-05
**Success Criteria** (what must be TRUE):
  1. User can create a transaction from the Transactions page with Date, Cost, Envelope (dropdown), Merchant, and Description fields, and the envelope's remaining balance updates immediately
  2. User can expand an envelope card on the home page to reveal an inline transaction form (Date, Cost, Merchant, Description) and submit a transaction that updates the card's remaining balance
  3. User can edit any transaction's fields (amount, date, envelope, merchant, description) and the affected envelope balances recompute correctly
  4. User can delete a transaction with immediate UI update and server-side auth verification, and the envelope's remaining balance recomputes
  5. Transactions page has a week selector ("Week N: M/D/YYYY - M/D/YYYY") that filters the transaction list to the selected week, showing all fields with delete action
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — getWeekNumber utility + transactionUpdateSchema + TransactionsPageData type (TDD, dave-ramsey repo)
- [ ] 03-02-PLAN.md — Transaction CRUD functions, API routes, useTransactions SWR hook (both repos)
- [ ] 03-03-PLAN.md — Transactions page UI + inline home page transaction form (personal-brand repo)

### Phase 4: Overage Reallocation
**Goal**: When a transaction causes an envelope to go negative, users are guided through a reallocation workflow to cover the overage from other envelopes, with full validation and atomic persistence
**Depends on**: Phase 3
**Requirements**: INFRA-06, OVR-01, OVR-02, OVR-03, OVR-04, OVR-05
**Success Criteria** (what must be TRUE):
  1. When a transaction causes an envelope's remaining balance to go negative, an overage modal opens automatically showing the overage amount and donor envelopes with their remaining budgets
  2. User can allocate amounts from donor envelopes in the modal, with inline validation: each donor allocation cannot exceed that donor's remaining balance, and total allocations must equal the overage exactly
  3. Overage allocations are persisted atomically (transaction + allocations written together) with server-side validation of all constraints, and linked to the source transaction for traceability
  4. Deleting a transaction that triggered overage allocations cascades to remove linked allocation records, restoring donor envelope balances correctly
  5. The reusable Modal component works correctly for the overage workflow and is available for future use across the app
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: Analytics
**Goal**: Users can view summary stats and a weekly breakdown of their spending across all envelopes, plus track cumulative savings growth over time
**Depends on**: Phase 3
**Requirements**: ANL-01, ANL-02, ANL-03
**Success Criteria** (what must be TRUE):
  1. Analytics page displays current-week summary stats: total spent, total budget, total remaining, and an on-track indicator
  2. Weekly pivot table shows rows for each week, columns for each envelope, with cell values being the sum of transactions per envelope per week
  3. Savings tracker displays the cumulative savings total with a week-over-week growth visualization
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Billing Integration
**Goal**: The app monetizes through the existing credits system with a free trial week, weekly charging on first access, and graceful read-only degradation for unpaid weeks
**Depends on**: Phase 2
**Requirements**: BILL-01, BILL-02, BILL-03
**Success Criteria** (what must be TRUE):
  1. User's first week of using Digital Envelopes is completely free with no credit charge
  2. After the free week, 100 credits are charged on the user's first access each subsequent week (idempotent -- revisiting the same week does not re-charge)
  3. When a user has not paid for the current week (after free week expires), they can view all past data but cannot add, edit, or delete envelopes or transactions (read-only mode with clear visual indication)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6
Note: Phase 5 (Analytics) and Phase 6 (Billing) both depend on earlier phases but are independent of each other. They could execute in either order.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-10 |
| 2. Envelope Management | 3/3 | Complete | 2026-02-10 |
| 3. Transactions | 0/3 | Not started | - |
| 4. Overage Reallocation | 0/3 | Not started | - |
| 5. Analytics | 0/2 | Not started | - |
| 6. Billing Integration | 0/2 | Not started | - |
