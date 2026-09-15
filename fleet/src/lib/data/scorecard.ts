import "server-only";
import type { SB } from "./fleet";
import { getDowntime, getDrivers, getSchedules, getScoreWeights } from "./fleet";
import { getWeekStatusRange } from "./rent";
import { computeDriverScore, rankDrivers, trendOf, type DriverInput, type DriverScore, type Trend, type WeekInput } from "@/lib/scorecard/score";
import { INCIDENT_CATEGORIES } from "@/lib/maintenance/categories";
import { addDays, daysBetween, luandaToday, weekStartOf } from "@/lib/time";
import type { WeekStatusRow } from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";

export type RankedDriver = DriverScore & { trend: Trend; previous_score: number | null; weeks: WeekStatusRow[] };

type IncidentRow = { driver_id: string; event_date: string; total_aoa: number };

function windowBounds(today: string, weeks: number, offsetWeeks = 0): { from: string; to: string } {
  // last completed week ends the Sunday before this week's Monday
  const thisMonday = weekStartOf(today);
  const to = addDays(thisMonday, -7 * (1 + offsetWeeks)); // Monday of last completed week (minus offset)
  const from = addDays(to, -7 * (weeks - 1));
  return { from, to };
}

function toWeekInputs(rows: WeekStatusRow[]): WeekInput[] {
  return rows.map((r) => ({ week_start: r.week_start, status: r.status, expected_aoa: r.expected_aoa, paid_aoa: r.paid_aoa, outstanding_aoa: r.outstanding_aoa }));
}

function downtimeDaysFor(
  downtime: { vehicle_id: string; from_date: string; to_date: string }[],
  schedules: { driver_id: string; vehicle_id: string; valid_from: string; valid_to: string | null }[],
  driverId: string, from: string, to: string,
): number {
  let days = 0;
  for (const s of schedules.filter((x) => x.driver_id === driverId)) {
    const sFrom = s.valid_from > from ? s.valid_from : from;
    const sTo = s.valid_to && s.valid_to < to ? s.valid_to : to;
    if (sFrom > sTo) continue;
    for (const d of downtime.filter((x) => x.vehicle_id === s.vehicle_id)) {
      const a = d.from_date > sFrom ? d.from_date : sFrom;
      const b = d.to_date < sTo ? d.to_date : sTo;
      if (a <= b) days += daysBetween(a, b) + 1;
    }
  }
  return days;
}

export async function getScorecard(sb: SB, today = luandaToday()): Promise<{ ranked: RankedDriver[]; window: { from: string; to: string } }> {
  const weights = await getScoreWeights(sb);
  const cur = windowBounds(today, weights.window_weeks);
  const prev = windowBounds(today, weights.window_weeks, weights.window_weeks);
  const [drivers, schedules, downtime, curRows, prevRows, incidentsRes] = await Promise.all([
    getDrivers(sb), getSchedules(sb), getDowntime(sb),
    getWeekStatusRange(sb, cur.from, addDays(cur.to, 6)),
    getWeekStatusRange(sb, prev.from, addDays(prev.to, 6)),
    sb.from("driver_incidents").select("driver_id, event_date, total_aoa"),
  ]);
  if (incidentsRes.error) throw new Error(`driver_incidents: ${incidentsRes.error.message}`);
  const incidents = ((incidentsRes.data ?? []) as IncidentRow[]).map((i) => ({ ...i, total_aoa: num(i.total_aoa) }));

  const build = (driverId: string, name: string, rows: WeekStatusRow[], w: { from: string; to: string }): DriverInput => {
    const mine = rows.filter((r) => r.driver_id === driverId);
    const inc = incidents.filter((i) => i.driver_id === driverId && i.event_date >= w.from && i.event_date <= addDays(w.to, 6));
    const first = schedules.filter((s) => s.driver_id === driverId).map((s) => s.valid_from).sort()[0];
    return {
      driver_id: driverId, driver_name: name, weeks: toWeekInputs(mine),
      incident_count: inc.length, incident_total_aoa: inc.reduce((a, i) => a + i.total_aoa, 0),
      downtime_days: downtimeDaysFor(downtime, schedules, driverId, w.from, addDays(w.to, 6)),
      tenure_weeks: first ? Math.max(0, Math.floor(daysBetween(first, today) / 7)) : 0,
    };
  };

  const scores: RankedDriver[] = drivers
    .filter((d) => d.active || curRows.some((r) => r.driver_id === d.id))
    .map((d) => {
      const current = computeDriverScore(build(d.id, d.full_name, curRows, cur), weights);
      const previous = computeDriverScore(build(d.id, d.full_name, prevRows, prev), weights);
      return { ...current, trend: trendOf(current.score, previous.score), previous_score: previous.score, weeks: curRows.filter((r) => r.driver_id === d.id) };
    });
  return { ranked: rankDrivers(scores) as RankedDriver[], window: cur };
}

export { INCIDENT_CATEGORIES };
