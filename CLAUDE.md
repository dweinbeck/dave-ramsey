# Project Instructions

> Inherits from `~/.claude/CLAUDE.md` — only project-specific overrides below.

---

## Quick Reference
```bash
npm test             # Vitest
npm run build        # tsc --noEmit (type check only)
```

---

## Project-Specific Zones

### Safe Zones
- `src/lib/envelopes/` — All envelope logic (firestore, types, week-math, format)
- `src/lib/envelopes/__tests__/` — Vitest test files

### Caution Zones
- `src/lib/firebase.ts` — Firebase Admin SDK singleton
- `src/lib/envelopes/types.ts` — Zod schemas (changes affect personal-brand consumers)

---

## Tech Stack Summary
| Category | Technology |
|----------|------------|
| Language | TypeScript |
| Database | Firebase Firestore |
| Validation | Zod 4 |
| Date Logic | date-fns 4 |
| Testing | Vitest 3 |

---

## Key Patterns (Reference)
- **Cents-only monetary:** All storage and computation in integer cents — `formatCents()` is the only place dollars appear
- **Pure computation separation:** Week math and status labels are pure functions (testable without Firestore)
- **Collection references:** `envelopesCol()`, `transactionsCol()`, `allocationsCol()` — wrappers with `requireDb()` guard
- **Week conventions:** Sunday-start weeks (`weekStartsOn: 0`), consistent across all functions
- **userId security:** NEVER in Zod schemas — always derived from `verifyUser()` server-side

---

## Known Gotchas
| Gotcha | Details |
|--------|---------|
| Library, not app | No standalone deployment — embedded in personal-brand |
| Cross-repo impact | Schema changes in `types.ts` affect personal-brand API routes |
| date-fns locale | Explicit `weekStartsOn: 0` prevents locale override surprises |
