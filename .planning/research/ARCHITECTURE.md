# Architecture Patterns: Digital Envelopes

**Domain:** Envelope budgeting mini-app within existing Next.js personal-brand site
**Researched:** 2026-02-10
**Overall confidence:** HIGH (based on direct codebase analysis + verified Firestore patterns)

---

## Executive Summary

Digital Envelopes is a feature module embedded within the existing `personal-brand` Next.js 16 site. The architecture follows the established patterns already present in the repo: thin page files delegating to client components, API routes with `verifyUser()` for authenticated mutations, Firestore via the admin SDK for all data access, and the existing billing system for access control. The primary architectural decisions are (1) Firestore collection design, (2) whether to denormalize computed values, (3) where mutations live (Server Actions vs API routes), and (4) how the overage reallocation workflow maintains consistency.

---

## Firestore Collection Schema

### Design Philosophy

The existing repo uses **top-level collections with `userId` field filtering** (not subcollections scoped to user docs). See `billing_tool_usage`, `billing_purchases`, and `billing_stripe_events` -- all are top-level collections with a `uid` field and `where("uid", "==", uid)` queries. Digital Envelopes should follow this same pattern for consistency.

**Exception:** The billing ledger uses subcollections (`billing_users/{uid}/ledger`). This is appropriate for ledger entries that are always queried within a single user context and never across users. However, for envelopes and transactions, top-level collections are better because they allow flexible querying (e.g., "all transactions for user X in week Y for envelope Z").

### Collection: `envelopes`

Stores envelope definitions per user.

```
envelopes/{autoId}
  userId:        string        // Firebase Auth UID (indexed, never from client)
  title:         string        // "Groceries", "Gas", "Dining Out"
  weeklyBudget:  number        // Integer cents (e.g., 15000 = $150.00)
  sortOrder:     number        // User-defined ordering (0, 1, 2...)
  createdAt:     Timestamp     // FieldValue.serverTimestamp()
  updatedAt:     Timestamp     // FieldValue.serverTimestamp()
```

**Index needed:** Composite index on `(userId, sortOrder)` for ordered listing.

**Why no `remaining` field here:** The `remaining` budget is a computed value (weeklyBudget minus sum of transactions for the current week). Storing it would require updating the envelope document on every transaction write, creating write contention on the envelope doc. Since envelope cards are loaded once per page visit and transaction counts per envelope per week are small (likely <50), computing on read is cheaper and simpler. See "Denormalization Decision" section below.

### Collection: `envelope_transactions`

Stores individual spending transactions.

```
envelope_transactions/{autoId}
  userId:        string        // Firebase Auth UID (indexed)
  envelopeId:    string        // Reference to envelopes/{id}
  date:          string        // ISO date "2026-02-10" (not Timestamp -- enables string range queries for week filtering)
  amountCents:   number        // Integer cents, always positive
  merchant:      string        // "Trader Joe's" (never logged server-side per privacy req)
  description:   string        // Optional note (never logged server-side)
  weekStart:     string        // ISO date of the week's Sunday, e.g., "2026-02-09" (denormalized for efficient querying)
  createdAt:     Timestamp
  updatedAt:     Timestamp
```

**Index needed:** Composite index on `(userId, weekStart)` for the Transactions page week selector. Composite index on `(userId, envelopeId, weekStart)` for per-envelope weekly totals.

**Why `weekStart` is denormalized:** Computing which week a transaction belongs to from its `date` field would require loading all transactions and filtering in application code. By storing `weekStart` (the Sunday of that week), Firestore can do the filtering directly. This field is derived deterministically from `date` using week-math utilities and is write-once (never updated independently).

**Why `date` is a string, not a Timestamp:** ISO date strings like "2026-02-10" enable clean equality and range queries for week boundaries, and they avoid timezone issues that come with Timestamp objects. The user picks a date (not a datetime), and the date itself is the meaningful value.

### Collection: `envelope_overage_allocations`

Stores overage reallocations when a transaction causes an envelope to go negative.

```
envelope_overage_allocations/{autoId}
  userId:           string     // Firebase Auth UID
  transactionId:    string     // The transaction that caused the overage
  sourceEnvelopeId: string     // The envelope that received the overage (went negative)
  donorEnvelopeId:  string     // The envelope donating funds
  amountCents:      number     // Integer cents donated
  weekStart:        string     // Same week as the triggering transaction
  createdAt:        Timestamp
```

**Why a separate collection (not embedded in the transaction doc):** A single overage can pull from multiple donor envelopes. Embedding an array of allocations inside the transaction doc would complicate deletion cleanup and querying. With a separate collection, deleting a transaction triggers a simple `where("transactionId", "==", txnId)` to find and delete all related allocations atomically.

**Index needed:** `(userId, weekStart)` for analytics, `(transactionId)` for cascading deletes.

### Collection: `envelope_weekly_access`

Tracks billing access per user per week for idempotent billing.

```
envelope_weekly_access/{userId}_{weekStart}
  userId:      string
  weekStart:   string         // ISO date of week's Sunday
  usageId:     string         // From debitForToolUse() result
  paidAt:      Timestamp
```

**Document ID is deterministic** (`{userId}_{weekStart}`), making idempotency checks a simple doc read rather than a query. This follows the existing `billing_idempotency` pattern in the repo.

---

## Denormalization Decision: Compute on Read

**Recommendation: Do NOT denormalize `remaining` budget onto envelope documents.**

| Factor | Denormalize | Compute on Read |
|--------|-------------|-----------------|
| Read cost | 1 read (envelope doc) | N+1 reads (envelopes + transactions for week) |
| Write cost | 2 writes per transaction (txn + update envelope) | 1 write per transaction |
| Write contention | HIGH (envelope doc updated on every txn) | NONE |
| Consistency | Risk of drift if update fails | Always correct |
| Overage complexity | Must also update donor envelopes | No extra updates needed |
| Deletion cleanup | Must recompute remaining | Automatic -- transactions gone, total recalculated |

**The math:** A user with 10 envelopes and ~5 transactions per envelope per week = ~50 transactions. Loading the Home page requires: 1 query for envelopes (returns 10 docs) + 1 query for current-week transactions (returns ~50 docs) = 2 Firestore reads (charged per query, not per document in admin SDK... correction: admin SDK reads are charged per document). So ~60 document reads per home page load. At $0.06 per 100,000 reads, this costs $0.000036 per page load. Negligible.

**The risk of denormalizing:** If a transaction write succeeds but the envelope `remaining` update fails (network issue, timeout), the envelope shows stale data. With compute-on-read, this is impossible -- the displayed remaining is always derived from actual transaction data.

**Implementation:** Create a server-side utility function `computeEnvelopeRemaining(envelopeId, weekStart, transactions)` that sums transaction amounts for the given envelope and week, then subtracts from the envelope's `weeklyBudget`. This runs server-side in the API route before returning data to the client.

---

## Component Architecture

### Route Structure

```
src/app/envelopes/
  layout.tsx              -- EnvelopesLayout: AuthGuard + sub-nav + billing gate
  page.tsx                -- Home page (envelope cards + greeting)
  transactions/
    page.tsx              -- Transactions page (CRUD + week selector)
  analytics/
    page.tsx              -- Analytics page (summary + pivot table)
```

Each `page.tsx` is a thin Server Component that exports metadata and renders a client component, following the existing pattern (see `src/app/apps/brand-scraper/page.tsx`).

### Layout: `/envelopes/layout.tsx`

```
EnvelopesLayout (Server Component)
  |-- AuthGuard (client, existing component)
  |     |-- BillingGate (client, new -- checks weekly access)
  |           |-- EnvelopesNav (client, new -- sub-navigation tabs)
  |           |-- {children} (page content)
```

**BillingGate** is the key new wrapper. On mount, it calls `/api/envelopes/access` to check (and optionally charge) weekly access. If the user hasn't paid for the current week, it renders content in read-only mode (disabling mutation buttons/forms) with a prompt to pay. This is similar to how `UserBrandScraperPage` checks balance before allowing actions, but elevated to the layout level since it applies to all three pages.

**EnvelopesNav** follows the exact pattern of `ControlCenterNav`: a horizontal tab bar with `usePathname()` for active state. Links:
- Home: `/envelopes` (exact match)
- Transactions: `/envelopes/transactions`
- Analytics: `/envelopes/analytics`

### Component Tree: Home Page

```
EnvelopesHomePage (client)
  |-- GreetingBanner
  |     |-- Displays: "Hi {name}! Today is {weekday}..."
  |     |-- Displays: on-track / spending summary
  |
  |-- EnvelopeCardGrid
        |-- EnvelopeCard (per envelope)
        |     |-- Card (existing UI component, "default" variant)
        |     |-- Displays: title, weekly budget, remaining, status label
        |     |-- StatusBadge (on-track / caution / over-budget)
        |     |-- [Expandable] InlineTransactionForm
        |           |-- Date, Cost, Merchant, Description fields
        |           |-- Submit triggers POST /api/envelopes/transactions
        |           |-- On overage: triggers OverageModal
        |
        |-- CreateEnvelopeCard
              |-- Card with "+" icon, opens form/modal for new envelope
```

### Component Tree: Transactions Page

```
EnvelopesTransactionsPage (client)
  |-- WeekSelector
  |     |-- Dropdown or prev/next arrows
  |     |-- Displays: "Week N: M/D/YYYY - M/D/YYYY"
  |
  |-- TransactionList
        |-- TransactionRow (per transaction)
        |     |-- Date, Cost, Category (envelope name), Merchant, Description
        |     |-- Edit button -> inline edit mode
        |     |-- Delete button -> confirm + DELETE /api/envelopes/transactions/{id}
        |
        |-- AddTransactionForm
              |-- Full-width form: Date, Cost, Category (dropdown), Merchant, Description
              |-- Submit triggers POST /api/envelopes/transactions
              |-- On overage: triggers OverageModal
```

### Component Tree: Analytics Page

```
EnvelopesAnalyticsPage (client)
  |-- SummaryStats
  |     |-- Total spent, Total budget, Total remaining, On-track count
  |
  |-- WeeklyPivotTable
        |-- Rows: weeks (newest first)
        |-- Columns: envelope names
        |-- Values: sum of transactions per envelope per week
        |-- Footer: column totals
```

### Shared Components (new, under `src/components/envelopes/`)

| Component | Purpose |
|-----------|---------|
| `OverageModal` | Modal dialog for overage reallocation workflow |
| `EnvelopeCard` | Card displaying envelope summary |
| `StatusBadge` | On-track / Caution / Over-budget label |
| `InlineTransactionForm` | Expandable form within envelope card |
| `WeekSelector` | Week navigation control |
| `TransactionRow` | Single transaction display with edit/delete |
| `AddTransactionForm` | Full transaction creation form |
| `WeeklyPivotTable` | Analytics pivot table |
| `SummaryStats` | Analytics summary numbers |
| `GreetingBanner` | Home page greeting with summary |
| `BillingGate` | Weekly access check + read-only mode |
| `EnvelopesNav` | Sub-navigation tabs |
| `CreateEnvelopeCard` | Card for adding new envelope |
| `EnvelopeForm` | Shared create/edit form for envelopes |

### Shared Utilities (new, under `src/lib/envelopes/`)

| File | Purpose |
|------|---------|
| `week-math.ts` | `getWeekRange(date)`, `getWeekStart(date)`, `getRemainingDaysPercent(today)`, `getStatusLabel(remaining, weeklyBudget, remainingDaysPercent)` |
| `types.ts` | TypeScript types for envelopes, transactions, allocations, API responses |
| `schemas.ts` | Zod v4 validation schemas for all mutations |
| `firestore.ts` | Server-side Firestore operations (CRUD, queries, computed values) |

---

## Data Flow

### Pattern: Authenticated Client -> API Route -> Firestore

This is the established pattern in the repo. Client components call API routes with Bearer token authentication. The existing `verifyUser()` function extracts `uid` and `email` from the Firebase ID token. All Firestore operations use the admin SDK server-side.

```
Client Component                API Route                    Firestore
     |                              |                            |
     |-- fetch() with Bearer ------>|                            |
     |                              |-- verifyUser(request) ---->|
     |                              |<--- { uid, email } --------|
     |                              |                            |
     |                              |-- db.collection().where() ->|
     |                              |<--- documents --------------|
     |                              |                            |
     |<---- Response.json() --------|                            |
     |                              |                            |
```

**Why NOT Server Actions for envelopes mutations:**

The existing repo uses API routes (not Server Actions) for all authenticated mutations that involve billing or user-scoped data. Server Actions are used only for the contact form (public, no auth). The reasons to stick with API routes:

1. **Auth pattern consistency:** `verifyUser(request)` extracts the Bearer token from the `Authorization` header. Server Actions use cookies/headers differently and would require a different auth pattern.
2. **Billing integration:** `debitForToolUse()` is called from API routes. The existing pattern works.
3. **Overage workflow:** The overage allocation requires a Firestore transaction spanning multiple documents (transaction + allocations + billing check). API routes give explicit control over the request/response lifecycle.
4. **Client-side token flow:** The existing `user.getIdToken()` -> `fetch()` with `Authorization: Bearer` pattern is well-established across `BillingPage`, `UserBrandScraperPage`, and all admin pages.

Server Actions would be appropriate if we were building forms that don't need token-based auth, but every envelope operation requires per-user auth, so API routes are the right choice.

### API Routes Structure

```
src/app/api/envelopes/
  access/
    route.ts              -- GET: check/charge weekly access
  route.ts                -- GET: list envelopes + computed remaining for current week
                          -- POST: create envelope
  [envelopeId]/
    route.ts              -- PUT: update envelope
                          -- DELETE: delete envelope
  transactions/
    route.ts              -- GET: list transactions (query params: weekStart, envelopeId)
                          -- POST: create transaction (+ overage allocations if needed)
    [transactionId]/
      route.ts            -- PUT: update transaction
                          -- DELETE: delete transaction (+ cascade delete allocations)
  analytics/
    route.ts              -- GET: weekly pivot data (query params: optional date range)
```

### Data Flow: Home Page Load

```
1. EnvelopesLayout mounts
2. AuthGuard checks auth state (existing pattern)
3. BillingGate calls GET /api/envelopes/access
   3a. API route calls verifyUser()
   3b. Checks envelope_weekly_access/{uid}_{weekStart} doc
   3c. If exists: return { paid: true }
   3d. If not: call debitForToolUse(), create access doc, return { paid: true }
   3e. If insufficient credits: return { paid: false, balance, cost }
4. EnvelopesHomePage calls GET /api/envelopes
   4a. API route fetches envelopes WHERE userId == uid
   4b. API route fetches transactions WHERE userId == uid AND weekStart == currentWeekStart
   4c. Server computes remaining for each envelope
   4d. Server computes status labels using week-math utilities
   4e. Returns enriched envelope data
5. Components render with computed data
```

### Data Flow: Transaction Creation (with Overage)

```
1. User fills InlineTransactionForm or AddTransactionForm
2. Client-side validation (Zod schema)
3. POST /api/envelopes/transactions with body:
   { envelopeId, date, amountCents, merchant, description }
4. API route:
   a. verifyUser()
   b. Validate with Zod
   c. Compute weekStart from date using getWeekStart()
   d. Query current transactions for the envelope + week
   e. Compute newRemaining = weeklyBudget - existingTotal - amountCents
   f. If newRemaining >= 0:
      - Write transaction doc
      - Return { transaction, newRemaining }
   g. If newRemaining < 0:
      - Return { needsOverage: true, overageAmount: Math.abs(newRemaining), pendingTransaction: {...} }
5. Client receives needsOverage response:
   a. Opens OverageModal
   b. Modal shows donor envelopes with their remaining amounts
   c. User allocates from donors (sum must equal overage exactly)
   d. POST /api/envelopes/transactions with body:
      { ...originalTransaction, overageAllocations: [{ donorEnvelopeId, amountCents }...] }
6. API route (with allocations):
   a. Firestore transaction (atomic):
      - Write transaction doc
      - Write overage allocation docs (one per donor)
      - Verify each donor has sufficient remaining (recompute on read within txn)
   b. Return { transaction, allocations }
7. Client updates local state
```

### Data Flow: Transaction Deletion (with Cascade)

```
1. User clicks delete on TransactionRow
2. Confirm dialog
3. DELETE /api/envelopes/transactions/{transactionId}
4. API route:
   a. verifyUser()
   b. Fetch transaction doc, verify userId matches
   c. Query overage allocations WHERE transactionId == id
   d. Firestore batch write:
      - Delete transaction doc
      - Delete all related allocation docs
   e. Return { success: true }
5. Client removes transaction from local state
```

---

## Overage Reallocation: Detailed Design

The overage workflow is the most complex interaction in the system. Here is the detailed design.

### Two-Phase Approach

**Phase 1: Detect overage (lightweight API call)**
When the user submits a transaction, the API checks whether it would cause the envelope to go negative. If so, it does NOT write the transaction yet. Instead, it returns the overage amount and the list of donor envelopes with their current remaining balances.

**Phase 2: Commit with allocations (atomic write)**
The client opens the OverageModal, the user fills in allocation amounts, and the client submits the original transaction PLUS the allocation array. The API writes everything atomically in a Firestore transaction.

### Why Two Phases (Not One)

Writing the transaction first and then asking the user to fix the overage creates a window where data is inconsistent (negative remaining with no allocations). The two-phase approach ensures data is never inconsistent.

### Validation Rules (Server-Side, in Firestore Transaction)

1. Each `allocation.amountCents > 0`
2. Each donor envelope belongs to the same userId
3. Each donor has sufficient remaining (`weeklyBudget - weekTransactionTotal >= allocation.amountCents`)
4. `sum(allocations.amountCents) == overageAmount` (exact match, no rounding)
5. The source envelope is not a donor to itself

### Modal Component Design

```
OverageModal
  |-- Header: "Transaction would exceed {envelopeName} by ${overageAmount}"
  |-- DonorEnvelopeList
  |     |-- DonorRow (per envelope with remaining > 0)
  |           |-- Envelope name
  |           |-- Available: ${remaining}
  |           |-- Input: allocation amount (capped at remaining)
  |
  |-- Footer
        |-- Remaining to allocate: ${overageAmount - sumAllocations}
        |-- Submit button (disabled until remaining == 0)
        |-- Cancel button (discards transaction entirely)
```

---

## Where Shared Utilities Live

### `src/lib/envelopes/week-math.ts`

Pure functions, no side effects, no Firestore dependency. Used by both API routes (server) and potentially client components (for display logic).

```typescript
// Core functions:
getWeekStart(date: Date): string        // Returns ISO date of Sunday for the given date's week
getWeekEnd(date: Date): string          // Returns ISO date of Saturday
getWeekRange(date: Date): { start: string; end: string; weekNumber: number }
getWeekLabel(weekStart: string): string // "Week 6: 2/9/2026 - 2/15/2026"
getRemainingDaysPercent(today: Date): number  // 0.0 to 1.0, fraction of week remaining
getStatusLabel(remainingCents: number, weeklyBudgetCents: number, remainingDaysPercent: number): "on-track" | "caution" | "over-budget"
```

**Status label logic:**
- `over-budget`: remaining <= 0
- `caution`: remaining > 0 but (remaining / weeklyBudget) < remainingDaysPercent (spending ahead of pace)
- `on-track`: otherwise

### `src/lib/envelopes/firestore.ts`

Server-only module. Follows the existing `src/lib/billing/firestore.ts` pattern: collection helpers at the top, exported functions for each operation.

```typescript
// Collection helpers (private):
function envelopesCol()
function transactionsCol()
function allocationsCol()
function weeklyAccessCol()

// Exported operations:
listEnvelopesWithRemaining(userId, weekStart)  // Returns envelopes + computed remaining
getEnvelope(userId, envelopeId)
createEnvelope(userId, data)
updateEnvelope(userId, envelopeId, data)
deleteEnvelope(userId, envelopeId)             // Also deletes related transactions + allocations

listTransactions(userId, weekStart?, envelopeId?)
createTransaction(userId, data)                 // Simple (no overage)
createTransactionWithOverage(userId, data, allocations)  // Atomic
deleteTransaction(userId, transactionId)        // Cascading

checkWeeklyAccess(userId, weekStart)
chargeWeeklyAccess(userId, email, weekStart)

getAnalyticsData(userId, weekRange?)            // Aggregated for pivot table
```

### `src/lib/envelopes/schemas.ts`

Zod v4 schemas following the existing pattern (`src/lib/schemas/contact.ts`, `src/lib/billing/types.ts`).

```typescript
// Envelope schemas
createEnvelopeSchema: { title: string, weeklyBudget: number (int, positive) }
updateEnvelopeSchema: { title?: string, weeklyBudget?: number }

// Transaction schemas
createTransactionSchema: { envelopeId: string, date: string (ISO date), amountCents: number (int, positive), merchant: string, description?: string }
createTransactionWithOverageSchema: extends createTransactionSchema + { overageAllocations: [{ donorEnvelopeId: string, amountCents: number (int, positive) }] }

// Note: all monetary values validated as positive integers (cents)
```

### `src/lib/envelopes/types.ts`

TypeScript types for Firestore document shapes and API response shapes. Follows the existing `src/lib/billing/types.ts` pattern.

---

## Sub-Navigation Integration

### How It Fits the Site Shell

The root layout (`src/app/layout.tsx`) renders: `Navbar > main > Footer`. The Navbar already includes a link system via `NavLinks`. For Digital Envelopes, the Navbar does NOT need to change -- users navigate to `/envelopes` via a link on the home page, the apps section, or a direct URL.

The `/envelopes/layout.tsx` adds the sub-navigation BELOW the Navbar but ABOVE the page content, exactly like the Control Center layout:

```
[Site Navbar] ---- persistent, from root layout
[Envelopes Sub-nav: Home | Transactions | Analytics] ---- from /envelopes/layout.tsx
[Page Content] ---- from page.tsx
[Site Footer] ---- persistent, from root layout
```

### Navigation Entry Point

Add "Digital Envelopes" to the NavLinks `baseLinks` array for signed-in users, or create an entry in the existing apps/tools section. The exact placement is a product decision, not an architecture decision.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Firestore Access
**What:** Using the Firebase client SDK to read/write Firestore directly from the browser.
**Why bad:** The existing Firestore rules deny ALL client reads/writes (`allow read, write: if false`). The entire repo uses server-side admin SDK access exclusively. Bypassing this would require changing security rules and duplicating auth logic.
**Instead:** All Firestore access through API routes using the admin SDK.

### Anti-Pattern 2: Storing Computed Values as Source of Truth
**What:** Storing `remaining` on the envelope document and treating it as authoritative.
**Why bad:** Write contention, consistency risk on partial failures, complex cascade logic on deletes.
**Instead:** Compute on read. The slight cost of extra document reads is negligible for this scale.

### Anti-Pattern 3: Embedding Allocations in Transaction Documents
**What:** Storing overage allocations as an array field inside the transaction document.
**Why bad:** Makes cascading deletes harder (need to read each transaction to find its allocations), makes analytics queries for "how much was donated from envelope X" impossible without reading all transactions.
**Instead:** Separate `envelope_overage_allocations` collection with `transactionId` reference.

### Anti-Pattern 4: Server Actions for Authenticated Mutations
**What:** Using `"use server"` actions for envelope CRUD.
**Why bad:** Breaks the established auth pattern (`verifyUser()` with Bearer token). Server Actions receive cookies automatically but the repo's auth flow relies on explicit `Authorization` headers. Mixing patterns creates confusion and maintenance burden.
**Instead:** API routes for all authenticated mutations, consistent with the rest of the repo.

### Anti-Pattern 5: Floating Point for Money
**What:** Storing or computing monetary values as dollars (e.g., 15.99).
**Why bad:** Floating point arithmetic causes rounding errors. `0.1 + 0.2 !== 0.3`.
**Instead:** Integer cents everywhere. Display formatting happens at the component level only.

---

## Build Order (Dependency Chain)

The following ordering reflects strict dependencies -- each item requires the preceding items to be functional.

### Phase 1: Foundation (No Dependencies)

Build these first because everything else depends on them:

1. **`week-math.ts` utilities** -- Pure functions, testable in isolation. Every other feature needs week calculations.
2. **`types.ts` + `schemas.ts`** -- TypeScript types and Zod schemas. Required by both API routes and components.
3. **Firestore collection helpers** -- The `envelopesCol()`, `transactionsCol()`, etc. helper functions in `firestore.ts`.

### Phase 2: Core Data Layer (Depends on Phase 1)

4. **Envelope CRUD in `firestore.ts`** -- `createEnvelope`, `listEnvelopes`, `updateEnvelope`, `deleteEnvelope`.
5. **Envelope API routes** -- GET/POST/PUT/DELETE for `/api/envelopes`.
6. **`EnvelopesNav` component** -- Sub-navigation (standalone, only needs routing).
7. **`/envelopes/layout.tsx`** -- Layout with AuthGuard + nav (no billing gate yet).

### Phase 3: Home Page (Depends on Phase 2)

8. **`listEnvelopesWithRemaining()`** -- Server function that joins envelopes + transactions to compute remaining.
9. **`EnvelopeCard` + `StatusBadge`** -- Display components.
10. **`GreetingBanner`** -- Greeting with summary stats.
11. **`EnvelopesHomePage`** -- Assembles the home page.

### Phase 4: Transactions (Depends on Phase 2)

12. **Transaction CRUD in `firestore.ts`** -- `createTransaction`, `listTransactions`, `deleteTransaction`.
13. **Transaction API routes** -- GET/POST/DELETE for `/api/envelopes/transactions`.
14. **`WeekSelector`** -- Week navigation control.
15. **`TransactionRow` + `AddTransactionForm`** -- Transaction display and creation.
16. **`EnvelopesTransactionsPage`** -- Assembles the transactions page.

### Phase 5: Overage Workflow (Depends on Phase 4)

17. **`Modal` component** -- Generic reusable modal (does not exist in repo yet).
18. **`OverageModal`** -- Overage-specific modal with allocation form.
19. **`createTransactionWithOverage()` in `firestore.ts`** -- Atomic Firestore transaction.
20. **Updated transaction API routes** -- Handle overage detection and allocation submission.
21. **`InlineTransactionForm`** -- Expandable form on envelope cards (uses overage flow).

### Phase 6: Analytics (Depends on Phase 4)

22. **`getAnalyticsData()` in `firestore.ts`** -- Aggregation queries.
23. **Analytics API route** -- GET `/api/envelopes/analytics`.
24. **`SummaryStats` + `WeeklyPivotTable`** -- Display components.
25. **`EnvelopesAnalyticsPage`** -- Assembles the analytics page.

### Phase 7: Billing Integration (Depends on Phase 2)

26. **`checkWeeklyAccess()` + `chargeWeeklyAccess()`** -- Billing functions using existing `debitForToolUse()`.
27. **Access API route** -- GET `/api/envelopes/access`.
28. **`BillingGate` component** -- Layout-level access control.
29. **Read-only mode styling** -- Disable mutation buttons when unpaid.

**Note:** Phases 3, 4, 6, and 7 can be built in parallel after Phase 2. Phase 5 requires Phase 4.

---

## Scalability Considerations

| Concern | At 1-10 users | At 100 users | At 1,000+ users |
|---------|---------------|--------------|-----------------|
| Firestore reads | Negligible cost | ~$0.01/month | Consider caching hot queries |
| Compute on read | Instant | Instant | Instant (queries scoped by userId + weekStart) |
| Write contention | None | None | None (each user writes to own docs) |
| Analytics aggregation | Fast | Fast | May need pagination for large date ranges |
| Weekly billing check | 1 read per page load | Cache in BillingGate state | Same -- cached per session |

At the expected scale (personal tool, small user base), there are no scalability concerns.

---

## Sources

- [Firebase Firestore Data Model](https://firebase.google.com/docs/firestore/data-model) -- Official documentation on collections, documents, subcollections
- [Choose a Data Structure (Firestore)](https://firebase.google.com/docs/firestore/manage-data/structure-data) -- Official guidance on when to use subcollections vs top-level collections
- [Transactions and Batched Writes](https://firebase.google.com/docs/firestore/manage-data/transactions) -- Atomic operations, transaction limits, consistency guarantees
- [Firestore Query Performance Best Practices (2026)](https://estuary.dev/blog/firestore-query-best-practices/) -- Denormalization tradeoffs, indexing
- [Next.js Server Actions: Complete Guide (2026)](https://makerkit.dev/blog/tutorials/nextjs-server-actions) -- When to use Server Actions vs Route Handlers
- [Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers) -- Detailed comparison
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices) -- Official best practices

All Firestore patterns verified against existing codebase at `/Users/dweinbeck/Documents/personal-brand/src/lib/billing/firestore.ts` and `/Users/dweinbeck/Documents/personal-brand/src/lib/auth/user.ts`.
