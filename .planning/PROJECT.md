# Digital Envelopes

## What This Is

A paid budgeting mini-app inside dan-weinbeck.com that lets any signed-in user manage weekly spending with the envelope method. Users create named envelopes with weekly budgets, record transactions against them, handle overages by reallocating from other envelopes, and view weekly analytics. It lives under `/envelopes` with its own sub-navigation but inherits the site's layout, design system, and authentication.

## Core Value

Users can see exactly how much they have left in each spending category this week and reallocate when they overspend — all in one place that feels like part of the site.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Site-integrated routing: `/envelopes`, `/envelopes/transactions`, `/envelopes/analytics` under existing site shell
- [ ] Internal sub-navigation (tabs: Home / Transactions / Analytics)
- [ ] Envelope CRUD: create, edit (title + weekly budget), delete envelopes
- [ ] Home page greeting: "Hi {name}! Today is {weekday}..." with on-track/spending summary
- [ ] Envelope cards matching site's Card component style: title, weekly budget, remaining, status label
- [ ] Inline transaction form: expand card to full row width, fields: Date, Cost, Merchant, Description
- [ ] Transaction CRUD from Transactions page: Date, Cost, Category (envelope), Merchant, Description
- [ ] Week selector on Transactions page ("Week N: M/D/YYYY - M/D/YYYY")
- [ ] Transaction deletion with server-side auth and immediate UI update
- [ ] Overage modal workflow: when transaction causes negative remaining, prompt user to reallocate from other envelopes
- [ ] Overage validation: each donor allocation <= donor remaining, sum must equal overage exactly
- [ ] Analytics page: summary stats (spent, budget, remaining, on-track) + weekly pivot table (rows: weeks, columns: envelopes, values: sum of transactions)
- [ ] Week math utilities: getWeekRange(date), getRemainingDaysPercent(today), getStatusLabel(remaining, weeklyBudget, remainingDaysPercent)
- [ ] Week starts Sunday
- [ ] Per-user data isolation: server-side userId derived from session on every read/write
- [ ] Billing integration: 100 credits charged on first access each week via existing `debitForToolUse()` pattern
- [ ] Read-only mode when user hasn't paid for current week (can view past data, can't add/edit)
- [ ] No logging of merchant/description payloads; no third-party analytics scripts

### Out of Scope

- Bank syncing or receipt scanning — complexity exceeds MVP
- Multi-currency support — single currency (USD cents) sufficient
- Shared/family budgets — single-user envelopes only
- Complex analytics beyond weekly summary table — keep v1 simple
- Rebuilding or restyling the overall personal-brand site — this is an addition, not a redesign
- New design system — must reuse existing navy/gold theme tokens
- Mobile app — web only
- Recurring transactions / auto-fill — manual entry for v1
- Envelope archiving/history — just active envelopes for now

## Context

**Host repo:** `~/Documents/personal-brand` (dan-weinbeck.com)
- Next.js 16, App Router, React 19, Tailwind CSS 4
- Firebase Auth (Google Sign-In only), Firestore (NoSQL)
- Existing billing/credits system: `debitForToolUse()` with Firestore transactions, idempotent ledger, Stripe checkout
- Shared UI components: `Card` (default/clickable/featured variants), `Button` (primary/secondary/ghost)
- No existing modal component — need to build one for overage workflow
- Auth pattern: `useAuth()` hook client-side, `verifyUser(request)` server-side (Firebase ID token from Authorization header)
- Validation: Zod v4
- Testing: Vitest (minimal coverage, `__tests__/` directories alongside code)
- Linting: Biome v2.3
- Git: trunk-based on `master`, push after each phase
- Design system: CSS custom properties in `globals.css` — navy (#063970), gold (#c8a55a), sage (#6b8e6f), amber (#d4956c)

**Data model considerations:**
- Firestore NoSQL — denormalized where needed, server-side consistency for overage allocations
- All monetary values stored as integer cents to avoid floating point issues
- Collections scoped by `userId` field, enforced server-side (never accept userId from client)
- Overage allocations linked to source transaction for cleanup on deletion

**Billing model:**
- Tool key: `digital_envelopes`, `creditsPerUse: 100`
- Charged on first access each week (idempotency key: `{uid}_{weekStartDate}`)
- Users without payment for current week see data in read-only mode
- Existing `billing_tool_pricing` collection stores the pricing
- Existing ledger/usage tracking provides audit trail

## Constraints

- **Tech stack**: Must use repo's existing stack (Next.js 16, Firestore, Firebase Auth, Tailwind 4) — no new databases or auth providers
- **Minimal diff**: No broad refactors; follow existing patterns for routing, data fetching, validation, error handling
- **Privacy**: Server-side userId enforcement on every operation; no merchant/description data in logs; no third-party analytics
- **Styling**: Must reuse existing Card component, Button component, and CSS custom properties — envelopes cards should match project cards visually
- **Auth inheritance**: No separate auth; inherit site's Firebase Auth session
- **Billing**: Must integrate with existing credits system via `debitForToolUse()`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Firestore (not SQL) for data | Follow repo conventions, avoid new infrastructure for MVP | — Pending |
| 100 credits/week on first access | Monetize without blocking read access to past data | — Pending |
| Week starts Sunday | User preference; consistent across all date math | — Pending |
| Build reusable Modal component | No modal exists in repo; overage workflow requires one | — Pending |
| Cents as integers | Avoid floating point; Firestore stores numbers natively | — Pending |
| Inline card expansion for transactions | Match site's interaction patterns; avoid separate page for quick entry | — Pending |

---
*Last updated: 2026-02-10 after initialization*
