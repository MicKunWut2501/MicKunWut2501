import type { ExpenseCategory } from "./categories";
import { addMonths, daysBetween } from "@/lib/time";

export type MaintenanceRule = {
  category: ExpenseCategory;
  label: string;
  every_km: number | null;
  every_months: number | null;
  active: boolean;
};

export type LastEvent = { event_date: string; odometer_km: number | null } | null;

export type DueState = "ok" | "due" | "overdue" | "never";

export type DueResult = {
  category: ExpenseCategory;
  label: string;
  state: DueState;
  /** absolute km at which the next service is due, if the rule has a km interval and a reading exists */
  due_at_km: number | null;
  km_remaining: number | null;
  due_on: string | null;
  days_remaining: number | null;
  reason: string;
};

export type DueThresholds = { km_window: number; days_window: number };
export const DEFAULT_THRESHOLDS: DueThresholds = { km_window: 500, days_window: 30 };

/**
 * Evaluates one rule for one vehicle. "due" when within the km/days window, "overdue" when past,
 * "never" when there is no event of that category on record.
 */
export function evaluateRule(
  rule: MaintenanceRule,
  last: LastEvent,
  ctx: { today: string; odometerKm: number | null },
  th: DueThresholds = DEFAULT_THRESHOLDS,
): DueResult {
  const base: DueResult = {
    category: rule.category,
    label: rule.label,
    state: "ok",
    due_at_km: null,
    km_remaining: null,
    due_on: null,
    days_remaining: null,
    reason: "",
  };
  if (!last) return { ...base, state: "never", reason: "Sem registo desta categoria" };

  let kmState: DueState | null = null;
  if (rule.every_km && last.odometer_km != null && ctx.odometerKm != null) {
    base.due_at_km = last.odometer_km + rule.every_km;
    base.km_remaining = base.due_at_km - ctx.odometerKm;
    kmState = base.km_remaining < 0 ? "overdue" : base.km_remaining <= th.km_window ? "due" : "ok";
  }
  let dateState: DueState | null = null;
  if (rule.every_months) {
    base.due_on = addMonths(last.event_date, rule.every_months);
    base.days_remaining = daysBetween(ctx.today, base.due_on);
    dateState = base.days_remaining < 0 ? "overdue" : base.days_remaining <= th.days_window ? "due" : "ok";
  }
  const rank: Record<DueState, number> = { ok: 0, due: 1, overdue: 2, never: 3 };
  const states: DueState[] = [];
  if (kmState) states.push(kmState);
  if (dateState) states.push(dateState);
  const state: DueState = states.length ? states.reduce((a, b) => (rank[b] > rank[a] ? b : a)) : "ok";

  const parts: string[] = [];
  if (kmState) {
    parts.push(
      base.km_remaining! < 0
        ? `${Math.abs(base.km_remaining!)} km em atraso`
        : `faltam ${base.km_remaining} km`,
    );
  }
  if (dateState) {
    parts.push(
      base.days_remaining! < 0
        ? `${Math.abs(base.days_remaining!)} dias em atraso`
        : `faltam ${base.days_remaining} dias`,
    );
  }
  return { ...base, state, reason: parts.join(" · ") || "Sem intervalo aplicável" };
}

export function evaluateVehicle(
  rules: MaintenanceRule[],
  lastByCategory: Partial<Record<ExpenseCategory, LastEvent>>,
  ctx: { today: string; odometerKm: number | null },
  th?: DueThresholds,
): DueResult[] {
  return rules
    .filter((r) => r.active)
    .map((r) => evaluateRule(r, lastByCategory[r.category] ?? null, ctx, th));
}
