import "server-only";
import type { SB } from "./fleet";
import { fetchBaanoolDevices, hasFix, matchesPlate, mileageToKm, type GpsDevice } from "@/lib/gps/baanool";
import type { GpsSnapshot, OdometerReading, Vehicle } from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";
import { summarizeMileage, type MileagePoint, type MileageSummary } from "@/lib/gps/mileage";
import { addDays } from "@/lib/time";

export type GpsSettings = { token: string | null; token_set_at: string | null; mileage_unit: "km" | "m"; last_sync_at: string | null; last_error: string | null };

export async function getGpsSettings(sb: SB): Promise<GpsSettings | null> {
  const { data } = await sb.from("gps_settings").select("token, token_set_at, mileage_unit, last_sync_at, last_error").eq("id", 1).maybeSingle();
  return (data as GpsSettings | null) ?? null;
}

export async function getLatestGps(sb: SB): Promise<Map<string, GpsSnapshot>> {
  const { data } = await sb.from("vehicle_latest_gps").select("*");
  const out = new Map<string, GpsSnapshot>();
  for (const r of (data ?? []) as GpsSnapshot[]) {
    out.set(r.vehicle_id, { ...r, speed_kmh: r.speed_kmh == null ? null : num(r.speed_kmh), mileage_km: r.mileage_km == null ? null : num(r.mileage_km) });
  }
  return out;
}

export async function getOdometerReadings(sb: SB, vehicleId?: string): Promise<OdometerReading[]> {
  let q = sb.from("odometer_readings").select("*").order("read_on", { ascending: true });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { data } = await q;
  return ((data ?? []) as OdometerReading[]).map((r) => ({ ...r, tracker_km: r.tracker_km == null ? null : num(r.tracker_km) }));
}

export type VehicleMileage = { summary: MileageSummary; first: OdometerReading | null; last: OdometerReading | null };

/**
 * Current km and km driven in the last 7 / 30 days per vehicle, counted from the first dashboard reading when there
 * is one. Only the snapshots the summary needs are read (latest, and the last before / first after each window
 * start), so the cost stays flat as history grows.
 */
export async function getMileageSummaries(sb: SB, vehicleIds: string[], nowMs: number): Promise<Map<string, VehicleMileage>> {
  const rows = (r: { data: unknown }): MileagePoint[] =>
    ((r.data ?? []) as MileagePoint[]).map((p) => ({ taken_at: p.taken_at, mileage_km: p.mileage_km == null ? null : num(p.mileage_km) }));
  const readings = await getOdometerReadings(sb);
  const out = new Map<string, VehicleMileage>();
  await Promise.all(vehicleIds.map(async (id) => {
    const mine = readings.filter((r) => r.vehicle_id === id);
    const first = mine[0] ?? null;
    const startReading = mine.find((r) => r.tracker_km != null && r.tracker_at);
    const start = startReading ? { taken_at: startReading.tracker_at!, mileage_km: startReading.tracker_km } : null;
    const q = () => sb.from("gps_snapshots").select("taken_at, mileage_km").eq("vehicle_id", id).not("mileage_km", "is", null);
    const starts = [7, 30].map((d) => new Date(nowMs - d * 86_400_000).toISOString());
    const res = await Promise.all([
      q().order("taken_at", { ascending: false }).limit(1),
      ...starts.flatMap((iso) => [
        q().lte("taken_at", iso).order("taken_at", { ascending: false }).limit(1),
        q().gt("taken_at", iso).order("taken_at", { ascending: true }).limit(1),
      ]),
    ]);
    out.set(id, { summary: summarizeMileage(res.flatMap(rows), nowMs, start), first, last: mine[mine.length - 1] ?? null });
  }));
  return out;
}

export type CalibrationResult = { plate: string; odometer_km: number; tracker_km: number | null; previous_km: number; offset_km: number | null };

/**
 * Records a dashboard reading and calibrates the tracker: offset = reading - tracker mileage at the end of that day
 * (the latest snapshot for today), and the vehicle odometer is set to latest tracker mileage + offset (it may go down
 * when the tracker over-counted). Without tracker data the reading becomes the odometer as is.
 */
export async function recordOdometerReading(sb: SB, v: Vehicle, readOn: string, km: number, driverId: string | null): Promise<CalibrationResult> {
  const snap = async (before?: string) => {
    let q = sb.from("gps_snapshots").select("taken_at, mileage_km").eq("vehicle_id", v.id).not("mileage_km", "is", null);
    if (before) q = q.lt("taken_at", before);
    const { data } = await q.order("taken_at", { ascending: false }).limit(1).maybeSingle();
    const p = data as MileagePoint | null;
    return p && p.mileage_km != null ? { taken_at: p.taken_at, mileage_km: num(p.mileage_km) } : null;
  };
  const [atRead, latest, newer] = await Promise.all([
    snap(`${addDays(readOn, 1)}T00:00:00+01:00`), snap(),
    sb.from("odometer_readings").select("id", { count: "exact", head: true }).eq("vehicle_id", v.id).gt("read_on", readOn),
  ]);
  const offset = atRead ? km - Math.round(atRead.mileage_km) : null;
  const { error } = await sb.from("odometer_readings").upsert({
    vehicle_id: v.id, read_on: readOn, odometer_km: km, driver_id: driverId,
    tracker_km: atRead?.mileage_km ?? null, tracker_at: atRead?.taken_at ?? null,
  }, { onConflict: "vehicle_id,read_on" });
  if (error) throw new Error(error.message);
  // a backdated reading is kept for the record but does not override the calibration from a newer one
  if ((newer.count ?? 0) > 0) return { plate: v.plate, odometer_km: km, tracker_km: atRead?.mileage_km ?? null, previous_km: v.odometer_km, offset_km: null };
  const odometer = offset != null && latest ? Math.round(latest.mileage_km) + offset : km;
  const { error: vErr } = await sb.from("vehicles").update({
    odometer_km: odometer, ...(offset != null ? { gps_odometer_offset_km: offset } : {}),
  }).eq("id", v.id);
  if (vErr) throw new Error(vErr.message);
  return { plate: v.plate, odometer_km: km, tracker_km: atRead?.mileage_km ?? null, previous_km: v.odometer_km, offset_km: offset };
}

const STALE_SYNC_MS = 10 * 60 * 1000;

/** Syncs only when the last successful BAANOOL pull is older than 10 minutes, so pages other than /fleet stay fast. */
export async function syncGpsIfStale(sb: SB, nowMs: number): Promise<GpsSyncResult | null> {
  const settings = await getGpsSettings(sb);
  if (!settings?.token) return { status: "no_token" };
  if (settings.last_sync_at && nowMs - new Date(settings.last_sync_at).getTime() < STALE_SYNC_MS) return null;
  return syncGps(sb);
}

export type GpsSyncResult =
  | { status: "no_token" }
  | { status: "error"; error: string; tokenExpired: boolean; rawText: string | null }
  | { status: "ok"; devices: GpsDevice[]; matched: { plate: string; device_id: string; stored: boolean }[]; unmatched: GpsDevice[]; rawText: string };

const MIN_SNAPSHOT_GAP_MS = 10 * 60 * 1000;

/**
 * Pulls the device list from BAANOOL, auto-maps devices to vehicles by plate digits (only for unmapped vehicles),
 * stores a snapshot per vehicle at most every 10 minutes (unless forced), and raises the vehicle odometer to
 * tracker mileage + per-vehicle offset when that is higher. Works with the signed-in staff client (RLS) or the
 * service-role client (cron).
 */
export async function syncGps(sb: SB, opts: { force?: boolean } = {}): Promise<GpsSyncResult> {
  const settings = await getGpsSettings(sb);
  if (!settings?.token) return { status: "no_token" };
  const res = await fetchBaanoolDevices(settings.token);
  if (!res.ok) {
    await sb.from("gps_settings").update({ last_error: res.error }).eq("id", 1);
    return { status: "error", error: res.error, tokenExpired: res.tokenExpired, rawText: res.rawText };
  }

  const { data: vdata } = await sb.from("vehicles").select("*");
  const vehicles = (vdata ?? []) as Vehicle[];
  const taken = new Set(vehicles.map((v) => v.gps_device_id).filter(Boolean) as string[]);
  for (const v of vehicles) {
    if (v.gps_device_id) continue;
    const d = res.devices.find((x) => !taken.has(x.device_id) && matchesPlate(v.plate, x.name));
    if (d) {
      const { error } = await sb.from("vehicles").update({ gps_device_id: d.device_id }).eq("id", v.id);
      if (!error) { v.gps_device_id = d.device_id; taken.add(d.device_id); }
    }
  }

  const latest = await getLatestGps(sb);
  const now = Date.now();
  const matched: { plate: string; device_id: string; stored: boolean }[] = [];
  for (const v of vehicles) {
    const d = v.gps_device_id ? res.devices.find((x) => x.device_id === v.gps_device_id) : undefined;
    if (!d) continue;
    const prev = latest.get(v.id);
    const due = opts.force || !prev || now - new Date(prev.taken_at).getTime() >= MIN_SNAPSHOT_GAP_MS;
    const mileageKm = mileageToKm(d.mileage_raw, settings.mileage_unit);
    let stored = false;
    if (due) {
      const { error } = await sb.from("gps_snapshots").insert({
        vehicle_id: v.id, device_id: d.device_id, position_at: d.position_at, position_text: d.position_text,
        lat: hasFix(d) ? d.lat : null, lng: hasFix(d) ? d.lng : null, speed_kmh: d.speed_kmh, mileage_km: mileageKm, online: d.online, raw: d.raw,
      });
      stored = !error;
    }
    if (mileageKm !== null) {
      const odo = Math.round(mileageKm + (v.gps_odometer_offset_km ?? 0));
      if (odo > (v.odometer_km ?? 0)) await sb.from("vehicles").update({ odometer_km: odo }).eq("id", v.id);
    }
    matched.push({ plate: v.plate, device_id: d.device_id, stored });
  }
  await sb.from("gps_settings").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", 1);
  const mappedIds = new Set(vehicles.map((v) => v.gps_device_id));
  return { status: "ok", devices: res.devices, matched, unmatched: res.devices.filter((d) => !mappedIds.has(d.device_id)), rawText: res.rawText };
}
