import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildWorkbook, workbookToBuffer } from "./xlsx";
import type { ExportInput } from "./xlsx";
import { aggregateFleet, computeVehicleMonth, car4Countdown } from "@/lib/model/model";

const targets = {
  net_per_car_month_aoa: 351000, free_cash_per_car_month_aoa: 147500, reserve_rate_aoa_month: 203500, inflation_rate_yearly: 0.2, reserve_base_year: 2026,
  car4_purchase_date: "2026-12-01", car4_private_injection_aoa: 12300000, passive_income_goal_aoa_month: 4000000, fleet_size_target_2026: 5,
};

describe("xlsx export", () => {
  it("contains the Model vs Actual sheet with fleet and vehicle rows", () => {
    const vm = [computeVehicleMonth({ vehicle_id: "v", plate: "P", month: "2026-08-01", days_in_month: 31, active_days: 31, downtime_days: 0, rent_expected_aoa: 420000, rent_paid_aoa: 400000, expenses_aoa: 50000 }, targets)];
    const fleetMonths = aggregateFleet(vm, targets);
    const input: ExportInput = {
      generatedAt: "2026-09-15T10:00:00Z", vehicles: [], drivers: [], weeks: [], payments: [], events: [], scorecard: [],
      model: { today: "2026-09-15", targets, vehicleMonths: vm, fleetMonths, thisMonth: null, lastFullMonth: fleetMonths[0], cash_on_hand_aoa: 0, cash_as_of: null, goal_progress: null,
        car4: car4Countdown({ today: "2026-09-15", purchaseDate: "2026-12-01", injectionAoa: 12300000, reserveBalanceAoa: 203500, cashOnHandAoa: 0 }) },
    };
    const wb = buildWorkbook(input);
    expect(wb.SheetNames).toEqual(["Cobrança", "Pagamentos", "Despesas", "Model vs Actual", "Scorecard", "Viaturas"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Model vs Actual"], { range: 4 });
    expect(rows).toHaveLength(2);
    expect(rows[0]["Nível"]).toBe("Frota");
    expect(rows[0]["Líquido (Kz)"]).toBe(350000);
    expect(rows[1]["Viatura"]).toBe("P");
    const buf = workbookToBuffer(wb);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
