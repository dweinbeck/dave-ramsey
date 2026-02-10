# Phase 1: Foundation - Research

**Researched:** 2026-02-10
**Domain:** Next.js App Router routing, date math utilities, Firestore per-user data isolation, privacy infrastructure
**Confidence:** HIGH

## Summary

Phase 1 establishes the routing shell, sub-navigation, week math utilities, per-user data isolation, and privacy infrastructure for the Digital Envelopes feature. The host repo (`~/Documents/personal-brand`) already has well-established patterns for all of these concerns, making this phase primarily an exercise in replicating existing patterns in a new route segment.

The existing codebase uses Next.js 16 App Router with nested layouts (see `control-center/layout.tsx`), `AuthGuard` for login-gated pages, `verifyUser()` for server-side auth on API routes, and Zod v4 for validation. All of these patterns are directly applicable. The only new dependency is `date-fns` v4.1.0 for week math utilities.

**Primary recommendation:** Follow the existing `control-center` pattern exactly -- create `src/app/envelopes/layout.tsx` with an `AuthGuard` wrapper and an `EnvelopesNav` sub-navigation component modeled on `ControlCenterNav`. Use `date-fns` v4 for all week math with `weekStartsOn: 0` (Sunday). Enforce per-user data isolation by always deriving `userId` from `verifyUser()` in every API route handler.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| date-fns | 4.1.0 | Week math: `startOfWeek`, `endOfWeek`, `differenceInCalendarDays`, `format` | Tree-shakeable, no heavy Moment/Luxon dependency; only new dep needed per STATE.md decision |
| zod | 4.3.6 (already installed) | Input validation for API routes | Already used in repo; `"zod/v4"` import path per billing types pattern |
| firebase-admin | 13.6.0 (already installed) | Server-side Firestore access and auth token verification | Already used for all server-side operations |
| swr | 2.4.0 (already installed) | Client-side data fetching with caching | Already used in brand-scraper hooks |
| clsx | 2.1.1 (already installed) | Conditional CSS class merging | Already used in all UI components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/navigation | 16.1.6 (already installed) | `usePathname()` for active tab detection | Sub-navigation active state |
| firebase (client) | 12.8.0 (already installed) | `user.getIdToken()` for Bearer tokens | All client-to-API requests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| date-fns | Temporal API | Temporal is still Stage 3; not shipped in all runtimes. date-fns is the STATE.md-locked decision |
| date-fns | dayjs | dayjs is smaller but date-fns is tree-shakeable and already decided |
| SWR | TanStack Query | SWR already in repo; switching would add unnecessary complexity |

**Installation:**
```bash
npm install date-fns
```

No other new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── envelopes/
│       ├── layout.tsx              # AuthGuard + EnvelopesNav wrapper
│       ├── page.tsx                # Home page (placeholder for Phase 1)
│       ├── transactions/
│       │   └── page.tsx            # Transactions page (placeholder for Phase 1)
│       └── analytics/
│           └── page.tsx            # Analytics page (placeholder for Phase 1)
├── components/
│   └── envelopes/
│       └── EnvelopesNav.tsx        # Sub-navigation tabs component
└── lib/
    └── envelopes/
        ├── week-math.ts            # Week math utilities (single source of truth)
        ├── week-math.test.ts       # OR __tests__/week-math.test.ts
        ├── types.ts                # Zod schemas + TypeScript types for envelopes
        └── firestore.ts            # Firestore collection helpers (Phase 2+, but types defined now)
```

### Pattern 1: Nested Layout with Sub-Navigation
**What:** A `layout.tsx` at `src/app/envelopes/` that wraps all envelope pages with authentication and sub-navigation.
**When to use:** Any route segment that needs shared UI (navigation, guards) across child routes.
**Example:**
```typescript
// Source: Existing pattern in src/app/control-center/layout.tsx
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { EnvelopesNav } from "@/components/envelopes/EnvelopesNav";

export default function EnvelopesLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <EnvelopesNav />
      {children}
    </AuthGuard>
  );
}
```

**Key difference from `control-center`:** The control center uses `AdminGuard` (admin-only); envelopes should use `AuthGuard` (any authenticated user). The `AuthGuard` is already in the codebase at `src/components/auth/AuthGuard.tsx` and shows a "Sign in with Google" button for unauthenticated users.

### Pattern 2: Sub-Navigation Tabs with Active State
**What:** A client component that renders tab links with active highlighting based on current pathname.
**When to use:** Internal section navigation within a route segment.
**Example:**
```typescript
// Source: Existing pattern in src/components/admin/ControlCenterNav.tsx
"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { name: "Home", href: "/envelopes", exact: true },
  { name: "Transactions", href: "/envelopes/transactions", exact: false },
  { name: "Analytics", href: "/envelopes/analytics", exact: false },
];

export function EnvelopesNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="border-b border-border bg-surface" aria-label="Envelopes">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-6">
          {navLinks.map((link) => {
            const active = isActive(link.href, link.exact);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "py-3 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-gold text-primary font-semibold"
                    : "border-transparent text-text-secondary hover:text-primary hover:bg-gold-light rounded-t",
                )}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
```

### Pattern 3: API Route with Server-Side Auth
**What:** API route handlers that derive userId from the Firebase ID token, never accepting it from the client.
**When to use:** Every API route that reads or writes user-specific data.
**Example:**
```typescript
// Source: Existing pattern in src/app/api/billing/me/route.ts
import { unauthorizedResponse, verifyUser } from "@/lib/auth/user";

export async function GET(request: Request) {
  const auth = await verifyUser(request);
  if (!auth.authorized) return unauthorizedResponse(auth);

  // auth.uid is the server-derived userId -- NEVER accept from client body/params
  const data = await getEnvelopesForUser(auth.uid);
  return Response.json(data);
}
```

### Pattern 4: Client-Side Authenticated Fetch
**What:** Client components that get a Firebase ID token and send it as a Bearer token in API requests.
**When to use:** Any client component that calls envelope API routes.
**Example:**
```typescript
// Source: Existing pattern in src/components/billing/BillingPage.tsx
const token = await user.getIdToken();
const res = await fetch("/api/envelopes", {
  headers: { Authorization: `Bearer ${token}` },
});
```

### Pattern 5: Integer Cents for Monetary Values
**What:** Store all monetary values as integer cents (e.g., `1050` for $10.50), perform all arithmetic on integers, only format to dollars for display.
**When to use:** Every monetary field in Firestore documents and API payloads.
**Example:**
```typescript
// Type definition
type Envelope = {
  id: string;
  userId: string;
  title: string;
  weeklyBudgetCents: number;  // e.g., 5000 = $50.00
  createdAt: FirebaseFirestore.Timestamp;
};

// Display formatting (only at the UI layer)
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Zod schema validation
const envelopeSchema = z.object({
  title: z.string().min(1).max(100),
  weeklyBudgetCents: z.number().int().min(1),  // Must be positive integer
});
```

### Anti-Patterns to Avoid
- **Accepting userId from client:** NEVER. Always derive from `verifyUser(request).uid`. The existing `firestore.rules` deny all client reads/writes (`allow read, write: if false`), so all access goes through server-side API routes.
- **Floating-point money:** NEVER use `Number` for dollars (e.g., `10.50`). Always use integer cents. This is already the pattern in the billing system (`usdCents`, `creditsPerUse`).
- **Logging merchant/description data:** NEVER `console.log` or `console.error` request bodies that may contain merchant names or transaction descriptions. Only log operation metadata (userId, error type, status codes).
- **Importing from `"zod"` vs `"zod/v4"`:** The most recent code in the repo uses `"zod/v4"`. Use this import path for consistency with the billing types pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Week start/end calculation | Custom date arithmetic | `date-fns/startOfWeek`, `date-fns/endOfWeek` with `{ weekStartsOn: 0 }` | Edge cases: DST transitions, year boundaries, leap years |
| Calendar day difference | `(d2 - d1) / 86400000` | `date-fns/differenceInCalendarDays` | DST-aware; handles timezone offset changes correctly |
| Date formatting | `date.toLocaleDateString()` | `date-fns/format` with explicit format strings | Consistent across server/client; locale-independent |
| Sub-navigation active state | Manual URL string comparison | `usePathname()` + `startsWith()` pattern | Already proven in `ControlCenterNav`; handles nested routes correctly |
| Auth token verification | Custom JWT parsing | `verifyUser()` from `@/lib/auth/user` | Already handles all edge cases: missing header, expired token, missing email claim |
| Auth guard UI | Custom loading/login state | `AuthGuard` from `@/components/auth/AuthGuard` | Already shows loading state, sign-in button, handles auth flow |

**Key insight:** The host repo already has battle-tested patterns for auth, API routes, UI components, and data access. Phase 1 should replicate these patterns, not invent new ones.

## Common Pitfalls

### Pitfall 1: Week Boundary Off-by-One
**What goes wrong:** `endOfWeek` returns Saturday at 23:59:59.999 when `weekStartsOn: 0`. If you compare dates naively, transactions at the boundary may land in the wrong week.
**Why it happens:** `startOfWeek` returns Sunday 00:00:00, `endOfWeek` returns Saturday 23:59:59.999. A transaction on Sunday at midnight belongs to the NEW week, not the old one.
**How to avoid:** Always use `startOfWeek` for both range boundaries: current week is `[startOfWeek(date), startOfWeek(addWeeks(date, 1)))` -- inclusive start, exclusive end. Store transaction dates as date strings (`YYYY-MM-DD`) not timestamps to avoid timezone ambiguity.
**Warning signs:** Tests pass locally but fail in CI (different timezone); transactions at week boundaries appear in wrong week.

### Pitfall 2: Floating-Point Arithmetic on Cents
**What goes wrong:** `$10.10 + $5.20 = 15.299999999999999` in JavaScript.
**Why it happens:** IEEE 754 floating-point representation.
**How to avoid:** ALL monetary values are stored and computed as integer cents. Input: parse dollars to cents (`Math.round(dollarAmount * 100)`). Output: format cents to dollars only at the display layer (`(cents / 100).toFixed(2)`).
**Warning signs:** Budget remaining shows values like `$4.999999999999` or validation rejects valid amounts.

### Pitfall 3: userId Leaking from Client
**What goes wrong:** API route accepts `userId` from request body or query params, allowing users to access other users' data.
**Why it happens:** Developer passes userId from the client for convenience rather than extracting it server-side.
**How to avoid:** Codify the rule: `verifyUser(request)` returns `auth.uid` which is the ONLY source of userId. Never destructure `userId` from `request.json()`. The existing Firestore rules deny all direct client access (`allow read, write: if false`), so this is doubly enforced.
**Warning signs:** API routes that accept a `userId` field in the request body.

### Pitfall 4: Sensitive Data in Logs
**What goes wrong:** Merchant names, transaction descriptions, or other PII appear in server logs (Cloud Run logs, console output).
**Why it happens:** Using `console.error("Failed:", requestBody)` which dumps the entire request including sensitive fields.
**How to avoid:** Log only non-sensitive metadata: operation name, userId (already in auth), error type, status code. Never log request bodies that contain merchant/description fields. Create a convention: any `try/catch` in envelope API routes logs only `"POST /api/envelopes/transactions error:", error.message` -- never the request payload.
**Warning signs:** Grep server logs for merchant names or transaction descriptions.

### Pitfall 5: Third-Party Analytics on Envelope Pages
**What goes wrong:** Google Analytics, Hotjar, or other third-party scripts capture page content or user interactions on envelope pages.
**Why it happens:** Analytics scripts are loaded globally in the root layout.
**How to avoid:** Audit the root layout. Currently, the site has NO third-party analytics scripts in `src/app/layout.tsx` or `src/app/globals.css` (confirmed by reading both files). This means INFRA-07 is already satisfied at the infrastructure level. Document this finding. If analytics are ever added to the site, they must exclude `/envelopes/*` routes.
**Warning signs:** Check `layout.tsx` for `<Script>` tags, check for Google Tag Manager, check for any `gtag` calls.

### Pitfall 6: Using `exact: false` for the Home Tab
**What goes wrong:** The "Home" tab at `/envelopes` stays highlighted when on `/envelopes/transactions` because `pathname.startsWith("/envelopes")` is true for all sub-routes.
**Why it happens:** The `startsWith` check doesn't distinguish the root from sub-routes.
**How to avoid:** Use `exact: true` for the root tab (`/envelopes`) and `exact: false` for sub-tabs. This is exactly the pattern in `ControlCenterNav` where "Dashboard" uses `exact: true`.
**Warning signs:** Home tab always appears active regardless of which sub-page is displayed.

## Code Examples

### Week Math Utilities (Single Source of Truth)
```typescript
// Source: date-fns v4.1.0 official API (verified via GitHub source)
// File: src/lib/envelopes/week-math.ts
import { differenceInCalendarDays, endOfWeek, format, startOfWeek } from "date-fns";

/**
 * Week starts Sunday (weekStartsOn: 0), which is the date-fns default.
 * Explicitly set for clarity and to prevent accidental locale overrides.
 */
const WEEK_OPTIONS = { weekStartsOn: 0 as const };

/**
 * Returns the Sunday-to-Saturday range for the week containing `date`.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, WEEK_OPTIONS),
    end: endOfWeek(date, WEEK_OPTIONS),
  };
}

/**
 * Returns the fraction of the week remaining (0.0 to 1.0).
 * Sunday morning = ~1.0, Saturday evening = ~0.0.
 */
export function getRemainingDaysPercent(today: Date): number {
  const { start, end } = getWeekRange(today);
  const totalDays = differenceInCalendarDays(end, start) + 1; // 7
  const elapsed = differenceInCalendarDays(today, start);
  const remaining = totalDays - elapsed;
  return remaining / totalDays;
}

/**
 * Returns a status label for an envelope based on spending vs. budget
 * and time remaining in the week.
 *
 * - "On Track": remaining >= budget * remainingDaysPercent
 * - "Watch":    remaining > 0 but less than proportional budget
 * - "Over":     remaining <= 0
 */
export function getStatusLabel(
  remainingCents: number,
  weeklyBudgetCents: number,
  remainingDaysPercent: number,
): "On Track" | "Watch" | "Over" {
  if (remainingCents <= 0) return "Over";
  const proportionalBudget = weeklyBudgetCents * remainingDaysPercent;
  if (remainingCents >= proportionalBudget) return "On Track";
  return "Watch";
}

/**
 * Formats a week range for display: "Week N: M/D/YYYY - M/D/YYYY"
 */
export function formatWeekLabel(date: Date): string {
  const { start, end } = getWeekRange(date);
  return `${format(start, "M/d/yyyy")} - ${format(end, "M/d/yyyy")}`;
}
```

### Firestore Collection Helper Pattern
```typescript
// Source: Existing pattern in src/lib/billing/firestore.ts
// File: src/lib/envelopes/firestore.ts (stub for Phase 1, full implementation in Phase 2)
import { db } from "@/lib/firebase";

function requireDb() {
  if (!db) {
    throw new Error("Firestore not available.");
  }
  return db;
}

/**
 * All envelope collections filter by userId server-side.
 * userId is ALWAYS derived from verifyUser(), never from client input.
 */
export function envelopesCol(userId: string) {
  return requireDb()
    .collection("envelopes")
    .where("userId", "==", userId);
}

export function transactionsCol(userId: string) {
  return requireDb()
    .collection("envelope_transactions")
    .where("userId", "==", userId);
}
```

### Privacy-Safe Error Logging Pattern
```typescript
// File: API route handlers for envelopes
// DO:
console.error("POST /api/envelopes/transactions error:", error instanceof Error ? error.message : "Unknown error");

// DON'T:
console.error("POST /api/envelopes/transactions error:", error, requestBody);
// requestBody may contain merchant, description -- NEVER log these
```

### Placeholder Page Pattern
```typescript
// Source: Common Next.js App Router pattern
// File: src/app/envelopes/page.tsx
export const metadata = {
  title: "Digital Envelopes",
};

export default function EnvelopesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-2xl font-bold text-primary font-display mb-4">
        Digital Envelopes
      </h1>
      <p className="text-text-secondary">
        Weekly envelope budgeting. Coming soon.
      </p>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Moment.js | date-fns v4 (tree-shakeable) | 2020+ | Smaller bundles; no global mutation |
| `import { z } from "zod"` (v3) | `import { z } from "zod/v4"` (v4) | 2025 (zod 4.0) | New validation APIs; both paths work but `zod/v4` is the explicit v4 path |
| Floating-point dollars | Integer cents | Industry standard | No rounding errors in financial calculations |
| Client-side Firestore rules | Server-side API routes with admin SDK | Project convention | All Firestore rules deny access (`allow read, write: if false`); all data flows through API routes |
| `getServerSideProps` | App Router layouts + route handlers | Next.js 13+ | Nested layouts, streaming, React Server Components |

**Deprecated/outdated:**
- `pages/` router: This project uses App Router exclusively
- `Moment.js`: Superseded by date-fns/Temporal; not in this project
- Zod v3 string validators (`.email()`, `.url()`): In v4, these become top-level (`z.email()`, `z.url()`) but old syntax still works during transition

## Open Questions

1. **NavLinks integration: Should `/envelopes` appear in the main site navigation?**
   - What we know: `NavLinks.tsx` currently builds the nav list conditionally based on admin status. The `baseLinks` array could include an "Envelopes" link for authenticated users.
   - What's unclear: Whether the link should appear for all users or only authenticated users. Currently `Control Center` only appears for the admin.
   - Recommendation: Add "Envelopes" to `baseLinks` for all authenticated users (gated by `user` existence, not admin email). The page itself already requires auth via `AuthGuard`. Defer to planner.

2. **Firestore collection structure: Top-level vs. sub-collection**
   - What we know: The billing system uses top-level collections with `userId` field filtering. The alternative is `users/{userId}/envelopes` sub-collections.
   - What's unclear: Which is better for the Digital Envelopes use case (cross-user queries are not needed).
   - Recommendation: Use top-level `envelopes` and `envelope_transactions` collections with `userId` field, matching the existing billing pattern (`billing_tool_usage` uses `where("uid", "==", uid)`). This is simpler and consistent with the codebase. Sub-collections would also work but deviate from existing patterns.

3. **Date storage format for transactions**
   - What we know: Transactions need a date field for week-based queries. Options: Firestore Timestamp, ISO 8601 string, or `YYYY-MM-DD` date string.
   - What's unclear: Whether Firestore Timestamp or date string is better for week-range queries.
   - Recommendation: Use `YYYY-MM-DD` string for the transaction date (user-entered date, not creation timestamp). This avoids timezone issues -- the user picks "2026-02-10" and that's what's stored, regardless of timezone. Use `startOfWeek`/`endOfWeek` to compute range strings for Firestore `where` queries. Keep `createdAt` as Firestore Timestamp for audit purposes.

## Sources

### Primary (HIGH confidence)
- Host repo codebase analysis -- direct file reads of all relevant source files:
  - `src/app/layout.tsx` -- root layout structure (AuthProvider, Navbar, Footer)
  - `src/app/control-center/layout.tsx` -- nested layout pattern (AdminGuard + ControlCenterNav)
  - `src/components/admin/ControlCenterNav.tsx` -- sub-navigation tab pattern
  - `src/components/auth/AuthGuard.tsx` -- authentication guard pattern
  - `src/lib/auth/user.ts` -- `verifyUser()` server-side auth pattern
  - `src/lib/billing/firestore.ts` -- Firestore collection helpers, `debitForToolUse()` pattern
  - `src/lib/billing/types.ts` -- Zod v4 schema pattern (`"zod/v4"` import)
  - `src/components/ui/Card.tsx` -- Card component (default/clickable/featured variants)
  - `src/components/ui/Button.tsx` -- Button component (primary/secondary/ghost)
  - `src/components/billing/BillingPage.tsx` -- client-side authenticated fetch pattern
  - `src/app/globals.css` -- CSS custom properties (design system tokens)
  - `src/app/api/billing/me/route.ts` -- API route pattern
  - `src/app/api/tools/brand-scraper/scrape/route.ts` -- API route with billing integration
  - `firestore.rules` -- deny-all client access rules
  - `package.json` -- dependency versions
  - `biome.json` -- linter configuration
  - `vitest.config.ts` -- test configuration
  - `tsconfig.json` -- TypeScript configuration
- date-fns v4 source code (GitHub) -- `startOfWeek`, `endOfWeek`, `differenceInCalendarDays`, `format` function signatures and implementation

### Secondary (MEDIUM confidence)
- [date-fns npm page](https://www.npmjs.com/package/date-fns) -- version 4.1.0 confirmed as latest
- [Zod v4 versioning](https://zod.dev/v4/versioning) -- `"zod/v4"` subpath import is permanent and stable
- [Next.js App Router layouts docs](https://nextjs.org/docs/app/getting-started/layouts-and-pages) -- nested layout and partial rendering behavior
- [Firestore per-user security patterns](https://medium.com/firebase-developers/patterns-for-security-with-firebase-per-user-permissions-for-cloud-firestore-be67ee8edc4a) -- field-based userId filtering for server-side access

### Tertiary (LOW confidence)
- None. All findings were verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are either already in the repo or verified via npm/GitHub source
- Architecture: HIGH -- all patterns directly replicate existing codebase conventions
- Pitfalls: HIGH -- derived from code analysis and well-known JavaScript/Firestore gotchas
- Week math: HIGH -- verified against date-fns v4 source code on GitHub; `weekStartsOn: 0` is the default

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable; all dependencies are mature)
