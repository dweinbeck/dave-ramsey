# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** Users can see exactly how much they have left in each spending category this week and reallocate when they overspend
**Current focus:** Phase 4 in progress -- Overage Handling

## Current Position

Phase: 4 of 6 (Overage Reallocation)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-10 -- Completed 04-02-PLAN.md (Allocation CRUD, API & Modal)

Progress: [███████████░░░░░░] 69%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 4 min
- Total execution time: 48 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14 min | 5 min |
| 2. Envelope Management | 3/3 | 16 min | 5 min |
| 3. Transactions | 3/3 | 11 min | 4 min |
| 4. Overage Reallocation | 2/3 | 7 min | 4 min |

**Recent Trend:**
- Last 5 plans: 04-02 (5 min), 04-01 (2 min), 03-03 (5 min), 03-02 (4 min), 03-01 (2 min)
- Trend: Cross-repo plans take slightly longer due to merge/sync

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 6 phases derived from 35 requirements -- Foundation, Envelopes, Transactions, Overage, Analytics, Billing
- [Roadmap]: Compute-on-read for envelope balances (no denormalized remaining field) per research recommendation
- [Roadmap]: date-fns v4 is the only new dependency needed
- [01-01]: AuthGuard (not AdminGuard) for envelopes layout -- envelopes is for all authenticated users
- [01-01]: Envelopes link in main nav for all authenticated users, before Control Center
- [01-02]: date-fns v4 with explicit weekStartsOn:0 via WEEK_OPTIONS constant -- single source of truth for all week math
- [01-02]: getRemainingDaysPercent includes today in count (Sunday=7/7, Saturday=1/7, always > 0)
- [01-02]: getStatusLabel uses >= for On Track threshold (encouraging interpretation)
- [01-03]: Timestamp imported from firebase-admin/firestore (not @google-cloud/firestore namespace)
- [01-03]: Separate collection references (for writes) from query helpers (for reads) in firestore.ts
- [01-03]: Created firebase.ts stub -- will be replaced with host repo's actual firebase initialization
- [02-01]: Pure computation helpers extracted from Firestore-dependent functions for unit testability without mocks
- [02-01]: Envelope createdAt comparison uses weekEnd (not weekStart) -- envelopes created mid-week count toward that week's savings
- [02-01]: Per-envelope savings floored at 0 -- overspending one envelope does not subtract from total savings
- [02-01]: SavingsEnvelope type alias to reduce repetition across computation helper signatures
- [02-02]: Copied dave-ramsey utilities into personal-brand repo (self-contained, not cross-repo import)
- [02-02]: reorderEnvelopes userId param prefixed underscore (reserved for future ownership verification)
- [02-02]: Optional chain + guard in useEnvelopes instead of non-null assertion (Biome compliance)
- [02-03]: CreateEnvelopeCard uses native button element instead of div with role=button (a11y)
- [02-03]: Inline delete confirmation instead of modal (Modal component in Phase 4)
- [02-03]: window.alert for error display (temporary, modal coming in Phase 4)
- [03-01]: getWeek with firstWeekContainsDate:1 -- Dec 31, 2025 is week 1 (same week as Jan 1, 2026)
- [03-01]: transactionUpdateSchema reuses same per-field constraints as transactionSchema but all optional for PATCH
- [03-02]: useTransactions SWR key includes both weekStart and weekEnd for correct cache invalidation on week navigation
- [03-03]: All transaction mutations refresh both useTransactions and useEnvelopes SWR caches for balance accuracy
- [03-03]: Inline form date constrained to current week via HTML min/max attributes
- [03-03]: Mutual exclusion between expandedId, editingId, and deletingId states on home page
- [03-03]: No delete confirmation for transactions (easily re-created, no cascading effects)
- [04-01]: validateAllocations reports all errors at once (better UX than short-circuiting)
- [04-01]: computeEnvelopeStatus extended with optional allocation params (default 0 for backward compat)
- [04-01]: Defense-in-depth empty check in validateAllocations independent of Zod schema enforcement
- [04-02]: Cascade delete uses batch only when allocations exist (avoids unnecessary overhead)
- [04-02]: Two-pass allocation query in listEnvelopesWithRemaining with deduplication
- [04-02]: Allocation API computes live donor balances including existing allocations before validation
- [04-02]: Modal uses native HTML dialog element for built-in focus trap and Escape handling

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 5]: Savings tracking (ENV-06, HOME-04, ANL-03) spans multiple phases -- envelope accumulation logic in Phase 2, display in Phase 2, visualization in Phase 5. Ensure consistent computation approach.
- [Phase 6]: Existing `debitForToolUse()` function needs review during Phase 6 planning to understand integration points.

## Session Continuity

Last session: 2026-02-10T20:42:00Z
Stopped at: Completed 04-02-PLAN.md (Allocation CRUD, API & Modal)
Resume file: None
