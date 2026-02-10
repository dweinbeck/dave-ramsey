# Phase 3: Transactions - Research

**Researched:** 2026-02-10
**Domain:** Transaction CRUD (create/edit/delete), week selector with week-number display, inline card expansion, Firestore queries for filtered transaction lists, immediate balance recomputation
**Confidence:** HIGH

## Summary

Phase 3 adds transaction management to the Digital Envelopes app. Transactions can be created from two entry points: (1) the dedicated Transactions page with a full form including an envelope dropdown, and (2) an inline form that expands within an envelope card on the Home page (envelope is implicit). Both entry points write to the same `envelope_transactions` Firestore collection. Editing and deleting transactions is done from the Transactions page, which also includes a week selector dropdown for filtering.

The architecture follows patterns already established in Phases 1 and 2: API routes with `verifyUser()` for all mutations, Firestore admin SDK for data access, SWR for client-side data fetching with `mutate()` for cache invalidation after mutations, and the existing Zod schemas for validation. The `transactionSchema` and `EnvelopeTransaction` type already exist from Phase 1. No new dependencies are needed. The primary new utility is a `getWeekNumber()` function (wrapping date-fns `getWeek`) for the week selector display format "Week N: M/D/YYYY - M/D/YYYY".

The key technical considerations are: (1) the inline card expansion on the Home page must not break the responsive card grid layout, (2) the Transactions page needs its own SWR hook keyed by the selected week to enable week-based filtering, (3) balance recomputation happens naturally via compute-on-read (the existing `listEnvelopesWithRemaining` already sums transactions), so creating/deleting a transaction just requires SWR cache invalidation to trigger a refetch, and (4) editing a transaction that changes its envelope requires invalidating both the old and new envelope's balance display.

**Primary recommendation:** Build transaction CRUD following the exact patterns from Phase 2 (API routes, Firestore helpers, SWR hooks, form components). The Transactions page is a new client component with its own `useTransactions(weekStart, weekEnd)` SWR hook. The inline Home page form expands the envelope card to full grid-row width using CSS `col-span-full`. Use the existing `transactionSchema` for creation, add a `transactionUpdateSchema` (all fields optional) for edits. The week selector uses date-fns `getWeek` with `{ weekStartsOn: 0, firstWeekContainsDate: 1 }` to compute week numbers relative to the year.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| swr | 2.4.0 (installed in personal-brand) | Client-side data fetching + cache invalidation after mutations | Already established in Phase 2 for envelope CRUD |
| firebase-admin | 13.6.0 (installed) | Server-side Firestore CRUD for transactions | All data access goes through admin SDK |
| zod | 4.3.6 (installed) | Input validation for transaction API routes | `"zod/v4"` import; `transactionSchema` already defined |
| date-fns | 4.1.0 (installed in both repos) | `getWeek`, `addWeeks`, `subWeeks` for week selector navigation | Already used for all week math |
| clsx | 2.1.1 (installed in personal-brand) | Conditional CSS class merging | Already used in all UI components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| firebase (client) | 12.8.0 (installed) | `user.getIdToken()` for Bearer tokens | All client-to-API requests |
| react | 19.2.3 (installed) | `useState` for form state, week selection state | Form components, week selector |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SWR `mutate()` for balance refresh | React 19 `useOptimistic` | SWR already established in Phase 2; consistency is more valuable than marginal UX improvement |
| API routes for transaction CRUD | Server Actions | Codebase uses API routes exclusively; switching would introduce inconsistency. Server Actions are better for internal mutations but this project has an established API route pattern |
| Custom week number calculation | ISO week numbering | date-fns `getWeek` with `weekStartsOn: 0` gives US-style week numbers (Sunday start), matching the app's week definition |
| Separate transactions API endpoint | Reuse `/api/envelopes` endpoint | Separate endpoint is cleaner -- transactions are a distinct resource with different query patterns |

**Installation:**
```bash
# No new dependencies needed. Both repos already have everything required.
```

## Architecture Patterns

### Recommended Project Structure

**personal-brand repo (UI + API routes):**
```
src/
├── app/
│   ├── envelopes/
│   │   ├── page.tsx                # Home page (existing -- server component)
│   │   └── transactions/
│   │       └── page.tsx            # Transactions page (replace placeholder)
│   └── api/
│       └── envelopes/
│           └── transactions/
│               ├── route.ts        # GET: list for week; POST: create
│               └── [transactionId]/
│                   └── route.ts    # PUT: update; DELETE: delete
├── components/
│   └── envelopes/
│       ├── EnvelopeCard.tsx        # (modify: add expand/collapse + inline form)
│       ├── InlineTransactionForm.tsx  # Inline form (Date, Cost, Merchant, Description)
│       ├── TransactionsPage.tsx    # Client orchestrator for transactions page
│       ├── TransactionForm.tsx     # Full transaction form (with Envelope dropdown)
│       ├── TransactionList.tsx     # Table/list of transactions for selected week
│       ├── TransactionRow.tsx      # Single transaction row with edit/delete actions
│       ├── WeekSelector.tsx        # Dropdown: "Week N: M/D/YYYY - M/D/YYYY"
│       └── EnvelopesHomePage.tsx   # (modify: add inline form expansion handling)
└── lib/
    └── envelopes/
        ├── hooks.ts                # (modify: add useTransactions hook)
        └── types.ts                # (modify: add transactionUpdateSchema, TransactionsPageData)
```

**dave-ramsey repo (shared utilities):**
```
src/
└── lib/
    └── envelopes/
        ├── types.ts                # (modify: add transactionUpdateSchema)
        ├── firestore.ts            # (modify: add transaction CRUD, listTransactionsForWeek)
        ├── week-math.ts            # (modify: add getWeekNumber)
        └── __tests__/
            ├── week-math.test.ts   # (modify: add getWeekNumber tests)
            └── firestore.test.ts   # (modify: add transaction CRUD tests)
```

### Pattern 1: Transaction CRUD API Routes
**What:** RESTful API routes for transaction create, read (filtered by week), update, and delete.
**When to use:** Every transaction mutation.
**Example:**
```typescript
// File: src/app/api/envelopes/transactions/route.ts (personal-brand repo)
import { unauthorizedResponse, verifyUser } from "@/lib/auth/user";
import { transactionSchema } from "@/lib/envelopes/types";
import {
  createTransaction,
  listTransactionsForWeek,
} from "@/lib/envelopes/firestore";

export async function GET(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  const url = new URL(request.url);
  const weekStart = url.searchParams.get("weekStart");
  const weekEnd = url.searchParams.get("weekEnd");

  if (!weekStart || !weekEnd) {
    return Response.json(
      { error: "weekStart and weekEnd query params required." },
      { status: 400 },
    );
  }

  try {
    const data = await listTransactionsForWeek(auth.uid, weekStart, weekEnd);
    return Response.json(data);
  } catch (error) {
    console.error(
      "GET /api/envelopes/transactions error:",
      error instanceof Error ? error.message : "Unknown",
    );
    return Response.json(
      { error: "Failed to load transactions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  try {
    const body = await request.json();
    const parsed = transactionSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input.", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const transaction = await createTransaction(auth.uid, parsed.data);
    return Response.json(transaction, { status: 201 });
  } catch (error) {
    console.error(
      "POST /api/envelopes/transactions error:",
      error instanceof Error ? error.message : "Unknown",
    );
    return Response.json(
      { error: "Failed to create transaction." },
      { status: 500 },
    );
  }
}
```

### Pattern 2: Week-Filtered SWR Hook for Transactions
**What:** A SWR hook that fetches transactions for a specific week range, keyed by the week boundaries so changing weeks fetches fresh data.
**When to use:** The Transactions page.
**Example:**
```typescript
// File: src/lib/envelopes/hooks.ts (personal-brand repo)
export function useTransactions(weekStart: string, weekEnd: string) {
  const { user } = useAuth();

  const { data, error, isLoading, mutate } = useSWR<TransactionsPageData>(
    user ? `/api/envelopes/transactions?weekStart=${weekStart}&weekEnd=${weekEnd}` : null,
    async (url: string) => {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      return envelopeFetch<TransactionsPageData>(url, token);
    },
  );

  return { data, error, isLoading, mutate };
}
```

### Pattern 3: Inline Card Expansion for Home Page Transaction Form
**What:** When the user clicks "Add Transaction" on an envelope card, the card expands to span the full grid row width and reveals a transaction form beneath the card content.
**When to use:** HOME-05 (inline transaction form on home page).
**Example:**
```typescript
// Concept: EnvelopeCard in expanded state spans full row
// The grid item uses conditional col-span-full class

// In EnvelopeCardGrid, the expanded card gets:
<div className={clsx(
  expandedId === env.id ? "col-span-full" : "",
)}>
  <EnvelopeCard
    envelope={env}
    isExpanded={expandedId === env.id}
    onToggleExpand={() => setExpandedId(
      expandedId === env.id ? null : env.id
    )}
    // ... other props
  />
  {expandedId === env.id && (
    <InlineTransactionForm
      envelopeId={env.id}
      onSubmit={handleInlineTransaction}
      onCancel={() => setExpandedId(null)}
    />
  )}
</div>

// InlineTransactionForm has: Date, Cost, Merchant, Description
// envelopeId is implicit (from the card context)
```

### Pattern 4: Week Selector with Navigation
**What:** A dropdown or button group that shows the current week label ("Week N: M/D/YYYY - M/D/YYYY") and allows navigating to previous/next weeks.
**When to use:** TXN-05 (week selector on Transactions page).
**Example:**
```typescript
// File: src/components/envelopes/WeekSelector.tsx (personal-brand repo)
"use client";

import { addWeeks, subWeeks, startOfWeek, format } from "date-fns";
import { getWeekNumber } from "@/lib/envelopes/week-math";
import { Button } from "@/components/ui/Button";

type Props = {
  weekStart: Date;
  onWeekChange: (newWeekStart: Date) => void;
};

export function WeekSelector({ weekStart, onWeekChange }: Props) {
  const weekNum = getWeekNumber(weekStart);
  const { start, end } = getWeekRange(weekStart);
  const label = `Week ${weekNum}: ${format(start, "M/d/yyyy")} - ${format(end, "M/d/yyyy")}`;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWeekChange(subWeeks(weekStart, 1))}
        aria-label="Previous week"
      >
        &larr;
      </Button>
      <span className="text-sm font-medium text-text-primary min-w-[260px] text-center">
        {label}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWeekChange(addWeeks(weekStart, 1))}
        aria-label="Next week"
      >
        &rarr;
      </Button>
    </div>
  );
}
```

### Pattern 5: Transaction Update with Envelope Change Handling
**What:** When editing a transaction, the user may change the envelope assignment. This requires the balance for both the old and new envelope to recompute.
**When to use:** TXN-04 (edit transaction).
**Example:**
```typescript
// After a successful PUT to /api/envelopes/transactions/[transactionId],
// invalidate BOTH the transactions SWR cache AND the envelopes SWR cache:

async function handleUpdateTransaction(
  transactionId: string,
  formData: TransactionUpdateInput,
) {
  const token = await getToken();
  await envelopeFetch(`/api/envelopes/transactions/${transactionId}`, token, {
    method: "PUT",
    body: JSON.stringify(formData),
  });

  // Invalidate both caches to recompute balances
  await mutateTransactions();  // Refresh transaction list
  await mutateEnvelopes();     // Refresh envelope remaining balances on home page
}
```

### Anti-Patterns to Avoid
- **Denormalizing remaining balance on transaction create/delete:** The existing `listEnvelopesWithRemaining` already computes remaining from transactions. Do not add a `remainingCents` field to the envelope document -- it would require updating on every transaction mutation and create consistency risks.
- **Logging transaction details (merchant, description):** These are user-private data. Only log operation metadata (error messages, transaction IDs) per the privacy requirements from Phase 1.
- **Using a single SWR key for all weeks:** The Transactions page must key its SWR cache by week boundaries so navigating weeks fetches fresh data. Using a static key would show stale data when changing weeks.
- **Accepting userId from client in transaction mutations:** Always derive from `verifyUser(request).uid`, same as envelope CRUD.
- **Blocking the inline form behind a separate page navigation:** The HOME-05 requirement is for inline expansion, not navigation to the Transactions page. The form should appear within the card grid.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Week number computation | Manual `Math.ceil(dayOfYear / 7)` | date-fns `getWeek` with `{ weekStartsOn: 0, firstWeekContainsDate: 1 }` | Handles year boundaries, leap years, and configurable week start day |
| Transaction list filtered by week | Client-side filtering of all transactions | Firestore server-side `where("date", ">=", weekStart).where("date", "<=", weekEnd)` query | The existing `transactionsForUserInWeek()` helper already does this |
| Balance recomputation after mutation | Manual arithmetic to update displayed balance | SWR `mutate()` to invalidate cache and trigger refetch of `listEnvelopesWithRemaining` | The server recomputes correctly every time; cache invalidation is the simplest approach |
| Form validation | Manual field-by-field checks | Zod `transactionSchema.safeParse()` (already exists) + new `transactionUpdateSchema` | Type-safe, reusable server + client, consistent with envelope form pattern |
| Authenticated fetch with error handling | Raw fetch with manual token/error handling | `envelopeFetch()` from `@/lib/envelopes/api` (already exists) | Handles token attachment, JSON parsing, and error extraction uniformly |
| Week navigation (prev/next) | Manual date arithmetic | `date-fns/addWeeks` and `date-fns/subWeeks` with `startOfWeek` | DST-safe, already imported in the codebase |

**Key insight:** Almost all the infrastructure needed for Phase 3 already exists from Phases 1 and 2. The `transactionSchema`, `EnvelopeTransaction` type, `transactionsCol()`, `transactionsForUserInWeek()`, `envelopeFetch()`, and `useEnvelopes()` are all ready. Phase 3 is primarily about: (1) adding transaction CRUD functions to firestore.ts, (2) adding API routes, (3) building UI components for the two entry points, and (4) adding the week selector utility.

## Common Pitfalls

### Pitfall 1: Week Number Mismatch Between Selector Display and Query
**What goes wrong:** The week selector displays "Week 7" but queries a different date range than expected, or week numbering resets incorrectly at year boundaries.
**Why it happens:** date-fns `getWeek` uses a complex algorithm that depends on both `weekStartsOn` and `firstWeekContainsDate`. If these don't match the app's Sunday-start convention, week numbers will be off.
**How to avoid:** Use `getWeek(date, { weekStartsOn: 0, firstWeekContainsDate: 1 })` consistently. The `firstWeekContainsDate: 1` means the first week of the year is the week containing January 1st (US convention). Always compute the week range from `startOfWeek(date, { weekStartsOn: 0 })` and display using `formatWeekLabel`. The week number is purely a display concern -- the actual query uses date strings, not week numbers.
**Warning signs:** "Week 1" does not start on the first Sunday of January; week numbers differ between the selector and transaction dates.

### Pitfall 2: Stale Balance After Transaction Mutation
**What goes wrong:** User creates a transaction on the Home page, but the envelope's remaining balance still shows the old value.
**Why it happens:** The Home page uses `useEnvelopes()` which caches its response. After creating a transaction, the cache must be invalidated to trigger a refetch that includes the new transaction in the balance computation.
**How to avoid:** After any transaction mutation (create, update, delete), call `mutate()` on the envelopes SWR key (not just the transactions key). This triggers `listEnvelopesWithRemaining` which recomputes balances including the new transaction. The existing pattern from Phase 2 already does this -- `await mutate()` after envelope CRUD.
**Warning signs:** Balance updates only after a manual page refresh; balance shows the correct value on the Transactions page but wrong on the Home page.

### Pitfall 3: Inline Form Breaks Grid Layout
**What goes wrong:** When expanding an envelope card to show the inline transaction form, the expanded card overflows or misaligns with the grid.
**Why it happens:** The `EnvelopeCardGrid` uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. An expanded card needs to span the full width but the grid cell size is fixed.
**How to avoid:** Use CSS `col-span-full` on the grid item (not the card itself) when expanded. This makes the expanded card span all columns in the grid. The form renders below the card content within the same grid item. On collapse, the card returns to its normal single-column span.
**Warning signs:** Expanded card squished into one column; other cards shift unexpectedly; form fields truncated.

### Pitfall 4: Editing Transaction Envelope Changes Balance of Wrong Envelope
**What goes wrong:** User edits a transaction to change its envelope from A to B. Envelope A's balance still reflects the old transaction, and envelope B's balance doesn't include it.
**Why it happens:** The SWR cache for the Home page is only invalidated once, but the balance computation happens server-side. If the cache invalidation triggers correctly, this should work. The risk is in optimistic updates that don't account for cross-envelope changes.
**How to avoid:** Don't use optimistic updates for transaction edits that change the envelope. Simply invalidate the cache after the PUT succeeds and let the server recompute both envelopes' balances. The round-trip latency is acceptable for edits (unlike the reorder pattern where optimistic updates prevent visual jank).
**Warning signs:** Old envelope still shows the transaction amount deducted; new envelope doesn't reflect the new transaction.

### Pitfall 5: Transaction Date Outside Current Week on Home Page Inline Form
**What goes wrong:** User adds a transaction via the inline Home page form. The form defaults the date to today, which is correct for the current week. But if the user changes the date to a past or future week, the transaction won't appear in the current week's balance computation.
**Why it happens:** The inline form doesn't restrict the date to the current week, but the Home page shows current-week balances only.
**How to avoid:** Two options: (a) restrict the inline form's date picker to the current week (Sunday-Saturday), or (b) allow any date but show a warning if the date is outside the current week. Option (a) is simpler and matches the mental model of "I'm adding a transaction to this envelope for this week." The Transactions page (with week selector) can handle past/future dates. Recommendation: default to today, restrict to current week range for the inline form.
**Warning signs:** User enters a transaction on the Home page but the envelope balance doesn't change; transaction appears on the Transactions page for a different week.

### Pitfall 6: Firestore Index Missing for Transaction Queries
**What goes wrong:** Queries on `envelope_transactions` collection fail with "The query requires an index" error.
**Why it happens:** Firestore requires composite indexes for queries with multiple `where` clauses or `where` + `orderBy`. The `transactionsForUserInWeek` query uses `where("userId", "==", ...)` and `where("date", ">=", ...)`.where("date", "<=", ...)`.
**How to avoid:** This composite index should already be deployed from Phase 2 research (userId + date). Verify it exists in `firestore.indexes.json`. If not, add it:
```json
{
  "collectionGroup": "envelope_transactions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "ASCENDING" }
  ]
}
```
Additionally, transaction delete by envelope will need `userId + envelopeId` index (already used in Phase 2 delete cascade). Verify both exist.
**Warning signs:** API routes return 500 errors; Firestore logs show "index required" messages.

## Code Examples

### Transaction CRUD: Create Transaction
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo, then copied to personal-brand)
// Source: Pattern from createEnvelope in existing firestore.ts
import { FieldValue } from "firebase-admin/firestore";
import type { EnvelopeTransaction, TransactionInput } from "./types";

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<EnvelopeTransaction> {
  // Verify the envelope exists and belongs to the user
  const envRef = envelopesCol().doc(input.envelopeId);
  const envSnap = await envRef.get();

  if (!envSnap.exists || envSnap.data()?.userId !== userId) {
    throw new Error("Envelope not found or access denied.");
  }

  const docRef = transactionsCol().doc();
  const data = {
    userId,
    envelopeId: input.envelopeId,
    amountCents: input.amountCents,
    date: input.date,
    ...(input.merchant ? { merchant: input.merchant } : {}),
    ...(input.description ? { description: input.description } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(data);

  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() } as EnvelopeTransaction;
}
```

### Transaction CRUD: Update Transaction
```typescript
// File: src/lib/envelopes/firestore.ts
export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: Partial<TransactionInput>,
): Promise<void> {
  const docRef = transactionsCol().doc(transactionId);
  const snap = await docRef.get();

  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Transaction not found or access denied.");
  }

  // If changing envelope, verify the new envelope belongs to the user
  if (input.envelopeId) {
    const envRef = envelopesCol().doc(input.envelopeId);
    const envSnap = await envRef.get();
    if (!envSnap.exists || envSnap.data()?.userId !== userId) {
      throw new Error("Envelope not found or access denied.");
    }
  }

  // Build update payload, omitting undefined fields
  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.envelopeId !== undefined) updateData.envelopeId = input.envelopeId;
  if (input.amountCents !== undefined) updateData.amountCents = input.amountCents;
  if (input.date !== undefined) updateData.date = input.date;
  if (input.merchant !== undefined) updateData.merchant = input.merchant;
  if (input.description !== undefined) updateData.description = input.description;

  await docRef.update(updateData);
}
```

### Transaction CRUD: Delete Transaction
```typescript
// File: src/lib/envelopes/firestore.ts
export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const docRef = transactionsCol().doc(transactionId);
  const snap = await docRef.get();

  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Transaction not found or access denied.");
  }

  // In Phase 4, this will also need to cascade-delete related overage allocations.
  // For Phase 3, a simple delete suffices since overage allocations don't exist yet.
  await docRef.delete();
}
```

### List Transactions for Week
```typescript
// File: src/lib/envelopes/firestore.ts
import type { EnvelopeTransaction } from "./types";

export async function listTransactionsForWeek(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ transactions: EnvelopeTransaction[] }> {
  const snap = await transactionsForUserInWeek(userId, weekStart, weekEnd)
    .orderBy("date", "desc")
    .get();

  const transactions = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as EnvelopeTransaction[];

  return { transactions };
}
```

### Week Number Utility
```typescript
// File: src/lib/envelopes/week-math.ts (dave-ramsey repo, then copied to personal-brand)
import { getWeek } from "date-fns";

/**
 * Returns the week number for a given date, using US conventions:
 * - Weeks start on Sunday (weekStartsOn: 0)
 * - The first week of the year contains January 1st (firstWeekContainsDate: 1)
 *
 * This matches the app's Sunday-Saturday week definition.
 */
export function getWeekNumber(date: Date): number {
  return getWeek(date, { weekStartsOn: 0, firstWeekContainsDate: 1 });
}
```

### Transaction Update Zod Schema
```typescript
// File: src/lib/envelopes/types.ts
/** Transaction partial update payload (all fields optional). */
export const transactionUpdateSchema = z.object({
  envelopeId: z.string().min(1).optional(),
  amountCents: z.number().int().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  merchant: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
```

### Transactions Page Data Type
```typescript
// File: src/lib/envelopes/types.ts
/** Response shape for GET /api/envelopes/transactions?weekStart=...&weekEnd=... */
export type TransactionsPageData = {
  transactions: EnvelopeTransaction[];
};
```

### Inline Transaction Form Component
```typescript
// File: src/components/envelopes/InlineTransactionForm.tsx (personal-brand repo)
"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  envelopeId: string;
  defaultDate: string; // YYYY-MM-DD (today)
  minDate: string;     // Current week start (Sunday) YYYY-MM-DD
  maxDate: string;     // Current week end (Saturday) YYYY-MM-DD
  onSubmit: (data: {
    envelopeId: string;
    amountCents: number;
    date: string;
    merchant?: string;
    description?: string;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

export function InlineTransactionForm({
  envelopeId,
  defaultDate,
  minDate,
  maxDate,
  onSubmit,
  onCancel,
  isSubmitting,
}: Props) {
  const [costDollars, setCostDollars] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = Number.parseFloat(costDollars);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Cost must be greater than $0.00.");
      return;
    }

    const cents = Math.round(parsed * 100);

    onSubmit({
      envelopeId,
      amountCents: cents,
      date,
      ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-3 border-t border-border">
      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Date */}
        <div className="flex flex-col gap-1">
          <label htmlFor="txn-date" className="text-xs font-medium text-text-secondary">
            Date
          </label>
          <input
            id="txn-date"
            type="date"
            required
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-gold"
          />
        </div>

        {/* Cost */}
        <div className="flex flex-col gap-1">
          <label htmlFor="txn-cost" className="text-xs font-medium text-text-secondary">
            Cost ($)
          </label>
          <input
            id="txn-cost"
            type="number"
            required
            min="0.01"
            step="0.01"
            value={costDollars}
            onChange={(e) => setCostDollars(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-gold"
          />
        </div>

        {/* Merchant */}
        <div className="flex flex-col gap-1">
          <label htmlFor="txn-merchant" className="text-xs font-medium text-text-secondary">
            Merchant
          </label>
          <input
            id="txn-merchant"
            type="text"
            maxLength={200}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-gold"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label htmlFor="txn-desc" className="text-xs font-medium text-text-secondary">
            Description
          </label>
          <input
            id="txn-desc"
            type="text"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-gold"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

### Expanded Card Grid Item Pattern
```typescript
// In EnvelopesHomePage or EnvelopeCardGrid, wrap each card in a container
// that conditionally spans the full grid width when expanded:

{envelopes.map((env, i) => (
  <div
    key={env.id}
    className={clsx(expandedId === env.id && "col-span-full")}
  >
    <EnvelopeCard
      envelope={env}
      isExpanded={expandedId === env.id}
      onToggleExpand={() => setExpandedId(
        expandedId === env.id ? null : env.id
      )}
      // ... existing props
    />
    {expandedId === env.id && (
      <InlineTransactionForm
        envelopeId={env.id}
        defaultDate={format(new Date(), "yyyy-MM-dd")}
        minDate={format(currentWeekStart, "yyyy-MM-dd")}
        maxDate={format(currentWeekEnd, "yyyy-MM-dd")}
        onSubmit={handleInlineTransaction}
        onCancel={() => setExpandedId(null)}
        isSubmitting={isSubmitting}
      />
    )}
  </div>
))}
```

## Firestore Indexes Required

Phase 3 requires these composite indexes (may already exist from Phase 2):

```json
[
  {
    "collectionGroup": "envelope_transactions",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "userId", "order": "ASCENDING" },
      { "fieldPath": "date", "order": "ASCENDING" }
    ]
  },
  {
    "collectionGroup": "envelope_transactions",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "userId", "order": "ASCENDING" },
      { "fieldPath": "date", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "envelope_transactions",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "userId", "order": "ASCENDING" },
      { "fieldPath": "envelopeId", "order": "ASCENDING" }
    ]
  }
]
```

The first index supports `transactionsForUserInWeek` (ascending date range). The second supports `listTransactionsForWeek` (descending date sort within a range). The third supports deletion cascade queries (transactions by envelopeId). Verify these exist in `firestore.indexes.json` before deployment.

## Transaction Form Design Notes

### Full Form (Transactions Page) vs Inline Form (Home Page)

| Aspect | Transactions Page (TXN-01) | Home Page Inline (HOME-05) |
|--------|---------------------------|---------------------------|
| Envelope field | Dropdown (user selects) | Implicit (from card context) |
| Date field | Free date picker (any date) | Restricted to current week |
| Cost field | Dollar input with cents conversion | Same |
| Merchant | Optional text input | Same |
| Description | Optional text input | Same |
| After submit | Refreshes transaction list + envelope balances | Collapses form, refreshes envelope card balance |
| SWR invalidation | `mutateTransactions()` + `mutateEnvelopes()` | `mutateEnvelopes()` only (Home page) |

### Dollar-to-Cents Conversion

Both forms follow the pattern established in `EnvelopeForm.tsx`:
- User types dollars (e.g., "12.50")
- `Number.parseFloat(value)` parses the input
- `Math.round(parsed * 100)` converts to integer cents (1250)
- Cents are sent to the API and validated by Zod `z.number().int().min(1)`

### Edit Transaction Flow

On the Transactions page, clicking "Edit" on a transaction row should:
1. Replace the row with an inline edit form (same fields as creation, pre-populated)
2. Include an Envelope dropdown (allows reassignment)
3. On save, send PUT to `/api/envelopes/transactions/[transactionId]`
4. Invalidate both transactions and envelopes SWR caches
5. Collapse the edit form back to a display row

This follows the exact same pattern as envelope editing in Phase 2 (editingId state toggles between display and form).

## Balance Recomputation Strategy

**Compute-on-read is the correct approach for Phase 3.** Here's why:

1. `listEnvelopesWithRemaining` already fetches current-week transactions and computes `spentCents`, `remainingCents`, and `status` for each envelope.
2. Creating, editing, or deleting a transaction simply adds/changes/removes a document in `envelope_transactions`.
3. After any transaction mutation, calling `mutate()` on the envelopes SWR cache triggers a refetch of `listEnvelopesWithRemaining`, which re-queries all current-week transactions and recomputes balances.
4. No denormalized balance field exists, so there is no field to update on the envelope document.

**This means balance updates are "immediate" from the user's perspective:** the SWR refetch happens after the mutation completes, typically < 200ms for a Firestore query.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Form with `onSubmit` + `fetch` | Same pattern (App Router doesn't require Server Actions for existing API route patterns) | N/A | Consistency with Phase 2 patterns |
| Client-side date filtering | Server-side Firestore range queries | Already established in Phase 1 | Better performance, data isolation |
| Modal forms for CRUD | Inline edit/create forms | Phase 2 decision | Simpler UX, no modal dependency until Phase 4 |
| Separate pages per CRUD operation | Single page with state-driven form toggling | Phase 2 pattern | Fewer route transitions, faster interaction |

**Deprecated/outdated:**
- `react-hook-form` for simple forms: The existing codebase uses controlled `useState` forms. These are simple enough (4-5 fields) that a form library adds unnecessary complexity.
- Server Actions for this use case: While Server Actions are the modern Next.js pattern for mutations, this project has an established API route pattern. Consistency is more important than following the bleeding edge.

## Open Questions

1. **Should the inline Home page form restrict dates to the current week?**
   - What we know: The Home page shows current-week envelope balances. An inline transaction with a date outside the current week would not affect the displayed balance.
   - What's unclear: Whether users expect to log past transactions from the Home page or only current-week ones.
   - Recommendation: Restrict inline form to current week dates (min=Sunday, max=Saturday of current week). The Transactions page (with week selector) handles any week. This prevents confusion where a transaction is submitted but the balance appears unchanged.

2. **Should the Transactions page show an "Add Transaction" button or always show the form?**
   - What we know: TXN-01 requires a create form on the Transactions page.
   - What's unclear: Whether the form should be always visible or toggled.
   - Recommendation: Show an "Add Transaction" button that toggles a form at the top of the page. This matches the Phase 2 pattern (CreateEnvelopeCard toggles EnvelopeForm). Always-visible forms take up space and can be confusing when the user is primarily browsing transactions.

3. **Should editing a transaction that changes its envelope also change its date to the selected week?**
   - What we know: A user viewing "Week 5" transactions might edit a transaction and change its envelope.
   - What's unclear: If they change the date to a different week while editing, the transaction disappears from the current view.
   - Recommendation: Allow it. The transaction list will refresh after the edit, and if the date moved it out of the current week, it simply won't appear in the list anymore. This is correct behavior. No need to restrict date editing.

4. **What is the display format for the week selector?**
   - What we know: TXN-05 specifies "Week N: M/D/YYYY - M/D/YYYY" format.
   - What's unclear: What "N" refers to -- is it the ISO week number, the week-of-year number, or a sequential count of the user's weeks?
   - Recommendation: Use the week-of-year number from `getWeek(date, { weekStartsOn: 0, firstWeekContainsDate: 1 })`. This gives "Week 1" through "Week 52/53" for each year. It's universally understood and does not depend on when the user started using the app.

5. **Phase 4 interaction: Should transaction delete cascade overage allocations now?**
   - What we know: Phase 4 will add overage allocations linked to transactions. Deleting a transaction should cascade to its allocations.
   - What's unclear: Whether Phase 3's `deleteTransaction` should already query for allocations (defensive), or if that logic should be added in Phase 4.
   - Recommendation: Phase 3's `deleteTransaction` should be a simple delete. Phase 4 will modify it to cascade. Adding unused cascade logic now would be premature and could not be tested without the allocation system. Add a TODO comment noting the Phase 4 extension point.

## Sources

### Primary (HIGH confidence)
- Host repo codebase analysis -- direct file reads of:
  - `src/app/api/envelopes/route.ts` -- API route pattern (GET + POST) with verifyUser
  - `src/app/api/envelopes/[envelopeId]/route.ts` -- Dynamic API route pattern (PUT + DELETE)
  - `src/lib/envelopes/hooks.ts` -- SWR hook with auth token pattern
  - `src/lib/envelopes/api.ts` -- `envelopeFetch()` helper
  - `src/lib/envelopes/types.ts` -- Existing `transactionSchema`, `EnvelopeTransaction`, `envelopeUpdateSchema` pattern
  - `src/lib/envelopes/firestore.ts` -- Full CRUD pattern, `transactionsCol()`, `transactionsForUserInWeek()`
  - `src/lib/envelopes/week-math.ts` -- Week math utilities (`getWeekRange`, `formatWeekLabel`)
  - `src/components/envelopes/EnvelopesHomePage.tsx` -- Client orchestrator pattern with CRUD handlers
  - `src/components/envelopes/EnvelopeCard.tsx` -- Card component with action buttons
  - `src/components/envelopes/EnvelopeForm.tsx` -- Form pattern (controlled state, dollar-to-cents conversion)
  - `src/components/envelopes/EnvelopeCardGrid.tsx` -- Responsive grid layout
  - `src/components/ui/Card.tsx` -- Card component variants
  - `src/components/ui/Button.tsx` -- Button component variants
  - `src/app/envelopes/transactions/page.tsx` -- Current placeholder page
  - `firestore.indexes.json` -- Existing composite index definitions
- dave-ramsey repo codebase:
  - `src/lib/envelopes/types.ts` -- Zod schemas + Firestore types
  - `src/lib/envelopes/firestore.ts` -- Collection helpers + computation functions
  - `src/lib/envelopes/week-math.ts` -- Week math utilities
  - `src/lib/envelopes/__tests__/` -- Test patterns for pure computation helpers
- [date-fns getWeek source](https://github.com/date-fns/date-fns/blob/main/src/getWeek/index.ts) -- Function signature and options
- [Firebase: Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions) -- CRUD patterns
- [Firebase: Delete data](https://firebase.google.com/docs/firestore/manage-data/delete-data) -- Delete patterns

### Secondary (MEDIUM confidence)
- [SWR: Mutation & Revalidation](https://swr.vercel.app/docs/mutation) -- `mutate()`, cache invalidation patterns
- [date-fns getWeek W3cubDocs](https://docs.w3cub.com/date_fns/getWeek.html) -- getWeek options documentation
- [Next.js Server Actions vs API Routes](https://www.pronextjs.dev/should-i-use-server-actions-or-apis) -- Pattern comparison (confirmed API routes are correct for this project)
- [Accessible cards (Kitty Giraudel)](https://kittygiraudel.com/2022/04/02/accessible-cards/) -- Expandable card accessibility patterns

### Tertiary (LOW confidence)
- None. All findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed; no new dependencies
- Architecture: HIGH -- all patterns directly replicate existing Phase 2 patterns
- Pitfalls: HIGH -- derived from code analysis and established Firestore/SWR behavior
- Week selector: MEDIUM -- `getWeek` options are verified via source code, but the exact display format ("Week N") is a design choice that may need user feedback
- Inline card expansion: HIGH -- CSS `col-span-full` is a standard CSS Grid feature; the grid is already using Tailwind grid utilities

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable; all dependencies are mature, no fast-moving concerns)
