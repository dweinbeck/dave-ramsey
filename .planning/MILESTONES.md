# Project Milestones: Digital Envelopes

## v1 MVP (Shipped: 2026-02-10)

**Delivered:** A complete weekly envelope budgeting mini-app inside dan-weinbeck.com with envelope management, transaction tracking, overage reallocation, analytics, and billing integration.

**Phases completed:** 1-6 (18 plans total)

**Key accomplishments:**
- Foundation infrastructure with routes, sub-navigation, week math utilities (5 functions, 36 tests), Zod schemas, and Firestore collection helpers across two repositories
- Full envelope CRUD with reorder, rollover policy, cumulative savings tracking, and styled card-based home page with personalized greeting
- Transaction management from both inline home page forms and dedicated transactions page with week selector, edit/delete, and dual SWR cache refresh
- Overage reallocation workflow with reusable Modal component, automatic detection, donor allocation with client+server validation, atomic persistence, and cascade delete
- Analytics dashboard with summary stats, weekly pivot table, and Recharts savings growth visualization
- Billing integration with free trial week, weekly 100-credit charging via debitForToolUse, and graceful read-only degradation across all endpoints and UI pages

**Stats:**
- 57 files across 2 repos (dave-ramsey utilities + personal-brand Next.js app)
- ~6,300 lines of TypeScript
- 6 phases, 18 plans, ~70 min total execution time
- 88 unit tests (dave-ramsey repo)
- 35 requirements satisfied (100% coverage)
- 1 day from start to ship

**Git range:** `feat(01-01)` → `feat(06-03)`

**What's next:** Project complete for v1. Manual QA recommended before production use. Potential v2 features: notifications, CSV export, envelope templates, dark mode.

---
