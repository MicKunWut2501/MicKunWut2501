import { describe, expect, it } from "vitest";
import {
  computeDriverScore, normaliseIncidents, normaliseOnTime, normaliseShortfall, rankDrivers, trendOf,
  type DriverInput, type ScoreWeights, type WeekInput,
} from "./score";

const W: ScoreWeights = { on_time_pct: 40, shortfall_pct: 25, incidents_pct: 25, downtime_pct: 10, min_weeks: 4, window_weeks: 12 };

const wk = (i: number, status: WeekInput["status"], paid: number, expected = 105000): WeekInput => ({
  week_start: `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
  status, expected_aoa: expected, paid_aoa: paid, outstanding_aoa: Math.max(0, expected - paid),
});

const driver = (weeks: WeekInput[], extra: Partial<DriverInput> = {}): DriverInput => ({
  driver_id: "d", driver_name: "Teste", weeks, incident_count: 0, incident_total_aoa: 0, downtime_days: 0, tenure_weeks: 20, ...extra,
});

describe("normalisation", () => {
  it("on-time ignores pending/exempt weeks", () => {
    const weeks = [wk(0, "PAID", 105000), wk(1, "MISSED", 0), wk(2, "PENDING", 0), wk(3, "EXEMPT", 0, 0), wk(4, "PAID", 105000)];
    expect(normaliseOnTime(weeks)).toEqual({ raw: 2 / 3, score: (2 / 3) * 100 });
  });
  it("shortfall is share of expected rent unpaid", () => {
    const s = normaliseShortfall([wk(0, "PAID", 105000), wk(1, "PARTIAL", 55000)]);
    expect(s.expected).toBe(210000);
    expect(s.raw).toBe(50000);
    expect(s.score).toBeCloseTo((1 - 50000 / 210000) * 100);
  });
  it("incidents penalise cost share and count, floored at 0", () => {
    expect(normaliseIncidents(0, 0, 1000000).score).toBe(100);
    expect(normaliseIncidents(1, 100000, 1000000).score).toBe(80);
    expect(normaliseIncidents(5, 2000000, 1000000).score).toBe(0);
  });
});

describe("weighting", () => {
  it("perfect driver scores 100 with all components", () => {
    const d = driver(Array.from({ length: 12 }, (_, i) => wk(i, "PAID", 105000)));
    const s = computeDriverScore(d, W);
    expect(s.insufficient).toBe(false);
    expect(s.score).toBe(100);
    expect(s.components.map((c) => c.weighted)).toEqual([40, 25, 25, 10]);
    expect(s.top_positive).not.toBeNull();
  });
  it("applies weights and exposes breakdown", () => {
    const weeks = [...Array.from({ length: 6 }, (_, i) => wk(i, "PAID", 105000)), ...Array.from({ length: 6 }, (_, i) => wk(6 + i, "MISSED", 0))];
    const d = driver(weeks, { incident_count: 1, incident_total_aoa: 126000, downtime_days: 21 });
    const s = computeDriverScore(d, W);
    const [onTime, shortfall, incidents, downtime] = s.components;
    expect(onTime.score).toBe(50);
    expect(shortfall.score).toBe(50);
    expect(incidents.score).toBe(80); // 126000/1260000 = 10 % cost share, minus 10 for the count
    expect(downtime.score).toBe(75); // 21 of 84 days
    expect(s.score).toBe(20 + 12.5 + 20 + 7.5);
    expect(s.top_positive!.key).toBe("incidents");
    expect(s.top_negative!.key).toBe("on_time");
  });
});

describe("insufficient data", () => {
  it("returns null score with fewer than min_weeks scored weeks", () => {
    const d = driver([wk(0, "PAID", 105000), wk(1, "PAID", 105000), wk(2, "PAID", 105000), wk(3, "PENDING", 0)]);
    const s = computeDriverScore(d, W);
    expect(s.scored_weeks).toBe(3);
    expect(s.insufficient).toBe(true);
    expect(s.score).toBeNull();
    expect(s.top_positive).toBeNull();
    expect(s.components).toHaveLength(4); // breakdown still shown
  });
  it("ranks null scores last and computes trends", () => {
    const a = computeDriverScore(driver(Array.from({ length: 12 }, (_, i) => wk(i, "PAID", 105000)), { driver_id: "a" }), W);
    const b = computeDriverScore(driver([wk(0, "PAID", 105000)], { driver_id: "b" }), W);
    const c = computeDriverScore(driver(Array.from({ length: 12 }, (_, i) => wk(i, i % 2 ? "MISSED" : "PAID", i % 2 ? 0 : 105000)), { driver_id: "c" }), W);
    expect(rankDrivers([b, c, a]).map((s) => s.driver_id)).toEqual(["a", "c", "b"]);
    expect(trendOf(80, 70)).toBe("up");
    expect(trendOf(70, 80)).toBe("down");
    expect(trendOf(71, 70)).toBe("flat");
    expect(trendOf(null, 70)).toBe("none");
  });
});
