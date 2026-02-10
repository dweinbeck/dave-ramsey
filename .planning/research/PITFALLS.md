# Domain Pitfalls

**Domain:** Envelope budgeting mini-app (weekly cycle, Firestore backend)
**Researched:** 2026-02-10
**Overall confidence:** HIGH (most pitfalls verified via official Firebase docs and established engineering sources)

---

## Critical Pitfalls

Mistakes that cause data corruption, financial inaccuracy, or required rewrites.

---

### Pitfall 1: Floating-Point Currency Math Produces Silent Penny Errors

**What goes wrong:** Using JavaScript `number` (IEEE 754 float) for dollar amounts causes rounding errors that compound silently. Example: `2090.5 * 8.61` produces `17999.20499999999` instead of `17999.205`. In a budgeting app, these errors mean envelope totals stop adding up, overage reallocation sums diverge from the actual overage amount, and users see unexplained pennies appearing or vanishing.

**Why it happens:** JavaScript has no native decimal type. All `number` values are 64-bit doubles. Decimal fractions like 0.10 cannot be represented exactly in binary floating point. Every arithmetic operation on dollar amounts accumulates error.

**Consequences:**
- Envelope balances drift from actual spending totals
- Overage reallocation of $5.00 across 3 envelopes produces $4.99 or $5.01
- Users lose trust in the app when numbers visibly don't add up
- Bug is intermittent and hard to reproduce (depends on specific values)

**Prevention:**
- Store ALL monetary values as integer cents in Firestore (`500` not `5.00`)
- Perform ALL arithmetic in integer cents; never convert to dollars until display
- Name variables explicitly: `amountCents`, `budgetCents` -- never ambiguous `amount`
- Create a thin currency module (`toCents(dollars)`, `toDollars(cents)`, `formatCurrency(cents)`) used everywhere; no ad-hoc conversions
- Add a validation rule: `typeof value === 'number' && Number.isInteger(value)` for all cent values before Firestore writes
- Use Firestore security rules to validate integer values: `request.resource.data.amountCents is int`

**Detection:**
- Unit test that asserts `sumOfParts === total` after every allocation operation
- Firestore trigger or client-side invariant: sum of envelope allocations must equal the overage amount exactly
- Any `toFixed()` call in business logic (not display) is a red flag

**Confidence:** HIGH -- IEEE 754 limitations are well-documented; integer-cents pattern is standard in fintech.

**Phase:** Must be established in Phase 1 (data model). Retrofitting cents-everywhere after building with dollars requires touching every file.

**Sources:**
- [How to Handle Monetary Values in JavaScript](https://frontstuff.io/how-to-handle-monetary-values-in-javascript)
- [Currency Calculations in JavaScript](https://www.honeybadger.io/blog/currency-money-calculations-in-javascript/)
- [currency.js](https://currency.js.org/)

---

### Pitfall 2: Overage Reallocation "Lost Penny" Problem

**What goes wrong:** When an envelope overspends by $5.00 and the overage is distributed across 3 donor envelopes, naive integer division (`500 / 3 = 166` cents each) loses 2 cents (`166 * 3 = 498`, not `500`). The system either silently drops pennies or creates money from nothing.

**Why it happens:** Integer division has remainders. Without an explicit remainder distribution algorithm, the sum of allocated parts will not equal the total. This is the "hanging pennies" problem well-known in financial engineering.

**Consequences:**
- Envelope balances become internally inconsistent
- User's total budget amount changes after reallocation (money created/destroyed)
- Cascading errors if reallocation feeds into further reallocations
- Auditing becomes impossible

**Prevention -- Use the Largest Remainder Method:**
1. Calculate each donor's share: `Math.floor(overageCents * donorWeight / totalWeight)`
2. Compute remainder: `overageCents - sumOfFlooredParts`
3. Sort donors by their fractional remainders (descending)
4. Distribute one extra cent to the top N donors, where N = remainder
5. Assert: `sumOfAllParts === overageCents` before writing to Firestore

**Implementation skeleton:**
```typescript
function allocateOverage(
  overageCents: number,
  donors: { id: string; weightCents: number }[]
): { id: string; deductCents: number }[] {
  const totalWeight = donors.reduce((s, d) => s + d.weightCents, 0);
  const raw = donors.map(d => ({
    id: d.id,
    exact: (overageCents * d.weightCents) / totalWeight,
    floored: Math.floor((overageCents * d.weightCents) / totalWeight),
  }));
  const remainder = overageCents - raw.reduce((s, r) => s + r.floored, 0);
  // Sort by fractional part descending
  raw.sort((a, b) => (b.exact - b.floored) - (a.exact - a.floored));
  return raw.map((r, i) => ({
    id: r.id,
    deductCents: r.floored + (i < remainder ? 1 : 0),
  }));
}
```

**Detection:**
- Assertion at write time: `allocations.reduce((s, a) => s + a.deductCents, 0) === overageCents`
- Unit tests with edge cases: indivisible amounts (1 cent across 3 donors), zero-weight donors, single donor

**Confidence:** HIGH -- Largest remainder method is mathematically proven; used at Betterment and Shopify for penny-precise allocation.

**Phase:** Must be designed in Phase 1 (data model), implemented when overage reallocation feature is built.

**Sources:**
- [Shopify: 8 Tips for Hanging Pennies](https://shopify.engineering/eight-tips-for-hanging-pennies)
- [Betterment: Penny-Precise Allocation](https://betterment.com/resources/penny-precise-allocation-functions)
- [Wikipedia: Largest Remainder Method](https://en.wikipedia.org/wiki/Largest_remainder_method)

---

### Pitfall 3: Week Boundary Math Goes Wrong Across Timezones

**What goes wrong:** The app uses "week starts Sunday" for budget cycles. A user in US Pacific timezone logs a transaction at 11:30 PM Saturday. In UTC, that's Sunday 7:30 AM -- a different budget week. If the server or Firestore stores timestamps in UTC (which it does) and the week boundary calculation also uses UTC, the transaction is assigned to next week's budget.

**Why it happens:** JavaScript `Date` objects use the system timezone. Firestore `Timestamp` values are UTC. `getDay() === 0` means Sunday in the local timezone but the underlying UTC value may be a different day. `date-fns` `startOfWeek()` operates on the Date's local timezone representation by default.

**Consequences:**
- Transactions appear in wrong week's budget
- Weekly totals are incorrect
- Users near midnight see transactions "jump" between weeks
- Different behavior for users in different timezones
- Testing passes in one timezone, fails in another

**Prevention:**
- Store each user's IANA timezone string in their profile document (e.g., `"America/New_York"`)
- Use `date-fns` v4 with `@date-fns/tz` and `TZDate` for ALL week boundary calculations
- Week boundaries are always computed in the USER's timezone, not UTC and not the server's timezone
- Store a computed `weekId` field on each transaction (e.g., `"2026-W07"`) at write time, calculated using the user's timezone. This makes queries simple and timezone-proof after the fact
- Never derive week boundaries from raw Firestore Timestamps without timezone conversion

**Configuration for date-fns:**
```typescript
import { startOfWeek, endOfWeek } from 'date-fns';
import { TZDate } from '@date-fns/tz';

function getWeekBounds(dateUtc: Date, userTimezone: string) {
  const tzDate = new TZDate(dateUtc, userTimezone);
  // weekStartsOn: 0 = Sunday
  const start = startOfWeek(tzDate, { weekStartsOn: 0 });
  const end = endOfWeek(tzDate, { weekStartsOn: 0 });
  return { start, end };
}
```

**Detection:**
- Unit tests with timestamps near midnight in various US timezones (Pacific, Eastern, Central, Mountain)
- Test specifically: "Saturday 11:59 PM Pacific should be in the same week as Saturday 10:00 AM Pacific"
- Integration test: create transaction at 23:59 local, verify it lands in the correct week

**Confidence:** HIGH -- date-fns v4 timezone support verified via official blog post; `weekStartsOn` option is documented.

**Phase:** Must be decided in Phase 1 (data model design). The `weekId` field on transactions is a schema decision that affects all queries.

**Sources:**
- [date-fns v4 timezone support announcement](https://blog.date-fns.org/v40-with-time-zone-support/)
- [date-fns startOfWeek documentation](https://date-fns.org/)
- [MDN: Date.prototype.getUTCDay()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getUTCDay)

---

### Pitfall 4: Deleting Transactions That Have Linked Overage Allocations

**What goes wrong:** User deletes a transaction. That transaction caused an overage, which triggered reallocation across donor envelopes. The original transaction is deleted, but the reallocation deductions from donor envelopes remain, leaving the system in an inconsistent state where donors lost money for an overage that no longer exists.

**Why it happens:** Firestore has no cascading deletes, no foreign keys, and no referential integrity. If the deletion logic only removes the transaction document without also reversing related allocations, orphaned side effects persist indefinitely.

**Consequences:**
- Donor envelopes permanently lose the reallocated cents
- Envelope totals become incorrect and cannot be reconciled
- If user re-enters the transaction, a second reallocation occurs (double-deducted)
- The more the user edits/deletes, the more the totals diverge from reality

**Prevention:**
- Design a "transaction + allocations" as an atomic unit. Every transaction document that triggered an overage must store references to its allocation records (or the allocation amounts inline)
- Deletion must be a Firestore transaction (or batched write) that atomically: (1) deletes the transaction, (2) reverses the allocation on each donor envelope, (3) deletes/marks the allocation records
- Consider soft-delete pattern: mark transactions as `deleted: true` instead of removing documents. This preserves audit trail and makes reversal safer
- Add an envelope balance recalculation function that can recompute from source transactions as a safety net

**Schema implication:**
```
transactions/{txId}
  amountCents: 1500
  envelopeId: "groceries"
  weekId: "2026-W07"
  overageAllocation: {
    "dining": -300,
    "entertainment": -200
  }
```
When deleting `txId`, the transaction must also add 300 back to "dining" and 200 back to "entertainment".

**Detection:**
- Invariant check: `sum(all transaction amounts in envelope for week) === envelope.spentCents`
- Periodic reconciliation job that recomputes balances from transactions and flags drift
- Integration test: create transaction -> trigger overage -> delete transaction -> verify all balances restored

**Confidence:** HIGH -- Firestore's lack of cascading deletes is explicitly documented by Firebase.

**Phase:** Must be designed in data model phase, implemented alongside overage reallocation feature.

**Sources:**
- [Firebase: Delete data from Cloud Firestore](https://firebase.google.com/docs/firestore/manage-data/delete-data)
- [Managing Firestore Subcollections After Parent Document Deletion](https://medium.com/@max980203/managing-firestore-subcollections-after-parent-document-deletion-a-practical-guide-7ae305905be6)

---

### Pitfall 5: Firestore Transaction Contention on Shared Envelope Documents

**What goes wrong:** Multiple rapid writes to the same envelope document (e.g., user logs 3 transactions quickly, each updating `spentCents` on the envelope) cause Firestore transaction contention. Transactions retry, and after the retry limit, they fail with `ABORTED: Too much contention on these documents`.

**Why it happens:** Firestore uses pessimistic concurrency by default (standard edition). When a transaction reads and writes the same document, it acquires a lock. If another write is queued for that document, it must wait. The lock deadline is 20 seconds, and sustained contention leads to failures. A single Firestore document has a recommended sustained write rate of 1 write per second.

**Consequences:**
- Transaction logging fails intermittently during rapid entry
- Overage reallocation that touches multiple envelopes has higher contention risk
- User sees error messages during normal usage

**Prevention:**
- Use `FieldValue.increment()` for simple counter updates (e.g., `spentCents`) instead of read-modify-write transactions. Increment is atomic, server-side, and does not require reading the document first
- Reserve full transactions for multi-document operations (overage reallocation) where atomicity across documents is required
- For overage reallocation, minimize the number of documents in a single transaction
- Design data so that a single user action only writes to 1-2 documents in the common case (logging a transaction should write the transaction doc + increment on the envelope doc, not a full transaction)
- The 1 QPS per document limit is rarely a problem for a single-user budgeting app, but becomes relevant if batch imports or weekly rollovers touch many documents rapidly

**Detection:**
- Monitor for `ABORTED` errors in Cloud Functions logs
- Load test: simulate rapid transaction entry and verify no failures
- If using client-side transactions, implement exponential backoff with a maximum retry count

**Confidence:** HIGH -- Firestore contention model, FieldValue.increment(), and 1 QPS guidance all verified via official Firebase documentation.

**Phase:** Relevant when implementing transaction logging and overage reallocation.

**Sources:**
- [Firebase: Transaction serializability and isolation](https://firebase.google.com/docs/firestore/transaction-data-contention)
- [Firebase: Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firebase: Incrementing Values Atomically](https://firebase.blog/posts/2019/03/increment-server-side-cloud-firestore/)
- [Firebase: Understand reads and writes at scale](https://firebase.google.com/docs/firestore/understand-reads-writes-scale)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### Pitfall 6: Security Rules Allow Cross-User Data Access

**What goes wrong:** Security rules are written too broadly (e.g., `allow read, write: if request.auth != null`) which means any authenticated user can read/write any other user's budget data. In a paid multi-user app, this is a data breach.

**Why it happens:** During development, permissive rules are used for convenience and never tightened before launch. Or rules are written for the top-level collection but subcollections inherit no rules (Firestore subcollection rules do NOT inherit from parent).

**Prevention:**
- Every document path in security rules must check `request.auth.uid == resource.data.userId` or use a user-scoped collection path like `users/{userId}/envelopes/{envelopeId}` with `match /users/{userId}` and `allow read, write: if request.auth.uid == userId`
- Subcollections need explicit rules; they do NOT inherit from parent collection rules
- Use `rules_version = '2'` for recursive wildcard support
- Test security rules with the Firebase Emulator Suite's rules testing API before deploy
- Validate incoming data shape in rules: `request.resource.data.keys().hasAll(['amountCents', 'envelopeId'])` prevents write of arbitrary fields

**Detection:**
- Firebase Emulator rules test suite: write tests that assert user A cannot read user B's data
- Firebase console security rules simulator
- Periodic audit: grep rules for `auth != null` without further uid comparison

**Confidence:** HIGH -- verified via official Firebase security rules documentation.

**Phase:** Must be established when data model is created. Security rules deploy with the Firestore schema.

**Sources:**
- [Firebase: Security rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firebase: Structuring security rules](https://firebase.google.com/docs/firestore/security/rules-structure)
- [Firebase: Fix insecure rules](https://firebase.google.com/docs/firestore/enterprise/security/insecure-rules)

---

### Pitfall 7: Denormalized Data Gets Out of Sync

**What goes wrong:** Because Firestore has no joins, you denormalize data (e.g., store `envelopeName` inside each transaction document, or store `spentCents` as a running total on the envelope document). When the source of truth changes (envelope renamed, transaction deleted), the denormalized copies are not updated, creating inconsistency.

**Why it happens:** Denormalization is necessary in Firestore for performant reads, but every denormalized field creates a write obligation. Without discipline, some update paths miss denormalized copies.

**Prevention:**
- Document every denormalized field and its source of truth in a "data dictionary"
- Prefer computed/derived fields that can be recalculated from transactions (e.g., `spentCents` can be recomputed by summing transaction amounts) over fields that cannot be recalculated
- Use Firestore transactions or batched writes to update denormalized data atomically with the source
- Build a "reconciliation" function for each denormalized aggregate that recomputes from source documents. Run periodically or on-demand
- Minimize denormalization. For a single-user budgeting app, the read volume is low enough that some client-side aggregation (summing transactions to get envelope spent) may be acceptable

**Detection:**
- Reconciliation function that compares aggregated totals with stored totals
- Integration test: modify source data, verify denormalized copies updated
- Monitoring: flag cases where `spentCents !== sum(transaction amounts)`

**Confidence:** HIGH -- denormalization consistency challenges are extensively documented in Firebase literature.

**Phase:** Data model design phase. The denormalization strategy must be decided upfront.

**Sources:**
- [Firebase Blog: Denormalizing Your Data is Normal](https://firebase.googleblog.com/2013/04/denormalizing-your-data-is-normal.html)
- [Firebase is Awesome Until Denormalization Happened](https://joe-cajandab.medium.com/firebase-is-awesome-until-denormalization-happened-b4ff5f23912)

---

### Pitfall 8: Firestore Listener Costs Spiral from Broad Queries

**What goes wrong:** Using `onSnapshot` on an entire collection (e.g., all transactions for a user) means every time any document changes, all documents are re-read on initial connection. If the user has hundreds of transactions across many weeks, every session start incurs hundreds of reads.

**Why it happens:** Developers use broad listeners for convenience during prototyping and never scope them down. Firestore charges per document read, including the initial snapshot and every reconnection after 30+ minutes offline.

**Consequences:**
- Free tier (50K reads/month) exhausted quickly with just a few active users
- At $0.06/100K reads, costs grow linearly with historical data volume
- Reconnection after offline period re-reads all matched documents

**Prevention:**
- Scope listeners to the current week: `where('weekId', '==', currentWeekId)` limits reads to ~20-50 documents
- Use `get()` (one-time read) for historical data; use `onSnapshot` only for the current active week
- When switching weeks in the UI, detach the old listener before attaching a new one
- Enable offline persistence so cached data serves repeat views without server reads
- Monitor read counts in the Firebase console billing dashboard

**Detection:**
- Firebase console usage dashboard showing unexpectedly high reads
- Budget alert at 50% of expected monthly spend
- Code review flag: any `onSnapshot` without a `where` clause

**Confidence:** HIGH -- Firestore billing model verified via official pricing documentation.

**Phase:** Relevant during real-time data layer implementation.

**Sources:**
- [Firebase: Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing)
- [Firebase: Get realtime updates](https://firebase.google.com/docs/firestore/query-data/listen)
- [Reducing Firestore Reads](https://medium.com/better-programming/firebase-firestore-cut-costs-by-reducing-reads-edfccb538285)

---

### Pitfall 9: Donor Envelope Goes Below Zero During Reallocation

**What goes wrong:** Overage reallocation deducts cents from donor envelopes, but the deduction exceeds the donor's remaining budget. The donor envelope balance goes negative, which is nonsensical for a budgeting app ("you have -$3.50 left for Dining").

**Why it happens:** The reallocation algorithm distributes proportionally without checking whether each donor has sufficient remaining balance. Or a race condition: two overages both try to draw from the same donor, and the second one pushes it below zero.

**Consequences:**
- Negative envelope balances confuse users
- The constraint "donor can't go below 0" is violated
- If the UI hides negative values, money silently vanishes
- Reallocation that fails midway can leave partial state

**Prevention:**
- Before executing reallocation, validate: `donorRemainingCents >= deductCents` for every donor
- If a donor has insufficient funds, cap their contribution at their remaining balance and redistribute the shortfall to other donors
- This is a multi-step algorithm: calculate ideal allocation -> cap at available -> redistribute remainder -> repeat until fully allocated or all donors exhausted
- If total available across all donors is less than the overage, surface this to the user: "Overage of $5.00 cannot be fully covered. $3.50 short."
- Wrap the entire reallocation in a Firestore transaction that reads current balances before writing deductions

**Detection:**
- Firestore security rule or Cloud Function validation: `envelope.remainingCents >= 0` after write
- Unit tests: overage exceeds all donor budgets, overage exceeds one donor but not others
- Assertion: no envelope balance is ever negative after any write

**Confidence:** HIGH -- this is a domain-logic constraint, not a technology-specific issue. The prevention strategy is deterministic.

**Phase:** Overage reallocation feature implementation.

---

### Pitfall 10: Stale Cached Data After Access Revocation (Billing Gate)

**What goes wrong:** User's subscription expires. The billing gate should block access. But Firestore's offline persistence cache still contains all their budget data. The client app renders cached data even though the user should be locked out, or worse, the user can make offline writes that sync when connectivity returns.

**Why it happens:** Firestore offline persistence caches documents locally. The cache is not invalidated when server-side security rules change. The client SDK may serve cached data with `fromCache: true` without checking current auth/subscription status.

**Prevention:**
- Check subscription status client-side BEFORE rendering data (don't rely solely on Firestore security rules for UX gating)
- Use a `subscriptionActive` flag in the user's auth custom claims or Firestore user document
- Client-side middleware: if subscription expired, show paywall regardless of cached data
- Security rules as the server-side enforcement: `allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.subscriptionActive == true`
- For writes, security rules absolutely must enforce billing gate -- client-side checks are supplementary
- Consider `disableNetwork()` / `clearPersistence()` on subscription expiration if strict lockout is required

**Detection:**
- Test: expire a subscription, verify app shows paywall (not cached data)
- Test: expire subscription, make offline write, go online -- verify write is rejected by security rules
- Monitor Cloud Functions for writes from expired subscribers

**Confidence:** MEDIUM -- the general pattern is documented, but the interaction between offline cache and security rule changes has edge cases that require testing against the specific Firebase SDK version.

**Phase:** Billing integration phase.

**Sources:**
- [Firebase: Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase JS SDK: Strong consistency issue](https://github.com/firebase/firebase-js-sdk/issues/5895)

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without major rework.

---

### Pitfall 11: weekId Format Inconsistency

**What goes wrong:** Different parts of the codebase compute `weekId` strings differently. One uses ISO week numbering (weeks start Monday), another uses Sunday-start weeks. The IDs don't match, causing queries to return wrong data.

**Prevention:**
- Define a single `getWeekId(date: Date, timezone: string): string` utility function
- Use a custom format, not ISO weeks (ISO 8601 weeks start Monday, your app starts Sunday)
- Recommended format: `"YYYY-Www"` where `ww` is the Sunday-start week number, computed consistently via date-fns with `weekStartsOn: 0`
- Alternative: use the Sunday date itself as the weekId: `"2026-02-08"` (the Sunday). This is unambiguous and timezone-aware if computed in the user's timezone
- Export this function from a shared utility module; never compute weekId inline

**Detection:**
- grep for any direct `getDay()` or `startOfWeek()` call that doesn't go through the shared utility

**Confidence:** HIGH

**Phase:** Phase 1 utility module.

---

### Pitfall 12: Security Rules Propagation Delay

**What goes wrong:** You deploy updated security rules and immediately test. The test fails because rules take up to 1 minute for new queries and up to 10 minutes to fully propagate to active listeners.

**Prevention:**
- After deploying security rules, wait at least 1 minute before testing via the client
- For CI/CD, use the Firebase Emulator for rules testing (instantaneous) rather than testing against production/staging
- Never rely on "I just deployed rules" for security -- test against the emulator in CI

**Detection:**
- Flaky CI tests that pass sometimes after rules deploy

**Confidence:** HIGH -- propagation delay is documented in official Firebase docs.

**Phase:** Any phase deploying security rules.

---

### Pitfall 13: Firestore Index Limits for Compound Queries

**What goes wrong:** Queries like `where('envelopeId', '==', x).where('weekId', '==', y).orderBy('createdAt')` require a composite index. Without it, the query throws an error at runtime. Developers discover this in production.

**Prevention:**
- The Firestore SDK error message includes a direct URL to create the missing index -- always check console output during development
- Define all expected queries upfront in `firestore.indexes.json` and deploy with `firebase deploy --only firestore:indexes`
- Keep query patterns simple: user-scoped collection + weekId filter covers most needs
- Composite index limits: 200 composite indexes per database (unlikely to hit for this app, but worth knowing)

**Detection:**
- Integration tests that run every query pattern and fail if missing indexes

**Confidence:** HIGH -- composite index requirement is well-documented.

**Phase:** Data model and query design phase.

---

### Pitfall 14: Accidental Money Multiplication on Transaction Edits

**What goes wrong:** User edits a transaction amount from $15.00 to $20.00. The code adds $20.00 to the envelope's `spentCents` without first subtracting the old $15.00. The envelope now shows $35.00 spent instead of $20.00.

**Prevention:**
- Transaction edits must compute the delta: `newAmountCents - oldAmountCents` and apply that delta to the envelope
- Use `FieldValue.increment(deltaCents)` rather than reading and rewriting the total
- Alternatively, always recompute `spentCents` from the sum of all transactions (eliminates drift but costs more reads)
- Integration test: edit transaction amount, verify envelope total is correct

**Detection:**
- Unit test: create transaction, edit amount, verify envelope balance equals new amount (not old + new)
- Reconciliation function catches the drift

**Confidence:** HIGH

**Phase:** Transaction CRUD implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Data model design | Floating-point currency (P1), weekId format (P11), denormalization strategy (P7) | Establish cents-everywhere convention, shared weekId utility, data dictionary documenting all denormalized fields |
| Security rules | Cross-user access (P6), subcollection inheritance gap, propagation delay (P12) | User-scoped collection paths, explicit subcollection rules, emulator-based testing |
| Transaction logging | Contention on envelope docs (P5), edit delta bugs (P14) | FieldValue.increment for counters, delta-based edits |
| Overage reallocation | Lost penny (P2), donor below zero (P9), delete reversal (P4) | Largest remainder method, donor balance validation, atomic transaction for reallocation + reversal |
| Week boundary logic | Timezone misassignment (P3), inconsistent weekId (P11) | TZDate from date-fns v4, user timezone stored in profile, single getWeekId utility |
| Billing integration | Stale cache after revocation (P10) | Client-side subscription check + server-side security rule enforcement |
| Real-time listeners | Cost spiral (P8) | Scope listeners to current weekId, use get() for historical data |
| Index management | Missing composite indexes (P13) | Define indexes in firestore.indexes.json, integration test all query patterns |

---

## Invariants to Enforce

These are system-wide correctness properties that should be verified continuously, not just at the point of each pitfall:

| Invariant | Description | Enforcement |
|-----------|-------------|-------------|
| Cents integrity | All monetary values are integers | Security rules (`is int`), TypeScript types, runtime assertions |
| Allocation sum | `sum(allocation parts) === overage amount` | Assertion before every Firestore write |
| Envelope non-negative | No envelope balance goes below 0 after reallocation | Pre-write validation in reallocation logic |
| User isolation | User A cannot read/write User B's data | Security rules + emulator tests |
| Week consistency | Same timestamp always produces same weekId | Single utility function, timezone-aware |
| Edit idempotency | Editing a transaction produces correct totals regardless of edit count | Delta-based updates, reconciliation function |

---

## Sources

### Official Firebase Documentation (HIGH confidence)
- [Firebase: Transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firebase: Transaction data contention](https://firebase.google.com/docs/firestore/transaction-data-contention)
- [Firebase: Understand reads and writes at scale](https://firebase.google.com/docs/firestore/understand-reads-writes-scale)
- [Firebase: Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing)
- [Firebase: Security rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firebase: Structuring security rules](https://firebase.google.com/docs/firestore/security/rules-structure)
- [Firebase: Delete data](https://firebase.google.com/docs/firestore/manage-data/delete-data)
- [Firebase: Access data offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase: Incrementing Values Atomically](https://firebase.blog/posts/2019/03/increment-server-side-cloud-firestore/)
- [Firebase Blog: Denormalizing Your Data is Normal](https://firebase.googleblog.com/2013/04/denormalizing-your-data-is-normal.html)

### Verified Engineering Sources (MEDIUM-HIGH confidence)
- [Shopify: 8 Tips for Hanging Pennies](https://shopify.engineering/eight-tips-for-hanging-pennies)
- [date-fns v4 timezone support](https://blog.date-fns.org/v40-with-time-zone-support/)
- [How to Handle Monetary Values in JavaScript](https://frontstuff.io/how-to-handle-monetary-values-in-javascript)
- [Currency Calculations in JavaScript](https://www.honeybadger.io/blog/currency-money-calculations-in-javascript/)

### Community Sources (MEDIUM confidence)
- [Handling Dates in JavaScript the Wrong Way](https://medium.com/@raphael.moutard/handling-dates-in-javascript-the-wrong-way-d98cb2835200)
- [Firebase is Awesome Until Denormalization Happened](https://joe-cajandab.medium.com/firebase-is-awesome-until-denormalization-happened-b4ff5f23912)
- [Managing Firestore Subcollections After Parent Deletion](https://medium.com/@max980203/managing-firestore-subcollections-after-parent-document-deletion-a-practical-guide-7ae305905be6)
