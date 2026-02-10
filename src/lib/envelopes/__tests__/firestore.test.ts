import { describe, expect, it } from "vitest";
import {
  computeEnvelopeStatus,
  computeSavingsForWeek,
  computeCumulativeSavingsFromData,
  computeWeeklySavingsBreakdown,
  buildPivotRows,
  validateAllocations,
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

// ---------------------------------------------------------------------------
// validateAllocations
// ---------------------------------------------------------------------------

describe("validateAllocations", () => {
  it("returns valid when allocations exactly equal overage and within donor balances", () => {
    const result = validateAllocations(
      [
        { donorEnvelopeId: "d1", amountCents: 3000 },
        { donorEnvelopeId: "d2", amountCents: 2000 },
      ],
      5000,
      new Map([["d1", 10000], ["d2", 5000]]),
    );
    expect(result).toEqual({ valid: true });
  });

  it("returns error when total allocated is less than overage", () => {
    const result = validateAllocations(
      [{ donorEnvelopeId: "d1", amountCents: 2000 }],
      5000,
      new Map([["d1", 10000]]),
    );
    expect(result).toEqual({
      valid: false,
      errors: ["Total allocated (2000) does not equal overage (5000)"],
    });
  });

  it("returns error when total allocated exceeds overage", () => {
    const result = validateAllocations(
      [{ donorEnvelopeId: "d1", amountCents: 6000 }],
      5000,
      new Map([["d1", 10000]]),
    );
    expect(result).toEqual({
      valid: false,
      errors: ["Total allocated (6000) does not equal overage (5000)"],
    });
  });

  it("returns error when allocation exceeds donor remaining balance", () => {
    const result = validateAllocations(
      [{ donorEnvelopeId: "d1", amountCents: 5000 }],
      5000,
      new Map([["d1", 3000]]),
    );
    expect(result).toEqual({
      valid: false,
      errors: ["Allocation for d1 (5000) exceeds remaining balance (3000)"],
    });
  });

  it("returns error when donor envelope is not found", () => {
    const result = validateAllocations(
      [{ donorEnvelopeId: "unknown", amountCents: 1000 }],
      1000,
      new Map(),
    );
    expect(result).toEqual({
      valid: false,
      errors: ["Donor envelope unknown not found"],
    });
  });

  it("returns error for empty allocations array", () => {
    const result = validateAllocations([], 1000, new Map());
    expect(result).toEqual({
      valid: false,
      errors: ["No allocations provided"],
    });
  });

  it("returns multiple errors when multiple constraints are violated", () => {
    const result = validateAllocations(
      [
        { donorEnvelopeId: "d1", amountCents: 4000 },
        { donorEnvelopeId: "unknown", amountCents: 3000 },
      ],
      5000,
      new Map([["d1", 2000]]),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      // d1 exceeds balance, unknown not found, sum 7000 != 5000
      expect(result.errors).toContain("Allocation for d1 (4000) exceeds remaining balance (2000)");
      expect(result.errors).toContain("Donor envelope unknown not found");
      expect(result.errors).toContain("Total allocated (7000) does not equal overage (5000)");
      expect(result.errors).toHaveLength(3);
    }
  });
});

// ---------------------------------------------------------------------------
// computeEnvelopeStatus with allocations
// ---------------------------------------------------------------------------

describe("computeEnvelopeStatus with allocations", () => {
  it("is backward compatible with no allocations (defaults to 0)", () => {
    const today = new Date(2026, 1, 8); // Sunday
    const result = computeEnvelopeStatus(10000, 3000, today);
    expect(result.remainingCents).toBe(7000);
  });

  it("adds received allocations to remaining balance", () => {
    // budget 10000 - spent 12000 + received 5000 = 3000
    const today = new Date(2026, 1, 8); // Sunday
    const result = computeEnvelopeStatus(10000, 12000, today, 5000, 0);
    expect(result.remainingCents).toBe(3000);
  });

  it("subtracts donated allocations from remaining balance", () => {
    // budget 10000 - spent 3000 - donated 4000 = 3000
    const today = new Date(2026, 1, 8); // Sunday
    const result = computeEnvelopeStatus(10000, 3000, today, 0, 4000);
    expect(result.remainingCents).toBe(3000);
  });

  it("handles both received and donated allocations", () => {
    // budget 10000 - spent 5000 + received 2000 - donated 3000 = 4000
    const today = new Date(2026, 1, 8); // Sunday
    const result = computeEnvelopeStatus(10000, 5000, today, 2000, 3000);
    expect(result.remainingCents).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklySavingsBreakdown
// ---------------------------------------------------------------------------

describe("computeWeeklySavingsBreakdown", () => {
  it("returns empty array when no envelopes exist", () => {
    const result = computeWeeklySavingsBreakdown([], [], "2026-01-04", "2026-02-08");
    expect(result).toEqual([]);
  });

  it("returns one entry with full budget as savings when single week with no transactions", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // One completed week: Jan 4 (Sun) - Jan 10 (Sat), currentWeekStart = Jan 11
    const result = computeWeeklySavingsBreakdown(envelopes, transactions, "2026-01-04", "2026-01-11");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      weekStart: "2026-01-04",
      weekLabel: "Wk 2",
      savingsCents: 5000,
      cumulativeCents: 5000,
    });
  });

  it("computes correct per-week and cumulative totals across multiple weeks", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 10000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions = [
      { envelopeId: "e1", amountCents: 3000, date: "2026-01-05" }, // Week 1: spent 3000, saved 7000
      { envelopeId: "e1", amountCents: 8000, date: "2026-01-12" }, // Week 2: spent 8000, saved 2000
    ];
    // Two completed weeks: Jan 4-10 and Jan 11-17
    const result = computeWeeklySavingsBreakdown(envelopes, transactions, "2026-01-04", "2026-01-18");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      weekStart: "2026-01-04",
      weekLabel: "Wk 2",
      savingsCents: 7000,
      cumulativeCents: 7000,
    });
    expect(result[1]).toEqual({
      weekStart: "2026-01-11",
      weekLabel: "Wk 3",
      savingsCents: 2000,
      cumulativeCents: 9000,
    });
  });

  it("excludes rollover envelopes from savings (delegates to computeSavingsForWeek)", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-01" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: true, createdAt: "2026-01-01" },
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    const result = computeWeeklySavingsBreakdown(envelopes, transactions, "2026-01-04", "2026-01-11");
    expect(result).toHaveLength(1);
    expect(result[0].savingsCents).toBe(5000); // only e1 counted
  });

  it("only counts envelopes from their creation week onward", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 5000, rollover: false, createdAt: "2026-01-04" },
      { id: "e2", weeklyBudgetCents: 3000, rollover: false, createdAt: "2026-01-12" }, // created in week 2
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    // Week 1 (Jan 4-10): only e1 => 5000
    // Week 2 (Jan 11-17): e1 + e2 => 8000
    const result = computeWeeklySavingsBreakdown(envelopes, transactions, "2026-01-04", "2026-01-18");
    expect(result).toHaveLength(2);
    expect(result[0].savingsCents).toBe(5000);
    expect(result[0].cumulativeCents).toBe(5000);
    expect(result[1].savingsCents).toBe(8000);
    expect(result[1].cumulativeCents).toBe(13000);
  });

  it("returns entries in chronological order (oldest first)", () => {
    const envelopes = [
      { id: "e1", weeklyBudgetCents: 1000, rollover: false, createdAt: "2026-01-01" },
    ];
    const transactions: { envelopeId: string; amountCents: number; date: string }[] = [];
    const result = computeWeeklySavingsBreakdown(envelopes, transactions, "2026-01-04", "2026-01-25");
    // 3 weeks: Jan 4, Jan 11, Jan 18
    expect(result).toHaveLength(3);
    expect(result[0].weekStart).toBe("2026-01-04");
    expect(result[1].weekStart).toBe("2026-01-11");
    expect(result[2].weekStart).toBe("2026-01-18");
  });
});

// ---------------------------------------------------------------------------
// buildPivotRows
// ---------------------------------------------------------------------------

describe("buildPivotRows", () => {
  it("returns empty array when no transactions exist", () => {
    const result = buildPivotRows([], "2026-01-04", "2026-01-10");
    expect(result).toEqual([]);
  });

  it("returns one row with one cell for a single transaction", () => {
    const transactions = [
      { envelopeId: "e1", amountCents: 2500, date: "2026-01-06" },
    ];
    // Week: Jan 4-10 (Sun-Sat)
    const result = buildPivotRows(transactions, "2026-01-04", "2026-01-10");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      weekStart: "2026-01-04",
      weekLabel: "Wk 2",
      cells: { e1: 2500 },
      totalCents: 2500,
    });
  });

  it("groups transactions across 3 weeks and 2 envelopes, newest first", () => {
    const transactions = [
      { envelopeId: "e1", amountCents: 1000, date: "2026-01-05" }, // Week 1
      { envelopeId: "e2", amountCents: 2000, date: "2026-01-06" }, // Week 1
      { envelopeId: "e1", amountCents: 3000, date: "2026-01-12" }, // Week 2
      { envelopeId: "e1", amountCents: 500, date: "2026-01-19" },  // Week 3
      { envelopeId: "e2", amountCents: 1500, date: "2026-01-20" }, // Week 3
    ];
    // Range: Jan 4 (Sun) through Jan 24 (Sat)
    const result = buildPivotRows(transactions, "2026-01-04", "2026-01-24");
    expect(result).toHaveLength(3);

    // Newest first: Week 3 (Jan 18), Week 2 (Jan 11), Week 1 (Jan 4)
    expect(result[0].weekStart).toBe("2026-01-18");
    expect(result[0].cells).toEqual({ e1: 500, e2: 1500 });
    expect(result[0].totalCents).toBe(2000);

    expect(result[1].weekStart).toBe("2026-01-11");
    expect(result[1].cells).toEqual({ e1: 3000 });
    expect(result[1].totalCents).toBe(3000);

    expect(result[2].weekStart).toBe("2026-01-04");
    expect(result[2].cells).toEqual({ e1: 1000, e2: 2000 });
    expect(result[2].totalCents).toBe(3000);
  });

  it("sums multiple transactions in same week and same envelope", () => {
    const transactions = [
      { envelopeId: "e1", amountCents: 1000, date: "2026-01-05" },
      { envelopeId: "e1", amountCents: 2000, date: "2026-01-07" },
      { envelopeId: "e1", amountCents: 500, date: "2026-01-09" },
    ];
    const result = buildPivotRows(transactions, "2026-01-04", "2026-01-10");
    expect(result).toHaveLength(1);
    expect(result[0].cells).toEqual({ e1: 3500 });
    expect(result[0].totalCents).toBe(3500);
  });

  it("omits weeks with no transactions", () => {
    const transactions = [
      { envelopeId: "e1", amountCents: 1000, date: "2026-01-05" }, // Week 1
      // Week 2 (Jan 11-17): no transactions
      { envelopeId: "e1", amountCents: 2000, date: "2026-01-19" }, // Week 3
    ];
    // Range covers 3 weeks, but week 2 has no transactions
    const result = buildPivotRows(transactions, "2026-01-04", "2026-01-24");
    expect(result).toHaveLength(2);
    // Newest first: Week 3 then Week 1
    expect(result[0].weekStart).toBe("2026-01-18");
    expect(result[1].weekStart).toBe("2026-01-04");
  });
});
