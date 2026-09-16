import { describe, expect, it } from "vitest";
import { formatAOA, formatDate, formatEUR, formatMonth, formatPct, formatWeek } from "./format";

const N = " ";

describe("formatAOA", () => {
  it("groups thousands and appends Kz", () => {
    expect(formatAOA(105000)).toBe(`105${N}000${N}Kz`);
    expect(formatAOA(12300000)).toBe(`12${N}300${N}000${N}Kz`);
    expect(formatAOA("70000.00")).toBe(`70${N}000${N}Kz`);
  });
  it("handles zero, negatives, signed and decimals", () => {
    expect(formatAOA(0)).toBe(`0${N}Kz`);
    expect(formatAOA(-2500)).toBe(`-2${N}500${N}Kz`);
    expect(formatAOA(2500, { signed: true })).toBe(`+2${N}500${N}Kz`);
    expect(formatAOA(1234.5, { decimals: 2 })).toBe(`1${N}234,50${N}Kz`);
    expect(formatAOA(null)).toBe("—");
    expect(formatEUR(809.2307, 2)).toBe(`809,23${N}€`);
    expect(formatEUR(-1500)).toBe(`-1${N}500${N}€`);
  });
});

describe("dates", () => {
  it("formats dd/mm/yyyy with English month names", () => {
    expect(formatDate("2026-08-03")).toBe("03/08/2026");
    expect(formatMonth("2026-08-01")).toBe("Aug 2026");
    expect(formatMonth("2026-08-01", true)).toBe("August 2026");
    expect(formatWeek("2026-08-03")).toBe("3–9 Aug");
    expect(formatWeek("2026-08-31")).toBe("31 Aug – 6 Sep");
    expect(formatPct(0.873)).toBe("87%");
    expect(formatPct(-0.125, 1, true)).toBe("-12,5%");
  });
});
