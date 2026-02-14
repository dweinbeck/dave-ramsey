# Functional Requirements Document (FRD)

## Goals

1. Provide a simple, weekly-cadence envelope budgeting tool for users who prefer to think in weekly budgets rather than monthly budgets.
2. Deliver the core envelope budgeting experience (create envelopes, log transactions, track remaining balances, reallocate overages) as a focused mini-app embedded within the host personal brand site.
3. Monetize through the host site's existing credit-based billing system (100 credits/week).

## Non-Goals

1. Bank account syncing (Plaid integration) -- manual-only tracking by design.
2. Multi-user or household budget sharing.
3. Debt tracking, payoff calculators, or full financial management.
4. Goal setting or long-term savings tracking beyond per-envelope rollover.
5. Native mobile apps (iOS/Android) -- responsive web only.
6. Bill reminders, notifications, or recurring transaction scheduling.
7. AI-powered insights or chatbot coaching.
8. CSV/data export (deferred to v2+).

## User Persona

**Name:** Weekly Budgeter

**Description:** A person who gets paid weekly or biweekly and wants tight, fast feedback on their spending. They find monthly budgeting tools too coarse -- by the time a monthly cycle completes, the spending damage is already done. They want a simple tool that answers "how much can I still spend this week on groceries?" in under 2 seconds.

**Characteristics:**
- Prefers manual transaction entry (does not trust or want bank syncing)
- Manages 5-15 spending categories (envelopes)
- Logs 3-10 transactions per week
- Checks the dashboard 1-3 times daily
- Uses both desktop and mobile browsers

## Scenarios

### S1: First-Time Setup

A new user signs in with Google, navigates to Stash, and creates their first set of envelopes. They can use a template (e.g., "Groceries," "Gas," "Dining Out," "Entertainment") or create custom envelopes. For each envelope, they set a weekly budget amount. Setup takes under 2 minutes.

### S2: Daily Transaction Logging

The user opens the Home page, taps an envelope card, and quickly logs a transaction: amount, merchant name, and optional description. The date defaults to today. The envelope's remaining balance updates immediately, and the status badge reflects whether the user is on track, needs to watch spending, or is over budget.

### S3: Overage Reallocation

The user logs a grocery transaction that pushes the Groceries envelope over budget by $12.50. The system detects the overage and opens the reallocation modal. The user sees their other envelopes with available balances and allocates $7.50 from Dining Out and $5.00 from Entertainment. Both donor envelopes decrease accordingly, and the transaction is saved atomically.

### S4: Weekly Review

At the end of the week, the user checks the Transactions page to review all spending. They can filter by envelope and navigate between weeks using the week selector. They edit a transaction where they entered the wrong amount and delete a duplicate entry.

### S5: Analytics Review

The user visits the Analytics page to see a summary of spending across all envelopes for the current week, along with a pivot table showing spending by envelope across recent weeks. They identify that they consistently overspend on Dining Out and adjust next week's budget.

### S6: Budget Cycle Reset

A new week begins (Sunday). Non-rollover envelopes reset to their full weekly budget. Rollover envelopes carry forward any unspent balance. The user sees fresh balances on the Home page.

### S7: Billing Access

The user's first week using Stash is free. Starting the second week, the system charges 100 credits from the host site's billing system. If the user has insufficient credits, envelope pages display in read-only mode (data visible but mutations disabled).

## End-to-End Workflows

### Workflow 1: Transaction Creation (No Overage)

1. User opens Home page (authenticated via Firebase Auth).
2. System fetches envelopes with computed remaining balances via `GET /api/envelopes`.
3. User expands an envelope card and fills in the inline transaction form.
4. Client validates input (Zod schema).
5. Client sends `POST /api/envelopes/transactions` with Bearer token.
6. Server validates via `verifyUser()`, runs Zod validation, verifies envelope ownership.
7. Server computes whether transaction causes overage.
8. No overage: server writes transaction to Firestore, returns created transaction.
9. Client updates SWR cache via `mutate()`.

### Workflow 2: Transaction Creation (With Overage)

1. Steps 1-7 same as Workflow 1.
2. Server detects overage: returns `{ needsOverage: true, overageAmountCents, donorEnvelopes }`.
3. Client opens Overage Modal showing donor envelopes with available balances.
4. User allocates from donors (sum must equal overage exactly).
5. Client sends `POST /api/envelopes/transactions` with original transaction data plus `overageAllocations` array.
6. Server executes Firestore transaction atomically: writes transaction doc + allocation docs + validates donor balances.
7. Client updates SWR cache.

### Workflow 3: Transaction Deletion (With Cascade)

1. User clicks delete on a transaction row.
2. Client shows confirmation dialog.
3. Client sends `DELETE /api/envelopes/transactions/{id}` with Bearer token.
4. Server verifies ownership, queries linked overage allocations by `sourceTransactionId`.
5. Server performs batch delete: transaction doc + all linked allocation docs.
6. Client updates SWR cache.

## Requirements

### Envelope Management

| ID | Requirement | Status |
|----|-------------|--------|
| ENV-01 | Users can create envelopes with a title (1-100 chars) and weekly budget (positive integer cents) | Planned |
| ENV-02 | Users can edit an envelope's title, weekly budget, and rollover setting | Planned |
| ENV-03 | Users can delete an envelope, which cascade-deletes all related transactions and allocations | Planned |
| ENV-04 | Users can reorder envelopes via sortOrder | Planned |
| ENV-05 | Envelopes display computed remaining balance (weeklyBudget - sum of current week transactions + received allocations - donated allocations) | Planned |
| ENV-06 | Each envelope shows a status badge: "On Track," "Watch," or "Over" based on remaining balance and time left in the week | Planned |
| ENV-07 | Non-rollover envelopes reset to full budget each week; rollover envelopes carry surplus forward | Planned |

### Transaction Management

| ID | Requirement | Status |
|----|-------------|--------|
| TXN-01 | Users can create transactions with envelope, amount (positive integer cents), date (YYYY-MM-DD), optional merchant, and optional description | Planned |
| TXN-02 | Users can edit any field of an existing transaction | Planned |
| TXN-03 | Users can delete transactions; linked overage allocations are cascade-deleted atomically | Planned |
| TXN-04 | Transaction date defaults to today | Planned |
| TXN-05 | Transactions are listed by week with a week selector for navigation | Planned |

### Overage Reallocation

| ID | Requirement | Status |
|----|-------------|--------|
| OVR-01 | When a transaction would push an envelope below zero, the system detects the overage and prompts the user to reallocate from other envelopes | Planned |
| OVR-02 | The user selects donor envelopes and amounts; total allocated must exactly equal the overage | Planned |
| OVR-03 | Each donor allocation cannot exceed the donor envelope's remaining balance | Planned |
| OVR-04 | The transaction and all overage allocations are written atomically via a Firestore transaction | Planned |

### Dashboard and Analytics

| ID | Requirement | Status |
|----|-------------|--------|
| DASH-01 | Home page shows all envelopes as cards with title, weekly budget, spent, remaining, and status | Planned |
| DASH-02 | Home page displays a greeting banner with the current week label and cumulative savings | Planned |
| ANLYT-01 | Analytics page shows summary stats: total spent, total budget, total remaining, on-track count | Planned |
| ANLYT-02 | Analytics page shows a weekly pivot table: rows = weeks, columns = envelopes, values = sum of transactions | Planned |
| ANLYT-03 | Analytics page shows weekly savings breakdown with per-week and cumulative totals | Planned |

### Authentication and Billing

| ID | Requirement | Status |
|----|-------------|--------|
| AUTH-01 | All envelope routes require Firebase Auth (Google Sign-In) | Planned |
| AUTH-02 | All API routes derive userId from verifyUser() -- never from client input | Planned |
| BILL-01 | First week of usage is free | Planned |
| BILL-02 | Subsequent weeks cost 100 credits via the host site's billing system | Planned |
| BILL-03 | Insufficient credits results in read-only mode (data visible, mutations disabled) | Planned |

### Infrastructure and Data Integrity

| ID | Requirement | Status |
|----|-------------|--------|
| INFRA-01 | All monetary values stored as integer cents | Done |
| INFRA-02 | Week boundaries use Sunday-Saturday with `weekStartsOn: 0` | Done |
| INFRA-03 | Envelope balances computed on read (no denormalized remaining field) | Done |
| INFRA-04 | Per-user data isolation enforced server-side in every API route | Done |
| INFRA-05 | No sensitive data (merchant names, descriptions) logged server-side | Planned |
| INFRA-06 | Zod validation on all API inputs using `zod/v4` import path | Done |

## Coverage

| Area | Total | Done | Planned | Coverage |
|------|-------|------|---------|----------|
| Envelope Management | 7 | 0 | 7 | 0% |
| Transaction Management | 5 | 0 | 5 | 0% |
| Overage Reallocation | 4 | 0 | 4 | 0% |
| Dashboard and Analytics | 5 | 0 | 5 | 0% |
| Auth and Billing | 5 | 0 | 5 | 0% |
| Infrastructure | 6 | 4 | 2 | 67% |
| **Total** | **32** | **4** | **28** | **13%** |
