import { FieldValue } from "firebase-admin/firestore";
import { addWeeks, format, startOfWeek } from "date-fns";
import { db } from "@/lib/firebase";
import {
  getWeekRange,
  getRemainingDaysPercent,
  getStatusLabel,
  formatWeekLabel,
} from "./week-math";
import type {
  Envelope,
  EnvelopeWithStatus,
  HomePageData,
} from "./types";

const WEEK_OPTIONS = { weekStartsOn: 0 as const };

function requireDb() {
  if (!db) {
    throw new Error("Firestore not available.");
  }
  return db;
}

// ---------------------------------------------------------------------------
// Collection references (for writes)
// ---------------------------------------------------------------------------

/**
 * Returns the envelopes collection reference.
 * All queries MUST filter by userId server-side.
 * userId is ALWAYS derived from verifyUser(), never from client input.
 */
export function envelopesCol() {
  return requireDb().collection("envelopes");
}

/**
 * Returns the envelope_transactions collection reference.
 */
export function transactionsCol() {
  return requireDb().collection("envelope_transactions");
}

/**
 * Returns the overage_allocations collection reference.
 */
export function allocationsCol() {
  return requireDb().collection("envelope_allocations");
}

// ---------------------------------------------------------------------------
// Query helpers (for reads)
// ---------------------------------------------------------------------------

/**
 * Returns envelopes for a specific user, ordered by sortOrder.
 */
export function envelopesForUser(userId: string) {
  return envelopesCol()
    .where("userId", "==", userId)
    .orderBy("sortOrder", "asc");
}

/**
 * Returns transactions for a specific user within a date range.
 * weekStart and weekEnd are YYYY-MM-DD strings.
 */
export function transactionsForUserInWeek(
  userId: string,
  weekStart: string,
  weekEnd: string,
) {
  return transactionsCol()
    .where("userId", "==", userId)
    .where("date", ">=", weekStart)
    .where("date", "<=", weekEnd);
}

// ---------------------------------------------------------------------------
// Pure computation helpers (testable without Firestore)
// ---------------------------------------------------------------------------

/** Minimal envelope shape needed by savings computation helpers. */
type SavingsEnvelope = {
  id: string;
  weeklyBudgetCents: number;
  rollover: boolean;
  createdAt: string;
};

/**
 * Computes remaining cents and status label for a single envelope.
 */
export function computeEnvelopeStatus(
  weeklyBudgetCents: number,
  spentCents: number,
  today: Date,
): { remainingCents: number; status: "On Track" | "Watch" | "Over" } {
  const remainingCents = weeklyBudgetCents - spentCents;
  const remainingDaysPercent = getRemainingDaysPercent(today);
  const status = getStatusLabel(
    remainingCents,
    weeklyBudgetCents,
    remainingDaysPercent,
  );
  return { remainingCents, status };
}

/**
 * Computes total savings for a single completed week across non-rollover envelopes.
 * Per-envelope savings are floored at 0 (overspending does not subtract).
 * Envelopes created after the week end are excluded.
 */
export function computeSavingsForWeek(
  envelopes: SavingsEnvelope[],
  transactions: { envelopeId: string; amountCents: number }[],
  weekStart: string,
  weekEnd: string,
): number {
  let totalSavings = 0;

  for (const env of envelopes) {
    // Skip rollover envelopes -- savings only apply to non-rollover
    if (env.rollover) continue;

    // Skip envelopes created after this week ended
    if (env.createdAt > weekEnd) continue;

    const spent = transactions
      .filter((t) => t.envelopeId === env.id)
      .reduce((sum, t) => sum + t.amountCents, 0);

    const unspent = Math.max(0, env.weeklyBudgetCents - spent);
    totalSavings += unspent;
  }

  return totalSavings;
}

/**
 * Computes cumulative savings across all completed weeks from earliestWeekStart
 * to currentWeekStart (exclusive -- current week is not counted).
 *
 * @param envelopes - All envelopes with id, weeklyBudgetCents, rollover, createdAt (YYYY-MM-DD)
 * @param transactions - All transactions with envelopeId, amountCents, date (YYYY-MM-DD)
 * @param earliestWeekStart - YYYY-MM-DD of the Sunday starting the earliest week
 * @param currentWeekStart - YYYY-MM-DD of the Sunday starting the current week
 */
export function computeCumulativeSavingsFromData(
  envelopes: SavingsEnvelope[],
  transactions: { envelopeId: string; amountCents: number; date: string }[],
  earliestWeekStart: string,
  currentWeekStart: string,
): number {
  if (envelopes.length === 0) return 0;

  let totalSavings = 0;
  let weekStart = earliestWeekStart;

  while (weekStart < currentWeekStart) {
    // Compute end of this week (Saturday) as YYYY-MM-DD
    const weekStartDate = new Date(weekStart + "T00:00:00");
    const nextWeekDate = addWeeks(weekStartDate, 1);
    const weekEnd = format(
      new Date(nextWeekDate.getTime() - 86_400_000),
      "yyyy-MM-dd",
    );

    // Filter transactions for this week
    const weekTransactions = transactions.filter(
      (t) => t.date >= weekStart && t.date <= weekEnd,
    );

    totalSavings += computeSavingsForWeek(
      envelopes,
      weekTransactions,
      weekStart,
      weekEnd,
    );

    // Move to next week
    weekStart = format(nextWeekDate, "yyyy-MM-dd");
  }

  return totalSavings;
}

// ---------------------------------------------------------------------------
// CRUD operations (depend on Firestore)
// ---------------------------------------------------------------------------

/**
 * Creates a new envelope for the given user.
 * Assigns sortOrder as maxExisting + 1.
 */
export async function createEnvelope(
  userId: string,
  input: { title: string; weeklyBudgetCents: number },
): Promise<Envelope> {
  const existing = await envelopesForUser(userId).get();
  let maxSort = -1;
  for (const doc of existing.docs) {
    const data = doc.data();
    if (typeof data.sortOrder === "number" && data.sortOrder > maxSort) {
      maxSort = data.sortOrder;
    }
  }

  const docRef = envelopesCol().doc();
  const envelope = {
    userId,
    title: input.title,
    weeklyBudgetCents: input.weeklyBudgetCents,
    sortOrder: maxSort + 1,
    rollover: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(envelope);

  // Return the created envelope with its ID (timestamps will be server-set)
  const snap = await docRef.get();
  return { id: docRef.id, ...snap.data() } as Envelope;
}

/**
 * Updates an existing envelope. Verifies ownership before modifying.
 * Only updates provided fields.
 */
export async function updateEnvelope(
  userId: string,
  envelopeId: string,
  input: Partial<{
    title: string;
    weeklyBudgetCents: number;
    rollover: boolean;
  }>,
): Promise<void> {
  const docRef = envelopesCol().doc(envelopeId);
  const snap = await docRef.get();

  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Envelope not found or access denied.");
  }

  await docRef.update({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Deletes an envelope and all related transactions and allocations atomically.
 * Verifies ownership before deleting. Splits into multiple batches if > 450 ops.
 */
export async function deleteEnvelope(
  userId: string,
  envelopeId: string,
): Promise<void> {
  const docRef = envelopesCol().doc(envelopeId);
  const snap = await docRef.get();

  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Envelope not found or access denied.");
  }

  // Find all related transactions
  const txSnap = await transactionsCol()
    .where("userId", "==", userId)
    .where("envelopeId", "==", envelopeId)
    .get();

  const transactionIds = txSnap.docs.map((d) => d.id);

  // Find all related allocations (by donorEnvelopeId)
  const allocByDonor = await allocationsCol()
    .where("donorEnvelopeId", "==", envelopeId)
    .get();

  // Find allocations by sourceTransactionId (for any of the envelope's transactions)
  const allocByTx: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (transactionIds.length > 0) {
    // Firestore 'in' queries support up to 30 values; chunk if needed
    for (let i = 0; i < transactionIds.length; i += 30) {
      const chunk = transactionIds.slice(i, i + 30);
      const snap = await allocationsCol()
        .where("sourceTransactionId", "in", chunk)
        .get();
      allocByTx.push(...snap.docs);
    }
  }

  // Deduplicate allocation refs from both queries
  const seenPaths = new Set<string>();
  const uniqueAllocRefs: FirebaseFirestore.DocumentReference[] = [];
  for (const doc of [...allocByDonor.docs, ...allocByTx]) {
    if (!seenPaths.has(doc.ref.path)) {
      seenPaths.add(doc.ref.path);
      uniqueAllocRefs.push(doc.ref);
    }
  }

  const deleteRefs = [docRef, ...txSnap.docs.map((d) => d.ref), ...uniqueAllocRefs];

  // Batch delete (max 500 ops per batch, use 450 for safety)
  const BATCH_LIMIT = 450;
  for (let i = 0; i < deleteRefs.length; i += BATCH_LIMIT) {
    const batch = requireDb().batch();
    const chunk = deleteRefs.slice(i, i + BATCH_LIMIT);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

/**
 * Reorders envelopes by assigning sequential sortOrder values.
 * orderedIds[0] gets sortOrder 0, orderedIds[1] gets sortOrder 1, etc.
 */
export async function reorderEnvelopes(
  userId: string,
  orderedIds: string[],
): Promise<void> {
  const batch = requireDb().batch();

  for (let i = 0; i < orderedIds.length; i++) {
    const ref = envelopesCol().doc(orderedIds[i]);
    batch.update(ref, {
      sortOrder: i,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

/**
 * Returns enriched envelope list with spent/remaining/status for current week,
 * along with the week label and cumulative savings.
 */
export async function listEnvelopesWithRemaining(
  userId: string,
): Promise<HomePageData> {
  const today = new Date();
  const { start, end } = getWeekRange(today);
  const weekStartStr = format(start, "yyyy-MM-dd");
  const weekEndStr = format(end, "yyyy-MM-dd");

  // Parallel fetch: envelopes and transactions for current week
  const [envSnap, txSnap] = await Promise.all([
    envelopesForUser(userId).get(),
    transactionsForUserInWeek(userId, weekStartStr, weekEndStr).get(),
  ]);

  // Build transaction sums by envelopeId
  const spentByEnvelope = new Map<string, number>();
  for (const doc of txSnap.docs) {
    const data = doc.data();
    const envId = data.envelopeId as string;
    spentByEnvelope.set(envId, (spentByEnvelope.get(envId) ?? 0) + (data.amountCents as number));
  }

  // Enrich envelopes with computed fields
  const envelopes: EnvelopeWithStatus[] = envSnap.docs.map((doc) => {
    const data = doc.data() as Omit<Envelope, "id">;
    const spentCents = spentByEnvelope.get(doc.id) ?? 0;
    const { remainingCents, status } = computeEnvelopeStatus(
      data.weeklyBudgetCents,
      spentCents,
      today,
    );

    return {
      id: doc.id,
      ...data,
      spentCents,
      remainingCents,
      status,
    } as EnvelopeWithStatus;
  });

  const cumulativeSavingsCents = await computeCumulativeSavings(userId);

  return {
    envelopes,
    weekLabel: formatWeekLabel(today),
    cumulativeSavingsCents,
  };
}

/**
 * Computes total cumulative savings from all completed past weeks.
 * Only non-rollover envelopes contribute to savings.
 * Per-envelope savings are floored at 0 per week.
 */
export async function computeCumulativeSavings(
  userId: string,
): Promise<number> {
  const envSnap = await envelopesForUser(userId).get();

  if (envSnap.empty) return 0;

  // Find earliest createdAt across all envelopes
  let earliestDate: Date | null = null;
  const envelopeData: SavingsEnvelope[] = [];

  for (const doc of envSnap.docs) {
    const data = doc.data();
    const createdAt = data.createdAt?.toDate?.() ?? new Date();
    if (!earliestDate || createdAt < earliestDate) {
      earliestDate = createdAt;
    }
    envelopeData.push({
      id: doc.id,
      weeklyBudgetCents: data.weeklyBudgetCents as number,
      rollover: data.rollover as boolean,
      createdAt: format(createdAt, "yyyy-MM-dd"),
    });
  }

  const earliest = earliestDate as Date;
  const earliestWeekStart = startOfWeek(earliest, WEEK_OPTIONS);
  const currentWeekStart = startOfWeek(new Date(), WEEK_OPTIONS);

  const earliestStr = format(earliestWeekStart, "yyyy-MM-dd");
  const currentStr = format(currentWeekStart, "yyyy-MM-dd");

  if (earliestStr >= currentStr) return 0;

  // Fetch all transactions in the range
  const txSnap = await transactionsCol()
    .where("userId", "==", userId)
    .where("date", ">=", earliestStr)
    .where("date", "<", currentStr)
    .get();

  const transactions = txSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      envelopeId: data.envelopeId as string,
      amountCents: data.amountCents as number,
      date: data.date as string,
    };
  });

  return computeCumulativeSavingsFromData(
    envelopeData,
    transactions,
    earliestStr,
    currentStr,
  );
}
