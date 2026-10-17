"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordOdometerReading, syncGps, type CalibrationResult } from "@/lib/data/gps";
import { getSchedules, getVehicles } from "@/lib/data/fleet";
import { formatKm } from "@/lib/format";
import { luandaToday } from "@/lib/time";
import type { ActionResult } from "@/app/(app)/rent/actions";

export async function refreshGps(): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const sb = await createClient();
  const r = await syncGps(sb, { force: true });
  revalidatePath("/fleet");
  return r.status === "ok" ? { ok: true } : { ok: false, error: r.status === "error" ? r.error : "No token saved." };
}

const KmSchema = z.coerce.number().int().min(0).max(2_000_000);

/** Dashboard km reported by the drivers, one field per car (`km_<vehicle id>`, blank = skip), all for one date. */
export async function recordOdometerReadings(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const today = luandaToday();
  const readOn = String(fd.get("read_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readOn) || readOn > today) return { ok: false, error: "Pick a date that is not in the future." };
  const sb = await createClient();
  const [vehicles, schedules] = await Promise.all([getVehicles(sb), getSchedules(sb)]);
  const entries: { id: string; km: number }[] = [];
  for (const v of vehicles) {
    const raw = String(fd.get(`km_${v.id}`) ?? "").replace(/[\s.,]/g, "");
    if (!raw) continue;
    const km = KmSchema.safeParse(raw);
    if (!km.success) return { ok: false, error: `${v.plate}: enter whole kilometres.` };
    entries.push({ id: v.id, km: km.data });
  }
  if (!entries.length) return { ok: false, error: "Enter the km for at least one car." };
  // fresh tracker reading so today's calibration matches the moment the readings arrive
  if (readOn === today) await syncGps(sb, { force: true });
  const fresh = await getVehicles(sb);
  const done: CalibrationResult[] = [];
  try {
    for (const e of entries) {
      const v = fresh.find((x) => x.id === e.id)!;
      const s = schedules.find((x) => x.vehicle_id === v.id && x.valid_from <= readOn && (!x.valid_to || x.valid_to >= readOn));
      done.push(await recordOdometerReading(sb, v, readOn, e.km, s?.driver_id ?? null));
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
  }
  for (const p of ["/dashboard", "/fleet"]) revalidatePath(p);
  revalidatePath("/fleet/[id]", "page");
  return {
    ok: true,
    message: "Saved: " + done.map((d) => `${d.plate} ${formatKm(d.odometer_km)}${d.tracker_km != null && d.offset_km != null ? ` (tracker ${formatKm(d.tracker_km)}, ${d.offset_km >= 0 ? "+" : "−"}${formatKm(Math.abs(d.offset_km))})` : ""}`).join(" · "),
  };
}
