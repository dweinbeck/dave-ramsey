# Phase 2: Envelope Management - Research

**Researched:** 2026-02-10
**Domain:** Envelope CRUD, home page UI, cumulative savings computation, Firestore cascading operations, reorder persistence
**Confidence:** HIGH

## Summary

Phase 2 transforms the Digital Envelopes app from placeholder pages into a functional envelope management system. It spans both repositories: API routes and UI components in the personal-brand repo, and any new shared utility functions in the dave-ramsey repo. The phase covers envelope CRUD (create, edit, delete with cascading cleanup), reordering, rollover policy, the home page with greeting banner and envelope cards, and cumulative savings tracking.

The architecture follows patterns already established in Phase 1 and the existing billing system: API routes with `verifyUser()` for all mutations, Firestore admin SDK for data access, SWR for client-side data fetching with optimistic updates, and the existing `Card` component for envelope display. No new dependencies are needed beyond what is already installed in both repos. The compute-on-read decision from the roadmap (no denormalized `remaining` field) is the correct approach and simplifies both CRUD and savings computation.

The key technical complexity in this phase is the savings computation (ENV-06, HOME-04). Cumulative savings must be computed across all historical weeks, which requires either: (a) a compute-on-read approach that queries all past transactions and envelopes, or (b) a lightweight denormalized savings field that is updated weekly. This research recommends a hybrid: compute-on-read for display accuracy, with the computation scoped to only completed weeks (not the current in-progress week).

**Primary recommendation:** Build envelope CRUD API routes following the billing system pattern exactly. Use the existing `Card` component with `variant="default"` for envelope cards. Implement reordering with simple up/down arrow buttons (not drag-and-drop) to avoid a new dependency. Compute savings server-side by iterating over completed past weeks and summing unspent budget. Use SWR with `mutate()` for optimistic UI updates after CRUD operations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| swr | 2.4.0 (installed in personal-brand) | Client-side data fetching + optimistic mutations | Already used in repo; `useSWR` + `mutate()` for CRUD ops |
| firebase-admin | 13.6.0 (installed) | Server-side Firestore CRUD, batched writes | All data access goes through admin SDK |
| zod | 4.3.6 (installed) | Input validation for API routes | Already used; `"zod/v4"` import path |
| date-fns | 4.1.0 (installed in dave-ramsey) | Week math utilities for savings computation | Already used in week-math.ts |
| clsx | 2.1.1 (installed in personal-brand) | Conditional CSS class merging | Already used in all UI components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/navigation | 16.1.6 (installed) | `usePathname()` for active state | Already established in EnvelopesNav |
| firebase (client) | 12.8.0 (installed) | `user.getIdToken()` for Bearer tokens | All client-to-API requests |
| react (useOptimistic) | 19.2.3 (installed) | React 19 native optimistic updates | Alternative to SWR optimistic data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Up/down arrow reorder | @dnd-kit/react (drag-and-drop) | dnd-kit v0.2.4 is pre-release; adds dependency; overkill for 5-15 envelopes. Arrow buttons are simpler, accessible, zero dependencies |
| SWR mutate | React 19 useOptimistic | useOptimistic is newer, less documented; SWR already established in repo |
| Compute savings on read | Denormalized savings_total field | Denormalized field requires updating on every transaction; compute-on-read is simpler, always correct, and negligible cost at this scale |

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
│   │   ├── layout.tsx              # AuthGuard + EnvelopesNav (exists from Phase 1)
│   │   └── page.tsx                # Home page (replace placeholder)
│   └── api/
│       └── envelopes/
│           ├── route.ts            # GET: list with computed remaining; POST: create
│           ├── [envelopeId]/
│           │   └── route.ts        # PUT: update; DELETE: delete with cascade
│           └── reorder/
│               └── route.ts        # PUT: batch update sortOrder
├── components/
│   └── envelopes/
│       ├── EnvelopesNav.tsx        # (exists from Phase 1)
│       ├── EnvelopesHomePage.tsx    # Client component: data fetching + layout
│       ├── GreetingBanner.tsx      # "Hi {name}! Today is {weekday}..."
│       ├── EnvelopeCardGrid.tsx    # Grid layout for envelope cards
│       ├── EnvelopeCard.tsx        # Individual envelope card using Card component
│       ├── StatusBadge.tsx         # On Track / Watch / Over badge
│       ├── CreateEnvelopeCard.tsx  # "+" card for creating new envelope
│       ├── EnvelopeForm.tsx        # Shared create/edit form (title + budget)
│       └── SavingsBanner.tsx       # Cumulative savings display
└── lib/
    └── envelopes/
        ├── api.ts                  # Client-side fetch helpers (token + SWR)
        └── hooks.ts                # useEnvelopes() SWR hook
```

**dave-ramsey repo (shared utilities):**
```
src/
└── lib/
    └── envelopes/
        ├── types.ts                # (exists) Add EnvelopeWithStatus, HomePageData types
        ├── firestore.ts            # (exists) Add CRUD operations, savings computation
        ├── week-math.ts            # (exists) Add getWeekStart() returning YYYY-MM-DD string
        ├── format.ts               # (exists) No changes needed
        └── __tests__/
            ├── types.test.ts       # (exists) Add new type tests
            └── firestore.test.ts   # New: test CRUD + savings logic
```

### Pattern 1: API Route CRUD with Firestore Admin SDK
**What:** RESTful API routes that perform Firestore operations server-side after verifying the user.
**When to use:** Every envelope mutation (create, update, delete, reorder).
**Example:**
```typescript
// Source: Existing pattern in src/app/api/billing/me/route.ts
// File: src/app/api/envelopes/route.ts (personal-brand repo)
import { unauthorizedResponse, verifyUser } from "@/lib/auth/user";
import { envelopeSchema } from "@/lib/envelopes/types";
import {
  createEnvelope,
  listEnvelopesWithRemaining,
} from "@/lib/envelopes/firestore";

export async function GET(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  try {
    const data = await listEnvelopesWithRemaining(auth.uid);
    return Response.json(data);
  } catch (error) {
    console.error("GET /api/envelopes error:", error instanceof Error ? error.message : "Unknown");
    return Response.json({ error: "Failed to load envelopes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  try {
    const body = await request.json();
    const parsed = envelopeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid input.", details: parsed.error.issues }, { status: 400 });
    }

    const envelope = await createEnvelope(auth.uid, parsed.data);
    return Response.json(envelope, { status: 201 });
  } catch (error) {
    console.error("POST /api/envelopes error:", error instanceof Error ? error.message : "Unknown");
    return Response.json({ error: "Failed to create envelope." }, { status: 500 });
  }
}
```

### Pattern 2: SWR Data Fetching with Authenticated Token
**What:** Client-side hook that fetches envelope data with Bearer token authentication and supports optimistic mutations.
**When to use:** The home page and any component that displays envelope data.
**Example:**
```typescript
// File: src/lib/envelopes/hooks.ts (personal-brand repo)
"use client";

import useSWR from "swr";
import { useAuth } from "@/context/AuthContext";
import type { HomePageData } from "@/lib/envelopes/types";

async function fetchWithToken(url: string, token: string): Promise<HomePageData> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export function useEnvelopes() {
  const { user } = useAuth();

  const { data, error, isLoading, mutate } = useSWR<HomePageData>(
    user ? "/api/envelopes" : null,
    async (url: string) => {
      const token = await user!.getIdToken();
      return fetchWithToken(url, token);
    },
  );

  return { data, error, isLoading, mutate };
}
```

### Pattern 3: Firestore Batched Write for Cascading Delete
**What:** Delete an envelope and all its related transactions and allocations atomically using a Firestore batched write.
**When to use:** ENV-03 (delete envelope with cascading cleanup).
**Example:**
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
// Source: Firebase Firestore batched writes documentation
export async function deleteEnvelope(userId: string, envelopeId: string): Promise<void> {
  const firestore = requireDb();

  // Verify ownership
  const envelopeRef = envelopesCol().doc(envelopeId);
  const envelopeSnap = await envelopeRef.get();
  if (!envelopeSnap.exists || envelopeSnap.data()?.userId !== userId) {
    throw new Error("Envelope not found or access denied.");
  }

  // Find related transactions
  const txnSnap = await transactionsCol()
    .where("userId", "==", userId)
    .where("envelopeId", "==", envelopeId)
    .get();

  // Find related allocations (transactions may have triggered overages)
  const txnIds = txnSnap.docs.map(d => d.id);
  // Also find allocations where this envelope was a donor
  const donorAllocSnap = await allocationsCol()
    .where("donorEnvelopeId", "==", envelopeId)
    .get();

  // Batched write (max 500 operations per batch)
  const batch = firestore.batch();
  batch.delete(envelopeRef);
  for (const doc of txnSnap.docs) {
    batch.delete(doc.ref);
  }
  for (const doc of donorAllocSnap.docs) {
    batch.delete(doc.ref);
  }
  // Also delete allocations linked to this envelope's transactions
  for (const txnId of txnIds) {
    const allocSnap = await allocationsCol()
      .where("sourceTransactionId", "==", txnId)
      .get();
    for (const doc of allocSnap.docs) {
      batch.delete(doc.ref);
    }
  }

  await batch.commit();
}
```

### Pattern 4: Envelope Card Using Existing Card Component
**What:** Render each envelope as a styled card matching the site's design system.
**When to use:** HOME-02 (envelope cards on home page).
**Example:**
```typescript
// File: src/components/envelopes/EnvelopeCard.tsx (personal-brand repo)
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { formatCents } from "@/lib/envelopes/format";

type Props = {
  title: string;
  weeklyBudgetCents: number;
  remainingCents: number;
  status: "On Track" | "Watch" | "Over";
  onEdit: () => void;
  onDelete: () => void;
};

export function EnvelopeCard({ title, weeklyBudgetCents, remainingCents, status, onEdit, onDelete }: Props) {
  return (
    <Card variant="default" className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <h3 className="font-display font-bold text-primary text-lg">{title}</h3>
        <StatusBadge status={status} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-primary">{formatCents(remainingCents)}</span>
        <span className="text-sm text-text-secondary">of {formatCents(weeklyBudgetCents)}</span>
      </div>
      {/* Edit/delete buttons */}
    </Card>
  );
}
```

### Pattern 5: Compute-on-Read for Envelope Remaining and Savings
**What:** Server-side function that joins envelopes with current-week transactions to compute remaining budget, and iterates over past weeks to compute cumulative savings.
**When to use:** GET /api/envelopes response enrichment.
**Example:**
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
export async function listEnvelopesWithRemaining(userId: string): Promise<HomePageData> {
  const firestore = requireDb();
  const today = new Date();
  const { start, end } = getWeekRange(today);
  const weekStart = format(start, "yyyy-MM-dd");
  const weekEnd = format(end, "yyyy-MM-dd");

  // Fetch envelopes and current-week transactions in parallel
  const [envelopeSnap, txnSnap] = await Promise.all([
    envelopesForUser(userId).get(),
    transactionsForUserInWeek(userId, weekStart, weekEnd).get(),
  ]);

  const envelopes = envelopeSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const transactions = txnSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Compute remaining for each envelope
  const enriched = envelopes.map(env => {
    const envTxns = transactions.filter(t => t.envelopeId === env.id);
    const spentCents = envTxns.reduce((sum, t) => sum + t.amountCents, 0);
    const remainingCents = env.weeklyBudgetCents - spentCents;
    const remainingDaysPercent = getRemainingDaysPercent(today);
    const status = getStatusLabel(remainingCents, env.weeklyBudgetCents, remainingDaysPercent);
    return { ...env, spentCents, remainingCents, status };
  });

  return { envelopes: enriched, weekLabel: formatWeekLabel(today) };
}
```

### Anti-Patterns to Avoid
- **Denormalizing `remaining` on the envelope document:** Creates write contention and consistency risk. Always compute from transactions.
- **Accepting sort order from client without validation:** Client sends `sortOrder` values -- always validate they are sequential integers starting from 0 and belong to the authenticated user's envelopes.
- **Using drag-and-drop library for simple reorder:** For 5-15 envelopes, up/down arrow buttons are simpler, more accessible, and require no new dependency. Drag-and-drop can be added later if users request it.
- **Computing savings on every page load by querying all historical data:** For the first weeks/months this is fine, but the query should be bounded. Use a "savings checkpoint" approach if data grows (see Savings Computation section).
- **Logging request bodies in error handlers:** Envelope titles are user-generated content. Log only error messages and operation metadata, never the request payload.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic UI after mutations | Manual state management with useState | SWR `mutate()` with `optimisticData` | SWR handles cache invalidation, rollback on error, and revalidation automatically |
| Cascading delete across collections | Sequential individual deletes | Firestore `batch()` with all deletes in one atomic operation | Atomic -- either all succeed or none do; no orphaned records |
| Status label computation | Inline conditional logic per component | `getStatusLabel()` from week-math.ts (exists) | Single source of truth, already tested |
| Week range formatting | `new Date().toLocaleDateString()` | `formatWeekLabel()` from week-math.ts (exists) | Consistent format, timezone-safe |
| Form validation | Manual field-by-field checks | Zod `envelopeSchema.safeParse()` (exists) | Type-safe, reusable server + client, already defined |
| Authenticated fetch | Raw fetch with manual token handling | SWR hook with `user.getIdToken()` pattern | Matches existing repo pattern (brand-scraper hooks) |

**Key insight:** Phase 1 already built the foundational utilities (types, schemas, week-math, firestore helpers, format). Phase 2 extends these, not replaces them. The existing billing firestore.ts provides the CRUD pattern template.

## Common Pitfalls

### Pitfall 1: Cascading Delete Exceeding Firestore Batch Limit
**What goes wrong:** A Firestore batched write is limited to 500 operations. If an envelope has more than ~498 related documents (transactions + allocations), the batch exceeds the limit and fails.
**Why it happens:** An envelope could accumulate hundreds of transactions over many weeks. Deleting the envelope plus all transactions plus all allocations in one batch could exceed 500.
**How to avoid:** Check the total count before batching. If > 450 (leaving margin), split into multiple sequential batches. Alternatively, use `firestore.recursiveDelete()` for admin SDK (available in firebase-admin), but this does not support cross-collection deletes. Better approach: chunk the deletes into batches of 450 and commit sequentially within a try/catch.
**Warning signs:** Delete operations silently failing or throwing "batch size exceeds maximum" errors.

### Pitfall 2: Race Condition in Reorder When Multiple Updates Overlap
**What goes wrong:** User clicks reorder rapidly (up-up-up). Each click sends a PUT to `/api/envelopes/reorder` with the new sort order. If requests arrive out of order, the final sort order may not match what the user sees.
**Why it happens:** Network requests are not guaranteed to arrive in order. Optimistic UI shows the user the expected order, but server writes may apply in a different sequence.
**How to avoid:** Use a simple approach: each reorder request sends the complete ordered list of envelope IDs. The server always writes the full sort order (not incremental swaps). Client-side, debounce rapid reorder clicks or queue them. The SWR `mutate()` approach naturally handles this -- the most recent mutation wins.
**Warning signs:** Sort order reverting after rapid reordering; sort order differing between page loads.

### Pitfall 3: Savings Computation Becoming Expensive Over Time
**What goes wrong:** Cumulative savings requires summing unspent budget across ALL past weeks. After 52 weeks (one year), this means querying all transactions for the user's entire history on every page load.
**Why it happens:** No savings checkpoint exists, so the computation starts from the user's first week every time.
**How to avoid:** For Phase 2 (launch), compute-on-read is fine -- users will have 0-4 weeks of history. Add a `savings_checkpoints` collection in a future phase if needed: store `{ userId, weekStart, cumulativeSavingsCents, computedAt }` periodically. Computation then only needs to sum from the last checkpoint forward. This is an optimization that can be deferred.
**Warning signs:** GET /api/envelopes response time increasing as user history grows; Firestore read count increasing linearly with weeks of usage.

### Pitfall 4: Greeting Banner Name Extraction from Firebase User
**What goes wrong:** The greeting banner says "Hi {name}!" but `user.displayName` is null for some Google accounts, leading to "Hi null!" or "Hi !".
**Why it happens:** Firebase Auth's `displayName` field depends on the Google account configuration. Some accounts (especially workspace accounts) may not populate this field.
**How to avoid:** Always fall back: `user.displayName || user.email?.split("@")[0] || "there"`. This produces "Hi Dan!" or "Hi dweinbeck!" or "Hi there!" depending on what's available. The name comes from the client-side `useAuth()` hook (Firebase client SDK `User` object), NOT from the server -- no API call needed.
**Warning signs:** Greeting showing null, undefined, or empty string.

### Pitfall 5: Envelope Sort Order Gaps After Deletion
**What goes wrong:** Envelopes have sortOrder 0, 1, 2, 3. User deletes envelope at position 1. Remaining envelopes have sortOrder 0, 2, 3. This works functionally (orderBy still sorts correctly) but creates gaps that accumulate and make sortOrder values meaningless for display.
**How to avoid:** After deleting an envelope, re-index the sort order of remaining envelopes in the same batched write. This is a minor optimization but prevents drift. Alternatively, accept gaps -- the orderBy("sortOrder", "asc") query still returns correct order regardless of gaps. The simpler approach (accept gaps) is recommended for Phase 2.
**Warning signs:** sortOrder values growing to large numbers over time; sort order displaying incorrectly if used for numbering.

## Code Examples

### Firestore CRUD: Create Envelope
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
// Source: Pattern from src/lib/billing/firestore.ts
import { FieldValue } from "firebase-admin/firestore";

export async function createEnvelope(
  userId: string,
  input: { title: string; weeklyBudgetCents: number },
): Promise<Envelope> {
  const firestore = requireDb();

  // Determine next sortOrder (append to end)
  const existing = await envelopesForUser(userId).get();
  const maxSort = existing.docs.reduce(
    (max, d) => Math.max(max, (d.data().sortOrder ?? 0)),
    -1,
  );

  const now = FieldValue.serverTimestamp();
  const docRef = envelopesCol().doc();
  const data = {
    userId,
    title: input.title,
    weeklyBudgetCents: input.weeklyBudgetCents,
    sortOrder: maxSort + 1,
    rollover: false, // default: reset each week
    createdAt: now,
    updatedAt: now,
  };

  await docRef.set(data);
  return { id: docRef.id, ...data, createdAt: now, updatedAt: now } as unknown as Envelope;
}
```

### Firestore CRUD: Update Envelope
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
export async function updateEnvelope(
  userId: string,
  envelopeId: string,
  input: Partial<{ title: string; weeklyBudgetCents: number; rollover: boolean }>,
): Promise<void> {
  const ref = envelopesCol().doc(envelopeId);
  const snap = await ref.get();

  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Envelope not found or access denied.");
  }

  await ref.update({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
```

### Firestore: Reorder Envelopes
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
export async function reorderEnvelopes(
  userId: string,
  orderedIds: string[],
): Promise<void> {
  const firestore = requireDb();
  const batch = firestore.batch();

  for (let i = 0; i < orderedIds.length; i++) {
    const ref = envelopesCol().doc(orderedIds[i]);
    batch.update(ref, {
      sortOrder: i,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}
```

### Savings Computation: Cumulative Unspent Budget
```typescript
// File: src/lib/envelopes/firestore.ts (dave-ramsey repo)
// ENV-06 + HOME-04: Compute cumulative savings from all completed past weeks
import { subWeeks } from "date-fns";

export async function computeCumulativeSavings(userId: string): Promise<number> {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });
  const currentWeekStartStr = format(currentWeekStart, "yyyy-MM-dd");

  // Get all envelopes (for their weekly budgets and rollover policies)
  const envelopeSnap = await envelopesForUser(userId).get();
  const envelopes = envelopeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (envelopes.length === 0) return 0;

  // Get the earliest envelope creation date to bound the query
  const earliestCreated = envelopes.reduce((min, e) => {
    const created = e.createdAt?.toDate?.() ?? today;
    return created < min ? created : min;
  }, today);
  const earliestWeekStart = format(startOfWeek(earliestCreated, { weekStartsOn: 0 }), "yyyy-MM-dd");

  // Get ALL transactions BEFORE the current week (completed weeks only)
  const txnSnap = await transactionsCol()
    .where("userId", "==", userId)
    .where("date", ">=", earliestWeekStart)
    .where("date", "<", currentWeekStartStr)
    .get();
  const transactions = txnSnap.docs.map(d => d.data());

  // Group transactions by week and envelope
  // For each completed week, savings = sum of (weeklyBudget - spentInThatWeek) across non-rollover envelopes
  // For rollover envelopes, surplus carries forward (not counted as savings)
  let totalSavingsCents = 0;

  // Iterate week by week from earliest to current
  let weekCursor = startOfWeek(earliestCreated, { weekStartsOn: 0 });
  while (format(weekCursor, "yyyy-MM-dd") < currentWeekStartStr) {
    const wkStart = format(weekCursor, "yyyy-MM-dd");
    const wkEnd = format(endOfWeek(weekCursor, { weekStartsOn: 0 }), "yyyy-MM-dd");

    for (const env of envelopes) {
      // Skip if envelope was created after this week
      const envCreated = env.createdAt?.toDate?.() ?? today;
      if (envCreated > endOfWeek(weekCursor, { weekStartsOn: 0 })) continue;

      const envTxns = transactions.filter(
        t => t.envelopeId === env.id && t.date >= wkStart && t.date <= wkEnd,
      );
      const spent = envTxns.reduce((sum, t) => sum + t.amountCents, 0);
      const unspent = Math.max(0, env.weeklyBudgetCents - spent);

      // Only non-rollover envelopes contribute to savings
      // Rollover envelopes carry surplus forward (accounted for in their remaining)
      if (!env.rollover) {
        totalSavingsCents += unspent;
      }
    }

    weekCursor = new Date(weekCursor.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return totalSavingsCents;
}
```

### SWR Mutation After Create
```typescript
// File: src/components/envelopes/EnvelopesHomePage.tsx (personal-brand repo)
// Source: SWR docs - Mutation & Revalidation
import { useEnvelopes } from "@/lib/envelopes/hooks";
import { useAuth } from "@/context/AuthContext";

function handleCreateEnvelope(formData: { title: string; weeklyBudgetCents: number }) {
  const { user } = useAuth();
  const { mutate } = useEnvelopes();

  const token = await user!.getIdToken();
  await mutate(
    async (current) => {
      const res = await fetch("/api/envelopes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to create envelope");
      const newEnvelope = await res.json();
      return {
        ...current!,
        envelopes: [...(current?.envelopes ?? []), newEnvelope],
      };
    },
    { revalidate: true },
  );
}
```

### Greeting Banner with Fallback Name
```typescript
// File: src/components/envelopes/GreetingBanner.tsx (personal-brand repo)
"use client";

import { useAuth } from "@/context/AuthContext";

function getDisplayName(user: { displayName?: string | null; email?: string | null }): string {
  if (user.displayName) return user.displayName.split(" ")[0]; // First name only
  if (user.email) return user.email.split("@")[0];
  return "there";
}

function getWeekdayName(): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
}

type Props = {
  onTrackCount: number;
  totalCount: number;
  savingsCents: number;
};

export function GreetingBanner({ onTrackCount, totalCount, savingsCents }: Props) {
  const { user } = useAuth();
  if (!user) return null;

  const name = getDisplayName(user);
  const weekday = getWeekdayName();

  return (
    <div className="rounded-2xl bg-primary/5 border border-primary/10 p-6 mb-6">
      <h2 className="text-xl font-display font-bold text-primary">
        Hi {name}! Today is {weekday}.
      </h2>
      <p className="text-text-secondary mt-1">
        {onTrackCount} of {totalCount} envelopes on track this week.
      </p>
    </div>
  );
}
```

## Savings Computation Design

This section documents the recommended approach for ENV-06 (cumulative savings) and HOME-04 (savings display), which the STATE.md flagged as a cross-phase concern.

### Definition

**Cumulative Savings** = the total unspent budget from all **completed** past weeks, across all envelopes where `rollover === false`.

- Only completed weeks count (not the current in-progress week).
- Only non-rollover envelopes contribute. Rollover envelopes carry surplus forward into their remaining balance, so the surplus is "in use" rather than "saved."
- Overspending in a week does NOT reduce savings (minimum contribution per envelope per week is $0). Overages are handled by the reallocation system.

### Why This Definition

1. **Rollover vs savings separation:** If an envelope has `rollover: true`, its surplus stays in that envelope for future weeks. Counting it as savings would double-count it. Only `rollover: false` envelopes "release" their surplus to savings.
2. **Completed weeks only:** The current week is still in progress -- the user may still spend their budget. Including partial weeks would show misleading savings that decrease as the user spends.
3. **Floor at zero:** If the user overspends in a week, that envelope contributes $0 to savings (not negative). Overages are a separate concern handled by the reallocation system.

### Computation Approach

**Phase 2 (launch):** Compute-on-read. Query all past transactions, iterate week by week, sum unspent non-rollover budgets. This is O(weeks * envelopes * transactions) but for a personal budgeting app, the data is tiny (months of weekly data, <100 transactions/week).

**Future optimization (if needed):** Add a `savings_checkpoints` collection that stores periodic snapshots. Computation then only needs to process weeks since the last checkpoint.

### Consistency with Phase 5

Phase 5 (Analytics) includes ANL-03 (savings visualization). The same `computeCumulativeSavings()` function should be reused there. The function should be parameterized to optionally return per-week savings breakdown (for visualization) in addition to the cumulative total.

## Reorder Design

### Recommended: Arrow Buttons (Not Drag-and-Drop)

**Why not drag-and-drop:**
1. `@dnd-kit/react` is at version 0.2.4 (pre-release) -- not yet stable for production use.
2. The older `@dnd-kit/core` + `@dnd-kit/sortable` require SSR workarounds with dynamic imports in Next.js.
3. For 5-15 envelopes, the UX improvement of drag-and-drop over arrow buttons is marginal.
4. Arrow buttons are fully accessible (keyboard-operable), require zero dependencies, and are trivial to implement.

**Implementation:**
- Each envelope card has up/down arrow buttons (hidden for first/last items).
- Clicking an arrow swaps the envelope with its neighbor.
- The new order is sent as a complete ordered list of IDs to PUT /api/envelopes/reorder.
- SWR optimistic update shows the new order immediately.

**Future consideration:** If users request drag-and-drop, it can be added in a v2 enhancement when `@dnd-kit/react` reaches 1.0.

## Firestore Indexes Required

Phase 2 requires these composite indexes to be added to `firestore.indexes.json`:

```json
{
  "collectionGroup": "envelopes",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "sortOrder", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "envelope_transactions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "ASCENDING" }
  ]
}
```

These support the `envelopesForUser()` and `transactionsForUserInWeek()` queries defined in Phase 1.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd for reordering | @dnd-kit (or simple arrow buttons for small lists) | 2023+ | react-beautiful-dnd deprecated; @dnd-kit is the successor |
| Manual fetch + setState for CRUD | SWR mutate() with optimistic data | SWR 2.0 (2023) | Automatic cache management, rollback on error |
| Sequential Firestore deletes | Batched writes | Always available | Atomic, better performance, prevents orphaned data |
| Denormalized totals for display | Compute-on-read with parallel queries | Roadmap decision | Always consistent, no write contention |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Officially deprecated, unmaintained, does not support React 19
- Manual `fetch` without caching: SWR provides caching, deduplication, and revalidation for free
- `getServerSideProps` for data fetching: This repo uses App Router with client components + API routes

## Open Questions

1. **Should rollover envelopes accumulate their surplus separately from savings?**
   - What we know: The rollover flag (ENV-04) determines whether surplus carries forward. Non-rollover surplus goes to savings.
   - What's unclear: Should rollover surplus be visible as a separate "banked" amount on the envelope card, or just reflected in the remaining balance for the next week?
   - Recommendation: For Phase 2, keep it simple -- rollover envelopes just show a higher `remainingCents` (weeklyBudget + accumulated surplus - spent). Display the accumulated surplus as a secondary label ("includes $X.XX carried over"). Defer detailed rollover tracking to a future enhancement.

2. **How to handle envelope budget changes retroactively for savings?**
   - What we know: If a user changes an envelope's `weeklyBudgetCents` from $100 to $75, should past savings be recomputed?
   - What's unclear: Whether to use the current budget or the historical budget for savings computation.
   - Recommendation: Use the **current** budget for savings computation. This is simpler (no need to store budget history) and aligns with user mental model ("I save whatever I don't spend based on my current budget"). If users need historical accuracy, a `budget_history` collection can be added later.

3. **Savings for rollover envelopes across weeks**
   - What we know: Rollover envelopes carry surplus forward. If a user has $50/week budget, spends $30 in week 1, the $20 surplus carries to week 2 (giving $70 available).
   - What's unclear: When computing savings, should rollover envelopes ever contribute? If the user STILL has surplus after a full week, where does it go?
   - Recommendation: Rollover surplus stays in the envelope indefinitely -- it does NOT convert to savings. The user chose rollover specifically to bank surplus in that envelope. Savings comes only from non-rollover envelopes. This keeps the model clean: savings = "money you chose not to allocate to a specific envelope."

4. **What happens to cumulative savings when an envelope is deleted?**
   - What we know: Deleting an envelope cascades to remove its transactions (ENV-03).
   - What's unclear: Should historical savings computed from that envelope's past unspent weeks be preserved or recalculated?
   - Recommendation: Since savings is computed-on-read from transaction data, deleting the transactions means those weeks' contributions vanish from the savings total. This is the correct behavior -- if the envelope and its transactions are gone, the savings they generated are also gone. Document this as expected behavior. If users want to preserve savings, they should keep the envelope (perhaps set budget to $0) rather than delete it.

## Sources

### Primary (HIGH confidence)
- Host repo codebase analysis -- direct file reads of:
  - `src/components/ui/Card.tsx` -- Card component (default/clickable/featured variants)
  - `src/components/ui/Button.tsx` -- Button component (primary/secondary/ghost)
  - `src/lib/billing/firestore.ts` -- Full CRUD pattern with Firestore admin SDK, batched writes, transactions
  - `src/lib/auth/user.ts` -- `verifyUser()` + `unauthorizedResponse()` pattern
  - `src/app/api/billing/me/route.ts` -- API route pattern with auth
  - `src/context/AuthContext.tsx` -- `useAuth()` hook providing `user` object
  - `src/components/layout/AuthButton.tsx` -- `user.displayName` usage pattern
  - `src/components/layout/NavLinks.tsx` -- Confirms "Envelopes" link exists for authenticated users
  - `src/app/envelopes/layout.tsx` -- AuthGuard + EnvelopesNav (Phase 1 output)
  - `src/app/envelopes/page.tsx` -- Current placeholder page
  - `src/lib/brand-scraper/hooks.ts` -- SWR hook pattern with Bearer token auth
  - `firestore.indexes.json` -- Existing composite index definitions
  - `firestore.rules` -- Deny-all rules (all access via admin SDK)
  - `src/app/globals.css` -- Design tokens (navy, gold, sage, amber, card shadows)
- dave-ramsey repo codebase:
  - `src/lib/envelopes/types.ts` -- Existing Zod schemas + Firestore types
  - `src/lib/envelopes/firestore.ts` -- Existing collection helpers
  - `src/lib/envelopes/week-math.ts` -- Existing week math utilities
  - `src/lib/envelopes/format.ts` -- Existing formatCents utility
- [Firebase: Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions) -- Batch limit (500 ops), atomic guarantees
- [Firebase: Delete data](https://firebase.google.com/docs/firestore/manage-data/delete-data) -- No automatic cascading deletes

### Secondary (MEDIUM confidence)
- [SWR: Mutation & Revalidation](https://swr.vercel.app/docs/mutation) -- `mutate()`, `optimisticData`, `rollbackOnError`, `useSWRMutation` patterns
- [dnd-kit documentation](https://docs.dndkit.com/presets/sortable) -- Sortable preset, React compatibility
- [dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) -- Version 0.2.4, pre-release status confirmed
- [Firebase: Understand reads and writes at scale](https://firebase.google.com/docs/firestore/understand-reads-writes-scale) -- 1 QPS per document, batch size limits

### Tertiary (LOW confidence)
- None. All findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed in one or both repos; no new dependencies
- Architecture: HIGH -- all patterns replicate existing billing/auth patterns in the host repo
- Pitfalls: HIGH -- derived from Firestore documentation and existing code analysis
- Savings computation: MEDIUM -- the approach is sound but the rollover interaction is a design decision that could change based on user feedback
- Reorder approach: HIGH -- arrow buttons are simpler and dnd-kit pre-release status is verified

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable; all dependencies are mature, no fast-moving concerns)
