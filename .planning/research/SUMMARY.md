# Project Research Summary

**Project:** Digital Envelopes
**Domain:** Envelope budgeting web application (weekly cadence)
**Researched:** 2026-02-10
**Confidence:** HIGH

## Executive Summary

Digital Envelopes is a weekly-cadence envelope budgeting tool embedded within an existing Next.js 16 personal brand site. Research reveals that envelope budgeting is a well-established domain with clear patterns: users need envelopes with budgets, transaction logging, balance tracking, and overage reallocation. The weekly cadence is a differentiator — most competitors default to monthly cycles. The product should be built as a focused mini-app, not a full financial management suite, leveraging the existing host repo's patterns (Firebase Auth, Firestore admin SDK via API routes, SWR for data fetching, Tailwind CSS 4).

The recommended approach is to use the existing stack with one new dependency (date-fns v4 for Sunday-start week calculations), store all monetary values as integer cents to avoid floating-point errors, compute envelope balances on read rather than denormalizing, and handle overage reallocation as a two-phase atomic workflow. The primary risk is the overage reallocation complexity — it must handle penny-precise allocation across donor envelopes, prevent negative balances, and support cascading deletes. This requires Firestore transactions and careful validation.

Critical pitfalls include floating-point currency math (use integer cents everywhere), timezone-aware week boundary calculation (store user timezone, use date-fns TZDate), overage allocation "lost penny" problems (use largest remainder method), and cascading delete failures (atomic transactions that clean up linked allocations). These must be addressed in Phase 1 (data model design) to avoid costly refactoring later.

## Key Findings

### Recommended Stack

The host repository already contains all necessary technologies except date math utilities. The envelope feature will use Next.js 16 App Router, React 19, Tailwind CSS 4, Firebase Auth (Google Sign-In), Firestore (admin SDK server-side), Zod v4 for validation, and SWR for client-side data fetching. The only new dependency is **date-fns v4** for week boundary calculations (Sunday-start weeks, tree-shakable, 24K+ npm dependents).

**Core technologies:**
- **date-fns v4**: Week math utilities — handles Sunday-start weeks out of the box with `weekStartsOn: 0`, provides `startOfWeek`, `endOfWeek`, `eachWeekOfInterval`, and `isSameWeek`
- **Firestore (admin SDK)**: Database — top-level collections with `userId` field filtering, consistent with existing billing system patterns
- **API Routes + SWR**: Data layer — authenticated reads/writes via `verifyUser(request)` with Bearer token, client-side caching via SWR
- **Intl.NumberFormat (built-in)**: Currency formatting — no library needed since all values are integer cents, display-time conversion only
- **Zod v4**: Validation — existing pattern from contact form (`useActionState` + Server Action + `safeParse`)

**Key architectural decisions:**
- API Routes (not Server Actions) for all authenticated mutations — consistent with existing brand-scraper and billing patterns that use `verifyUser(request)`
- Integer cents everywhere — no floating-point currency math; store as `number` (int), format as string only at display layer
- Compute-on-read for envelope balances — no denormalized `remaining` field, reduces write contention and consistency risk
- Two-phase overage workflow — detect overage without writing, user allocates from donors, atomic commit with validation

### Expected Features

**Must have (table stakes):**
- Create/edit/delete envelopes with weekly budget amounts
- Record transactions manually (date, amount, envelope, merchant, description)
- View remaining balance per envelope (computed: weekly budget - sum of transactions for current week)
- Transfer/reallocate funds between envelopes (overage handling)
- Weekly reset/refill cycle (configurable start day, user chooses carry-over vs reset per envelope)
- Transaction history per envelope (filterable by current week vs all time)
- Dashboard/overview screen (card-based layout showing all envelopes with status)
- Overspending indication (red/warning state when envelope goes negative)
- Edit/delete transactions (recalculates balances)
- User authentication (Google Sign-In via existing Firebase Auth)
- Data persistence (Firestore with user-scoped security rules)
- Weekly credit-based access (100 credits/week via existing billing system)

**Should have (competitive differentiators):**
- Weekly cadence as the default and only mode (not monthly)
- Simple card-based UI matching host site Tailwind design
- Quick-add transaction form (minimal friction, pre-selected envelope, auto-date to today)
- Envelope templates/presets during onboarding (reduce blank-slate paralysis)
- Rollover policy per envelope (savings envelopes carry surplus, spending envelopes reset)

**Defer (v2+):**
- Weekly analytics/insights (end-of-week summary, week-over-week trends) — nice-to-have but not MVP
- Bank account syncing — explicitly anti-feature (requires Plaid, security liability, contradicts manual-tracking philosophy)
- Multi-user/household sharing — high complexity, single-user MVP first
- Goal setting/savings goals — different mental model from weekly spending
- Bill reminders/notifications — out of scope
- Mobile native app — responsive web only
- CSV export — low priority
- Recurring transactions — weekly cadence makes this less relevant

### Architecture Approach

Digital Envelopes is a feature module within the existing Next.js 16 site, following the established pattern: thin page files delegating to client components, API routes with `verifyUser()` for authenticated mutations, Firestore via admin SDK for all data access, and the existing billing system for weekly access control. The architecture uses top-level Firestore collections (not subcollections) with `userId` field filtering, consistent with the billing system pattern (`billing_tool_usage`, `billing_purchases`).

**Major components:**

1. **`/envelopes` route group** — Layout with AuthGuard + BillingGate (checks weekly access, disables mutations if unpaid) + sub-navigation tabs (Home, Transactions, Analytics). Three pages: Home (envelope cards + inline transaction form), Transactions (week selector + transaction list + CRUD), Analytics (weekly pivot table, deferred to v1.1+).

2. **`/api/envelopes` routes** — All CRUD operations via API Route Handlers authenticated with `verifyUser(request)`. GET `/api/envelopes` returns envelopes with computed `remaining` (server-side aggregation). POST `/api/envelopes/transactions` handles transaction creation with two-phase overage workflow (detect -> modal -> commit with allocations). DELETE cascades to linked overage allocations via Firestore batch write.

3. **Firestore collections** — `envelopes` (userId, title, weeklyBudgetCents, sortOrder, timestamps), `envelope_transactions` (userId, envelopeId, date as ISO string, amountCents, merchant, description, weekStart denormalized for efficient queries, timestamps), `envelope_overage_allocations` (userId, transactionId, donorEnvelopeId, recipientEnvelopeId, amountCents, weekStart, timestamps), `envelope_weekly_access` (billing idempotency via deterministic doc ID `{userId}_{weekStart}`).

4. **Week math utilities** — Pure functions in `src/lib/envelopes/week-math.ts` using date-fns: `getWeekStart(date)` returns ISO date of Sunday, `getWeekLabel(weekStart)` formats for display, `getRemainingDaysPercent(today)` computes fraction of week remaining, `getStatusLabel(remaining, budget, remainingPct)` returns "on-track" / "caution" / "over-budget".

5. **Overage modal workflow** — Two-phase: (1) POST transaction detects overage, returns `{ needsOverage: true, overageAmount, donorEnvelopes }`, (2) client opens OverageModal with allocation form, (3) POST transaction with `{ overageAllocations: [{donorEnvelopeId, amountCents}] }`, (4) server executes Firestore transaction atomically writing transaction + allocations + validating donor balances.

### Critical Pitfalls

1. **Floating-point currency math** — Storing dollars as `number` causes penny errors that compound silently. Prevention: Store all values as integer cents, perform all arithmetic in integer cents, convert to dollars only at display layer. Use explicit variable names (`amountCents`) and validate `Number.isInteger()` before Firestore writes.

2. **Overage allocation "lost penny" problem** — Distributing $5.00 across 3 envelopes via naive integer division (`500 / 3 = 166` each) loses 2 cents (`166 * 3 = 498`). Prevention: Use largest remainder method — floor all shares, compute remainder, sort donors by fractional remainder descending, distribute one extra cent to top N donors. Assert `sum(allocations) === overageAmount` before every write.

3. **Week boundary timezone errors** — Transaction logged at 11:30 PM Saturday Pacific is Sunday 7:30 AM UTC, landing in the wrong budget week. Prevention: Store user's IANA timezone in profile, compute week boundaries using date-fns v4 `TZDate` in user timezone, denormalize `weekStart` (ISO date string) on transactions for efficient querying.

4. **Deleting transactions with linked overage allocations** — Deleting a transaction that caused overage leaves orphaned allocations, making donor envelope balances permanently incorrect. Prevention: Cascade deletes via Firestore batch write — query allocations by `transactionId`, delete all linked allocations atomically with transaction deletion.

5. **Firestore transaction contention on shared envelope documents** — Multiple rapid writes to the same envelope (e.g., updating `spentCents` on 3 quick transactions) causes contention failures (`ABORTED: Too much contention`). Prevention: Use compute-on-read instead of denormalized `remaining` field, eliminates write contention on envelope docs entirely.

6. **Security rules allow cross-user data access** — Overly permissive rules (`allow read, write: if request.auth != null`) let any authenticated user read/write any other user's data. Prevention: Every collection must validate `request.auth.uid == resource.data.userId` in Firestore security rules, test with Firebase Emulator rules suite.

## Implications for Roadmap

Based on research, suggested phase structure prioritizes foundational correctness (data model, week math, security), then core CRUD (envelopes, transactions), then complex workflows (overage reallocation), then polish (UI enhancements, analytics). This ordering avoids the critical pitfalls early and defers nice-to-have features to later phases.

### Phase 1: Foundation (Data Model, Week Math, Security)
**Rationale:** All other features depend on correct week boundaries, integer-cents storage, and secure user-scoped data access. These must be established first to avoid costly retrofitting.
**Delivers:** Firestore collection schemas, security rules, week math utilities (`getWeekStart`, `getWeekLabel`, `getRemainingDaysPercent`, `getStatusLabel`), TypeScript types, Zod schemas, user timezone storage.
**Addresses:** Pitfall 1 (floating-point), Pitfall 3 (timezone), Pitfall 6 (security), Pitfall 11 (weekId consistency).
**No user-facing features yet** — pure infrastructure.

### Phase 2: Envelope CRUD
**Rationale:** Users need envelopes before they can log transactions. Simple CRUD with no complex dependencies.
**Delivers:** Create/edit/delete envelopes, API routes (`GET/POST/PUT/DELETE /api/envelopes`), `EnvelopeCard` component, `EnvelopesHomePage` with card grid, sub-navigation layout.
**Addresses:** Table stakes T1 (create envelopes), T2 (set budget), T8 (dashboard).
**Uses:** Phase 1 schemas, security rules, week math (for display, not computation yet).

### Phase 3: Transaction CRUD (No Overage Handling)
**Rationale:** Core budget tracking loop — log spending, see balance drop. Overage is deferred to next phase because it requires complex validation and atomic writes.
**Delivers:** Create/delete transactions (edit deferred to polish), transaction list page with week selector, quick-add form, `listEnvelopesWithRemaining()` server function (computes balance from transactions), remaining balance display on envelope cards.
**Addresses:** Table stakes T3 (record transaction), T4 (view balance), T7 (transaction history), T10 (delete transaction).
**Implements:** Compute-on-read pattern (avoids Pitfall 5 contention, Pitfall 7 denormalization drift).

### Phase 4: Overage Reallocation Workflow
**Rationale:** Most complex feature, requires Firestore transactions, largest remainder allocation, donor validation. Built after simple CRUD is stable.
**Delivers:** Two-phase overage workflow (detect -> modal -> commit), `OverageModal` component with donor allocation form, `createTransactionWithOverage()` Firestore transaction, donor balance validation, cascading delete cleanup.
**Addresses:** Table stakes T5 (transfer between envelopes), T9 (overspending indication), Pitfall 2 (lost penny), Pitfall 4 (cascading deletes), Pitfall 9 (donor below zero).
**Critical phase** — this is where the envelope budgeting complexity lives.

### Phase 5: Weekly Reset/Refill
**Rationale:** Automates the budget cycle. Depends on working CRUD and overage handling.
**Delivers:** Configurable week start day (user profile setting), rollover policy per envelope (carry-over vs reset), weekly refill logic (Firestore transaction or Cloud Function scheduled trigger), first-week onboarding (set initial budgets).
**Addresses:** Table stakes T6 (weekly reset), differentiator D6 (per-envelope rollover policy).
**Needs research** — weekly reset implementation strategy (client-side on page load vs server-side scheduled job).

### Phase 6: Billing Integration
**Rationale:** Required for monetization. Integrates with existing billing system patterns.
**Delivers:** Weekly access check via `checkWeeklyAccess()` using deterministic `envelope_weekly_access` doc IDs, charge via `chargeWeeklyAccess()` wrapping existing `debitForToolUse()`, `BillingGate` component in layout (checks paid status, enables read-only mode if unpaid), credit cost definition (100 credits/week).
**Addresses:** Table stakes T11 (auth), differentiator D7 (credit-based access), Pitfall 10 (stale cache after revocation).
**Uses:** Existing billing Firestore functions, low complexity.

### Phase 7: Polish & Enhancements
**Rationale:** UI/UX improvements that make the product delightful but aren't blocking MVP.
**Delivers:** Edit transaction (delta-based update to avoid Pitfall 14), inline transaction form on envelope cards (expandable), envelope templates/presets during onboarding, greeting banner with summary stats, status badges (on-track / caution / over-budget), improved error messages.
**Addresses:** Table stakes T10 (edit transaction), differentiator D4 (quick-add), D5 (templates).
**Low risk** — pure client-side enhancements.

### Phase 8 (Optional): Weekly Analytics
**Rationale:** Differentiator but not MVP. Requires historical data to be meaningful.
**Delivers:** Weekly pivot table (rows = weeks, columns = envelopes, values = sum of transactions), week-over-week trends, summary stats (total spent, on-track count).
**Addresses:** Differentiator D3 (weekly analytics).
**Defer to v1.1+** — need real usage data first.

### Phase Ordering Rationale

- **Phase 1 comes first** because floating-point errors, timezone bugs, and security holes are architectural mistakes that require touching every file to fix later. Get them right from the start.
- **Phase 2-3 (CRUD) before Phase 4 (overage)** because overage reallocation is the most complex workflow and benefits from a stable foundation. Users can manually transfer between envelopes if overage flow isn't built yet.
- **Phase 4 is the critical path** — without overage handling, the product isn't a real envelope budgeting tool (all competitors have this).
- **Phase 5 (weekly reset) after Phase 4** because reset logic must handle carried-over amounts and negative balances correctly, which depends on overage allocation being stable.
- **Phase 6 (billing) can be built in parallel with Phase 4-5** since it's orthogonal to envelope logic. However, it should be tested with full CRUD flows before launch.
- **Phase 7-8 are polish** — they enhance the product but aren't blocking launch.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 5 (Weekly Reset):** Implementation strategy unclear — client-side rollover on first page load of new week vs server-side Cloud Function scheduled trigger vs Firestore TTL policy. Need to research Firestore scheduled jobs, Cloud Scheduler integration, and idempotency patterns.
- **Phase 6 (Billing Integration):** Existing `debitForToolUse()` function needs review to understand how to pass tool name, check balance, handle insufficient credits. May need to read billing Firestore code during phase planning.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Week math with date-fns is well-documented, Firestore schema design follows existing patterns, security rules are standard.
- **Phase 2 (Envelope CRUD):** Basic REST CRUD via API routes, standard Next.js patterns.
- **Phase 3 (Transaction CRUD):** Same as Phase 2, well-documented.
- **Phase 4 (Overage Reallocation):** Complex but research already completed — largest remainder method is well-documented (Shopify, Betterment), Firestore transactions are standard.
- **Phase 7 (Polish):** Pure UI/UX work, no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies except date-fns are already in host repo. date-fns v4 verified via official blog post and npm. Intl.NumberFormat is built-in. No unknowns. |
| Features | HIGH | Cross-referenced YNAB, Goodbudget, EveryDollar, RealBudget, Actual Budget. Table stakes features are consistent across all competitors. Weekly cadence is validated (Goodbudget supports it). |
| Architecture | HIGH | Firestore collection structure, API routes pattern, compute-on-read strategy all verified against existing codebase patterns (billing system, brand-scraper, contact form). Firestore transactions documented by Firebase. |
| Pitfalls | HIGH | Critical pitfalls (floating-point, lost penny, timezone, cascading deletes) are well-documented with established solutions (integer cents, largest remainder method, TZDate, batch writes). Firestore contention and security rules confirmed via official Firebase docs. |

**Overall confidence:** HIGH

Research sources are primarily official documentation (Firebase, React, date-fns, MDN) and verified engineering sources (Shopify, Betterment, NerdWallet). Codebase patterns validated by reading existing files (`billing/firestore.ts`, `auth/user.ts`, `contact/ContactForm.tsx`, `api/tools/brand-scraper`). No tertiary or unverified sources used for critical decisions.

### Gaps to Address

- **Weekly reset implementation strategy:** Research doesn't specify whether to use client-side rollover logic (check on page load, refill if new week detected) vs server-side Cloud Function (scheduled trigger every Sunday at user's configured time). This affects Phase 5 planning. Recommendation: Start with client-side rollover for MVP (simpler, no Cloud Functions deploy), evaluate scheduled approach in v1.1 if users report issues with stale weekly data.

- **User timezone storage location:** Research recommends storing IANA timezone string in user profile but doesn't specify where. Options: (1) Firebase Auth custom claims, (2) Firestore `users/{uid}` document, (3) Firestore `envelope_user_settings/{uid}` document. Recommendation: Use Firestore `users/{uid}` document (or create if doesn't exist) since custom claims require admin SDK writes and are more rigid.

- **Rollover policy default:** Research mentions per-envelope rollover policy but doesn't specify the default. Should new envelopes default to "carry over surplus" or "reset to budget amount"? Recommendation: Default to "reset" for spending categories (groceries, gas, dining) and surface a toggle in the UI. Users can opt-in to carry-over for savings-like envelopes (vacation, emergency fund).

- **Transaction edit behavior:** Edit transaction amount requires computing delta and applying via `FieldValue.increment()`. But what if the user edits the *envelope* field (moving transaction from "Groceries" to "Dining")? This requires decrementing old envelope and incrementing new envelope atomically. Research flags this (Pitfall 14) but doesn't detail the multi-envelope edit case. Recommendation: Phase 7 should implement envelope-change edits as a Firestore transaction that updates both envelopes atomically.

- **Firestore indexes:** Research mentions composite indexes needed but doesn't provide the full `firestore.indexes.json` structure. Recommendation: Let Firestore generate the index URL on first query error during development, then add to `firestore.indexes.json` and deploy. Proactively define indexes for known query patterns: `(userId, weekStart)` for transactions, `(userId, sortOrder)` for envelopes, `(userId, transactionId)` for allocations.

## Sources

### Primary (HIGH confidence)
- Firebase Firestore official docs: data model, transactions, security rules, billing, offline persistence, best practices
- Next.js 16 official docs: App Router, Server Actions, Route Handlers, `useActionState`
- React 19 official docs: `useActionState`, `useFormStatus`
- date-fns v4 official docs + blog post: `startOfWeek`, `weekStartsOn`, timezone support via `@date-fns/tz`
- MDN: `Intl.NumberFormat`, `Date`, `getUTCDay`
- Host codebase: `src/lib/billing/firestore.ts`, `src/lib/auth/user.ts`, `src/lib/actions/contact.ts`, `src/components/contact/ContactForm.tsx`, `src/app/api/tools/brand-scraper/scrape/route.ts`, `package.json`

### Secondary (MEDIUM confidence)
- NerdWallet: Best Budget Apps 2026 — feature comparison across YNAB, Goodbudget, EveryDollar
- Shopify Engineering: 8 Tips for Hanging Pennies — largest remainder method
- Betterment: Penny-Precise Allocation Functions — integer cents allocation algorithms
- Frontstuff: How to Handle Monetary Values in JavaScript — integer cents pattern
- Honeybadger: Currency Calculations in JavaScript — floating-point pitfalls
- Eleken: Budget App Design Tips — UI/UX patterns for budget apps
- Firestore Query Best Practices (Estuary.dev) — denormalization tradeoffs
- Makerkit: Server Actions vs Route Handlers — when to use which

### Tertiary (LOW confidence)
- None — all critical decisions based on PRIMARY or SECONDARY sources

---
*Research completed: 2026-02-10*
*Ready for roadmap: yes*
