# Technical Design

## System Architecture

Digital Envelopes is a feature module within an existing Next.js 16 App Router site. The architecture follows a server-centric pattern: all data operations flow through Next.js API Route Handlers that authenticate via Firebase ID tokens, access Firestore through the admin SDK, and return computed data to the client. Client components use SWR for data fetching and cache management. There is no client-side Firestore access -- Firestore security rules deny all direct client reads and writes (`allow read, write: if false`).

Envelope balances are computed on read rather than stored as denormalized fields. This eliminates write contention on envelope documents, prevents consistency drift from partial failures, and simplifies deletion cleanup. The trade-off is slightly more Firestore reads per page load (~60 document reads for a user with 10 envelopes), which is negligible at the expected scale.

```
+-------------------+         +--------------------+         +------------------+
|  Client Browser   |         |  Next.js Server    |         |  Firestore       |
|                   |         |  (API Routes)      |         |  (Admin SDK)     |
|  React Components | ------> |  verifyUser()      | ------> |  envelopes       |
|  SWR Cache        | <Bearer>|  Zod Validation    | <-----> |  envelope_txns   |
|  Firebase Auth    | <------ |  Compute on Read   |         |  envelope_allocs |
|  (getIdToken())   |  JSON   |  Batch Writes      |         |  envelope_billing|
+-------------------+         +--------------------+         +------------------+
```

## Directory Structure

```
dave-ramsey/
  src/
    lib/
      firebase.ts                          # Firebase Admin SDK init (singleton)
      envelopes/
        week-math.ts                       # Pure functions: getWeekRange, getRemainingDaysPercent,
                                           #   getStatusLabel, formatWeekLabel, getWeekNumber
        types.ts                           # Zod schemas (envelopeSchema, transactionSchema,
                                           #   transactionUpdateSchema, overageAllocationSchema)
                                           # TypeScript types (Envelope, EnvelopeTransaction,
                                           #   OverageAllocation, EnvelopeWithStatus, HomePageData,
                                           #   TransactionsPageData, AnalyticsPageData, etc.)
        firestore.ts                       # Collection refs: envelopesCol(), transactionsCol(),
                                           #   allocationsCol()
                                           # Query helpers: envelopesForUser(), transactionsForUserInWeek()
                                           # Pure computation: computeEnvelopeStatus(),
                                           #   validateAllocations(), computeSavingsForWeek(),
                                           #   computeCumulativeSavingsFromData(),
                                           #   computeWeeklySavingsBreakdown(), buildPivotRows()
                                           # CRUD: createEnvelope(), updateEnvelope(),
                                           #   deleteEnvelope(), reorderEnvelopes(),
                                           #   createTransaction(), updateTransaction(),
                                           #   deleteTransaction(), createAllocations()
                                           # Aggregate reads: listEnvelopesWithRemaining(),
                                           #   listTransactionsForWeek(), computeCumulativeSavings()
        format.ts                          # formatCents(cents) -> "$X.XX"
        __tests__/
          week-math.test.ts                # 20 test cases across 5 function groups
          types.test.ts                    # 20 test cases for Zod schema validation
          firestore.test.ts                # 40+ test cases for computation + validation helpers
  .planning/
    config.json                            # Agent workflow configuration
    research/
      FEATURES.md                          # Competitive analysis: table stakes, differentiators, anti-features
      STACK.md                             # Technology decisions with rationale
      ARCHITECTURE.md                      # Firestore schema, component trees, data flows
      PITFALLS.md                          # 14 documented pitfalls with prevention strategies
      SUMMARY.md                           # Executive summary of all research
    phases/
      01-foundation/                       # Phase 1: routing shell, week math, types, Firestore helpers
  package.json
  tsconfig.json                            # strict: true, ES2022 target, ESNext modules, path alias @/*
  vitest.config.ts                         # node environment, globals: true, @ alias
```

## Data Flows

### Home Page Load

1. Client navigates to `/envelopes`.
2. `EnvelopesLayout` renders `AuthGuard` (redirects unauthenticated users to sign-in).
3. `BillingGate` calls `GET /api/envelopes/access` to check/charge weekly billing.
4. `EnvelopesHomePage` calls `GET /api/envelopes` with Bearer token.
5. API route calls `verifyUser(request)` to extract `uid`.
6. `listEnvelopesWithRemaining(uid)` executes two parallel Firestore queries: envelopes for user + transactions for current week.
7. Server computes per-envelope `spentCents`, `remainingCents`, and `status` using `computeEnvelopeStatus()`.
8. Server computes `cumulativeSavingsCents` from all completed past weeks.
9. Returns `HomePageData` JSON to client.
10. SWR caches the response; components render envelope cards with status badges.

### Transaction Creation (Two-Phase Overage Detection)

1. User fills inline transaction form on an envelope card.
2. Client validates input against `transactionSchema` (Zod).
3. Client sends `POST /api/envelopes/transactions` with `{ envelopeId, amountCents, date, merchant?, description? }`.
4. Server runs `verifyUser()`, validates with Zod, verifies envelope ownership.
5. Server queries existing transactions for the envelope + week to compute current total.
6. Server computes `newRemaining = weeklyBudgetCents - existingTotal - amountCents`.
7. If `newRemaining >= 0`: writes transaction doc, returns `{ transaction, newRemaining }`.
8. If `newRemaining < 0`: returns `{ needsOverage: true, overageAmountCents, donorEnvelopes }` without writing.
9. Client opens Overage Modal; user allocates from donors.
10. Client re-sends `POST` with original data plus `overageAllocations` array.
11. Server executes atomic Firestore batch write: transaction doc + allocation docs.
12. Server validates via `validateAllocations()`: sum equals overage, each donor has sufficient balance, no self-donation.
13. Client calls `mutate()` to refresh SWR cache.

### Transaction Deletion (Cascade)

1. User clicks delete on a transaction row; confirms via dialog.
2. Client sends `DELETE /api/envelopes/transactions/{transactionId}` with Bearer token.
3. Server calls `verifyUser()`, verifies transaction ownership.
4. Server queries `envelope_allocations` where `sourceTransactionId == transactionId`.
5. If no allocations: deletes transaction doc directly.
6. If allocations exist: batch deletes transaction doc + all linked allocation docs atomically.
7. Client updates SWR cache.

## API Contracts

### GET /api/envelopes

Returns all envelopes for the authenticated user with computed remaining balances for the current week.

**Request:**
```
Headers: Authorization: Bearer <firebase-id-token>
```

**Response (200):**
```json
{
  "envelopes": [
    {
      "id": "abc123",
      "userId": "uid_xxx",
      "title": "Groceries",
      "weeklyBudgetCents": 15000,
      "sortOrder": 0,
      "rollover": false,
      "spentCents": 8500,
      "remainingCents": 6500,
      "status": "On Track",
      "createdAt": "2026-01-15T00:00:00Z",
      "updatedAt": "2026-02-10T00:00:00Z"
    }
  ],
  "weekLabel": "2/8/2026 - 2/14/2026",
  "cumulativeSavingsCents": 45000,
  "billing": { "mode": "readwrite" }
}
```

### POST /api/envelopes

Creates a new envelope.

**Request:**
```json
{
  "title": "Groceries",
  "weeklyBudgetCents": 15000
}
```

**Response (201):**
```json
{
  "id": "abc123",
  "userId": "uid_xxx",
  "title": "Groceries",
  "weeklyBudgetCents": 15000,
  "sortOrder": 0,
  "rollover": false,
  "createdAt": "2026-02-10T00:00:00Z",
  "updatedAt": "2026-02-10T00:00:00Z"
}
```

### PUT /api/envelopes/[envelopeId]

Updates an existing envelope. Supports partial updates.

**Request:**
```json
{
  "title": "Weekly Groceries",
  "weeklyBudgetCents": 17500,
  "rollover": true
}
```

### DELETE /api/envelopes/[envelopeId]

Deletes an envelope and cascade-deletes all related transactions and overage allocations.

### POST /api/envelopes/transactions

Creates a new transaction. Returns overage metadata if the transaction would push the envelope negative.

**Request (no overage):**
```json
{
  "envelopeId": "abc123",
  "amountCents": 2500,
  "date": "2026-02-10",
  "merchant": "Trader Joe's",
  "description": "Weekly groceries"
}
```

**Response when overage detected (200):**
```json
{
  "needsOverage": true,
  "overageAmountCents": 1250,
  "donorEnvelopes": [
    { "id": "def456", "title": "Dining Out", "remainingCents": 8000 },
    { "id": "ghi789", "title": "Entertainment", "remainingCents": 5000 }
  ]
}
```

**Request (with overage allocations):**
```json
{
  "envelopeId": "abc123",
  "amountCents": 2500,
  "date": "2026-02-10",
  "merchant": "Trader Joe's",
  "overageAllocations": [
    { "donorEnvelopeId": "def456", "amountCents": 750 },
    { "donorEnvelopeId": "ghi789", "amountCents": 500 }
  ]
}
```

### DELETE /api/envelopes/transactions/[transactionId]

Deletes a transaction and cascade-deletes any linked overage allocations.

### GET /api/envelopes/transactions

Lists transactions for a given week.

**Query params:** `weekStart=2026-02-08&weekEnd=2026-02-14`

### GET /api/envelopes/analytics

Returns analytics data: summary stats, pivot table rows, and weekly savings breakdown.

### GET /api/envelopes/access

Checks and optionally charges weekly billing access.

## Data Models

### Firestore: `envelopes/{autoId}`

| Field | Type | Description |
|-------|------|-------------|
| userId | string | Firebase Auth UID (indexed, server-derived) |
| title | string | Envelope name (1-100 chars) |
| weeklyBudgetCents | number | Budget per week in integer cents |
| sortOrder | number | Display order (0, 1, 2...) |
| rollover | boolean | `true` = carry surplus, `false` = reset weekly |
| createdAt | Timestamp | Server-set creation time |
| updatedAt | Timestamp | Server-set last modification |

### Firestore: `envelope_transactions/{autoId}`

| Field | Type | Description |
|-------|------|-------------|
| userId | string | Firebase Auth UID (indexed, server-derived) |
| envelopeId | string | FK to `envelopes/{id}` |
| amountCents | number | Transaction amount in integer cents (always positive) |
| date | string | User-entered date as `YYYY-MM-DD` (not Timestamp, avoids timezone issues) |
| merchant | string? | Optional merchant name (max 200 chars, never logged server-side) |
| description | string? | Optional note (max 500 chars, never logged server-side) |
| createdAt | Timestamp | Server-set creation time |
| updatedAt | Timestamp | Server-set last modification |

### Firestore: `envelope_allocations/{autoId}`

| Field | Type | Description |
|-------|------|-------------|
| userId | string | Firebase Auth UID |
| sourceTransactionId | string | The transaction that caused the overage |
| donorEnvelopeId | string | The envelope that donated funds |
| amountCents | number | Amount reallocated in integer cents |
| createdAt | Timestamp | Server-set creation time |

### Firestore: `envelope_billing/{uid}`

| Field | Type | Description |
|-------|------|-------------|
| uid | string | Firebase Auth UID |
| firstAccessWeekStart | string | `YYYY-MM-DD` of first-ever access week's Sunday |
| paidWeeks | Record<string, object> | Map of `weekStart` -> `{ usageId, creditsCharged, chargedAt }` |
| createdAt | Timestamp | Server-set creation time |
| updatedAt | Timestamp | Server-set last modification |

### Firestore Composite Indexes Required

```
envelopes:                (userId ASC, sortOrder ASC)
envelope_transactions:    (userId ASC, date ASC)
envelope_transactions:    (userId ASC, envelopeId ASC, date ASC)
envelope_allocations:     (sourceTransactionId ASC)
envelope_allocations:     (donorEnvelopeId ASC)
```

## Error Handling

| Error Scenario | HTTP Status | Response | Behavior |
|----------------|-------------|----------|----------|
| Missing/invalid Bearer token | 401 | `{ error: "Unauthorized" }` | `verifyUser()` returns `authorized: false` |
| Zod validation failure | 400 | `{ error: "Validation failed", details: [...] }` | `safeParse()` returns `success: false` |
| Envelope not found or wrong owner | 404 | `{ error: "Envelope not found or access denied." }` | Ownership check fails |
| Transaction not found or wrong owner | 404 | `{ error: "Transaction not found or access denied." }` | Ownership check fails |
| Allocation sum does not equal overage | 400 | `{ error: "Validation failed", details: [...] }` | `validateAllocations()` returns errors |
| Donor balance insufficient | 400 | `{ error: "Allocation for X exceeds remaining balance" }` | `validateAllocations()` catches |
| Firestore unavailable | 500 | `{ error: "Internal server error" }` | `requireDb()` throws |
| Insufficient billing credits | 200 | `{ mode: "readonly", reason: "unpaid" }` | BillingGate enables read-only mode |

**Privacy constraint:** API route error logging never includes request bodies containing `merchant` or `description` fields. Only operation name, userId, error type, and status code are logged.

## Integration Points

| System | Integration | Direction | Purpose |
|--------|-------------|-----------|---------|
| Firebase Auth | `verifyUser(request)` via Bearer token | Client -> Server | Authenticate all API requests |
| Firestore (Admin SDK) | `firebase-admin/firestore` | Server -> Database | All data reads and writes |
| Host site billing | `debitForToolUse()` pattern | Server -> Firestore | Weekly access billing (100 credits) |
| Host site auth context | `AuthContext` / `user.getIdToken()` | Client | Obtain Bearer token for API calls |
| Host site UI components | `Card`, `Button`, `AuthGuard` | Client | Reuse existing UI primitives |
| SWR | `useSWR` / `mutate` | Client | Cache management for API responses |
| date-fns v4 | `startOfWeek`, `endOfWeek`, `format`, etc. | Shared | Week boundary calculations |

## Architecture Decision Records

| ID | Decision | Rationale | Alternatives Considered |
|----|----------|-----------|------------------------|
| ADR-01 | API Routes for all authenticated mutations (not Server Actions) | `verifyUser()` requires a `Request` object with `Authorization` header; Server Actions receive `FormData` not `Request`. Consistent with existing brand-scraper and billing patterns. | Server Actions with token passed as argument (breaks pattern consistency) |
| ADR-02 | Integer cents for all monetary values | Eliminates IEEE 754 floating-point rounding errors. `0.1 + 0.2 !== 0.3` in JavaScript. Industry standard for financial applications. | Floating-point dollars (introduces penny errors), dinero.js library (unnecessary -- all math is integer) |
| ADR-03 | Compute envelope balances on read (no denormalized `remaining`) | Eliminates write contention on envelope docs, prevents consistency drift from partial write failures, simplifies cascading deletes. ~60 doc reads per home page load costs $0.000036. | Denormalized `remaining` field (write contention, consistency risk, complex delete cascades) |
| ADR-04 | Top-level Firestore collections with `userId` field (not subcollections) | Consistent with existing billing system pattern (`billing_tool_usage`, `billing_purchases`). Allows collection group queries for admin analytics. | User-scoped subcollections (`users/{uid}/envelopes`) -- works but deviates from codebase conventions |
| ADR-05 | Transaction dates stored as `YYYY-MM-DD` strings (not Timestamps) | Users pick dates, not datetimes. String format avoids timezone conversion issues. Enables clean range queries (`date >= "2026-02-08" AND date <= "2026-02-14"`). | Firestore Timestamps (timezone ambiguity near midnight), Date objects |
| ADR-06 | date-fns v4 for week math (not Temporal API, not day.js) | Tree-shakeable, stable (24K+ npm dependents). `startOfWeek` with `weekStartsOn: 0` is purpose-built for Sunday-start weeks. Temporal API has no Safari support. | Temporal API (no Safari), day.js (missing `eachWeekOfInterval` and `isSameWeek` without plugins), Moment.js (deprecated) |
| ADR-07 | Two-phase overage workflow (detect then commit) | Writing the transaction first and asking the user to fix creates inconsistent state (negative balance with no allocations). Two-phase approach ensures data is never inconsistent. | Single-phase write-then-fix (consistency window), pre-commit with rollback (complex) |
| ADR-08 | SWR for client data fetching (not TanStack Query) | Already in the host repo. No reason to add a competing library for the same purpose. | TanStack Query (would replace existing SWR, unnecessary churn) |
| ADR-09 | Separate `envelope_allocations` collection (not embedded in transaction docs) | Enables `where("sourceTransactionId", "==", id)` for cascading deletes. Supports queries like "how much was donated from envelope X." | Embedded array in transaction doc (complicates deletion, prevents donor-centric queries) |

## Limitations and Tradeoffs

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| No real-time updates (polling via SWR, not Firestore listeners) | User must refresh or navigate to see changes from another session | SWR `revalidateOnFocus` provides reasonable freshness; single-user app makes this acceptable |
| No offline support | Transactions cannot be logged without network connectivity | Responsive web design works well on mobile; offline PWA support deferred to v2+ |
| Balance compute-on-read adds latency on first load | Home page requires 2+ Firestore queries before rendering | Parallel query execution (`Promise.all`), SWR caching eliminates repeat costs |
| No server-side pagination for transactions | Performance degrades with many months of historical data | Week-scoped queries naturally limit result size; most users have <50 transactions per week |
| All Firestore access is server-side only | Cannot use Firestore offline persistence or real-time listeners | Trade-off for security: deny-all client rules eliminate entire class of authorization bugs |
| Weekly cadence only (no monthly, biweekly, or custom periods) | Users who prefer other cadences cannot use the tool | Deliberate product constraint -- weekly focus is the primary differentiator |
| Single currency (USD) | International users cannot use native currency | `Intl.NumberFormat("en-US", { currency: "USD" })` is hardcoded; multi-currency deferred |
