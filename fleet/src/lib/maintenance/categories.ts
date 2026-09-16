export const EXPENSE_CATEGORIES = [
  "fuel", "oil_service", "tyres", "brakes", "repair", "insurance", "licensing", "wash", "fine", "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: "Fuel",
  oil_service: "Oil / service",
  tyres: "Tyres",
  brakes: "Brakes",
  repair: "Repair",
  insurance: "Insurance",
  licensing: "Licensing",
  wash: "Wash",
  fine: "Fine",
  other: "Other",
};

/** Categories that count as driver-attributable incidents in the scorecard. */
export const INCIDENT_CATEGORIES: ExpenseCategory[] = ["repair", "brakes", "tyres", "fine"];

export function isExpenseCategory(v: unknown): v is ExpenseCategory {
  return typeof v === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

export type EventLike = {
  vehicle_id: string;
  event_date: string;
  category: ExpenseCategory;
  total_aoa: number;
  odometer_km?: number | null;
};

/** Sum per category, optionally restricted to an inclusive ISO date range. */
export function categoryTotals(events: EventLike[], range?: { from: string; to: string }): Record<ExpenseCategory, number> {
  const out = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, number>;
  for (const e of events) {
    if (range && (e.event_date < range.from || e.event_date > range.to)) continue;
    out[e.category] += Number(e.total_aoa);
  }
  return out;
}

export type MonthCategoryRow = { month: string; category: ExpenseCategory; total_aoa: number };

/** Group events into month x category totals (month = YYYY-MM-01). */
export function monthlyByCategory(events: EventLike[]): MonthCategoryRow[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const key = `${e.event_date.slice(0, 7)}-01|${e.category}`;
    map.set(key, (map.get(key) ?? 0) + Number(e.total_aoa));
  }
  return [...map.entries()]
    .map(([k, total]) => {
      const [month, category] = k.split("|");
      return { month, category: category as ExpenseCategory, total_aoa: total };
    })
    .sort((a, b) => (a.month === b.month ? a.category.localeCompare(b.category) : a.month.localeCompare(b.month)));
}

/**
 * Cost per km over the events that carry an odometer reading: total cost of ALL events in the period
 * divided by the km travelled between the first and last odometer readings. null if < 2 readings.
 */
export function costPerKm(events: EventLike[]): { cost_aoa: number; km: number; per_km: number } | null {
  const withOdo = events.filter((e) => e.odometer_km != null && e.odometer_km > 0);
  if (withOdo.length < 2) return null;
  const readings = withOdo.map((e) => e.odometer_km as number);
  const km = Math.max(...readings) - Math.min(...readings);
  if (km <= 0) return null;
  const cost = events.reduce((a, e) => a + Number(e.total_aoa), 0);
  return { cost_aoa: cost, km, per_km: cost / km };
}

/** Per-vehicle month totals with the fleet average and an outlier flag (> threshold above average). */
export function fleetMonthComparison(
  rows: { vehicle_id: string; plate: string; total_aoa: number }[],
  threshold = 0.3,
): { average_aoa: number; rows: { vehicle_id: string; plate: string; total_aoa: number; vs_avg: number | null; outlier: boolean }[] } {
  const n = rows.length;
  const avg = n ? rows.reduce((a, r) => a + r.total_aoa, 0) / n : 0;
  return {
    average_aoa: avg,
    rows: rows.map((r) => {
      const vs = avg > 0 ? r.total_aoa / avg - 1 : null;
      return { ...r, vs_avg: vs, outlier: vs !== null && vs > threshold };
    }),
  };
}
