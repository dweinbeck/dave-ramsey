# Digital Envelopes

> A weekly-cadence envelope budgeting tool embedded within an existing personal brand site.

## Description

Digital Envelopes is a focused, simple envelope budgeting application that operates on a weekly cycle rather than the monthly cycle used by most competitors. Users create envelopes with weekly budget amounts, log transactions manually, and track remaining balances throughout the week. When an envelope is overspent, the overage reallocation workflow allows users to pull funds from other envelopes atomically.

The application is designed as a mini-app module within an existing Next.js personal brand site (dan-weinbeck.com), inheriting its authentication (Firebase/Google Sign-In), styling (Tailwind CSS), and billing infrastructure. All monetary values are stored as integer cents to avoid floating-point errors, and envelope balances are computed on read from transaction data rather than stored as denormalized fields. This eliminates write contention and ensures balances are always consistent.

Digital Envelopes targets users who think in weekly budgets and want a lightweight, no-frills spending tracker without the complexity of full financial management suites. It deliberately avoids bank syncing, debt tracking, multi-user sharing, and other features that would bloat the product beyond its focused purpose.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 (strict mode) |
| UI | React 19, Tailwind CSS 4 |
| Database | Firestore (via firebase-admin SDK, server-side only) |
| Auth | Firebase Auth (Google Sign-In) |
| Validation | Zod v4 |
| Data Fetching | SWR 2.x (client-side caching) |
| Date Math | date-fns 4.1 |
| Testing | Vitest 3.2 |
| Linting | Biome 2.2 |

## Documentation

- [Functional Requirements (FRD)](docs/FRD.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check (build)
npm run build

# Lint (same as build -- TypeScript noEmit)
npm run lint
```

## Project Structure

```
dave-ramsey/
  src/
    lib/
      firebase.ts                  # Firebase Admin SDK initialization
      envelopes/
        week-math.ts               # Week boundary utilities (Sunday-Saturday)
        types.ts                   # Zod schemas + TypeScript types
        firestore.ts               # Firestore CRUD + computation helpers
        format.ts                  # Currency formatting (cents to dollars)
        __tests__/
          week-math.test.ts        # Week math unit tests
          types.test.ts            # Schema validation tests
          firestore.test.ts        # CRUD + computation helper tests
  .planning/                       # Research, roadmap, and phase plans
  package.json
  tsconfig.json
  vitest.config.ts
```

## License

ISC
