/**
 * Single source of truth for AOA (Angolan kwanza) and date formatting.
 * Deterministic (no Intl locale data) so server and client render identically.
 */

const NBSP = " ";

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 105000 -> "105 000 Kz". Rounds to whole kwanza unless decimals is given. */
export function formatAOA(
  value: number | string | null | undefined,
  opts: { decimals?: number; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const decimals = opts.decimals ?? 0;
  const abs = Math.abs(n).toFixed(decimals);
  const [intPart, frac] = abs.split(".");
  const body = groupThousands(intPart) + (frac ? "," + frac : "");
  const sign = n < 0 ? "-" : opts.signed && n > 0 ? "+" : "";
  return `${sign}${body}${NBSP}Kz`;
}

/** 0.873 -> "87%" ; with decimals 1 -> "87,3%" */
export function formatPct(ratio: number | null | undefined, decimals = 0, signed = false): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  const v = (ratio * 100).toFixed(decimals).replace(".", ",");
  const sign = signed && ratio > 0 ? "+" : "";
  return `${sign}${v}%`;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return "—";
  return `${groupThousands(String(Math.round(km)))}${NBSP}km`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-03" -> "03/08/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-08-03" -> "3 Aug" */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** "2026-08-01" -> "Aug 2026" ; long -> "August 2026" */
export function formatMonth(iso: string, long = false): string {
  const [y, m] = iso.slice(0, 10).split("-");
  const idx = Number(m) - 1;
  return long ? `${MONTHS_LONG[idx]} ${y}` : `${MONTHS[idx]} ${y}`;
}

/** Monday iso -> "3–9 Aug" */
export function formatWeek(weekStart: string): string {
  const end = addDaysIso(weekStart, 6);
  const [, m1, d1] = weekStart.split("-");
  const [, m2, d2] = end.split("-");
  if (m1 === m2) return `${Number(d1)}–${Number(d2)} ${MONTHS[Number(m1) - 1]}`;
  return `${Number(d1)} ${MONTHS[Number(m1) - 1]} – ${Number(d2)} ${MONTHS[Number(m2) - 1]}`;
}

/** "2026-08-05T09:12:00+00:00" -> "05/08/2026 10:12" (Luanda, UTC+1) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime() + 3600_000;
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// local copy to avoid a circular import with time.ts
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
