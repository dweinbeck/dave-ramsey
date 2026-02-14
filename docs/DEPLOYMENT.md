# Deployment Guide

## Overview

Stash is a feature module within the host `personal-brand` Next.js site. It does not deploy independently -- it ships as part of the host site's build and deploy pipeline. The module consists of server-side library code (`src/lib/envelopes/`), API Route Handlers (planned under `src/app/api/envelopes/`), page components (planned under `src/app/envelopes/`), and shared UI components (planned under `src/components/envelopes/`).

The current `stash` repository is a standalone development workspace for building and testing the core library (types, schemas, week math, Firestore helpers, computation functions) before integrating into the host repo. It shares the same dependency versions as the host repo to ensure compatibility.

## Environment Variables

### Required (Host Site)

These environment variables are configured in the host `personal-brand` deployment and are inherited by the envelope module at runtime.

| Variable | Description | Example | Where Set |
|----------|-------------|---------|-----------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account JSON (or use Application Default Credentials on GCP) | `/secrets/firebase-sa.json` | Cloud Run / GCP |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `dan-weinbeck-site` | Cloud Run env |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Client-side Firebase config (public) | `AIzaSy...` | `.env.local` / Cloud Run |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain | `dan-weinbeck-site.firebaseapp.com` | `.env.local` / Cloud Run |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Client-side project ID (public) | `dan-weinbeck-site` | `.env.local` / Cloud Run |

### Development Only

| Variable | Description | Default |
|----------|-------------|---------|
| `FIRESTORE_EMULATOR_HOST` | Points to local Firestore emulator | `localhost:8080` (when using Firebase Emulator) |
| `FIREBASE_AUTH_EMULATOR_HOST` | Points to local Auth emulator | `localhost:9099` (when using Firebase Emulator) |

### Envelope-Specific Configuration

No additional environment variables are required for the envelope module. All configuration (weekly credit cost, week start day, billing behavior) is defined in code constants, not environment variables. This is a deliberate design choice -- the envelope module has no independent deployment configuration.

| Configuration | Value | Defined In |
|---------------|-------|------------|
| Weekly credit cost | 100 credits | `src/lib/envelopes/firestore.ts` (billing constants) |
| Week start day | Sunday (`weekStartsOn: 0`) | `src/lib/envelopes/week-math.ts` (WEEK_OPTIONS) |
| Currency | USD only | `src/lib/envelopes/format.ts` (formatCents) |
| Free trial | First week free | `src/lib/envelopes/firestore.ts` (billing logic) |

## Local Development

### Prerequisites

- Node.js 22+ (matches host repo)
- npm 10+

### Setup

```bash
# Clone the repo
git clone https://github.com/dweinbeck/stash.git
cd stash

# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run build

# Run tests in watch mode
npm run test:watch
```

### Running Tests

The test suite covers three areas:

```bash
# All tests
npm test

# Week math utilities (20 test cases)
npx vitest run src/lib/envelopes/__tests__/week-math.test.ts

# Zod schema validation (20 test cases)
npx vitest run src/lib/envelopes/__tests__/types.test.ts

# Firestore computation helpers (40+ test cases)
npx vitest run src/lib/envelopes/__tests__/firestore.test.ts
```

### Integration with Host Repo

When the module is ready for integration, the source files will be copied into the host `personal-brand` repo at the corresponding paths:

```
stash/src/lib/envelopes/   ->  personal-brand/src/lib/envelopes/
stash/src/lib/firebase.ts  ->  (uses existing personal-brand/src/lib/firebase.ts)
```

The host repo already has all required dependencies (`firebase-admin`, `zod`, `date-fns`, `swr`, `vitest`) at compatible versions.

## Docker Build

Not applicable for the standalone development workspace. The host `personal-brand` site handles Docker builds and Cloud Run deployment.

When integrated into the host repo, the envelope module is included in the standard Next.js build:

```
Host Repo Build Pipeline:
1. npm install
2. npm run lint (Biome)
3. npm test (Vitest)
4. npm run build (Next.js production build)
5. Docker image build
6. Push to Artifact Registry
7. Deploy to Cloud Run
```

## Cloud Build and Deploy

Stash deploys as part of the host site. There is no independent deployment pipeline.

```
Developer                    GitHub                  Cloud Build             Cloud Run
    |                           |                        |                      |
    |-- git push ------------->|                        |                      |
    |                           |-- webhook trigger --->|                      |
    |                           |                        |-- npm install        |
    |                           |                        |-- npm run lint       |
    |                           |                        |-- npm test           |
    |                           |                        |-- npm run build      |
    |                           |                        |-- docker build       |
    |                           |                        |-- push to registry   |
    |                           |                        |-- deploy ----------->|
    |                           |                        |                      |-- serve
```

### Firestore Index Deployment

Composite indexes must be deployed before the first production use:

```bash
# From the host repo root (where firestore.indexes.json lives)
firebase deploy --only firestore:indexes
```

Required indexes (add to `firestore.indexes.json`):

```json
{
  "indexes": [
    {
      "collectionGroup": "envelopes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "sortOrder", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "envelope_transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "envelope_transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "envelope_transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "envelopeId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Rollback

Since Stash is part of the host site, rollback follows the host site's rollback procedure:

```bash
# List recent Cloud Run revisions
gcloud run revisions list --service=personal-brand --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic personal-brand \
  --to-revisions=personal-brand-00042-abc=100 \
  --region=us-central1
```

### Data Rollback

Firestore data is independent of code deployments. If a code bug corrupts data:

1. Identify affected documents via Cloud Logging.
2. Use the Firebase Console or a script to fix/restore specific documents.
3. The compute-on-read architecture means fixing transaction documents automatically fixes envelope balances (no denormalized fields to repair).

### Feature Flag Rollback

If the envelope feature needs to be disabled without a full code rollback:

1. Remove the "Envelopes" link from `NavLinks.tsx` (host repo).
2. The `/envelopes` route still exists but is not navigable from the site UI.
3. API routes remain functional for any bookmarked URLs until a full code deploy removes them.

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `Firestore not available.` error | Firebase Admin SDK not initialized; missing `GOOGLE_APPLICATION_CREDENTIALS` | Verify service account credentials are mounted/configured in the deployment environment |
| Tests fail with `Cannot find module 'date-fns'` | `date-fns` not installed | Run `npm install` |
| Tests fail with `Cannot find module 'zod/v4'` | Zod version mismatch; `zod/v4` subpath requires Zod 4.x | Verify `"zod": "^4.3.6"` in `package.json`, run `npm install` |
| `TypeError: db.collection is not a function` | Firebase Admin SDK initialized incorrectly or `db` is null | Check `src/lib/firebase.ts`; ensure `admin.initializeApp()` is called before `admin.firestore()` |
| Envelope balances are wrong | Transactions or allocations not properly included in computation | Check `listEnvelopesWithRemaining()` -- verify allocation queries cover both `sourceTransactionId` and `donorEnvelopeId` lookups |
| Week boundaries are off by one day | `weekStartsOn` not set to 0 (Sunday) | Verify all `startOfWeek`/`endOfWeek` calls use `WEEK_OPTIONS = { weekStartsOn: 0 }` |
| Cascade delete misses allocations | Firestore `in` query limited to 30 values; large batches may be chunked incorrectly | `deleteEnvelope()` chunks `transactionIds` in groups of 30; verify chunking logic |
| Zod validation rejects valid date | Date format is not `YYYY-MM-DD` | Verify input uses ISO date format with dashes (e.g., `2026-02-10`), not `MM/DD/YYYY` or `YYYYMMDD` |
| `npm run build` fails with type errors | TypeScript strict mode catches missing types | Check that `firebase-admin` and `@types/node` are installed; verify `tsconfig.json` has `"strict": true` |
| SWR returns stale data after mutation | `mutate()` not called after API write | After every `POST`, `PUT`, or `DELETE`, call `mutate("/api/envelopes")` and/or `mutate("/api/envelopes/transactions")` |
