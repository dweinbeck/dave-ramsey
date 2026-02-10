# Phase 6: Billing Integration - Research

**Researched:** 2026-02-10
**Domain:** Credits-based billing integration with existing Firestore billing system
**Confidence:** HIGH

## Summary

Phase 6 integrates Digital Envelopes with the existing credits billing system in the personal-brand repo. The existing billing infrastructure (`src/lib/billing/`) provides a complete credits-based payment system with Firestore storage, idempotent debiting via `debitForToolUse()`, ledger tracking, Stripe checkout, and admin operations. The Digital Envelopes billing model is distinct from per-tool-use billing: it charges 100 credits per **week** on first access (not per action), with a free first week and read-only degradation when unpaid.

The existing billing system was designed for per-action charging (e.g., 50 credits per brand scraper run). The envelope billing model introduces **time-based, idempotent weekly charging** -- a new pattern that can leverage the existing `debitForToolUse()` function and idempotency infrastructure but needs a new concept of "week entitlement" tracking. The core challenge is determining when to charge (first access per week), tracking the free trial week, and enforcing read-only mode at both the API and UI layers.

**Primary recommendation:** Create a dedicated `src/lib/envelopes/billing.ts` module that wraps the existing `debitForToolUse()` from `src/lib/billing/firestore.ts`, adds a Firestore document per user to track first-use date (for free week computation) and per-week charge records (for idempotency), and exposes a single `checkEnvelopeAccess()` function that API routes call to determine read/write vs read-only access.

## Standard Stack

### Core

No new libraries needed. This phase uses only existing infrastructure.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase-admin/firestore | (existing) | Week entitlement storage, idempotent charge records | Already used for all billing + envelope data |
| date-fns | v4 (existing) | Week boundary computation for charge periods | Already used in week-math.ts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod/v4 | (existing) | Schema validation for billing status response | API response shape validation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Firestore doc per week | billing_idempotency collection | Reusing idempotency collection is possible but conflates tool-use idempotency with week-access entitlement. Separate doc is clearer. |
| Server-side only gating | Client-side gating only | Client-side alone is bypassable via direct API calls. Server-side enforcement is mandatory; client provides UX. |

**Installation:** None needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure

```
personal-brand/src/
├── lib/
│   ├── billing/
│   │   └── firestore.ts          # EXISTING - debitForToolUse(), getBalance(), etc.
│   └── envelopes/
│       ├── billing.ts             # NEW - checkEnvelopeAccess(), envelope billing logic
│       ├── firestore.ts           # EXISTING - envelope CRUD (add billing checks to mutations)
│       ├── hooks.ts               # MODIFY - expose billing status to UI
│       ├── types.ts               # MODIFY - add BillingStatus type to API responses
│       └── week-math.ts           # EXISTING - reuse getWeekRange()
├── app/api/envelopes/
│   ├── route.ts                   # MODIFY - add billing gate to POST
│   ├── [envelopeId]/route.ts      # MODIFY - add billing gate to PUT, DELETE
│   ├── transactions/route.ts      # MODIFY - add billing gate to POST
│   ├── transactions/[transactionId]/route.ts  # MODIFY - add billing gate to PUT, DELETE
│   ├── allocations/route.ts       # MODIFY - add billing gate to POST
│   └── reorder/route.ts           # MODIFY - add billing gate to PUT
└── components/envelopes/
    ├── EnvelopesHomePage.tsx       # MODIFY - consume billing status, disable mutations
    ├── TransactionsPage.tsx        # MODIFY - consume billing status, disable mutations
    ├── ReadOnlyBanner.tsx          # NEW - visual indicator for read-only mode
    └── ...
```

### Pattern 1: Week Entitlement Document

**What:** A single Firestore document per user at `envelope_billing/{uid}` that tracks:
- `firstAccessWeekStart` (string, YYYY-MM-DD) -- the Sunday of the user's first-ever envelope access
- `paidWeeks` (map of weekStart string -> { chargedAt, usageId }) -- weeks that have been charged

**When to use:** Every time `checkEnvelopeAccess()` runs (on any envelope API call).

**Example:**
```typescript
// Firestore document: envelope_billing/{uid}
{
  uid: "abc123",
  firstAccessWeekStart: "2026-02-09",  // Sunday of first access
  paidWeeks: {
    "2026-02-16": {  // Second week (first paid week)
      usageId: "xyz789",
      creditsCharged: 100,
      chargedAt: Timestamp
    }
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Pattern 2: Single Access Check Function

**What:** A single `checkEnvelopeAccess()` function that all envelope API routes call after auth verification. It returns a `BillingAccess` result indicating whether the user can read+write or read-only.

**When to use:** Every envelope API route handler, after `verifyUser()`.

**Example:**
```typescript
type BillingAccess =
  | { mode: "readwrite"; weekStart: string }
  | { mode: "readonly"; reason: "unpaid"; weekStart: string }
  | { mode: "readwrite"; reason: "free_week"; weekStart: string };

async function checkEnvelopeAccess(uid: string, email: string): Promise<BillingAccess> {
  const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

  // 1. Get or create the envelope billing doc
  const billingDoc = await getOrCreateEnvelopeBilling(uid);

  // 2. Is this the free week?
  if (billingDoc.firstAccessWeekStart === currentWeekStart) {
    return { mode: "readwrite", reason: "free_week", weekStart: currentWeekStart };
  }

  // 3. Already paid for this week?
  if (billingDoc.paidWeeks?.[currentWeekStart]) {
    return { mode: "readwrite", weekStart: currentWeekStart };
  }

  // 4. Try to charge
  try {
    const debit = await debitForToolUse({
      uid,
      email,
      toolKey: "dave_ramsey",
      idempotencyKey: `envelope_week_${currentWeekStart}`,
    });

    // Record the paid week
    await recordPaidWeek(uid, currentWeekStart, debit.usageId, debit.creditsCharged);

    return { mode: "readwrite", weekStart: currentWeekStart };
  } catch (error) {
    // Insufficient credits or other billing error -> read-only
    if (error instanceof Error && "statusCode" in error && (error as any).statusCode === 402) {
      return { mode: "readonly", reason: "unpaid", weekStart: currentWeekStart };
    }
    throw error; // Re-throw unexpected errors
  }
}
```

### Pattern 3: API Route Guard Pattern

**What:** Each mutation endpoint checks billing access before proceeding. GET endpoints always succeed but include billing status in the response.

**When to use:** All envelope API routes.

**Example:**
```typescript
// In a POST/PUT/DELETE handler:
export async function POST(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  const access = await checkEnvelopeAccess(auth.uid, auth.email);
  if (access.mode === "readonly") {
    return Response.json(
      { error: "Week not paid. Purchase credits to continue editing." },
      { status: 402 }
    );
  }

  // ... proceed with normal logic
}

// In a GET handler (returns data + billing status):
export async function GET(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  const access = await checkEnvelopeAccess(auth.uid, auth.email);
  const data = await listEnvelopesWithRemaining(auth.uid);

  return Response.json({
    ...data,
    billing: {
      mode: access.mode,
      reason: "reason" in access ? access.reason : undefined,
    },
  });
}
```

### Pattern 4: Client-Side Read-Only Mode

**What:** UI components receive billing status from the API response and conditionally disable mutation controls (buttons, forms) while showing a banner explaining the read-only state.

**When to use:** EnvelopesHomePage, TransactionsPage, and any component that renders mutation controls.

**Example:**
```typescript
// In hooks.ts -- extend existing type
export type HomePageData = {
  envelopes: EnvelopeWithStatus[];
  weekLabel: string;
  cumulativeSavingsCents: number;
  billing: { mode: "readwrite" | "readonly"; reason?: string };
};

// In EnvelopesHomePage.tsx
const isReadOnly = data?.billing?.mode === "readonly";

// Disable create, edit, delete buttons when isReadOnly
// Show ReadOnlyBanner when isReadOnly
```

### Anti-Patterns to Avoid

- **Client-only gating:** Never rely solely on hiding UI buttons for billing enforcement. API routes MUST reject mutations for unpaid weeks. The UI is a courtesy; the server is the law.
- **Charging on every request:** The charge must be idempotent. Once charged for a week, subsequent requests that week must not re-charge. Use both the `billing_idempotency` collection (via `debitForToolUse`) AND the `paidWeeks` map for fast lookups.
- **Separate free-week logic from main flow:** Don't create a separate code path for free week. The `checkEnvelopeAccess()` function handles all cases in one flow.
- **Storing billing status on the billing_users doc:** Don't add envelope-specific fields to `billing_users`. Create a separate `envelope_billing` collection for separation of concerns.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent credit deduction | Custom debit-once logic | `debitForToolUse()` with stable idempotencyKey per week | Already handles idempotency via `billing_idempotency` collection with Firestore transactions |
| Week boundary computation | Custom date math | `getWeekRange()` from `week-math.ts` + `format(startOfWeek(...), 'yyyy-MM-dd')` | Already tested, handles weekStartsOn:0 correctly |
| Balance checking | Direct Firestore reads | `getBalance()` from `billing/firestore.ts` | Consistent with existing billing reads |
| Credit deduction + ledger entry | Manual balance update | `debitForToolUse()` handles balance, ledger, usage, and idempotency atomically in a transaction | Atomic Firestore transaction prevents double-charging |

**Key insight:** The existing billing system already solves the hardest parts (atomic debit, idempotency, ledger). The new code needs to add: (1) a thin wrapper to track per-user first-access and per-week paid status, and (2) API route guards + UI indicators.

## Common Pitfalls

### Pitfall 1: Race Condition on First Access

**What goes wrong:** Two concurrent requests for a user's first-ever envelope access could both try to create the `envelope_billing` document, leading to duplicate charges or data corruption.
**Why it happens:** Network retries, user double-clicking, or SSR + client both hitting API.
**How to avoid:** Use Firestore `runTransaction()` for the initial document creation (get-or-create pattern). The `debitForToolUse()` already handles idempotency for the charge itself via the idempotency key.
**Warning signs:** Duplicate ledger entries for the same week, or `firstAccessWeekStart` being overwritten.

### Pitfall 2: Week Boundary Mismatch

**What goes wrong:** The billing system uses a different week boundary than the envelope display, causing users to be charged for the wrong week or to see mismatched free-week periods.
**Why it happens:** Using different `weekStartsOn` values or computing week start differently.
**How to avoid:** Use the SAME `getWeekRange()` and `startOfWeek(date, { weekStartsOn: 0 })` for billing week computation as for envelope display. The formatted `YYYY-MM-DD` string of the Sunday is the canonical week identifier.
**Warning signs:** User sees "Week of 2/9/2026 - 2/15/2026" but billing thinks it is a different week.

### Pitfall 3: Free Week Determined by Calendar, Not Duration

**What goes wrong:** If "free first week" means "the calendar week of first access," a user who first accesses on Saturday gets only 1 free day. If it means "7 days from first access," the boundary does not align with envelope weeks.
**Why it happens:** Ambiguity in "first week" definition.
**How to avoid:** Define "free first week" as the **calendar week** (Sunday-Saturday) of the user's first-ever access. This aligns with envelope week boundaries. A user accessing first on Saturday gets a short free period, but this is consistent and simple. The alternative (7-day rolling window) creates misalignment with envelope weeks and is much harder to reason about.
**Warning signs:** User is charged during what they perceive as their first week.

### Pitfall 4: GET Requests Triggering Charges

**What goes wrong:** If `checkEnvelopeAccess()` always tries to charge, then simply viewing the envelopes page triggers a 100-credit charge, even if the user just wants to look.
**Why it happens:** Calling the charge function on GET requests.
**How to avoid:** The charge should only be attempted on the first **mutating** access (POST/PUT/DELETE) OR on the first GET access of the week. The requirement says "100 credits charged per week on first access each week" -- this means viewing the page triggers the charge. However, if the user has insufficient credits, they should still be able to view in read-only mode. So: attempt charge on first access, but gracefully fall back to read-only on failure. The key insight is that `checkEnvelopeAccess()` attempts charging, and on 402 (insufficient credits), returns `readonly` mode instead of blocking.
**Warning signs:** Users unable to view their own data when they have zero credits.

### Pitfall 5: Forgetting to Gate All Mutation Endpoints

**What goes wrong:** One mutation endpoint is missed and users can still create/edit/delete in read-only mode.
**Why it happens:** There are 6 mutation endpoints across 4 route files.
**How to avoid:** Create a comprehensive list and check each one.

**Complete list of mutation endpoints to gate:**
1. `POST /api/envelopes` -- create envelope
2. `PUT /api/envelopes/[envelopeId]` -- update envelope
3. `DELETE /api/envelopes/[envelopeId]` -- delete envelope
4. `POST /api/envelopes/transactions` -- create transaction
5. `PUT /api/envelopes/transactions/[transactionId]` -- update transaction
6. `DELETE /api/envelopes/transactions/[transactionId]` -- delete transaction
7. `POST /api/envelopes/allocations` -- create allocation
8. `PUT /api/envelopes/reorder` -- reorder envelopes

**Warning signs:** User in read-only mode is able to perform a mutation.

### Pitfall 6: Tool Pricing Not Active

**What goes wrong:** `debitForToolUse()` throws "Tool 'dave_ramsey' is not active" because the tool pricing seed has `active: false` for the `dave_ramsey` tool key.
**Why it happens:** The `TOOL_PRICING_SEED` in `tools.ts` has `dave_ramsey` set to `active: false`.
**How to avoid:** Activate the `dave_ramsey` tool pricing entry in Firestore (either by updating the seed or via the admin pricing API). Set `creditsPerUse: 100` and `active: true`. Note: `costToUsCentsEstimate` should be 0 since envelope access has no incremental cost to the platform.
**Warning signs:** All envelope access attempts fail with "Tool not active."

## Code Examples

### Example 1: Envelope Billing Document Schema

```typescript
// Source: Custom for this phase, following existing billing/types.ts patterns

/** Tracks per-user envelope billing state. */
export type EnvelopeBilling = {
  uid: string;
  firstAccessWeekStart: string; // YYYY-MM-DD (Sunday of first-ever access)
  paidWeeks: Record<string, {
    usageId: string;
    creditsCharged: number;
    chargedAt: FirebaseFirestore.Timestamp;
  }>;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

/** Result of checking envelope access for billing. */
export type EnvelopeAccessResult =
  | { mode: "readwrite"; weekStart: string; reason?: "free_week" }
  | { mode: "readonly"; weekStart: string; reason: "unpaid" };
```

### Example 2: checkEnvelopeAccess Implementation Sketch

```typescript
// Source: Custom, wrapping existing debitForToolUse() from billing/firestore.ts

import { format, startOfWeek } from "date-fns";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase";
import { debitForToolUse } from "@/lib/billing/firestore";
import type { EnvelopeAccessResult, EnvelopeBilling } from "@/lib/envelopes/types";

const WEEK_OPTIONS = { weekStartsOn: 0 as const };
const ENVELOPE_TOOL_KEY = "dave_ramsey";
const CREDITS_PER_WEEK = 100;

function envelopeBillingCol() {
  if (!db) throw new Error("Firestore not available.");
  return db.collection("envelope_billing");
}

export async function checkEnvelopeAccess(
  uid: string,
  email: string,
): Promise<EnvelopeAccessResult> {
  if (!db) throw new Error("Firestore not available.");

  const currentWeekStart = format(
    startOfWeek(new Date(), WEEK_OPTIONS),
    "yyyy-MM-dd",
  );

  const docRef = envelopeBillingCol().doc(uid);

  // Get-or-create billing doc in a transaction
  const billingDoc = await db.runTransaction(async (txn) => {
    const snap = await txn.get(docRef);
    if (snap.exists) return snap.data() as EnvelopeBilling;

    const newDoc: Omit<EnvelopeBilling, "createdAt" | "updatedAt"> & {
      createdAt: FirebaseFirestore.FieldValue;
      updatedAt: FirebaseFirestore.FieldValue;
    } = {
      uid,
      firstAccessWeekStart: currentWeekStart,
      paidWeeks: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    txn.set(docRef, newDoc);
    return { ...newDoc, paidWeeks: {} } as unknown as EnvelopeBilling;
  });

  // Free week check
  if (billingDoc.firstAccessWeekStart === currentWeekStart) {
    return { mode: "readwrite", weekStart: currentWeekStart, reason: "free_week" };
  }

  // Already paid this week?
  if (billingDoc.paidWeeks?.[currentWeekStart]) {
    return { mode: "readwrite", weekStart: currentWeekStart };
  }

  // Attempt to charge
  try {
    const debit = await debitForToolUse({
      uid,
      email,
      toolKey: ENVELOPE_TOOL_KEY,
      idempotencyKey: `envelope_week_${currentWeekStart}`,
    });

    // Record paid week
    await docRef.update({
      [`paidWeeks.${currentWeekStart}`]: {
        usageId: debit.usageId,
        creditsCharged: debit.creditsCharged,
        chargedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { mode: "readwrite", weekStart: currentWeekStart };
  } catch (error) {
    if (
      error instanceof Error &&
      "statusCode" in error &&
      (error as Error & { statusCode: number }).statusCode === 402
    ) {
      return { mode: "readonly", weekStart: currentWeekStart, reason: "unpaid" };
    }
    throw error;
  }
}
```

### Example 3: API Route Guard Usage

```typescript
// Source: Follows existing pattern in envelope API routes

// In POST /api/envelopes route.ts
export async function POST(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  const access = await checkEnvelopeAccess(auth.uid, auth.email);
  if (access.mode === "readonly") {
    return Response.json(
      { error: "Insufficient credits. Purchase credits to continue editing envelopes." },
      { status: 402 },
    );
  }

  // ... existing POST logic unchanged
}
```

### Example 4: GET Route with Billing Status

```typescript
// Source: Extending existing GET /api/envelopes pattern

export async function GET(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  const [access, data] = await Promise.all([
    checkEnvelopeAccess(auth.uid, auth.email),
    listEnvelopesWithRemaining(auth.uid),
  ]);

  return Response.json({
    ...data,
    billing: {
      mode: access.mode,
      reason: "reason" in access ? access.reason : undefined,
    },
  });
}
```

### Example 5: ReadOnlyBanner Component

```typescript
// Source: Follows existing GreetingBanner/SavingsBanner pattern

export function ReadOnlyBanner() {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <p className="font-semibold">Read-Only Mode</p>
      <p className="mt-1">
        Your free week has ended. Purchase credits to continue adding and editing
        envelopes and transactions.
      </p>
      <a
        href="/billing"
        className="mt-2 inline-block font-medium text-amber-900 underline hover:no-underline"
      >
        Buy Credits
      </a>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-action charging only | Time-based (weekly) + per-action charging | This phase | New `checkEnvelopeAccess()` function alongside existing `debitForToolUse()` |
| No tool-level gating | Per-tool access with graceful degradation | This phase | API routes gain billing awareness |

**Existing infrastructure being reused:**
- `debitForToolUse()` -- atomic debit with idempotency (no changes needed)
- `billing_idempotency` collection -- prevents double-charging (no changes needed)
- `billing_tool_pricing` collection -- stores the `dave_ramsey` pricing entry (needs activation)
- `BillingUser.balanceCredits` -- credit balance check (no changes needed)

## Open Questions

1. **Should the charge happen on GET or only on first mutation?**
   - What we know: The requirement says "100 credits charged per week on first access each week." "Access" implies viewing, not just editing.
   - What's unclear: Does the user expect to be charged just for viewing, or only when they try to edit?
   - Recommendation: Charge on any access (GET included) as the requirement states. This is simpler and ensures the billing doc's `paidWeeks` is populated on first visit. Users who just want to view but cannot pay will see read-only mode, which is the correct UX. This avoids the awkward scenario where a user can view all week for free but is only charged when they try to edit.

2. **What if the `dave_ramsey` tool pricing document does not exist in production Firestore?**
   - What we know: The seed function `seedToolPricing()` creates it with `active: false` and `creditsPerUse: 10`. Phase 6 needs it `active: true` with `creditsPerUse: 100`.
   - What's unclear: Whether the seed has already run in production and whether there is a migration mechanism.
   - Recommendation: Update the `TOOL_PRICING_SEED` to set `dave_ramsey` to `active: true` and `creditsPerUse: 100`, `costToUsCentsEstimate: 0`. Additionally, create a one-time admin script or use the admin pricing API (`PUT /api/admin/billing/pricing`) to update the existing production document.

3. **Should analytics page also be gated?**
   - What we know: Analytics (`GET /api/envelopes/analytics`) is a read-only view. The requirement says users "can view all past data" when unpaid.
   - What's unclear: Is the analytics page considered "viewing data" (always accessible) or a premium feature?
   - Recommendation: Analytics should remain accessible in read-only mode. It is a "view" of existing data. The billing check should still run on analytics GET to attempt charging (so it triggers payment on first access), but should never block reading.

## Sources

### Primary (HIGH confidence)

- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/lib/billing/firestore.ts` -- Full `debitForToolUse()` implementation with idempotency, atomic transactions, ledger entries. Read completely.
- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/lib/billing/types.ts` -- All billing types: `BillingUser`, `LedgerEntry`, `ToolPricing`, `ToolUsage`, `DebitResult`. Read completely.
- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/lib/billing/tools.ts` -- `TOOL_PRICING_SEED` with `dave_ramsey` entry (`active: false`, `creditsPerUse: 10`). Read completely.
- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/app/api/tools/brand-scraper/scrape/route.ts` -- Reference implementation showing how `debitForToolUse()` is called in practice with idempotency key. Read completely.
- **Existing codebase** -- All 6 envelope API route files read completely to catalog mutation endpoints.
- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/lib/envelopes/week-math.ts` -- Week boundary computation. Read completely.
- **Existing codebase** -- `/Users/dweinbeck/Documents/personal-brand/src/lib/auth/user.ts` -- Auth pattern with `verifyUser()` returning `{ uid, email }`. Read completely.
- **Existing codebase** -- All UI components for envelopes (EnvelopesHomePage, TransactionsPage, AnalyticsPage, EnvelopeCard, etc.) read to understand mutation touchpoints.

### Secondary (MEDIUM confidence)

- **Project planning docs** -- `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md` -- Phase 6 requirements and prior decisions. Read completely.

### Tertiary (LOW confidence)

None. All findings derived from existing codebase analysis.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries; all existing infrastructure verified by reading source code
- Architecture: HIGH -- Pattern follows existing `debitForToolUse()` integration (brand-scraper route) and extends it
- Pitfalls: HIGH -- Derived from direct analysis of existing code (e.g., `dave_ramsey` is `active: false` in seed)

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable -- no external dependencies, all internal code)
