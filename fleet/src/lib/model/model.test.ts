import { describe, expect, it } from "vitest";
import {
  aggregateFleet, car4Countdown, computeVehicleMonth, loanCoverage, proRate, reserveRateForMonth, toEur,
  type FleetTargets, type VehicleMonthFact,
} from "./model";

const T: FleetTargets = {
  net_per_car_month_aoa: 351000,
  free_cash_per_car_month_aoa: 147500,
  reserve_rate_aoa_month: 203500,
  inflation_rate_yearly: 0.2,
  reserve_base_year: 2026,
  car4_purchase_date: "2026-12-01",
  car4_private_injection_aoa: 12300000,
  passive_income_goal_aoa_month: 4000000,
  fleet_size_target_2026: 5,
  fx_aoa_per_eur: 1300,
  loan_installment_eur: 271.4,
  loan_principal_eur: 20040.82,
  loan_start_date: "2025-08-01",
  loan_months: 96,
};

const fact = (o: Partial<VehicleMonthFact>): VehicleMonthFact => ({
  vehicle_id: "v1", plate: "P1", month: "2026-08-01", days_in_month: 31, active_days: 31, downtime_days: 0,
  rent_expected_aoa: 450000, rent_paid_aoa: 450000, expenses_aoa: 60000, ...o,
});

describe("reserve rate", () => {
  it("equals net - free cash in the base year and inflates yearly", () => {
    expect(T.net_per_car_month_aoa - T.free_cash_per_car_month_aoa).toBe(T.reserve_rate_aoa_month);
    expect(reserveRateForMonth(T, "2026-08-01")).toBe(203500);
    expect(reserveRateForMonth(T, "2027-01-01")).toBe(244200);
    expect(reserveRateForMonth(T, "2028-06-01")).toBe(293040);
    expect(reserveRateForMonth(T, "2025-12-01")).toBe(203500);
  });
});

describe("computeVehicleMonth", () => {
  it("full month: net, reserve and free cash", () => {
    const r = computeVehicleMonth(fact({}), T);
    expect(r.prorate).toBe(1);
    expect(r.net_aoa).toBe(390000);
    expect(r.target_net_aoa).toBe(351000);
    expect(r.target_reserve_aoa).toBe(203500);
    expect(r.reserve_aoa).toBe(203500);
    expect(r.free_cash_aoa).toBe(186500);
    expect(r.target_free_cash_aoa).toBe(147500);
    expect(r.collection_rate).toBe(1);
  });
  it("pro-rates target and reserve by active days", () => {
    const r = computeVehicleMonth(fact({ active_days: 12, rent_expected_aoa: 180000, rent_paid_aoa: 180000, expenses_aoa: 0 }), T);
    expect(proRate({ active_days: 12, days_in_month: 31 })).toBeCloseTo(12 / 31);
    expect(r.target_net_aoa).toBe(Math.round((351000 * 12) / 31));
    expect(r.target_reserve_aoa).toBe(Math.round((203500 * 12) / 31));
  });
  it("actual reserve is capped by net and never negative", () => {
    const low = computeVehicleMonth(fact({ rent_paid_aoa: 150000, expenses_aoa: 50000 }), T);
    expect(low.net_aoa).toBe(100000);
    expect(low.reserve_aoa).toBe(100000);
    expect(low.free_cash_aoa).toBe(0);
    const neg = computeVehicleMonth(fact({ rent_paid_aoa: 20000, expenses_aoa: 90000 }), T);
    expect(neg.net_aoa).toBe(-70000);
    expect(neg.reserve_aoa).toBe(0);
    expect(neg.free_cash_aoa).toBe(-70000);
  });
  it("collection rate is null when nothing expected", () => {
    expect(computeVehicleMonth(fact({ rent_expected_aoa: 0, rent_paid_aoa: 0 }), T).collection_rate).toBeNull();
  });
});

describe("aggregateFleet", () => {
  it("computes net per car on car-equivalents and cumulative reserve", () => {
    const rows = [
      computeVehicleMonth(fact({ vehicle_id: "a", month: "2026-07-01" }), T),
      computeVehicleMonth(fact({ vehicle_id: "a", month: "2026-08-01" }), T),
      computeVehicleMonth(fact({ vehicle_id: "b", month: "2026-08-01", active_days: 15.5, days_in_month: 31, rent_paid_aoa: 200000, expenses_aoa: 5000 }), T),
    ];
    const fleet = aggregateFleet(rows, T);
    expect(fleet.map((m) => m.month)).toEqual(["2026-07-01", "2026-08-01"]);
    const aug = fleet[1];
    expect(aug.vehicles).toBe(2);
    expect(aug.car_equivalents).toBeCloseTo(1.5);
    expect(aug.net_aoa).toBe(390000 + 195000);
    expect(aug.net_per_car_aoa).toBe(Math.round(585000 / 1.5));
    expect(aug.cum_reserve_aoa).toBe(203500 + 203500 + Math.min(195000, Math.round(203500 * 0.5)));
    expect(aug.cum_target_reserve_aoa).toBe(203500 * 2 + Math.round(203500 * 0.5));
  });
});

describe("loanCoverage", () => {
  it("matches the workbook KPIs at 1 300 AOA/EUR", () => {
    expect(toEur(1052000, 1300)).toBeCloseTo(809.23, 2);
    const c = loanCoverage(T, 1052000, "2026-09-01");
    expect(c.net_eur).toBeCloseTo(809.23, 2);
    expect(c.coverage).toBeCloseTo(2.98, 2);
    expect(c.surplus_eur).toBeCloseTo(537.83, 2);
    expect(c.months_elapsed).toBe(14);
    expect(c.months_remaining).toBe(82);
    expect(c.remaining_eur).toBeCloseTo(82 * 271.4, 2);
  });
  it("clamps before the loan start and after the last instalment", () => {
    expect(loanCoverage(T, 0, "2025-06-01").months_elapsed).toBe(0);
    expect(loanCoverage(T, 0, "2040-01-01").months_remaining).toBe(0);
    expect(loanCoverage({ ...T, loan_installment_eur: 0 }, 1000, "2026-01-01").coverage).toBeNull();
  });
});

describe("car4Countdown", () => {
  it("counts months and days and computes injection still required", () => {
    const c = car4Countdown({ today: "2026-09-15", purchaseDate: "2026-12-01", injectionAoa: 12300000, reserveBalanceAoa: 1800000, cashOnHandAoa: 1500000 });
    expect(c.months_remaining).toBe(2);
    expect(c.days_after_months).toBe(16);
    expect(c.days_remaining).toBe(77);
    expect(c.injection_required_aoa).toBe(9000000);
  });
  it("floors at zero when the date passed or the money is covered", () => {
    const c = car4Countdown({ today: "2027-01-10", purchaseDate: "2026-12-01", injectionAoa: 100, reserveBalanceAoa: 500, cashOnHandAoa: 0 });
    expect(c.days_remaining).toBe(0);
    expect(c.months_remaining).toBe(0);
    expect(c.injection_required_aoa).toBe(0);
  });
});
