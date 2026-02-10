# Digital Envelopes

## What This Is

A paid budgeting mini-app inside dan-weinbeck.com that lets any signed-in user manage weekly spending with the envelope method. Users create named envelopes with weekly budgets, record transactions against them, handle overages by reallocating from other envelopes, and view weekly analytics with savings tracking. It lives under `/envelopes` with its own sub-navigation but inherits the site's layout, design system, and authentication. Monetized through the site's credits system with a free trial week.

## Core Value

Users can see exactly how much they have left in each spending category this week and reallocate when they overspend — all in one place that feels like part of the site.

## Requirements

### Validated

- Site-integrated routing with sub-navigation (Home / Transactions / Analytics) — v1
- Envelope CRUD with reorder, rollover policy, and cumulative savings tracking — v1
- Home page with personalized greeting, envelope cards, on-track indicator, and savings display — v1
- Inline transaction form on home page and full transaction CRUD on transactions page — v1
- Week selector with date-range filtering on transactions page — v1
- Overage reallocation modal with client+server validation and atomic persistence — v1
- Analytics dashboard with summary stats, weekly pivot table, and savings growth chart — v1
- Billing with free trial week, weekly 100-credit charging, and read-only degradation — v1
- Per-user data isolation enforced server-side on every read/write — v1
- Integer cents for all monetary values, no logging of sensitive data — v1

### Active

(None — v1 complete. Define v2 requirements with `/gsd:new-milestone`)

### Out of Scope

- Bank syncing or receipt scanning — complexity exceeds MVP, contradicts manual-entry philosophy
- Multi-currency support — single currency (USD cents) sufficient
- Shared/family budgets — single-user envelopes only
- Mobile native app — web only, responsive design covers mobile browsers
- AI-powered insights — simple rule-based status labels provide 80% value
- Goal setting/savings goals — rollover policy partially addresses this

## Current State

**Version:** v1 shipped 2026-02-10
**Codebase:** ~6,300 LOC TypeScript across 2 repos (dave-ramsey utilities + personal-brand Next.js app)
**Tests:** 88 unit tests (dave-ramsey repo), build+lint passing (personal-brand repo)
**Dependencies added:** date-fns v4 (dave-ramsey), recharts v3.7 (personal-brand)

## Context

**Host repo:** `~/Documents/personal-brand` (dan-weinbeck.com)
- Next.js 16, App Router, React 19, Tailwind CSS 4
- Firebase Auth (Google Sign-In only), Firestore (NoSQL)
- Existing billing/credits system: `debitForToolUse()` with Firestore transactions, idempotent ledger, Stripe checkout
- Shared UI components: `Card` (default/clickable/featured variants), `Button` (primary/secondary/ghost), `Modal` (built on native dialog)
- Auth pattern: `useAuth()` hook client-side, `verifyUser(request)` server-side (Firebase ID token from Authorization header)
- Validation: Zod v4
- Testing: Vitest (88 tests for envelope utilities)
- Linting: Biome v2.3
- Git: trunk-based on `master`, push after each phase
- Design system: CSS custom properties in `globals.css` — navy (#063970), gold (#c8a55a), sage (#6b8e6f), amber (#d4956c)

**Data model:**
- Firestore NoSQL — compute-on-read for envelope balances (no denormalized remaining field)
- All monetary values stored as integer cents
- Collections: envelopes, envelope_transactions, envelope_allocations, envelope_billing — all scoped by userId server-side
- Overage allocations linked to source transaction for cascade delete

**Billing model:**
- Tool key: `dave_ramsey`, `creditsPerUse: 100`
- First week free, then charged on first access each week (idempotency key: `envelope_week_{weekStart}`)
- Read-only mode when unpaid: server returns 402 on mutations, UI shows ReadOnlyBanner

## Constraints

- **Tech stack**: Must use repo's existing stack (Next.js 16, Firestore, Firebase Auth, Tailwind 4) — no new databases or auth providers
- **Minimal diff**: No broad refactors; follow existing patterns for routing, data fetching, validation, error handling
- **Privacy**: Server-side userId enforcement on every operation; no merchant/description data in logs; no third-party analytics
- **Styling**: Must reuse existing Card component, Button component, and CSS custom properties
- **Auth inheritance**: No separate auth; inherit site's Firebase Auth session
- **Billing**: Must integrate with existing credits system via `debitForToolUse()`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Firestore (not SQL) for data | Follow repo conventions, avoid new infrastructure for MVP | ✓ Good — clean NoSQL model with compute-on-read |
| 100 credits/week on first access | Monetize without blocking read access to past data | ✓ Good — free trial week + graceful read-only degradation |
| Week starts Sunday | User preference; consistent across all date math | ✓ Good — WEEK_OPTIONS constant used everywhere |
| Build reusable Modal component | No modal exists in repo; overage workflow requires one | ✓ Good — native dialog element, reusable across app |
| Cents as integers | Avoid floating point; Firestore stores numbers natively | ✓ Good — formatCents() for display only |
| Inline card expansion for transactions | Match site's interaction patterns; avoid separate page for quick entry | ✓ Good — col-span-full expansion with date constraints |
| Compute-on-read balances | No denormalized remaining field; recompute from transactions | ✓ Good — simpler data model, no sync issues |
| Pure computation helpers for testability | Extract logic from Firestore-dependent functions | ✓ Good — 88 tests without Firestore mocks |
| Copy utilities across repos (not shared package) | Self-contained per repo, avoids cross-repo dependency management | ✓ Good — each repo builds independently |
| Parallel Promise.all for Firestore queries | Multiple independent reads in single API handler | ✓ Good — zero added latency for billing checks |

---
*Last updated: 2026-02-10 after v1 milestone*
