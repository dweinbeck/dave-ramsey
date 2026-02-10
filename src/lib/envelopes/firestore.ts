import { db } from "@/lib/firebase";

function requireDb() {
  if (!db) {
    throw new Error("Firestore not available.");
  }
  return db;
}

/**
 * Returns the envelopes collection reference.
 * All queries MUST filter by userId server-side.
 * userId is ALWAYS derived from verifyUser(), never from client input.
 */
export function envelopesCol() {
  return requireDb().collection("envelopes");
}

/**
 * Returns envelopes for a specific user, ordered by sortOrder.
 */
export function envelopesForUser(userId: string) {
  return envelopesCol()
    .where("userId", "==", userId)
    .orderBy("sortOrder", "asc");
}

/**
 * Returns the envelope_transactions collection reference.
 */
export function transactionsCol() {
  return requireDb().collection("envelope_transactions");
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

/**
 * Returns the overage_allocations collection reference.
 */
export function allocationsCol() {
  return requireDb().collection("envelope_allocations");
}
