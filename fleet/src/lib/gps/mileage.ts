export type MileagePoint = { taken_at: string; mileage_km: number | null };

export type MileageWindow = {
  /** km driven inside the window, null when there are not two readings to compare */
  km: number | null;
  /** reading the difference starts from (ISO), the window start or the first reading after it */
  since: string | null;
  /** true when the history does not reach back to the window start */
  partial: boolean;
};

export type MileageSummary = {
  latest_km: number | null;
  latest_at: string | null;
  last7: MileageWindow;
  last30: MileageWindow;
  /** average km per day over the 30-day window (or the shorter history it has) */
  per_day_km: number | null;
};

const DAY_MS = 86_400_000;

function windowKm(points: (MileagePoint & { mileage_km: number })[], nowMs: number, days: number): MileageWindow {
  if (points.length < 2) return { km: null, since: points[0]?.taken_at ?? null, partial: true };
  const start = nowMs - days * DAY_MS;
  const latest = points[points.length - 1];
  let base = points[0];
  let partial = true;
  for (const p of points) {
    if (new Date(p.taken_at).getTime() > start) break;
    base = p;
    partial = false;
  }
  if (base === latest) return { km: null, since: base.taken_at, partial };
  return { km: Math.max(0, latest.mileage_km - base.mileage_km), since: base.taken_at, partial };
}

/** Tracker mileage history (any order) → latest reading and km driven in the last 7 / 30 days. */
export function summarizeMileage(history: MileagePoint[], nowMs: number): MileageSummary {
  const points = history
    .filter((p): p is MileagePoint & { mileage_km: number } => p.mileage_km != null && Number.isFinite(p.mileage_km))
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const latest = points[points.length - 1];
  const last30 = windowKm(points, nowMs, 30);
  let perDay: number | null = null;
  if (last30.km != null && last30.since && latest) {
    const days = (new Date(latest.taken_at).getTime() - new Date(last30.since).getTime()) / DAY_MS;
    if (days >= 1) perDay = last30.km / days;
  }
  return {
    latest_km: latest?.mileage_km ?? null,
    latest_at: latest?.taken_at ?? null,
    last7: windowKm(points, nowMs, 7),
    last30,
    per_day_km: perDay,
  };
}
