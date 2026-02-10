import { z } from "zod/v4";
import type { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Input schemas (what the client sends -- validated by Zod)
// IMPORTANT: userId is NEVER in these schemas. It is always derived server-side
// from verifyUser().
// ---------------------------------------------------------------------------

/** Envelope creation / update payload. */
export const envelopeSchema = z.object({
  title: z.string().min(1).max(100),
  weeklyBudgetCents: z.number().int().min(1), // positive integer cents
});
export type EnvelopeInput = z.infer<typeof envelopeSchema>;

/** Transaction creation payload. */
export const transactionSchema = z.object({
  envelopeId: z.string().min(1),
  amountCents: z.number().int().min(1), // positive integer cents
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  merchant: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});
export type TransactionInput = z.infer<typeof transactionSchema>;

/** Transaction partial update payload (all fields optional). */
export const transactionUpdateSchema = z.object({
  envelopeId: z.string().min(1).optional(),
  amountCents: z.number().int().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
  merchant: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;

// ---------------------------------------------------------------------------
// Firestore document shapes (what is stored)
// ---------------------------------------------------------------------------

/** Envelope Firestore document. */
export type Envelope = {
  id: string;
  userId: string;
  title: string;
  weeklyBudgetCents: number;
  sortOrder: number;
  rollover: boolean; // true = carry surplus, false = reset each week
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Transaction Firestore document. */
export type EnvelopeTransaction = {
  id: string;
  userId: string;
  envelopeId: string;
  amountCents: number;
  date: string; // YYYY-MM-DD (user-entered, no timezone issues)
  merchant?: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Overage allocation (used in Phase 4 for reallocation tracking). */
export type OverageAllocation = {
  id: string;
  userId: string;
  sourceTransactionId: string; // the transaction that caused the overage
  donorEnvelopeId: string; // the envelope donating funds
  amountCents: number; // how much was reallocated
  createdAt: Timestamp;
};

// ---------------------------------------------------------------------------
// Computed / display types (used by UI and API responses)
// ---------------------------------------------------------------------------

/** Envelope enriched with computed fields for display. */
export type EnvelopeWithStatus = Envelope & {
  spentCents: number;
  remainingCents: number;
  status: "On Track" | "Watch" | "Over";
};

/** Response shape for GET /api/envelopes (home page data). */
export type HomePageData = {
  envelopes: EnvelopeWithStatus[];
  weekLabel: string;
  cumulativeSavingsCents: number;
};

/** Response shape for GET /api/envelopes/transactions?weekStart=...&weekEnd=... */
export type TransactionsPageData = {
  transactions: EnvelopeTransaction[];
};
