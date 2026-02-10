# Requirements: Digital Envelopes

**Defined:** 2026-02-10
**Core Value:** Users can see exactly how much they have left in each spending category this week and reallocate when they overspend

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Routes `/envelopes`, `/envelopes/transactions`, `/envelopes/analytics` render inside site shell with matching layout
- [ ] **INFRA-02**: Sub-navigation tabs (Home / Transactions / Analytics) with active state highlighting
- [ ] **INFRA-03**: Week math utilities: `getWeekRange(date)`, `getRemainingDaysPercent(today)`, `getStatusLabel(remaining, budget, remainingDaysPercent)` — single source of truth, week starts Sunday
- [ ] **INFRA-04**: Per-user data isolation enforced server-side on every read/write (userId derived from session, never accepted from client)
- [ ] **INFRA-05**: All monetary values stored as integer cents to avoid floating-point errors
- [ ] **INFRA-06**: Reusable Modal component for overage workflow (none exists in host repo)
- [ ] **INFRA-07**: No logging of merchant/description payloads; no third-party analytics scripts on these pages

### Envelopes

- [ ] **ENV-01**: User can create an envelope with title and weekly budget amount
- [ ] **ENV-02**: User can edit an envelope's title and weekly budget
- [ ] **ENV-03**: User can delete an envelope with cascading cleanup of related transactions and overage allocations
- [ ] **ENV-04**: User can set per-envelope rollover policy (carry surplus forward vs reset to budget each week)
- [ ] **ENV-05**: User can reorder envelopes (sort order persists across sessions)
- [ ] **ENV-06**: At end of each week, unspent budget across all envelopes accumulates into a cumulative "Savings" total

### Home Page

- [ ] **HOME-01**: Greeting banner: "Hi {name}! Today is {weekday}..." with on-track/spending summary
- [ ] **HOME-02**: Envelope cards matching site's Card component style: title, weekly budget, remaining, status label
- [ ] **HOME-03**: Overall on-track indicator aggregated across all envelopes for the current week
- [ ] **HOME-04**: Cumulative savings total displayed prominently on home page
- [ ] **HOME-05**: Inline transaction form: expand envelope card to full row width with Date, Cost, Merchant, Description fields

### Transactions

- [ ] **TXN-01**: User can create transactions from Transactions page with fields: Date, Cost, Envelope (dropdown), Merchant, Description
- [ ] **TXN-02**: User can create transactions from inline card form on Home page
- [ ] **TXN-03**: User can delete transactions with server-side auth verification and immediate balance recomputation
- [ ] **TXN-04**: User can edit transactions (amount, date, envelope, merchant, description) after creation
- [ ] **TXN-05**: Week selector dropdown on Transactions page displaying "Week N: M/D/YYYY - M/D/YYYY"
- [ ] **TXN-06**: Transaction list for selected week displays all fields with delete action

### Overage

- [ ] **OVR-01**: When a transaction causes an envelope's remaining balance to go negative, overage modal opens automatically
- [ ] **OVR-02**: Modal lists other envelopes with their remaining budgets; user allocates amounts from donor envelopes
- [ ] **OVR-03**: Validation enforced: each donor allocation <= donor remaining, total allocations must equal overage exactly
- [ ] **OVR-04**: Overage allocations persisted as records linked to the source transaction for cascading cleanup
- [ ] **OVR-05**: Server validates all overage constraints; client shows inline errors until allocation is valid

### Analytics

- [ ] **ANL-01**: Summary stats for current week: total spent, total budget, total remaining, on-track indicator
- [ ] **ANL-02**: Weekly pivot table — rows: weeks, columns: envelopes, values: sum of transactions per envelope per week
- [ ] **ANL-03**: Savings tracker: cumulative savings total with week-over-week growth visualization

### Billing

- [ ] **BILL-01**: First week of usage is free (no credit charge on initial access)
- [ ] **BILL-02**: After free week, 100 credits charged per week on first access each week
- [ ] **BILL-03**: When unpaid (after free week expires), user sees data in read-only mode (can view but cannot add, edit, or delete)

## v2 Requirements

### Notifications

- **NOTF-01**: Weekly summary email/notification with spending vs budget breakdown
- **NOTF-02**: Alert when an envelope reaches 80% of weekly budget

### Enhancements

- **ENH-01**: Envelope templates/presets for common budgets (Groceries, Gas, Dining, Entertainment)
- **ENH-02**: CSV/data export of transactions and analytics
- **ENH-03**: Recurring transaction templates (auto-fill common entries)
- **ENH-04**: Dark mode support (inherit from host site when available)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bank syncing (Plaid) | High complexity, security liability, contradicts manual-entry philosophy |
| Multi-currency support | Single currency (USD cents) sufficient for target users |
| Shared/family budgets | Multi-user sync adds significant complexity; single-user only |
| Income tracking | Fixed weekly budgets per envelope; income source irrelevant |
| Debt tracking/payoff calculator | Different product concern; stay focused on spending envelopes |
| Mobile native app | Web-first; responsive design covers mobile browsers |
| AI-powered insights | Massive scope; simple rule-based status labels provide 80% value |
| Bill reminders/notifications | Not a bill manager; users manage bills elsewhere |
| Goal setting/savings goals | Different mental model; rollover policy partially addresses this |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| INFRA-04 | — | Pending |
| INFRA-05 | — | Pending |
| INFRA-06 | — | Pending |
| INFRA-07 | — | Pending |
| ENV-01 | — | Pending |
| ENV-02 | — | Pending |
| ENV-03 | — | Pending |
| ENV-04 | — | Pending |
| ENV-05 | — | Pending |
| ENV-06 | — | Pending |
| HOME-01 | — | Pending |
| HOME-02 | — | Pending |
| HOME-03 | — | Pending |
| HOME-04 | — | Pending |
| HOME-05 | — | Pending |
| TXN-01 | — | Pending |
| TXN-02 | — | Pending |
| TXN-03 | — | Pending |
| TXN-04 | — | Pending |
| TXN-05 | — | Pending |
| TXN-06 | — | Pending |
| OVR-01 | — | Pending |
| OVR-02 | — | Pending |
| OVR-03 | — | Pending |
| OVR-04 | — | Pending |
| OVR-05 | — | Pending |
| ANL-01 | — | Pending |
| ANL-02 | — | Pending |
| ANL-03 | — | Pending |
| BILL-01 | — | Pending |
| BILL-02 | — | Pending |
| BILL-03 | — | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 0
- Unmapped: 35

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
