import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";

/**
 * Week starts Sunday (weekStartsOn: 0), which is the date-fns default.
 * Explicitly set for clarity and to prevent accidental locale overrides.
 */
const WEEK_OPTIONS = { weekStartsOn: 0 as const };

/**
 * Returns the Sunday-to-Saturday range for the week containing `date`.
 * Start is Sunday 00:00:00.000, end is Saturday 23:59:59.999.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, WEEK_OPTIONS),
    end: endOfWeek(date, WEEK_OPTIONS),
  };
}

/**
 * Returns the fraction of the week remaining (0 < result <= 1).
 * Sunday = 7/7 = 1.0, Saturday = 1/7.
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
 * - "Over":     remaining <= 0
 * - "On Track": remaining >= budget * remainingDaysPercent
 * - "Watch":    remaining > 0 but less than proportional budget
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
 * Formats a week range for display: "M/D/YYYY - M/D/YYYY".
 */
export function formatWeekLabel(date: Date): string {
  const { start, end } = getWeekRange(date);
  return `${format(start, "M/d/yyyy")} - ${format(end, "M/d/yyyy")}`;
}
