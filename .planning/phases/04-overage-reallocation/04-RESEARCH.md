# Phase 4: Overage Reallocation - Research

**Researched:** 2026-02-10
**Domain:** Overage detection, donor allocation workflow, atomic multi-document persistence, reusable modal component, cascading deletion, client/server validation split
**Confidence:** HIGH

## Summary

Phase 4 introduces the signature complex workflow for Digital Envelopes: when a transaction causes an envelope to go negative, a modal guides the user through reallocating from other envelopes to cover the overage. This requires five coordinated capabilities: (1) a reusable Modal component built on the native HTML `<dialog>` element, (2) client-side overage detection after transaction creation, (3) a donor allocation form with real-time validation, (4) atomic server-side persistence of allocations linked to the source transaction, and (5) cascading deletion of allocations when their source transaction is deleted.

The architecture builds directly on Phase 3's transaction CRUD. The key insight is that overage detection happens client-side (comparing the response from transaction creation against envelope balances already available in SWR cache), while allocation persistence happens server-side with full constraint validation. The `OverageAllocation` type and `allocationsCol()` collection reference already exist in both repos from Phase 1. The `deleteTransaction` function in both repos already has a `TODO: Phase 4` comment marking the cascade extension point. Firestore batched writes (not transactions) are the correct atomicity primitive here because the overage allocation endpoint only writes documents -- it does not need to read-then-write conditionally.

The modal component should use the native HTML `<dialog>` element with `showModal()` / `close()` APIs. This approach requires zero new dependencies, provides built-in focus trapping, Escape key handling, backdrop via `::backdrop` pseudo-element, and top-layer rendering (no z-index conflicts). The component should be placed in `src/components/ui/Modal.tsx` alongside the existing Button and Card components.

**Primary recommendation:** Build the reusable Modal on native `<dialog>`, detect overage client-side after successful transaction creation by comparing the new spending total against the envelope's budget (both available from the POST response and SWR cache), and persist allocations via a new `POST /api/envelopes/allocations` endpoint that uses a Firestore batched write to atomically create all allocation documents with server-side validation of all constraints.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native HTML `<dialog>` | Browser built-in | Modal component foundation | Zero dependencies, built-in focus trap, Escape key, backdrop, top-layer. All modern browsers support it. |
| firebase-admin | 13.6.0 (installed) | Firestore batched writes for atomic allocation persistence | Already used for all server-side data operations |
| swr | 2.4.0 (installed) | Cache invalidation after allocation creation/deletion | Already established in Phases 2-3 |
| zod | 4.3.6 (installed) | Input validation for allocation API endpoint | `"zod/v4"` import; consistent with all existing schemas |
| react | 19.2.3 (installed) | `useRef`, `useEffect`, `useCallback` for Modal; `useState` for allocation form | Standard React patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | 2.1.1 (installed) | Conditional class merging for modal styling | Modal and allocation form components |
| date-fns | 4.1.0 (installed) | No new usage in Phase 4 | Already imported where needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<dialog>` | react-modal (7.4k stars, 1.7M downloads/week) | react-modal adds a dependency for something the browser does natively. The native `<dialog>` provides focus trapping, Escape key, backdrop, and top-layer for free. No library in the ecosystem uses native dialog yet -- but the native API is mature and well-supported. |
| Native `<dialog>` | Headless UI Dialog (from @headlessui/react) | Another dependency (40KB). Useful if building a full design system, but this project needs exactly one modal pattern. |
| Firestore batched write | Firestore `runTransaction` | `runTransaction` is for read-then-write patterns where you need to read current state and conditionally write. The allocation endpoint receives all data from the client and only writes -- no conditional reads needed. Batched writes are simpler, never retry, and have fewer failure modes. |
| Client-side overage detection | Server-side overage detection (return overage info from POST) | The server could compute overage and return it in the transaction creation response. However, the client already has envelope balances in SWR cache, so detection is trivial client-side. Server-side detection would require the transaction creation endpoint to query envelope balances and return them, adding complexity to an already-working endpoint. |
| New allocation API endpoint | Extend transaction POST to accept allocations | Keeping allocation creation separate from transaction creation maintains single responsibility. The transaction might not cause an overage (no modal needed), or the user might cancel the modal (transaction saved without allocations). Coupling them would complicate both. |

**Installation:**
```bash
# No new dependencies needed. Everything is already installed.
```

## Architecture Patterns

### Recommended Project Structure

**personal-brand repo (UI + API routes):**
```
src/
├── app/
│   └── api/
│       └── envelopes/
│           ├── allocations/
│           │   └── route.ts              # POST: create allocations for a transaction
│           └── transactions/
│               └── [transactionId]/
│                   └── route.ts          # MODIFY: DELETE cascades to allocations
├── components/
│   ├── ui/
│   │   └── Modal.tsx                     # NEW: reusable modal component (native dialog)
│   └── envelopes/
│       ├── OverageModal.tsx              # NEW: overage allocation workflow modal
│       ├── DonorAllocationRow.tsx        # NEW: single donor row with input + validation
│       ├── EnvelopesHomePage.tsx         # MODIFY: detect overage, open modal after txn create
│       └── TransactionsPage.tsx          # MODIFY: detect overage, open modal after txn create
├── lib/
│   └── envelopes/
│       ├── types.ts                      # MODIFY: add allocation schemas
│       ├── firestore.ts                  # MODIFY: add allocation CRUD, update deleteTransaction
│       └── hooks.ts                      # No changes needed (allocations don't have their own SWR hook)
```

**dave-ramsey repo (shared utilities):**
```
src/
└── lib/
    └── envelopes/
        ├── types.ts                      # MODIFY: add overageAllocationSchema
        ├── firestore.ts                  # MODIFY: add createAllocations, deleteAllocationsForTransaction, update deleteTransaction
        └── __tests__/
            └── firestore.test.ts         # MODIFY: add allocation tests
```

### Pattern 1: Reusable Modal Component (Native `<dialog>`)
**What:** A controlled modal component built on the native HTML `<dialog>` element that handles focus management, Escape key, backdrop clicks, and ARIA attributes automatically.
**When to use:** Overage workflow (Phase 4), and available for future use (error modals, confirmations, etc.).
**Example:**
```typescript
// File: src/components/ui/Modal.tsx (personal-brand repo)
"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
};

export function Modal({
  isOpen,
  onClose,
  children,
  className,
  ...ariaProps
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Sync close event (Escape key, etc.) with React state
    function handleClose() {
      onClose();
    }

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // Handle backdrop click (light dismiss)
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={className}
      {...ariaProps}
    >
      {children}
    </dialog>
  );
}
```

### Pattern 2: Overage Detection After Transaction Creation
**What:** After a transaction is successfully created, the client compares the new spending total against the envelope's weekly budget to determine if an overage occurred.
**When to use:** OVR-01 -- triggered in both `handleInlineTransaction` (home page) and `handleCreate` (transactions page).
**Example:**
```typescript
// In EnvelopesHomePage.tsx or TransactionsPage.tsx
// After successful transaction creation:

async function handleInlineTransaction(txnData: { ... }) {
  setIsSubmitting(true);
  try {
    const token = await getToken();
    const createdTxn = await envelopeFetch<EnvelopeTransaction>(
      "/api/envelopes/transactions",
      token,
      { method: "POST", body: JSON.stringify(txnData) },
    );

    // Refresh envelopes to get updated balances
    const freshData = await mutate();

    // Check if the target envelope is now over budget
    const envelope = freshData?.envelopes.find(
      (e) => e.id === txnData.envelopeId,
    );
    if (envelope && envelope.remainingCents < 0) {
      // Open overage modal with the created transaction and overage amount
      setOverageContext({
        transactionId: createdTxn.id,
        envelopeId: txnData.envelopeId,
        overageAmountCents: Math.abs(envelope.remainingCents),
        donorEnvelopes: freshData.envelopes.filter(
          (e) => e.id !== txnData.envelopeId && e.remainingCents > 0,
        ),
      });
    } else {
      setExpandedId(null);
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : "Failed to add transaction.");
  } finally {
    setIsSubmitting(false);
  }
}
```

### Pattern 3: Donor Allocation Form with Real-Time Validation
**What:** A form inside the overage modal that lists each eligible donor envelope with its remaining balance, an allocation input, and inline validation showing remaining-to-allocate.
**When to use:** OVR-02 + OVR-03.
**Example:**
```typescript
// File: src/components/envelopes/OverageModal.tsx (concept)
// Each donor envelope row:
// - Shows: envelope title, remaining budget, allocation input
// - Validates: allocation <= donor remaining, allocation >= 0
// - Footer shows: "Overage: $X.XX | Allocated: $Y.YY | Remaining: $Z.ZZ"
// - Submit enabled only when total allocations === overage exactly

type DonorAllocation = {
  donorEnvelopeId: string;
  amountCents: number;
};

// Validation: sum of all donor allocations must equal overageAmountCents
const totalAllocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
const isValid = totalAllocated === overageAmountCents;
const remaining = overageAmountCents - totalAllocated;
```

### Pattern 4: Atomic Allocation Persistence (Batched Write)
**What:** A server-side function that creates all overage allocation documents in a single atomic batch, with validation that constraints are met.
**When to use:** OVR-04 -- called by the allocation API endpoint.
**Example:**
```typescript
// File: src/lib/envelopes/firestore.ts
export async function createAllocations(
  userId: string,
  sourceTransactionId: string,
  allocations: { donorEnvelopeId: string; amountCents: number }[],
): Promise<void> {
  const batch = requireDb().batch();

  for (const alloc of allocations) {
    const docRef = allocationsCol().doc();
    batch.set(docRef, {
      userId,
      sourceTransactionId,
      donorEnvelopeId: alloc.donorEnvelopeId,
      amountCents: alloc.amountCents,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}
```

### Pattern 5: Cascading Deletion on Transaction Delete
**What:** When a transaction is deleted, any linked overage allocations are also deleted atomically.
**When to use:** OVR-04 -- extends the existing `deleteTransaction` function.
**Example:**
```typescript
// File: src/lib/envelopes/firestore.ts
// Modify deleteTransaction to cascade:
export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const docRef = transactionsCol().doc(transactionId);
  const snap = await docRef.get();
  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Transaction not found or access denied.");
  }

  // Find linked overage allocations
  const allocSnap = await allocationsCol()
    .where("sourceTransactionId", "==", transactionId)
    .get();

  if (allocSnap.empty) {
    // No allocations -- simple delete
    await docRef.delete();
  } else {
    // Batch delete transaction + all linked allocations
    const batch = requireDb().batch();
    batch.delete(docRef);
    for (const allocDoc of allocSnap.docs) {
      batch.delete(allocDoc.ref);
    }
    await batch.commit();
  }
}
```

### Anti-Patterns to Avoid
- **Using `runTransaction` instead of batched writes for allocations:** The allocation endpoint only writes documents. It receives validated data from the client and the server re-validates constraints. There are no conditional reads needed, so batched writes are simpler and more reliable.
- **Detecting overage server-side in the transaction POST endpoint:** This would couple transaction creation with overage detection, making the endpoint responsible for returning envelope balance data. The client already has this data in SWR cache.
- **Creating allocations inside the transaction creation endpoint:** The user may cancel the overage modal. The transaction should already be saved; allocations are an optional follow-up.
- **Building the modal with React portals and manual z-index management:** The native `<dialog>` with `showModal()` uses the browser's top-layer, which is above all other elements regardless of z-index. No portal needed.
- **Storing overage state on the envelope document:** The project uses compute-on-read. An envelope's "remaining" is computed from budget minus sum of transactions plus sum of incoming allocations minus sum of outgoing allocations. Do not add a `remainingCents` field to the envelope document.
- **Skipping server-side validation of allocation constraints:** Even though the client validates, the server MUST re-validate: each donor allocation <= donor remaining, total allocations == overage, all envelopes belong to the user. Trust-but-verify.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trapping in modal | Manual `tabindex` management, keyboard event listeners | Native `<dialog>` with `showModal()` | Browser handles focus trap, Escape key, backdrop, scroll prevention automatically |
| Backdrop overlay | Positioned div with z-index and click handler | `<dialog>::backdrop` pseudo-element | Native, no z-index conflicts, respects top-layer |
| Scroll prevention when modal open | `document.body.style.overflow = 'hidden'` | Native `<dialog>` with `showModal()` | Browser prevents scroll behind modal dialog automatically |
| Atomic multi-document writes | Multiple individual writes with try/catch | Firestore `batch.commit()` | All writes succeed or none. No partial state. Built into the SDK. |
| Dollar-to-cents conversion in allocation inputs | Custom parsing logic | Reuse the pattern from `InlineTransactionForm.tsx` (`parseFloat` + `Math.round * 100`) | Already established, proven pattern |
| Allocation validation (sum must equal overage) | Custom validation logic scattered in submit handler | Centralized pure function (e.g., `validateAllocations(allocations, overageAmountCents, donorBalances)`) | Testable, reusable, same function can run on client and server |

**Key insight:** The most critical "don't hand-roll" item is the modal. Building a custom modal with `position: fixed`, manual focus trapping, and z-index management is the #1 source of accessibility bugs in web apps. The native `<dialog>` element solves all of these problems for free.

## Common Pitfalls

### Pitfall 1: Modal Escape Key Desyncs React State
**What goes wrong:** User presses Escape, the browser closes the `<dialog>`, but React state still thinks the modal is open.
**Why it happens:** The `<dialog>` element has its own close event that fires independently of React state.
**How to avoid:** Listen for the `close` event on the dialog element and call `onClose()` to sync React state. The Modal component's `useEffect` should attach a `close` event listener.
**Warning signs:** Modal backdrop persists after pressing Escape; re-opening the modal doesn't work because state still shows it as "open."

### Pitfall 2: Overage Detected on Stale SWR Data
**What goes wrong:** The overage check compares the new transaction against stale envelope balance data, either missing a real overage or showing a false overage.
**Why it happens:** SWR cache might not be updated yet when the overage check runs. The `mutate()` call returns fresh data, but the component state might reference the old data.
**How to avoid:** Use the return value of `mutate()` for the overage check, not `data` from the SWR hook. `const freshData = await mutate()` returns the fresh data after revalidation.
**Warning signs:** Overage modal opens for non-negative envelopes, or doesn't open when it should.

### Pitfall 3: Allocation Amounts in Dollars vs Cents
**What goes wrong:** User enters dollar amounts in the allocation form, but the API expects cents. Off-by-100x error causes incorrect allocations.
**Why it happens:** Inconsistent conversion between UI input (dollars) and API payload (cents).
**How to avoid:** Convert at the form boundary, same as `InlineTransactionForm`. UI shows dollar inputs, form converts to cents via `Math.round(parseFloat(value) * 100)` before submitting. Server validates cents (integers, positive, <= donor remaining in cents).
**Warning signs:** Allocations are 100x too large or too small.

### Pitfall 4: Race Condition Between Transaction Create and Allocation Create
**What goes wrong:** Transaction is created, modal opens, but before user completes allocation, another browser tab deletes the transaction. Allocations are created for a non-existent transaction.
**Why it happens:** No server-side verification that the source transaction still exists when creating allocations.
**How to avoid:** The allocation API endpoint should verify the source transaction exists and belongs to the user before creating allocations. This is a simple `get()` check, not a Firestore transaction, since the allocation creation is a one-time operation, not a contended update.
**Warning signs:** Orphaned allocation records in Firestore with no matching source transaction.

### Pitfall 5: Donor Balance Changes While Modal Is Open
**What goes wrong:** User opens overage modal, sees "Groceries: $50.00 remaining." Another device adds a transaction to Groceries. User allocates $50 from Groceries, but Groceries only has $30 remaining now.
**Why it happens:** Donor balances shown in the modal are a point-in-time snapshot. They can become stale while the modal is open.
**How to avoid:** Server-side validation is the safety net. When the allocation endpoint receives the request, it re-computes donor remaining balances from current data and rejects if any allocation exceeds the donor's actual remaining. Client-side validation is optimistic (UX), server-side validation is authoritative (correctness).
**Warning signs:** Server returns 400 "Donor allocation exceeds remaining balance" even though the modal showed it was valid.

### Pitfall 6: Overage Amount Computation Doesn't Account for Existing Allocations
**What goes wrong:** An envelope already has overage allocations from a previous transaction. A new transaction causes the envelope to go further negative. The overage amount should be the new increment, not the total negative balance.
**Why it happens:** Computing overage as `Math.abs(remainingCents)` when `remainingCents` already reflects previous allocations.
**How to avoid:** This is actually correct for the compute-on-read model. The `remainingCents` on `EnvelopeWithStatus` is `weeklyBudgetCents - spentCents`. It does NOT factor in incoming/outgoing allocations currently. For Phase 4, the balance computation needs to be extended: `remainingCents = weeklyBudgetCents - spentCents + incomingAllocationsCents - outgoingAllocationsCents`. The overage is then `Math.abs(remainingCents)` when `remainingCents < 0` AFTER accounting for all allocations.
**Warning signs:** Overage amount shown in modal doesn't match what the user expects based on the card's displayed remaining balance.

### Pitfall 7: `deleteEnvelope` Already Handles Allocations but `deleteTransaction` Does Not Yet
**What goes wrong:** Deleting an envelope already cascades to allocations (added in Phase 2 as forward-looking code). But deleting a transaction does not cascade to its allocations yet.
**Why it happens:** `deleteTransaction` has a `TODO: Phase 4` comment. This is the planned extension point.
**How to avoid:** Phase 4 must update `deleteTransaction` in both repos to query `allocationsCol().where("sourceTransactionId", "==", transactionId)` and batch-delete them with the transaction.
**Warning signs:** Orphaned allocation records after transaction deletion; donor envelope balances show allocations for deleted transactions.

## Code Examples

### Modal Component (Native `<dialog>`)
```typescript
// File: src/components/ui/Modal.tsx (personal-brand repo)
"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
} & (
  | { "aria-labelledby": string; "aria-label"?: never }
  | { "aria-label": string; "aria-labelledby"?: never }
);

export function Modal({
  isOpen,
  onClose,
  children,
  className,
  ...ariaProps
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync open/close state with the native dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Sync native close events (Escape key) with React state
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [handleClose]);

  // Light dismiss: clicking the backdrop closes the modal
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={clsx(
        // Reset dialog default styles
        "max-h-[85vh] w-full max-w-lg rounded-2xl border border-border",
        "bg-surface p-0 shadow-xl",
        // Backdrop styling
        "backdrop:bg-black/50",
        className,
      )}
      {...ariaProps}
    >
      {isOpen ? children : null}
    </dialog>
  );
}
```

### Overage Allocation Zod Schema
```typescript
// File: src/lib/envelopes/types.ts
// Add to both dave-ramsey and personal-brand repos

/** Single donor allocation in an overage submission. */
export const donorAllocationSchema = z.object({
  donorEnvelopeId: z.string().min(1),
  amountCents: z.number().int().min(1), // positive integer cents
});

/** Overage allocation submission payload. */
export const overageAllocationSchema = z.object({
  sourceTransactionId: z.string().min(1),
  allocations: z.array(donorAllocationSchema).min(1),
});
export type OverageAllocationInput = z.infer<typeof overageAllocationSchema>;
```

### Allocation API Endpoint
```typescript
// File: src/app/api/envelopes/allocations/route.ts (personal-brand repo)
import { unauthorizedResponse, verifyUser } from "@/lib/auth/user";
import {
  createAllocations,
  transactionsCol,
  envelopesForUser,
  transactionsForUserInWeek,
  allocationsCol,
} from "@/lib/envelopes/firestore";
import { overageAllocationSchema } from "@/lib/envelopes/types";
// Server-side validation of all constraints

export async function POST(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  try {
    const body = await request.json();
    const parsed = overageAllocationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input.", details: parsed.error.issues },
        { status: 400 },
      );
    }

    // 1. Verify source transaction exists and belongs to user
    // 2. Get all envelopes for user
    // 3. Compute current remaining for each donor envelope
    // 4. Validate each allocation <= donor remaining
    // 5. Validate total allocations == overage amount
    // 6. Create allocations atomically

    await createAllocations(
      auth.uid,
      parsed.data.sourceTransactionId,
      parsed.data.allocations,
    );

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(
      "POST /api/envelopes/allocations error:",
      error instanceof Error ? error.message : "Unknown",
    );
    return Response.json(
      { error: "Failed to create allocations." },
      { status: 500 },
    );
  }
}
```

### Extended Balance Computation (Accounting for Allocations)
```typescript
// The existing computeEnvelopeStatus computes: remainingCents = weeklyBudgetCents - spentCents
// Phase 4 needs to extend this to account for allocations:
//
//   effectiveRemaining = weeklyBudgetCents
//     - spentCents                           (transactions against this envelope)
//     + incomingAllocationsCents              (allocations FROM donors TO this envelope)
//     - outgoingAllocationsCents              (allocations FROM this envelope TO other envelopes)
//
// However, OverageAllocation only has donorEnvelopeId (the donor) and
// sourceTransactionId (the transaction that caused overage).
// The recipient envelope is implicitly the envelope of the source transaction.
//
// For the donor: subtract alloc.amountCents (donating funds away)
// For the recipient: add alloc.amountCents (receiving donated funds)
//
// This must be computed in listEnvelopesWithRemaining by fetching current-week
// allocations alongside transactions.
```

### Cascading Delete for Transaction
```typescript
// File: src/lib/envelopes/firestore.ts
// Replace the existing deleteTransaction function:

export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const docRef = transactionsCol().doc(transactionId);
  const snap = await docRef.get();
  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Transaction not found or access denied.");
  }

  // Find linked overage allocations for this transaction
  const allocSnap = await allocationsCol()
    .where("sourceTransactionId", "==", transactionId)
    .get();

  if (allocSnap.empty) {
    await docRef.delete();
  } else {
    // Batch delete: transaction + all linked allocations
    const batch = requireDb().batch();
    batch.delete(docRef);
    for (const allocDoc of allocSnap.docs) {
      batch.delete(allocDoc.ref);
    }
    await batch.commit();
  }
}
```

## Balance Computation Strategy for Phase 4

The existing `listEnvelopesWithRemaining` computes `spentCents` by summing transactions per envelope. Phase 4 requires extending this to account for allocations:

**Current formula:** `remainingCents = weeklyBudgetCents - spentCents`

**Phase 4 formula:**
```
remainingCents = weeklyBudgetCents - spentCents + receivedAllocationsCents - donatedAllocationsCents
```

Where:
- `receivedAllocationsCents` = sum of allocations where this envelope's transactions were the overage source (allocations are incoming from donors to cover the overage)
- `donatedAllocationsCents` = sum of allocations where this envelope is the `donorEnvelopeId` (this envelope gave funds to another)

**Implementation approach:** In `listEnvelopesWithRemaining`, after fetching current-week transactions, also fetch all allocations linked to those transactions (using `sourceTransactionId in [...]`), plus all allocations where any user envelope is a donor. Build maps for both directions and incorporate into the remaining computation.

**Important:** The existing `computeEnvelopeStatus` pure function takes `weeklyBudgetCents` and `spentCents`. For Phase 4, it should be extended to also accept `receivedAllocationsCents` and `donatedAllocationsCents`, OR the caller should pre-compute the adjusted budget/spent values before calling it.

## Firestore Indexes Required

Phase 4 requires this additional composite index:

```json
{
  "collectionGroup": "envelope_allocations",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sourceTransactionId", "order": "ASCENDING" }
  ]
}
```

The `sourceTransactionId` index supports:
- Cascading deletion: `allocationsCol().where("sourceTransactionId", "==", transactionId)`
- Balance computation: `allocationsCol().where("sourceTransactionId", "in", [transactionIds])`

The `donorEnvelopeId` single-field index (auto-created by Firestore) supports:
- Donor allocation queries: `allocationsCol().where("donorEnvelopeId", "==", envelopeId)`
- Balance computation for donors

Note: The `deleteEnvelope` function already queries `allocationsCol()` by `donorEnvelopeId` and `sourceTransactionId`, and these patterns were established in Phase 2. Verify the indexes exist.

## Workflow Sequence

The complete overage workflow from the user's perspective:

```
1. User adds transaction          → POST /api/envelopes/transactions
2. Client receives response       → Transaction created successfully
3. Client calls mutate()          → SWR refetches listEnvelopesWithRemaining
4. Client checks envelope balance → remainingCents < 0?
   NO → Done (normal flow)
   YES → Continue to step 5
5. Client opens overage modal     → Shows overage amount + donor envelopes
6. User allocates from donors     → Client validates in real-time
7. User submits allocations       → POST /api/envelopes/allocations
8. Server validates constraints   → All donor checks pass?
   NO → Return 400 with error     → Client shows inline error
   YES → Continue to step 9
9. Server batched write           → All allocation docs created atomically
10. Client calls mutate()         → SWR refetches, balances updated
11. Modal closes                  → Donor cards show reduced remaining
```

The critical insight is that steps 1-2 and steps 7-9 are separate API calls. The transaction is saved regardless of whether the user completes the allocation workflow. If the user cancels the modal, the transaction exists but the envelope remains over budget. This is intentional -- the user can come back and reallocate later, or they can live with the overage.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom modal with `position: fixed` + z-index | Native `<dialog>` with `showModal()` | 2022+ (broad browser support) | Built-in focus trap, Escape key, backdrop, scroll prevention, top-layer. No z-index conflicts. |
| React portals for modals | Native `<dialog>` top-layer | 2022+ | Portals still needed for tooltips/popovers, but modals should use `<dialog>` for accessibility benefits |
| react-modal library | Native `<dialog>` | When `<dialog>` got full browser support | Zero dependencies, better a11y defaults |
| Manual focus trap libraries (focus-trap, focus-trap-react) | Native `<dialog>` | 2022+ | Browser handles focus trapping automatically with `showModal()` |

**Deprecated/outdated:**
- **react-modal for new projects:** Still works but adds unnecessary dependency now that native `<dialog>` is fully supported. Only use if you need to support very old browsers (pre-2022).
- **`document.body.style.overflow = 'hidden'` for scroll lock:** Native `<dialog>` handles this automatically.
- **Manual z-index stacking for modals:** The top-layer API makes this obsolete.

## Open Questions

1. **Should the user be able to dismiss the overage modal and leave the envelope over budget?**
   - What we know: The workflow says the modal opens "automatically" when overage is detected.
   - What's unclear: Whether the user can close the modal without completing the allocation.
   - Recommendation: Yes, allow dismissal. The transaction is already saved. Forcing the user to allocate would block them from leaving the page. They can see the "Over" status badge and choose to reallocate later. The modal should have a "Skip for now" or close button in addition to the allocation form.

2. **How should the balance computation change to account for allocations?**
   - What we know: `listEnvelopesWithRemaining` currently computes `remaining = budget - spent`. With allocations, it becomes `remaining = budget - spent + received - donated`.
   - What's unclear: Whether allocations should be scoped to the current week (like transactions) or all-time.
   - Recommendation: Allocations should be scoped to the current week, same as transactions. An allocation linked to a transaction from a previous week should not affect this week's balance. The allocation's week is determined by the source transaction's date, which is always within the week when it was created (due to the date constraints on the inline form).

3. **What happens if the user edits a transaction that previously triggered allocations?**
   - What we know: The user can edit a transaction's amount or envelope on the Transactions page.
   - What's unclear: Should existing allocations be automatically deleted/adjusted if the edited transaction no longer causes an overage?
   - Recommendation: For MVP, do NOT auto-adjust allocations when editing transactions. This would require complex logic to determine if the overage still exists and by how much. Instead, document this as a known limitation. If the user reduces a transaction amount below the overage threshold, the old allocations will cause the donor envelopes to still show reduced balances. The user can manually delete the transaction (which cascades allocations) and re-create it.

4. **Should the `createTransaction` endpoint be modified, or should we keep allocation creation separate?**
   - What we know: The current endpoint creates a transaction and returns it. The client then detects overage.
   - What's unclear: Whether atomicity between transaction creation and allocation creation matters.
   - Recommendation: Keep them separate. The transaction creation should remain unchanged. Allocations are created in a follow-up API call. This separation is correct because: (a) the user might cancel the modal, (b) the transaction exists independently of allocations, (c) it follows the existing pattern of single-concern API endpoints.

5. **Firestore composite index for allocation queries by week:**
   - What we know: The balance computation needs allocations for the current week. But `OverageAllocation` doesn't have a `date` field -- it has `sourceTransactionId`.
   - What's unclear: How to efficiently query "allocations for transactions in this week."
   - Recommendation: Query strategy: (1) Get current-week transactions for the user. (2) Get allocation records where `sourceTransactionId in [transactionIds]`. (3) Also get allocation records where `donorEnvelopeId in [envelopeIds]` to find donations from user's envelopes. This is a two-step query but the data volume is small (users have few envelopes and transactions per week). Alternatively, add a `weekStart` field to `OverageAllocation` for direct querying -- this is denormalization but simplifies queries.

## Sources

### Primary (HIGH confidence)
- Host repo codebase analysis -- direct file reads of:
  - `src/lib/envelopes/types.ts` -- `OverageAllocation` type already defined
  - `src/lib/envelopes/firestore.ts` -- `allocationsCol()` already defined, `deleteTransaction` has Phase 4 TODO comment, `deleteEnvelope` already cascades to allocations, `listEnvelopesWithRemaining` computation logic
  - `src/components/envelopes/EnvelopesHomePage.tsx` -- Transaction creation flow, SWR `mutate()` pattern
  - `src/components/envelopes/TransactionsPage.tsx` -- Transaction creation flow with dual cache invalidation
  - `src/components/envelopes/InlineTransactionForm.tsx` -- Dollar-to-cents conversion pattern
  - `src/components/ui/Button.tsx` and `src/components/ui/Card.tsx` -- Existing UI component patterns
  - `src/app/globals.css` -- CSS custom properties, design tokens
  - `src/context/AuthContext.tsx` -- Auth pattern
  - `src/lib/envelopes/hooks.ts` -- SWR hooks returning `mutate` function
  - `src/lib/envelopes/api.ts` -- `envelopeFetch` helper
- dave-ramsey repo codebase:
  - `src/lib/envelopes/types.ts` -- Matching `OverageAllocation` type, Zod schemas
  - `src/lib/envelopes/firestore.ts` -- Matching `allocationsCol()`, `deleteTransaction` TODO
- [Firestore Transactions and Batched Writes (Google Cloud)](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions) -- Batched writes API, 500 doc limit, atomicity guarantees
- [Transaction Class API (googleapis.dev)](https://googleapis.dev/nodejs/firestore/latest/Transaction.html) -- `get`, `getAll`, `set`, `create`, `update`, `delete` method signatures

### Secondary (MEDIUM confidence)
- [Building Accessible Modal Dialogs in React (Chris Henrick)](https://clhenrick.io/blog/react-a11y-modal-dialog/) -- Native `<dialog>` patterns, focus management, ARIA attributes, Escape key sync, backdrop click, animation gotchas
- [Best React Modal Dialog Libraries 2026 (Croct Blog)](https://blog.croct.com/post/best-react-modal-dialog-libraries) -- Library comparison showing no major library uses native `<dialog>`, confirming custom implementation is standard
- [Firestore Batches vs Transactions (Medium)](https://medium.com/@talhatlc/firestore-batches-vs-transactions-when-and-how-to-use-them-49a83e8a7c42) -- Comparison of when to use batched writes vs transactions
- Phase 3 Research (03-RESEARCH.md) -- Established patterns for transaction CRUD, SWR cache invalidation, inline form expansion

### Tertiary (LOW confidence)
- None. All findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all libraries already installed; native `<dialog>` is well-documented
- Architecture: HIGH -- patterns directly extend existing Phase 3 code; extension points (TODO comments) already marked
- Modal implementation: HIGH -- native `<dialog>` API is stable and well-supported; detailed blog post from Chris Henrick provides comprehensive pattern
- Overage detection flow: HIGH -- based on direct analysis of existing `handleInlineTransaction` and `mutate()` return values
- Balance computation with allocations: MEDIUM -- the extension strategy is clear but the exact query pattern (how to efficiently fetch allocations for current-week transactions) has multiple valid approaches
- Pitfalls: HIGH -- derived from code analysis and verified Firestore behavior

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable; all dependencies are mature, no fast-moving concerns)
