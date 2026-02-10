---
phase: 01-foundation
plan: 01
subsystem: routing
tags: [next.js, app-router, sub-navigation, auth-guard, placeholder-pages]
requires: []
provides:
  - "/envelopes route with AuthGuard + sub-navigation layout"
  - "/envelopes/transactions placeholder page"
  - "/envelopes/analytics placeholder page"
  - "Envelopes link in main site navigation for authenticated users"
affects:
  - "01-02 (week math utilities render into these pages)"
  - "01-03 (Firestore types used by future page content)"
  - "Phase 2 (envelope cards render inside /envelopes page)"
  - "Phase 3 (transactions render inside /envelopes/transactions page)"
  - "Phase 5 (analytics render inside /envelopes/analytics page)"
tech-stack:
  added: []
  patterns:
    - "Nested layout with AuthGuard (replicates control-center pattern)"
    - "Sub-navigation tabs with usePathname active state detection"
    - "exact: true for root tab to prevent false-positive active state"
key-files:
  created:
    - src/components/envelopes/EnvelopesNav.tsx
    - src/app/envelopes/layout.tsx
    - src/app/envelopes/page.tsx
    - src/app/envelopes/transactions/page.tsx
    - src/app/envelopes/analytics/page.tsx
  modified:
    - src/components/layout/NavLinks.tsx
key-decisions:
  - decision: "Use AuthGuard (not AdminGuard) for envelopes layout"
    rationale: "Envelopes is for all authenticated users, not just admin"
  - decision: "Match ControlCenterNav styling exactly (border-gray-200, bg-white)"
    rationale: "Consistent sub-navigation appearance across the site"
  - decision: "Envelopes link appears before Control Center in nav order"
    rationale: "Envelopes is for all users; Control Center is admin-only and appears last"
duration: "5m 28s"
completed: 2026-02-10
---

# Phase 1 Plan 1: Routing Shell, Sub-Navigation, and Placeholder Pages Summary

Envelopes routing shell with AuthGuard-gated layout, three-tab sub-navigation (Home/Transactions/Analytics), placeholder pages with metadata, and Envelopes link added to main site nav for all authenticated users.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 5m 28s |
| Start | 2026-02-10T14:00:49Z |
| End | 2026-02-10T14:06:17Z |
| Tasks | 2/2 |
| Files created | 5 |
| Files modified | 1 |

## Accomplishments

1. **EnvelopesNav component** -- Client component with three tabs (Home, Transactions, Analytics) using `usePathname` for active state detection. Uses `exact: true` for the Home tab to prevent false-positive highlighting on sub-routes. Matches ControlCenterNav's Tailwind classes exactly (`border-gray-200`, `bg-white`, `border-gold` for active state).

2. **Envelopes layout** -- Server component wrapping all envelope pages in `AuthGuard` (shows "Sign in with Google" for unauthenticated users) and `EnvelopesNav` (sub-navigation tabs). Modeled on the control-center layout but uses `AuthGuard` instead of `AdminGuard`.

3. **Three placeholder pages** -- Each exports `metadata` with appropriate titles and renders a heading + subtitle inside the site's standard content width container (`mx-auto max-w-6xl`).

4. **Main navigation update** -- NavLinks.tsx now adds "Envelopes" link for all authenticated users and "Control Center" for admin only. Previously, only admin saw any additional links.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create EnvelopesNav component and envelopes layout with placeholder pages | 46d209e | EnvelopesNav.tsx, layout.tsx, page.tsx (x3) |
| 2 | Add Envelopes link to main site navigation for authenticated users | 4932e62 | NavLinks.tsx |

## Files Created

| File | Purpose |
|------|---------|
| `src/components/envelopes/EnvelopesNav.tsx` | Sub-navigation tabs with active state highlighting |
| `src/app/envelopes/layout.tsx` | AuthGuard + EnvelopesNav wrapper for all envelope pages |
| `src/app/envelopes/page.tsx` | Home page placeholder ("Digital Envelopes") |
| `src/app/envelopes/transactions/page.tsx` | Transactions page placeholder |
| `src/app/envelopes/analytics/page.tsx` | Analytics page placeholder |

## Files Modified

| File | Change |
|------|--------|
| `src/components/layout/NavLinks.tsx` | Added "Envelopes" link for authenticated users in useMemo block |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| AuthGuard (not AdminGuard) for envelopes | Envelopes is for all authenticated users, not admin-only |
| Match ControlCenterNav classes exactly | Consistent sub-navigation appearance; uses `border-gray-200 bg-white` not CSS custom property aliases |
| Envelopes before Control Center in nav | User-facing feature appears before admin tool |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**For 01-02 (Week Math Utilities):**
- Routing shell is complete; week math utilities will be used by future page content that renders inside these placeholders
- No blockers

**For 01-03 (Zod Types, Firestore Helpers):**
- Layout and routing foundation is in place for data-driven pages
- No blockers

**For Phase 2 (Envelope Management):**
- The `/envelopes` page placeholder is ready to be replaced with envelope cards and greeting
- AuthGuard and EnvelopesNav are in place
- Main nav link is active for authenticated users
