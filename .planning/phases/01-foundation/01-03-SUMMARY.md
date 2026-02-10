---
phase: 01-foundation
plan: 03
subsystem: data-layer
tags: [zod, firestore, types, validation, integer-cents, data-isolation]
requires: []
provides:
  - "Zod schemas for envelope and transaction input validation"
  - "TypeScript types for Firestore document shapes (Envelope, EnvelopeTransaction, OverageAllocation)"
  - "Firestore collection helpers with per-user scoping"
  - "formatCents utility for integer cents to dollar string conversion"
affects:
  - "Phase 2 (envelope CRUD uses schemas and Firestore helpers)"
  - "Phase 3 (transaction CRUD uses transactionSchema and transactionsCol)"
  - "Phase 4 (overage reallocation uses OverageAllocation type and allocationsCol)"
  - "Phase 5 (analytics queries use Firestore helpers)"
  - "Phase 6 (billing integration references envelope types)"
tech-stack:
  added: []
  patterns:
    - "Zod v4 input validation with zod/v4 import path"
    - "Integer cents for all monetary values (never floating-point dollars)"
    - "userId never accepted from client -- always server-derived"
    - "Firestore top-level collections with userId field filtering"
key-files:
  created:
    - src/lib/envelopes/types.ts
    - src/lib/envelopes/firestore.ts
    - src/lib/envelopes/format.ts
    - src/lib/envelopes/__tests__/types.test.ts
    - src/lib/firebase.ts
  modified: []
key-decisions:
  - decision: "Use Timestamp from firebase-admin/firestore for Firestore document types"
    rationale: "Correct type path for firebase-admin v13 -- @google-cloud/firestore does not export FirebaseFirestore namespace directly"
  - decision: "Separate collection reference functions from query helpers"
    rationale: "envelopesCol() returns raw collection for writes; envelopesForUser() returns pre-filtered query for reads"
  - decision: "Created firebase.ts stub for Firestore admin SDK initialization"
    rationale: "Required for firestore.ts import to resolve -- will be replaced when host repo integration is complete"
duration: "5m 14s"
completed: "2026-02-10"
---

# Phase 1 Plan 3: Zod Types, Firestore Helpers, and formatCents Summary

Zod v4 schemas enforce positive integer cents and non-empty strings for envelope/transaction input; Firestore helpers scope all queries by userId parameter; formatCents converts integer cents to dollar display strings.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 5m 14s |
| Start | 2026-02-10T14:03:15Z |
| End | 2026-02-10T14:08:29Z |
| Tasks | 2/2 |
| Files created | 5 |
| Tests | 16 passing |

## Accomplishments

1. **Zod input schemas** -- `envelopeSchema` validates title (1-100 chars) and weeklyBudgetCents (positive integer); `transactionSchema` validates envelopeId, amountCents (positive integer), YYYY-MM-DD date, and optional merchant/description fields
2. **Firestore document types** -- `Envelope`, `EnvelopeTransaction`, and `OverageAllocation` types define the stored document shapes with Timestamps for audit fields
3. **Firestore collection helpers** -- `envelopesCol()`, `transactionsCol()`, `allocationsCol()` return raw collection references; `envelopesForUser()` and `transactionsForUserInWeek()` return pre-filtered queries scoped by userId
4. **formatCents utility** -- Converts integer cents to dollar display strings (e.g., 1050 -> "$10.50"), the single point where dollars appear
5. **16 validation tests** -- Comprehensive test coverage for both schemas including valid input, edge cases (max length, zero/negative values, non-integer cents), missing fields, and invalid date formats

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Zod schemas, TypeScript types, and validation tests | 3cab759 | types.ts, types.test.ts |
| 2 | Firestore collection helpers and formatCents utility | b9b75d1 | firestore.ts, format.ts, firebase.ts |

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/envelopes/types.ts` | Zod schemas (envelopeSchema, transactionSchema) + Firestore types (Envelope, EnvelopeTransaction, OverageAllocation) |
| `src/lib/envelopes/firestore.ts` | Firestore collection helpers with per-user scoping |
| `src/lib/envelopes/format.ts` | formatCents utility for integer cents to dollar display |
| `src/lib/envelopes/__tests__/types.test.ts` | 16 test cases for schema validation |
| `src/lib/firebase.ts` | Firebase Admin SDK initialization stub |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use `Timestamp` from `firebase-admin/firestore` | Correct type path for firebase-admin v13; `@google-cloud/firestore` does not export `FirebaseFirestore` namespace directly |
| Separate collection references from query helpers | `envelopesCol()` returns raw collection for writes (`.add()`); `envelopesForUser()` returns pre-filtered query for reads |
| Created `firebase.ts` stub | Required for `@/lib/firebase` import resolution; will be replaced with host repo's actual firebase.ts |
| YYYY-MM-DD string for transaction dates | Avoids timezone issues; user picks a date and that exact string is stored and queried |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FirebaseFirestore.Timestamp import path**
- **Found during:** Task 1
- **Issue:** Plan specified `import type { FirebaseFirestore } from "@google-cloud/firestore"` which does not exist in firebase-admin v13
- **Fix:** Changed to `import type { Timestamp } from "firebase-admin/firestore"` and replaced all `FirebaseFirestore.Timestamp` with `Timestamp`
- **Files modified:** `src/lib/envelopes/types.ts`
- **Commit:** 3cab759

**2. [Rule 3 - Blocking] Created firebase.ts stub**
- **Found during:** Task 2
- **Issue:** `firestore.ts` imports from `@/lib/firebase` which did not exist in the repo
- **Fix:** Created minimal `src/lib/firebase.ts` with Firebase Admin SDK initialization
- **Files modified:** `src/lib/firebase.ts`
- **Commit:** b9b75d1

**3. [Rule 3 - Blocking] Installed zod and firebase-admin packages**
- **Found during:** Task 1
- **Issue:** Packages were listed in package.json but not installed (node_modules missing)
- **Fix:** Ran `npm install zod firebase-admin`
- **No commit needed:** Packages were already in committed package.json; only node_modules was missing

## Issues Encountered

None beyond the deviations listed above.

## Next Phase Readiness

**Phase 2 can proceed.** All types, schemas, Firestore helpers, and formatting utilities are in place. Phase 2 (Envelope Management) will use:
- `envelopeSchema` for input validation in envelope CRUD API routes
- `envelopesCol()` and `envelopesForUser()` for Firestore operations
- `Envelope` type for type-safe document handling
- `formatCents()` for displaying budget amounts on envelope cards
