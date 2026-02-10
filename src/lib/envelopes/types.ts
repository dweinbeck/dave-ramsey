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

/** Single donor allocation within an overage reallocation. */
export const donorAllocationSchema = z.object({
  donorEnvelopeId: z.string().min(1),
  amountCents: z.number().int().min(1), // positive integer cents
});

/** Overage allocation input: source transaction + where to pull funds from. */
export const overageAllocationSchema = z.object({
  sourceTransactionId: z.string().min(1),
  allocations: z.array(donorAllocationSchema).min(1),
});
export type OverageAllocationInput = z.infer<typeof overageAllocationSchema>;

/** Result of validating an allocation request. */
export type AllocationValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

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

// ---------------------------------------------------------------------------
// Analytics types (used by GET /api/envelopes/analytics)
// ---------------------------------------------------------------------------

/** Single row in the weekly savings breakdown (for savings chart). */
export type WeeklySavingsEntry = {
  weekStart: string; // "2026-01-05" (YYYY-MM-DD)
  weekLabel: string; // "Wk 2"
  savingsCents: number; // savings for this single week
  cumulativeCents: number; // running total through this week
};

/** Single row in the weekly pivot table. */
export type PivotRow = {
  weekStart: string; // "2026-01-05" (YYYY-MM-DD)
  weekLabel: string; // "Wk 2"
  cells: Record<string, number>; // envelopeId -> sum of transaction amountCents
  totalCents: number; // sum across all envelopes for this week
};

/** Response shape for GET /api/envelopes/analytics. */
export type AnalyticsPageData = {
  summary: {
    totalSpentCents: number;
    totalBudgetCents: number;
    totalRemainingCents: number;
    onTrackCount: number;
    totalEnvelopeCount: number;
  };
  envelopes: { id: string; title: string }[]; // column headers for pivot table
  pivotRows: PivotRow[]; // rows, newest week first
  savingsByWeek: WeeklySavingsEntry[]; // oldest first (for chart x-axis)
};
