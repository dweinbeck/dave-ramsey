import { describe, expect, it } from "vitest";
import {
  computeEnvelopeStatus,
  computeSavingsForWeek,
  computeCumulativeSavingsFromData,
} from "../firestore";

// ---------------------------------------------------------------------------
// computeEnvelopeStatus
// ---------------------------------------------------------------------------

describe("computeEnvelopeStatus", () => {
  it("returns correct remaining and 'On Track' when budget is intact on Sunday", () => {
    // Sunday = 7/7 remaining, budget 10000, spent 0
    const today = new Date(2026, 1, 8); // Sunday Feb 8
    const result = computeEnvelopeStatus(10000, 0, today);
    expect(result.remainingCents).toBe(10000);
    expect(result.status).toBe("On Track");
  });

  it("returns 'Over' when spent exceeds budget", () => {
    const today = new Date(2026, 1, 11); // Wednesday
    const result = computeEnvelopeStatus(5000, 6000, today);
    expect(result.remainingCents).toBe(-1000);
    expect(result.status).toBe("Over");
  });

  it("returns 'Over' when spent equals budget exactly", () => {
    const today = new Date(2026, 1, 11); // Wednesday
    const result = computeEnvelopeStatus(5000, 5000, today);
    expect(result.remainingCents).toBe(0);
    expect(result.status).toBe("Over");
  });

  it("returns 'Watch' when remaining is positive but below proportional budget", () => {
    // Wednesday = 4/7 remaining, budget 7000, spent 5000, remaining 2000
    // proportional = 7000 * 4/7 = 4000, remaining 2000 < 4000 => Watch
    const today = new Date(2026, 1, 11); // Wednesday
    const result = computeEnvelopeStatus(7000, 5000, today);
    expect(result.remainingCents).toBe(2000);
    expect(result.status).toBe("Watch");
  });

  it("returns 'On Track' when remaining meets proportional budget", () => {
    // Wednesday = 4/7 remaining, budget 7000, spent 3000, remaining 4000
    // proportional = 7000 * 4/7 = 4000, remaining 4000 >= 4000 => On Track
    const today = new Date(2026, 1, 11); // Wednesday
    const result = computeEnvelopeStatus(7000, 3000, today);
    expect(result.remainingCents).toBe(4000);
    expect(result.status).toBe("On Track");
  });

  it("handles zero budget correctly", () => {
    const today = new Date(2026, 1, 8); // Sunday
    const result = computeEnvelopeStatus(0, 0, today);
    expect(result.remainingCents).toBe(0);
    expect(result.status).toBe("Over");
  });
});

// ---------------------------------------------------------------------------
// computeSavingsForWeek
// ---------------------------------------------------------------------------

describe("computeSavingsForWeek", () => {
  const weekStart = "2026-02-08"; // Sunday
  const weekEnd = "2026-02-14"; // Saturday

  it("returns full budget as savings when no transactions exist", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions: { envelopeId: string; amountCents: number }[] = [];
    const result = computeSavingsForWeek(envelopes, transactions, weekStart, weekEnd);
    expect(result).toBe(8000); // 5000 + 3000
  });

  it("computes unspent correctly when partial spending", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions = [
      { envelopeId: "e1", amountCents: 2000 },
    ];
    const result = computeSavingsForWeek(envelopes, transactions, weekStart, weekEnd);
    expect(result).toBe(3000); // 5000 - 2000
  });

  it("ignores rollover envelopes", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: true, createdAt: "2026-01-01" },
    ];
    const transactions: { envelopeId: string; amountCents: number }[] = [];
    const result = computeSavingsForWeek(envelopes, transactions, weekStart, weekEnd);
    expect(result).toBe(5000); // only e1 counts
  });

  it("floors per-envelope savings at 0 (overspending does not subtract from savings)", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions = [
      { envelopeId: "e1", amountCents: 7000 }, // overspent by 2000
      { envelopeId: "e2", amountCents: 1000 }, // saved 2000
    ];
    const result = computeSavingsForWeek(envelopes, transactions, weekStart, weekEnd);
    expect(result).toBe(2000); // max(0, -2000) + max(0, 2000) = 0 + 2000
  });

  it("excludes envelopes created after the week", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: false, createdAt: "2026-02-15" }, // after week
    ];
    const transactions: { envelopeId: string; amountCents: number }[] = [];
    const result = computeSavingsForWeek(envelopes, transactions, weekStart, weekEnd);
    expect(result).toBe(5000); // only e1 counts since e2 was created after
  });

  it("returns 0 for empty envelopes", () => {
    const result = computeSavingsForWeek([], [], weekStart, weekEnd);
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeCumulativeSavingsFromData
// ---------------------------------------------------------------------------

describe("computeCumulativeSavingsFromData", () => {
  it("returns 0 when no envelopes exist", () => {
    const result = computeCumulativeSavingsFromData([], [], "2026-01-04", "2026-02-08");
    expect(result).toBe(0);
  });

  it("sums savings across multiple completed weeks", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 10000, rollover: false, createdAt: "2026-01-04" },
    ];
    // Two completed weeks: Jan 4-10 and Jan 11-17
    // No transactions => savings = 10000 + 10000 = 20000
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // earliestWeekStart is Jan 4 (Sunday), currentWeekStart is Jan 18 (Sunday)
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-18");
    expect(result).toBe(20000);
  });

  it("subtracts spending from savings per week", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 10000, rollover: false, createdAt: "2026-01-04" },
    ];
    const transactions = [
      { envelopeId: "e1", amountCents: 3000, date: "2026-01-05" }, // Week 1: spent 3000
      { envelopeId: "e1", amountCents: 8000, date: "2026-01-12" }, // Week 2: spent 8000
    ];
    // Week 1: 10000 - 3000 = 7000
    // Week 2: 10000 - 8000 = 2000
    // Total: 9000
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-18");
    expect(result).toBe(9000);
  });

  it("floors per-envelope savings at 0 per week", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-04" },
    ];
    const transactions = [
      { envelopeId: "e1", amountCents: 8000, date: "2026-01-06" }, // overspent
    ];
    // Week 1: max(0, 5000 - 8000) = 0
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-11");
    expect(result).toBe(0);
  });

  it("ignores rollover envelopes in savings", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-04" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: true, createdAt: "2026-01-04" },
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // One completed week: Jan 4-10
    // Only e1 counts: 5000
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-11");
    expect(result).toBe(5000);
  });

  it("does not include current week in savings calculation", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 10000, rollover: false, createdAt: "2026-01-04" },
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // earliestWeekStart and currentWeekStart are the same -- no completed weeks
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-04");
    expect(result).toBe(0);
  });

  it("only counts envelopes that existed during each week", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-04" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: false, createdAt: "2026-01-12" }, // created in week 2
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // Week 1 (Jan 4-10): only e1 => 5000
    // Week 2 (Jan 11-17): e1 + e2 => 5000 + 3000 = 8000
    // Total: 13000
    const result = computeCumulativeSavingsFromData(envelopes, transactions, "2026-01-04", "2026-01-18");
    expect(result).toBe(13000);
  });
});
