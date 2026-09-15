/**
 * Calendar helpers. Dates travel as ISO "YYYY-MM-DD" strings interpreted in Africa/Luanda (UTC+1, no DST).
 */

export const LUANDA_OFFSET_MS = 3600_000;

export function luandaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + LUANDA_OFFSET_MS).toISOString().slice(0, 10);
}

export function luandaNowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return toIso(new Date(Date.UTC(y, m - 1, d + days)));
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return toIso(new Date(Date.UTC(y, m - 1 + months, d)));
}

/** ISO weekday: Monday = 1 ... Sunday = 7 */
export function isoWeekday(iso: string): number {
  const dow = parseIso(iso).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

/** Monday of the week containing iso. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

export function monthStartOf(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function monthEndOf(iso: string): string {
  return addDays(addMonths(monthStartOf(iso), 1), -1);
}

export function daysInMonth(iso: string): number {
  return Number(monthEndOf(iso).slice(8, 10));
}

/** Inclusive day count between two ISO dates (b >= a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

/** Mondays from `from` (aligned) to `to`, inclusive. */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = weekStartOf(from); w <= weekStartOf(to); w = addDays(w, 7)) out.push(w);
  return out;
}

/** First-of-month dates from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthStartOf(from); m <= monthStartOf(to); m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Sunday 23:59:59 Luanda for a rent week = Monday 00:00 Luanda of the following week, as UTC instant. */
export function weekDeadlineUtc(weekStart: string): Date {
  return new Date(parseIso(addDays(weekStart, 7)).getTime() - LUANDA_OFFSET_MS);
}
