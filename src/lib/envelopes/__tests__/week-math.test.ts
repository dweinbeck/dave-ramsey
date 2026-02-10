import { describe, expect, it } from "vitest";
import {
  formatWeekLabel,
  getRemainingDaysPercent,
  getStatusLabel,
  getWeekNumber,
  getWeekRange,
} from "../week-math";

describe("getWeekRange", () => {
  it("returns Sunday-Saturday range when given a Sunday", () => {
    const date = new Date(2026, 1, 8); // Sunday Feb 8, 2026
    const { start, end } = getWeekRange(date);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1); // February
    expect(start.getDate()).toBe(8); // Sunday
    expect(start.getDay()).toBe(0); // Sunday

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(1); // February
    expect(end.getDate()).toBe(14); // Saturday
    expect(end.getDay()).toBe(6); // Saturday
  });

  it("returns Sunday-Saturday range when given a Wednesday", () => {
    const date = new Date(2026, 1, 11); // Wednesday Feb 11, 2026
    const { start, end } = getWeekRange(date);

    expect(start.getDate()).toBe(8); // Sunday Feb 8
    expect(start.getDay()).toBe(0);
    expect(end.getDate()).toBe(14); // Saturday Feb 14
    expect(end.getDay()).toBe(6);
  });

  it("returns Sunday-Saturday range when given a Saturday", () => {
    const date = new Date(2026, 1, 14); // Saturday Feb 14, 2026
    const { start, end } = getWeekRange(date);

    expect(start.getDate()).toBe(8); // Sunday Feb 8
    expect(start.getDay()).toBe(0);
    expect(end.getDate()).toBe(14); // Saturday Feb 14
    expect(end.getDay()).toBe(6);
  });

  it("handles year boundary correctly", () => {
    const date = new Date(2025, 11, 31); // Wednesday Dec 31, 2025
    const { start, end } = getWeekRange(date);

    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // December
    expect(start.getDate()).toBe(28); // Sunday Dec 28
    expect(start.getDay()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0); // January
    expect(end.getDate()).toBe(3); // Saturday Jan 3
    expect(end.getDay()).toBe(6);
  });

  it("sets start to 00:00:00.000 and end to 23:59:59.999", () => {
    const date = new Date(2026, 1, 11); // Wednesday
    const { start, end } = getWeekRange(date);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("getRemainingDaysPercent", () => {
  it("returns 1.0 (7/7) on Sunday", () => {
    const sunday = new Date(2026, 1, 8); // Sunday Feb 8
    expect(getRemainingDaysPercent(sunday)).toBeCloseTo(1.0, 5);
  });

  it("returns 6/7 on Monday", () => {
    const monday = new Date(2026, 1, 9); // Monday Feb 9
    expect(getRemainingDaysPercent(monday)).toBeCloseTo(6 / 7, 5);
  });

  it("returns 4/7 on Wednesday", () => {
    const wednesday = new Date(2026, 1, 11); // Wednesday Feb 11
    expect(getRemainingDaysPercent(wednesday)).toBeCloseTo(4 / 7, 5);
  });

  it("returns 1/7 on Saturday", () => {
    const saturday = new Date(2026, 1, 14); // Saturday Feb 14
    expect(getRemainingDaysPercent(saturday)).toBeCloseTo(1 / 7, 5);
  });
});

describe("getStatusLabel", () => {
  it("returns 'Over' when remaining is zero", () => {
    expect(getStatusLabel(0, 10000, 0.5)).toBe("Over");
  });

  it("returns 'Over' when remaining is negative", () => {
    expect(getStatusLabel(-500, 10000, 0.5)).toBe("Over");
  });

  it("returns 'On Track' when remaining >= proportional budget", () => {
    // remaining=5000, budget=10000, percent=0.5 -> proportional=5000
    expect(getStatusLabel(5000, 10000, 0.5)).toBe("On Track");
  });

  it("returns 'Watch' when remaining is positive but below proportional budget", () => {
    // remaining=2000, budget=10000, percent=0.5 -> proportional=5000
    expect(getStatusLabel(2000, 10000, 0.5)).toBe("Watch");
  });

  it("returns 'On Track' at edge case with tiny remaining and tiny percent", () => {
    // remaining=1, budget=10000, percent=0.0001 -> proportional=1
    expect(getStatusLabel(1, 10000, 0.0001)).toBe("On Track");
  });

  it("returns 'On Track' with full budget on Sunday", () => {
    // remaining=10000, budget=10000, percent=1.0 -> proportional=10000
    expect(getStatusLabel(10000, 10000, 1.0)).toBe("On Track");
  });

  it("returns 'Watch' when remaining is 1 cent with large proportional", () => {
    // remaining=1, budget=10000, percent=1.0 -> proportional=10000
    expect(getStatusLabel(1, 10000, 1.0)).toBe("Watch");
  });
});

describe("getWeekNumber", () => {
  it("returns week 7 for Sunday Feb 8, 2026", () => {
    expect(getWeekNumber(new Date(2026, 1, 8))).toBe(7);
  });

  it("returns week 7 for Wednesday Feb 11, 2026", () => {
    expect(getWeekNumber(new Date(2026, 1, 11))).toBe(7);
  });

  it("returns week 1 for Thursday Jan 1, 2026", () => {
    expect(getWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });

  it("returns week 2 for Sunday Jan 4, 2026", () => {
    expect(getWeekNumber(new Date(2026, 0, 4))).toBe(2);
  });

  it("handles year boundary -- Dec 31, 2025 falls in week 1", () => {
    // Dec 28 (Sun) - Jan 3 (Sat) is the week containing Jan 1,
    // so with firstWeekContainsDate: 1, this is week 1
    expect(getWeekNumber(new Date(2025, 11, 31))).toBe(1);
  });
});

describe("formatWeekLabel", () => {
  it("formats a mid-week date as the week range string", () => {
    const wednesday = new Date(2026, 1, 11); // Wednesday Feb 11
    expect(formatWeekLabel(wednesday)).toBe("2/8/2026 - 2/14/2026");
  });

  it("formats a year-boundary date correctly", () => {
    const date = new Date(2025, 11, 31); // Wednesday Dec 31, 2025
    expect(formatWeekLabel(date)).toBe("12/28/2025 - 1/3/2026");
  });

  it("formats when given a Sunday (start of week)", () => {
    const sunday = new Date(2026, 1, 8); // Sunday Feb 8
    expect(formatWeekLabel(sunday)).toBe("2/8/2026 - 2/14/2026");
  });

  it("formats when given a Saturday (end of week)", () => {
    const saturday = new Date(2026, 1, 14); // Saturday Feb 14
    expect(formatWeekLabel(saturday)).toBe("2/8/2026 - 2/14/2026");
  });
});
