# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-10)

**Core value:** Users can see exactly how much they have left in each spending category this week and reallocate when they overspend
**Current focus:** ALL PHASES COMPLETE. Digital Envelopes feature fully implemented across 6 phases, 18 plans.

## Current Position

Phase: 6 of 6 (Billing Integration)
Plan: 3 of 3 in current phase
Status: COMPLETE
Last activity: 2026-02-10 -- Completed 06-03-PLAN.md (Client-side read-only mode)

Progress: [██████████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 18
- Average duration: 4 min
- Total execution time: 70 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/3 | 14 min | 5 min |
| 2. Envelope Management | 3/3 | 16 min | 5 min |
| 3. Transactions | 3/3 | 11 min | 4 min |
| 4. Overage Reallocation | 3/3 | 11 min | 4 min |
| 5. Analytics | 3/3 | 9 min | 3 min |
| 6. Billing Integration | 3/3 | 9 min | 3 min |

**Recent Trend:**
- Last 5 plans: 06-03 (3 min), 06-02 (2 min), 06-01 (4 min), 05-03 (4 min), 05-02 (3 min)
- Trend: Consistent 2-4 min per plan

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
All decisions across the project:

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
- [04-03]: Map-based allocation state for O(1) lookups by donor envelope ID
- [04-03]: useEffect resets allocations when context changes (new overage opened)
- [04-03]: Fresh mutate() return value for overage detection (not stale SWR data variable)
- [04-03]: envelopeFetch captures returned transaction for ID used in overage context
- [05-01]: computeWeeklySavingsBreakdown reuses same week iteration pattern as computeCumulativeSavingsFromData (intentional duplication for different output shapes)
- [05-01]: buildPivotRows omits empty weeks and returns newest-first; computeWeeklySavingsBreakdown returns oldest-first
- [05-01]: Week label format "Wk N" using getWeekNumber for consistent analytics display
- [05-02]: getAnalyticsData uses 3 parallel Firestore queries (envelopes, current-week txns, all txns) for efficiency
- [05-02]: Analytics summary on-track count uses raw spending without overage allocations (simplification)
- [05-02]: useAnalytics hook is read-only (no mutate exposed) since analytics is display-only
- [05-03]: Literal hex values for Recharts SVG instead of CSS variables (Tailwind v4 compatibility)
- [05-03]: Number(value ?? 0) for Recharts Tooltip formatter (v3 types define value as number | undefined)
- [06-01]: Default billing placeholder { mode: "readwrite" } in firestore return objects until API routes integrate checkEnvelopeAccess()
- [06-01]: EnvelopeBilling doc created in Firestore transaction to prevent race conditions on first access
- [06-01]: 402 statusCode check on debitForToolUse error for readonly degradation
- [06-01]: dave_ramsey tool pricing set to 100 credits (costToUsCentsEstimate: 0, no external API cost)
- [06-02]: Billing check placed inside try block as first statement -- before params destructuring or body parsing
- [06-02]: GET endpoints run billing check in parallel with data fetch via Promise.all (zero added latency)
- [06-02]: Firestore helpers return Omit<*PageData, "billing"> -- billing is API-route concern, not data-layer
- [06-02]: "reason" in access discriminated union check handles readwrite vs readonly reason fields
- [06-03]: isReadOnly derived from data?.billing?.mode === "readonly" with optional chaining for loading-state safety
- [06-03]: Handler guards (if isReadOnly return) as defense-in-depth alongside UI hiding
- [06-03]: ReadOnlyBanner uses amber color scheme (warning, not error) matching existing banner patterns
- [06-03]: CreateEnvelopeCard and Add Transaction button hidden entirely when readonly (not just disabled)

### Pending Todos

None. All 18 plans across 6 phases are complete.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-10
Stopped at: PROJECT COMPLETE -- all 6 phases, 18 plans executed
Resume file: None
