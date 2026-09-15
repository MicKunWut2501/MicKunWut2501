import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, luandaToday, weekDeadlineUtc, weekStartOf, weeksBetween } from "./time";

describe("time", () => {
  it("finds Monday", () => {
    expect(weekStartOf("2026-08-03")).toBe("2026-08-03");
    expect(weekStartOf("2026-08-09")).toBe("2026-08-03");
    expect(weekStartOf("2026-08-10")).toBe("2026-08-10");
  });
  it("Luanda date rolls over at 23:00 UTC", () => {
    expect(luandaToday(new Date("2026-08-09T22:59:00Z"))).toBe("2026-08-09");
    expect(luandaToday(new Date("2026-08-09T23:00:00Z"))).toBe("2026-08-10");
  });
  it("deadline is Sunday 23:00 UTC", () => {
    expect(weekDeadlineUtc("2026-08-03").toISOString()).toBe("2026-08-09T23:00:00.000Z");
  });
  it("month helpers", () => {
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(addMonths("2026-01-31", 1)).toBe("2026-03-03"); // JS overflow semantics, documented
    expect(weeksBetween("2026-08-05", "2026-08-20")).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });
});
