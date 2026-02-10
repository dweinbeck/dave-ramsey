import { describe, expect, it } from "vitest";
import {
  envelopeSchema,
  transactionSchema,
  transactionUpdateSchema,
} from "../types";

describe("envelopeSchema", () => {
  it("accepts valid input", () => {
    const result = envelopeSchema.safeParse({
      title: "Groceries",
      weeklyBudgetCents: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = envelopeSchema.safeParse({
      title: "",
      weeklyBudgetCents: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero budget", () => {
    const result = envelopeSchema.safeParse({
      title: "Groceries",
      weeklyBudgetCents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", () => {
    const result = envelopeSchema.safeParse({
      title: "Groceries",
      weeklyBudgetCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer budget (floating point)", () => {
    const result = envelopeSchema.safeParse({
      title: "Groceries",
      weeklyBudgetCents: 10.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = envelopeSchema.safeParse({
      weeklyBudgetCents: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts title at max length (100 chars)", () => {
    const result = envelopeSchema.safeParse({
      title: "a".repeat(100),
      weeklyBudgetCents: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects title over max length (101 chars)", () => {
    const result = envelopeSchema.safeParse({
      title: "a".repeat(101),
      weeklyBudgetCents: 5000,
    });
    expect(result.success).toBe(false);
  });
});

describe("transactionSchema", () => {
  it("accepts valid input", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 1050,
      date: "2026-02-10",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with optional fields", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 1050,
      date: "2026-02-10",
      merchant: "Costco",
      description: "Weekly groceries",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing envelopeId", () => {
    const result = transactionSchema.safeParse({
      amountCents: 1050,
      date: "2026-02-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 0,
      date: "2026-02-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer amount", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 10.5,
      date: "2026-02-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format (MM/DD/YYYY)", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 1050,
      date: "02/10/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format (no dashes)", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 1050,
      date: "20260210",
    });
    expect(result.success).toBe(false);
  });

  it("accepts date with valid YYYY-MM-DD format", () => {
    const result = transactionSchema.safeParse({
      envelopeId: "abc123",
      amountCents: 500,
      date: "2025-12-31",
    });
    expect(result.success).toBe(true);
  });
});

describe("transactionUpdateSchema", () => {
  it("accepts a single optional field", () => {
    const result = transactionUpdateSchema.safeParse({ amountCents: 500 });
    expect(result.success).toBe(true);
  });

  it("accepts multiple optional fields", () => {
    const result = transactionUpdateSchema.safeParse({
      envelopeId: "abc",
      amountCents: 1500,
      date: "2026-02-10",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all fields optional)", () => {
    const result = transactionUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects amountCents of 0 (min 1)", () => {
    const result = transactionUpdateSchema.safeParse({ amountCents: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format (MM-DD-YYYY)", () => {
    const result = transactionUpdateSchema.safeParse({ date: "02-10-2026" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer amountCents", () => {
    const result = transactionUpdateSchema.safeParse({ amountCents: 12.5 });
    expect(result.success).toBe(false);
  });
});
