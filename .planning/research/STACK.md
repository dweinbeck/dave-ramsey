# Technology Stack

**Project:** Digital Envelopes
**Researched:** 2026-02-10
**Overall confidence:** HIGH

## Existing Stack (Fixed -- Do Not Change)

These technologies are already in the host repo (`personal-brand`). The envelope budgeting feature MUST use them.

| Technology | Version in Repo | Purpose |
|------------|----------------|---------|
| Next.js | 16.1.6 | Framework (App Router) |
| React | 19.2.3 | UI library |
| Tailwind CSS | ^4 | Styling (CSS-first config, `@theme` directive) |
| Firebase Auth | ^12.8.0 (client) / ^13.6.0 (admin) | Authentication (Google Sign-In) |
| Firestore | (via firebase/firebase-admin) | Database |
| Zod | ^4.3.6 | Schema validation |
| SWR | ^2.4.0 | Client-side data fetching |
| clsx | ^2.1.1 | Conditional CSS class merging |
| Vitest | ^3.2.4 | Testing |
| Biome | 2.2.0 | Linting and formatting |
| TypeScript | ^5 | Type safety |

## New Dependencies to Add

### date-fns -- Date Math and Week Boundaries

| Library | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `date-fns` | `^4.1.0` | Week boundary calculations, date formatting, interval generation | HIGH |

**Why date-fns:**

1. **Sunday-start weeks out of the box.** `startOfWeek(date)` defaults to `weekStartsOn: 0` (Sunday), which is exactly what this project needs. No configuration required for the default case, but explicitly passing `{ weekStartsOn: 0 }` makes intent clear.

2. **Tree-shakable.** Import only the functions you use (`startOfWeek`, `endOfWeek`, `eachWeekOfInterval`, `format`, `isSameWeek`, `differenceInDays`, `isWithinInterval`). No barrel import bloat. This matters for a mini-app that should not bloat the host site's bundle.

3. **Stable and mature.** v4.1.0 is the current stable release. 24,000+ dependents on npm. Well-documented API.

4. **v4 adds first-class time zone support** via `@date-fns/tz`, which is not needed now but available if the app later needs timezone-aware week boundaries.

**Key functions needed:**

```typescript
import { startOfWeek, endOfWeek, format, isSameWeek, eachWeekOfInterval, isWithinInterval, differenceInDays } from "date-fns";

// Get current week boundaries (Sunday-Saturday)
const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

// Format for display: "Week 6: 2/9/2026 - 2/15/2026"
const label = `${format(weekStart, "M/d/yyyy")} - ${format(weekEnd, "M/d/yyyy")}`;

// Check if a transaction date falls in the current week
const inThisWeek = isSameWeek(txnDate, new Date(), { weekStartsOn: 0 });

// Generate week list for analytics
const weeks = eachWeekOfInterval(
  { start: firstTxnDate, end: new Date() },
  { weekStartsOn: 0 }
);
```

**Why NOT Temporal API:** Temporal shipped in Chrome 144 (Jan 2026) and Firefox 139 (May 2025), but Safari has no production support yet (only behind a flag in Tech Preview). The host site targets `Safari 16.4+` (per Tailwind CSS 4 requirements). Using Temporal would require a polyfill that adds bundle weight and complexity for no gain. date-fns is the right call today.

**Why NOT moment.js:** Deprecated. The Moment.js team themselves recommend alternatives.

**Why NOT day.js:** Smaller than date-fns but less comprehensive for week-interval operations. date-fns's `eachWeekOfInterval` and `isSameWeek` with `weekStartsOn` are purpose-built for this use case. day.js requires plugins for similar functionality.

**Sources:**
- [date-fns npm](https://www.npmjs.com/package/date-fns) -- v4.1.0 confirmed current
- [date-fns startOfWeek docs](https://date-fns.org/) -- `weekStartsOn: 0` default confirmed
- [Can I Use Temporal](https://caniuse.com/temporal) -- Safari not supported, ~49.5% global coverage
- [Bryntum Temporal status](https://bryntum.com/blog/javascript-temporal-is-it-finally-here/) -- Safari timeline unclear

## No Other New Dependencies Needed

The rest of the stack is already in the repo. Here is the specific rationale for each "do not add" decision:

### Currency Formatting: Use `Intl.NumberFormat` (built-in)

**Confidence:** HIGH

No library needed. The browser's built-in `Intl.NumberFormat` handles USD formatting perfectly. Since all values are stored as integer cents, the pattern is trivial:

```typescript
// Utility function (put in src/lib/envelopes/format.ts)
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}

// formatCents(1599) => "$15.99"
// formatCents(-350) => "-$3.50"
// formatCents(0) => "$0.00"
```

**Why NOT currency.js or dinero.js:** These libraries solve floating-point math problems. Since all values are stored as integer cents and all arithmetic is integer-only, there is no floating-point problem to solve. The only conversion is `cents / 100` at the display layer. Adding a library for this is pure overhead.

**Source:** [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)

### Form State: Use `useActionState` + Zod (already in repo)

**Confidence:** HIGH

The repo already has an established pattern for this in `ContactForm.tsx`:

```
useActionState (React 19) + Server Action + Zod safeParse + useFormStatus
```

This exact pattern should be reused for envelope CRUD forms. The existing pattern includes:
- `useActionState` for form state management and server action binding
- Server Action with `"use server"` directive
- `Zod.safeParse()` for server-side validation
- `useFormStatus` (from `react-dom`) for pending state in submit buttons
- Client-side inline validation on blur for immediate feedback
- Structured return type: `{ success: boolean; errors?: Record<string, string[]>; message?: string }`

**For the envelope forms specifically:**

1. **Create/Edit Envelope form:** Simple -- title (string) + weeklyBudget (number in cents). Use `useActionState` with a Server Action that validates via Zod and writes to Firestore.

2. **Transaction form (inline on card):** Date, cost (cents), merchant, description. Same `useActionState` pattern. The inline expansion is a UI concern, not a form-handling concern.

3. **Overage reallocation modal:** More complex -- dynamic number of inputs (one per donor envelope), sum validation. Still use `useActionState` because the validation (sum equals overage, each donor <= remaining) MUST happen server-side for consistency. Client-side validation can provide immediate feedback.

**Why NOT react-hook-form:** The repo does not use it. Adding it would introduce a new dependency and a second form-handling pattern. The `useActionState` approach already works well in the repo, provides progressive enhancement, and the envelope forms are not complex enough to justify react-hook-form's advanced features (field arrays, complex conditional logic, etc.). The overage modal has dynamic inputs but they are all the same type (amount fields), not deeply nested or conditionally rendered.

**Sources:**
- [React useActionState docs](https://react.dev/reference/react/useActionState) -- confirmed API: `const [state, formAction, isPending] = useActionState(fn, initialState)`
- Host repo `src/components/contact/ContactForm.tsx` -- existing pattern verified
- Host repo `src/lib/actions/contact.ts` -- Server Action pattern verified

### Data Fetching: Use API Routes + SWR (existing repo pattern for authenticated data)

**Confidence:** HIGH

The repo uses two patterns for data access, and the envelope feature needs the second one:

**Pattern 1 -- Server Actions for mutations (unauthenticated or cookie-auth)**
Used by: Contact form (`submitContact`), content actions (`saveTutorial`)
When: Public forms, admin tools that pass ID token as function argument

**Pattern 2 -- API Route Handlers + SWR for authenticated reads**
Used by: Brand scraper tool (`/api/tools/brand-scraper/*`), billing (`/api/billing/*`)
When: Data requires Firebase ID token verification via `verifyUser(request)` which reads `Authorization: Bearer <token>` header

**For Digital Envelopes, use Pattern 2 (API Routes) for ALL data operations because:**

1. **Authentication model requires it.** The `verifyUser()` function expects a `Request` object with an Authorization header. Server Actions do not receive a `Request` object -- they receive `FormData` or plain arguments. To use Server Actions for authenticated writes, you would need to pass the ID token as a function argument (like `saveTutorial` does), which is less ergonomic for CRUD-heavy features with many endpoints.

2. **Read/write symmetry.** Envelope data needs both reads (list envelopes, list transactions, analytics) and writes (create/edit/delete). Using API Routes for both keeps the auth pattern consistent: every route calls `verifyUser(request)` first.

3. **SWR for client-side state.** After a mutation (create transaction, reallocate), call `mutate()` to revalidate the SWR cache. This gives instant UI updates without full page reloads. The brand-scraper already demonstrates this pattern with SWR polling.

4. **Overage reallocation needs a Firestore transaction.** The reallocation must atomically: (a) create the transaction, (b) create overage allocation records, (c) update donor envelope remaining amounts. This is a multi-document Firestore `runTransaction()` -- exactly like the billing system's `debitForToolUse()`. API Routes are the natural home for this.

**However, consider a hybrid approach for simple form submissions:**

For create/edit envelope (simple single-document writes), Server Actions with `useActionState` may feel cleaner since there is an established pattern. Pass the ID token as an argument (like `saveTutorial` does). For transaction creation that may trigger overage reallocation, use an API Route because the logic is complex and transactional.

**Recommended API structure:**

```
src/app/api/envelopes/
  route.ts              -- GET (list), POST (create)
src/app/api/envelopes/[id]/
  route.ts              -- PUT (update), DELETE
src/app/api/envelopes/transactions/
  route.ts              -- GET (list with week filter), POST (create + overage check)
src/app/api/envelopes/transactions/[id]/
  route.ts              -- DELETE (with overage cleanup)
src/app/api/envelopes/analytics/
  route.ts              -- GET (weekly summary data)
src/app/api/envelopes/billing/
  route.ts              -- POST (check/charge weekly access)
```

**SWR usage pattern:**

```typescript
// Custom hook pattern (like existing useJobStatus)
export function useEnvelopes(token: string | null) {
  return useSWR(
    token ? "/api/envelopes" : null,
    (url) => authFetch(url, token!).then(r => r.json()),
    { revalidateOnFocus: false }
  );
}

// After mutation, revalidate:
await fetch("/api/envelopes/transactions", { method: "POST", ... });
mutate("/api/envelopes");          // Refresh envelope list (remaining updated)
mutate("/api/envelopes/transactions"); // Refresh transaction list
```

**Sources:**
- Host repo `src/lib/auth/user.ts` -- `verifyUser()` requires `Request` object
- Host repo `src/app/api/tools/brand-scraper/scrape/route.ts` -- authenticated API Route pattern
- Host repo `src/lib/brand-scraper/hooks.ts` -- SWR usage pattern with Bearer token
- Host repo `src/lib/actions/contact.ts` -- Server Action pattern (no auth header needed)

### State Management: No Global State Library Needed

**Confidence:** HIGH

The envelope feature does not need Redux, Zustand, Jotai, or any global state library. Here is why:

1. **SWR IS the state manager for server data.** SWR caches API responses and provides `mutate()` for cache invalidation. All envelope/transaction data lives on the server (Firestore) and is fetched via SWR.

2. **Local UI state is component-scoped.** The only client-side state is:
   - Which envelope card is expanded (inline transaction form) -- `useState` in the list component
   - Whether the overage modal is open -- `useState`
   - Form field values -- managed by `useActionState` or uncontrolled inputs
   - Current week selection -- `useState` (or URL search param)

3. **Existing repo pattern.** The host site uses `AuthContext` for auth state and SWR for server state. No other global state library exists. Adding one would be a pattern violation.

**Source:** Host repo -- no global state library in `package.json`; `AuthContext` is the only React context.

## Firestore Collection Structure Recommendation

**Confidence:** MEDIUM -- This is a design recommendation, not a technology choice. Needs validation during implementation.

### Recommended Structure

```
envelopes/                          # Root collection
  {envelopeId}/                     # Document per envelope
    userId: string                  # Owner (enforced server-side)
    title: string
    weeklyBudgetCents: number       # Budget in integer cents
    createdAt: Timestamp
    updatedAt: Timestamp

envelope_transactions/              # Root collection (not subcollection)
  {transactionId}/                  # Document per transaction
    userId: string                  # Owner (enforced server-side)
    envelopeId: string              # FK to envelope
    amountCents: number             # Transaction amount in cents
    merchant: string
    description: string
    date: Timestamp                 # User-selected transaction date
    weekStart: string               # "2026-02-09" -- denormalized for query efficiency
    createdAt: Timestamp

envelope_overage_allocations/       # Root collection
  {allocationId}/
    userId: string
    sourceTransactionId: string     # The transaction that caused the overage
    donorEnvelopeId: string         # Envelope that donated budget
    recipientEnvelopeId: string     # Envelope that received budget
    amountCents: number             # Amount reallocated in cents
    weekStart: string               # Same week as source transaction
    createdAt: Timestamp
```

### Why Root Collections (Not Subcollections Under Users)

1. **Consistent with existing repo pattern.** The billing system uses root collections with `uid` field filtering (`billing_users`, `billing_tool_usage`, `billing_purchases`), not subcollections under user documents. Following this pattern keeps the codebase consistent.

2. **Firestore query flexibility.** Root collections allow collection group queries if needed later (e.g., admin analytics across all users).

3. **Transaction scope.** Firestore transactions work the same with root collections and subcollections, so there is no atomicity difference.

### Why `weekStart` Denormalization

The `weekStart` field on transactions is a denormalized string (`"2026-02-09"`) that represents the Sunday of the transaction's week. This enables efficient Firestore queries:

```typescript
// Get all transactions for a specific week
db.collection("envelope_transactions")
  .where("userId", "==", uid)
  .where("weekStart", "==", "2026-02-09")
```

Without this field, you would need to query by date range (`date >= weekStart AND date <= weekEnd`), which requires a composite index and is less efficient for the "get all transactions in week X" query that runs on every page load.

**Source:** [Firebase Firestore best practices](https://firebase.google.com/docs/firestore/best-practices) -- denormalization is a standard Firestore pattern for query efficiency.

### Firestore Indexes Required

```
// Composite indexes needed (add to firestore.indexes.json):

// 1. List envelopes for a user
envelopes: userId ASC, createdAt DESC

// 2. List transactions for a user in a specific week
envelope_transactions: userId ASC, weekStart ASC, date DESC

// 3. List transactions for a user and envelope in a week
envelope_transactions: userId ASC, envelopeId ASC, weekStart ASC

// 4. Find overage allocations by source transaction
envelope_overage_allocations: userId ASC, sourceTransactionId ASC
```

## Server Actions vs API Routes Decision Matrix

| Operation | Approach | Rationale |
|-----------|----------|-----------|
| Create envelope | API Route | Consistent auth pattern with other operations |
| Edit envelope | API Route | Same as above |
| Delete envelope | API Route | Must also clean up transactions + allocations |
| List envelopes | API Route + SWR | Authenticated read, cached client-side |
| Create transaction | API Route | May trigger overage flow (complex, transactional) |
| Delete transaction | API Route | Must clean up linked overage allocations |
| List transactions | API Route + SWR | Authenticated read with week filter |
| Submit overage reallocation | API Route | Multi-document Firestore transaction, must be atomic |
| Get analytics data | API Route + SWR | Aggregation query, cached client-side |
| Check/charge weekly billing | API Route | Uses existing `debitForToolUse()` pattern |

**Rationale for API Routes over Server Actions:** The existing authenticated tool pattern (`brand-scraper`) uses API Routes with `verifyUser(request)`. Every envelope operation requires authentication. Using API Routes for all operations keeps the auth pattern identical and avoids mixing two different auth strategies in the same feature.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Date math | date-fns v4 | Temporal API | No Safari support; polyfill adds bundle weight for no benefit |
| Date math | date-fns v4 | day.js | Missing `eachWeekOfInterval`, `isSameWeek` with `weekStartsOn` without plugins |
| Currency display | `Intl.NumberFormat` | dinero.js / currency.js | Overkill -- all math is integer cents, only need display formatting |
| Form handling | `useActionState` + Zod | react-hook-form | Not in repo; would add new dependency and second pattern |
| Data fetching | SWR (already in repo) | TanStack Query | Would replace existing SWR -- unnecessary churn for this feature |
| State management | SWR + `useState` | Zustand / Jotai | No global client state needed; server state managed by SWR |
| Mutations | API Route Handlers | Server Actions | Auth pattern requires `Request` object for `verifyUser()` |

## Installation

```bash
# Only one new dependency:
npm install date-fns

# Everything else is already in the repo.
```

## Sources

### HIGH Confidence (Official Docs / Verified in Repo)
- Next.js 16 blog post: https://nextjs.org/blog/next-16
- Next.js updating data docs: https://nextjs.org/docs/app/getting-started/updating-data
- React useActionState: https://react.dev/reference/react/useActionState
- MDN Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
- Firebase Firestore best practices: https://firebase.google.com/docs/firestore/best-practices
- Firebase Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- date-fns npm: https://www.npmjs.com/package/date-fns
- Can I Use Temporal: https://caniuse.com/temporal
- Host repo patterns: verified by reading `package.json`, `src/lib/auth/user.ts`, `src/lib/billing/firestore.ts`, `src/lib/actions/contact.ts`, `src/components/contact/ContactForm.tsx`

### MEDIUM Confidence (WebSearch Verified with Official Source)
- Zod v4 features: https://zod.dev/v4 -- 14x faster string parsing, `.toJSONSchema()`, confirmed ^4.3.6 in repo
- Tailwind CSS 4 changes: https://tailwindcss.com/blog/tailwindcss-v4 -- CSS-first config, `@theme` directive
- date-fns v4 release: https://blog.date-fns.org/v40-with-time-zone-support/ -- first-class TZ support

### LOW Confidence (Flagged for Validation)
- Firestore collection structure: Design recommendation based on existing patterns. Should be validated against actual query patterns during implementation.
- API Route structure: Proposed REST-style layout. May need adjustment based on actual data access patterns.
