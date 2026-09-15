import { describe, expect, it } from "vitest";
import { categoryTotals, costPerKm, fleetMonthComparison, monthlyByCategory } from "./categories";
import { evaluateRule, evaluateVehicle, type MaintenanceRule } from "./rules";

const events = [
  { vehicle_id: "v", event_date: "2026-07-10", category: "oil_service" as const, total_aoa: 45000, odometer_km: 15000 },
  { vehicle_id: "v", event_date: "2026-08-02", category: "fuel" as const, total_aoa: 30000, odometer_km: 16800 },
  { vehicle_id: "v", event_date: "2026-08-20", category: "fuel" as const, total_aoa: 32000, odometer_km: 18000 },
  { vehicle_id: "v", event_date: "2026-08-25", category: "brakes" as const, total_aoa: 85000, odometer_km: null },
];

describe("category totals", () => {
  it("sums per category with optional range", () => {
    const all = categoryTotals(events);
    expect(all.fuel).toBe(62000);
    expect(all.oil_service).toBe(45000);
    expect(all.tyres).toBe(0);
    const aug = categoryTotals(events, { from: "2026-08-01", to: "2026-08-31" });
    expect(aug.oil_service).toBe(0);
    expect(aug.brakes).toBe(85000);
  });
  it("groups by month and category", () => {
    const rows = monthlyByCategory(events);
    expect(rows).toEqual([
      { month: "2026-07-01", category: "oil_service", total_aoa: 45000 },
      { month: "2026-08-01", category: "brakes", total_aoa: 85000 },
      { month: "2026-08-01", category: "fuel", total_aoa: 62000 },
    ]);
  });
  it("cost per km uses odometer span and total cost", () => {
    const c = costPerKm(events)!;
    expect(c.km).toBe(3000);
    expect(c.cost_aoa).toBe(192000);
    expect(c.per_km).toBe(64);
    expect(costPerKm(events.slice(0, 1))).toBeNull();
  });
  it("flags cars more than 30 % above fleet average", () => {
    const cmp = fleetMonthComparison([
      { vehicle_id: "a", plate: "A", total_aoa: 100000 },
      { vehicle_id: "b", plate: "B", total_aoa: 100000 },
      { vehicle_id: "c", plate: "C", total_aoa: 160000 },
    ]);
    expect(cmp.average_aoa).toBe(120000);
    expect(cmp.rows.find((r) => r.plate === "C")!.outlier).toBe(true);
    expect(cmp.rows.find((r) => r.plate === "A")!.outlier).toBe(false);
  });
});

const oil: MaintenanceRule = { category: "oil_service", label: "Óleo", every_km: 5000, every_months: 6, active: true };
const ins: MaintenanceRule = { category: "insurance", label: "Seguro", every_km: null, every_months: 12, active: true };

describe("due / overdue engine", () => {
  it("is never when there is no event", () => {
    expect(evaluateRule(oil, null, { today: "2026-09-15", odometerKm: 20000 }).state).toBe("never");
  });
  it("ok when far from both limits", () => {
    const r = evaluateRule(oil, { event_date: "2026-08-01", odometer_km: 15000 }, { today: "2026-09-15", odometerKm: 17000 });
    expect(r.state).toBe("ok");
    expect(r.due_at_km).toBe(20000);
    expect(r.km_remaining).toBe(3000);
    expect(r.due_on).toBe("2027-02-01");
  });
  it("due within the km window, overdue past it", () => {
    expect(evaluateRule(oil, { event_date: "2026-08-01", odometer_km: 15000 }, { today: "2026-09-15", odometerKm: 19600 }).state).toBe("due");
    expect(evaluateRule(oil, { event_date: "2026-08-01", odometer_km: 15000 }, { today: "2026-09-15", odometerKm: 20100 }).state).toBe("overdue");
  });
  it("time-based rules: due within 30 days, overdue after", () => {
    expect(evaluateRule(ins, { event_date: "2025-10-01", odometer_km: null }, { today: "2026-09-15", odometerKm: null }).state).toBe("due");
    expect(evaluateRule(ins, { event_date: "2025-08-01", odometer_km: null }, { today: "2026-09-15", odometerKm: null }).state).toBe("overdue");
    expect(evaluateRule(ins, { event_date: "2026-08-01", odometer_km: null }, { today: "2026-09-15", odometerKm: null }).state).toBe("ok");
  });
  it("worst of km and date wins; missing odometer falls back to date", () => {
    const r = evaluateRule(oil, { event_date: "2026-01-01", odometer_km: 15000 }, { today: "2026-09-15", odometerKm: 16000 });
    expect(r.state).toBe("overdue");
    const noOdo = evaluateRule(oil, { event_date: "2026-08-01", odometer_km: null }, { today: "2026-09-15", odometerKm: 16000 });
    expect(noOdo.state).toBe("ok");
    expect(noOdo.due_at_km).toBeNull();
  });
  it("evaluateVehicle skips inactive rules", () => {
    const out = evaluateVehicle([oil, { ...ins, active: false }], { oil_service: { event_date: "2026-08-01", odometer_km: 15000 } }, { today: "2026-09-15", odometerKm: 17000 });
    expect(out.map((r) => r.category)).toEqual(["oil_service"]);
  });
});
