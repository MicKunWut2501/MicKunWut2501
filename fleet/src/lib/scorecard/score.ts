/**
 * Driver scorecard. Pure functions over data already in the DB (week_status_range, driver_incidents,
 * vehicle_downtime, rent_schedule). Weighted 0-100; every component is exposed with raw value,
 * normalised score and a one-line explanation.
 */

export type ScoreWeights = {
  on_time_pct: number;
  shortfall_pct: number;
  incidents_pct: number;
  downtime_pct: number;
  min_weeks: number;
  window_weeks: number;
};

export type WeekInput = {
  week_start: string;
  status: "PAID" | "PARTIAL" | "MISSED" | "PENDING" | "EXEMPT";
  expected_aoa: number;
  paid_aoa: number;
  outstanding_aoa: number;
};

export type DriverInput = {
  driver_id: string;
  driver_name: string;
  weeks: WeekInput[]; // one entry per week in the window where the driver had a schedule
  incident_count: number;
  incident_total_aoa: number;
  downtime_days: number;
  tenure_weeks: number;
};

export type Component = {
  key: "on_time" | "shortfall" | "incidents" | "downtime";
  label: string;
  weight_pct: number;
  raw: number;
  raw_label: string;
  score: number; // 0..100
  weighted: number; // score * weight / 100
  explanation: string;
};

export type DriverScore = {
  driver_id: string;
  driver_name: string;
  scored_weeks: number;
  tenure_weeks: number;
  insufficient: boolean;
  score: number | null;
  components: Component[];
  top_positive: Component | null;
  top_negative: Component | null;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Weeks that count: the week has ended and rent was expected. */
export function scoredWeeks(weeks: WeekInput[]): WeekInput[] {
  return weeks.filter((w) => w.status !== "PENDING" && w.status !== "EXEMPT");
}

export function normaliseOnTime(weeks: WeekInput[]): { raw: number; score: number } {
  const s = scoredWeeks(weeks);
  if (!s.length) return { raw: 0, score: 0 };
  const paid = s.filter((w) => w.status === "PAID").length;
  const raw = paid / s.length;
  return { raw, score: clamp(raw * 100) };
}

export function normaliseShortfall(weeks: WeekInput[]): { raw: number; expected: number; score: number } {
  const s = scoredWeeks(weeks);
  const expected = s.reduce((a, w) => a + w.expected_aoa, 0);
  const outstanding = s.reduce((a, w) => a + w.outstanding_aoa, 0);
  if (expected <= 0) return { raw: outstanding, expected, score: 0 };
  return { raw: outstanding, expected, score: clamp((1 - outstanding / expected) * 100) };
}

/**
 * Incidents: cost share of expected rent (100 % of rent lost to incidents => 0) minus 10 points per incident.
 */
export function normaliseIncidents(count: number, totalAoa: number, expectedAoa: number): { score: number } {
  const costShare = expectedAoa > 0 ? Math.min(1, totalAoa / expectedAoa) : totalAoa > 0 ? 1 : 0;
  return { score: clamp(100 - costShare * 100 - count * 10) };
}

export function normaliseDowntime(downtimeDays: number, windowWeeks: number): { score: number } {
  const windowDays = Math.max(1, windowWeeks * 7);
  return { score: clamp((1 - downtimeDays / windowDays) * 100) };
}

export function computeDriverScore(d: DriverInput, w: ScoreWeights): DriverScore {
  const s = scoredWeeks(d.weeks);
  const onTime = normaliseOnTime(d.weeks);
  const shortfall = normaliseShortfall(d.weeks);
  const incidents = normaliseIncidents(d.incident_count, d.incident_total_aoa, shortfall.expected);
  const downtime = normaliseDowntime(d.downtime_days, w.window_weeks);
  const paidWeeks = s.filter((x) => x.status === "PAID").length;

  const components: Component[] = [
    {
      key: "on_time",
      label: "On-time rate",
      weight_pct: w.on_time_pct,
      raw: onTime.raw,
      raw_label: `${paidWeeks}/${s.length} weeks fully paid by Sunday`,
      score: r1(onTime.score),
      weighted: r1((onTime.score * w.on_time_pct) / 100),
      explanation: `Share of scored weeks where the full rent was in by the end of the week.`,
    },
    {
      key: "shortfall",
      label: "Shortfall",
      weight_pct: w.shortfall_pct,
      raw: shortfall.raw,
      raw_label: `${Math.round(shortfall.raw)} of ${Math.round(shortfall.expected)} Kz outstanding`,
      score: r1(shortfall.score),
      weighted: r1((shortfall.score * w.shortfall_pct) / 100),
      explanation: `100 minus the percentage of expected rent left unpaid over the window.`,
    },
    {
      key: "incidents",
      label: "Cost incidents",
      weight_pct: w.incidents_pct,
      raw: d.incident_total_aoa,
      raw_label: `${d.incident_count} incident(s), ${Math.round(d.incident_total_aoa)} Kz`,
      score: r1(incidents.score),
      weighted: r1((incidents.score * w.incidents_pct) / 100),
      explanation: `Repairs, brakes, tyres and fines during the driver's tenure: cost as % of expected rent, minus 10 points per incident.`,
    },
    {
      key: "downtime",
      label: "Downtime",
      weight_pct: w.downtime_pct,
      raw: d.downtime_days,
      raw_label: `${d.downtime_days} day(s) off-road in ${w.window_weeks} weeks`,
      score: r1(downtime.score),
      weighted: r1((downtime.score * w.downtime_pct) / 100),
      explanation: `Days the vehicle was off-road, as a share of the window.`,
    },
  ];

  const insufficient = s.length < w.min_weeks;
  const score = insufficient ? null : r1(components.reduce((a, c) => a + c.weighted, 0));
  // ties broken by weight so the heavier component is the one surfaced
  const byScoreDesc = [...components].sort((a, b) => b.score - a.score || b.weight_pct - a.weight_pct);
  const byScoreAsc = [...components].sort((a, b) => a.score - b.score || b.weight_pct - a.weight_pct);
  return {
    driver_id: d.driver_id,
    driver_name: d.driver_name,
    scored_weeks: s.length,
    tenure_weeks: d.tenure_weeks,
    insufficient,
    score,
    components,
    top_positive: insufficient ? null : byScoreDesc[0],
    top_negative: insufficient ? null : byScoreAsc[0],
  };
}

export type Trend = "up" | "down" | "flat" | "none";

export function trendOf(current: number | null, previous: number | null, threshold = 2): Trend {
  if (current === null || previous === null) return "none";
  const d = current - previous;
  if (d > threshold) return "up";
  if (d < -threshold) return "down";
  return "flat";
}

export function rankDrivers(scores: DriverScore[]): DriverScore[] {
  return [...scores].sort((a, b) => {
    if (a.score === null && b.score === null) return a.driver_name.localeCompare(b.driver_name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}
