import { describe, expect, it } from "vitest";
import { summarizeMileage } from "./mileage";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

describe("summarizeMileage", () => {
  it("returns nulls without history", () => {
    const s = summarizeMileage([], NOW);
    expect(s.latest_km).toBeNull();
    expect(s.last7.km).toBeNull();
    expect(s.per_day_km).toBeNull();
  });

  it("needs two readings to report driven km", () => {
    const s = summarizeMileage([{ taken_at: at(1), mileage_km: 1000 }], NOW);
    expect(s.latest_km).toBe(1000);
    expect(s.last7).toEqual({ km: null, since: at(1), partial: true });
  });

  it("uses the last reading at or before the window start as baseline", () => {
    const s = summarizeMileage([
      { taken_at: at(40), mileage_km: 5000 },
      { taken_at: at(31), mileage_km: 5500 },
      { taken_at: at(8), mileage_km: 7000 },
      { taken_at: at(3), mileage_km: 7600 },
      { taken_at: at(0), mileage_km: 8000 },
    ], NOW);
    expect(s.latest_km).toBe(8000);
    expect(s.last7).toEqual({ km: 1000, since: at(8), partial: false });
    expect(s.last30).toEqual({ km: 2500, since: at(31), partial: false });
    expect(s.per_day_km).toBeCloseTo(2500 / 31, 5);
  });

  it("flags windows the history does not reach back to and ignores order and empty readings", () => {
    const s = summarizeMileage([
      { taken_at: at(0), mileage_km: 82485 },
      { taken_at: at(2), mileage_km: null },
      { taken_at: at(5.5), mileage_km: 80682 },
    ], NOW);
    expect(s.last7).toEqual({ km: 1803, since: at(5.5), partial: true });
    expect(s.last30.partial).toBe(true);
    expect(s.per_day_km).toBeCloseTo(1803 / 5.5, 5);
  });

  it("never reports negative km after a tracker reset", () => {
    const s = summarizeMileage([{ taken_at: at(10), mileage_km: 900 }, { taken_at: at(0), mileage_km: 20 }], NOW);
    expect(s.last30.km).toBe(0);
  });
});
