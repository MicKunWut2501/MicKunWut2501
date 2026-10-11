/**
 * BAANOOL IOT (baanooliot.com) unofficial web API, as used by the vendor's own web app.
 * POST https://www.baanooliot.com/car-api/bnclw-onboard/personController/getMyDeviceListData
 * Header `token: <32-hex session token>` (sessionStorage.token on baanooliot.com), empty form body.
 * Observed answer (2026-10-12): {status: 0, resmsg: "SUCCESS", data: [{devices: [{dno: <IMEI>, carNum, name, lat, lng,
 * speed, mileage (km), online 0/1, acc_status, updateTime "YYYY-MM-DD HH:mm:ss", timeZone "1.0", ...}], groups, deviceNums}]}.
 * Parsing stays tolerant: it picks the array that looks most like devices and maps fields by common names.
 */

export const BAANOOL_DEVICE_LIST_URL = "https://www.baanooliot.com/car-api/bnclw-onboard/personController/getMyDeviceListData";

export type GpsDevice = {
  device_id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  speed_kmh: number | null;
  position_at: string | null; // ISO, only when the source gives an unambiguous timestamp
  position_text: string | null; // the source's own time text
  mileage_raw: number | null; // in the platform's unit, see mileageToKm
  online: boolean | null;
  raw: Record<string, unknown>;
};

export type ParseResult =
  | { ok: true; devices: GpsDevice[] }
  | { ok: false; error: string; tokenExpired: boolean };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const KEYS = {
  id: ["dno", "imei", "deviceImei", "deviceNo", "deviceNumber", "deviceId", "devId", "sn", "id"],
  name: ["carNum", "deviceName", "carNumber", "plateNumber", "plateNo", "carNo", "name", "nickName", "remark"],
  lat: ["lat", "latitude", "gpsLat", "glat", "la", "y"],
  lng: ["lng", "lon", "longitude", "gpsLng", "gpsLon", "glng", "lo", "x"],
  speed: ["speed", "gpsSpeed", "velocity"],
  time: ["gpsTime", "locationTime", "positionTime", "gpsDate", "lastTime", "updateTime", "time", "deviceTime"],
  mileage: ["totalMileage", "mileage", "totalMile", "mile", "odometer", "totalDistance", "distance"],
  online: ["online", "isOnline", "onlineStatus", "onLine"],
};
const NESTED = ["location", "lastLocation", "position", "gps", "lastGps", "locationInfo", "gpsInfo"];

function lookup(o: Obj, names: string[]): unknown {
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), k]));
  for (const n of names) {
    const k = lower.get(n.toLowerCase());
    if (k !== undefined && o[k] !== null && o[k] !== "") return o[k];
  }
  for (const nest of NESTED) {
    const k = lower.get(nest.toLowerCase());
    if (k !== undefined && isObj(o[k])) {
      const v = lookup(o[k] as Obj, names);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true" || v === "online") return true;
  if (v === 0 || v === "0" || v === "false" || v === "offline") return false;
  return null;
}

/**
 * Epoch numbers (s or ms) and ISO strings with a zone become ISO. Zone-less "YYYY-MM-DD HH:mm:ss" text becomes ISO only
 * when the device reports its own UTC offset in hours (BAANOOL `timeZone: "1.0"`); otherwise it is kept as text.
 */
export function parseTime(v: unknown, tzHours: number | null = null): { iso: string | null; text: string | null } {
  if (v === undefined || v === null || v === "") return { iso: null, text: null };
  const n = toNum(v);
  if (n !== null && n > 1e9) {
    const ms = n < 1e12 ? n * 1000 : n;
    return { iso: new Date(ms).toISOString(), text: String(v) };
  }
  if (typeof v === "string" && /(Z|[+-]\d{2}:?\d{2})$/.test(v.trim()) && !Number.isNaN(Date.parse(v))) {
    return { iso: new Date(v).toISOString(), text: v };
  }
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/) : null;
  if (m && tzHours !== null && Number.isFinite(tzHours) && Math.abs(tzHours) <= 14) {
    const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0) - tzHours * 3600_000;
    return { iso: new Date(utc).toISOString(), text: String(v) };
  }
  return { iso: null, text: String(v) };
}

/** Walks the whole answer and returns the array of objects that looks most like a device list (id + coordinates). */
function findArray(root: unknown): Obj[] | null {
  let best: { arr: Obj[]; score: number } | null = null;
  const visit = (v: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(v)) {
      const objs = v.filter(isObj);
      if (objs.length) {
        const score = objs.reduce((a, o) => a + (lookup(o, KEYS.id) !== undefined ? 1 : 0) + (lookup(o, KEYS.lat) !== undefined ? 2 : 0), 0);
        if (score > 0 && (!best || score > best.score)) best = { arr: objs, score };
      }
      for (const x of v) visit(x, depth + 1);
    } else if (isObj(v)) {
      for (const x of Object.values(v)) visit(x, depth + 1);
    }
  };
  visit(root, 0);
  return (best as { arr: Obj[]; score: number } | null)?.arr ?? null;
}

export function parseDeviceList(json: unknown): ParseResult {
  if (isObj(json)) {
    const code = json.code ?? json.status ?? json.errCode ?? json.errorCode;
    const msg = String(json.msg ?? json.resmsg ?? json.message ?? json.errMsg ?? json.error ?? "");
    const okCodes = [0, 1, 200, "0", "1", "200", "success", "SUCCESS", "ok", "OK", undefined, null];
    const failed = json.success === false || !okCodes.includes(code as never);
    if (failed) {
      const tokenExpired = [401, 403, "401", "403"].includes(code as never) || /token|login|登录|过期|expire|unauthori|invalid/i.test(msg);
      return { ok: false, error: msg || `BAANOOL returned code ${String(code)}`, tokenExpired };
    }
  }
  const arr = findArray(json);
  if (!arr) return { ok: false, error: "No device list found in the BAANOOL response.", tokenExpired: false };
  const devices: GpsDevice[] = [];
  for (const raw of arr) {
    const id = lookup(raw, KEYS.id);
    if (id === undefined) continue;
    const t = parseTime(lookup(raw, KEYS.time), toNum(lookup(raw, ["timeZone", "timezone", "tz"])));
    devices.push({
      device_id: String(id),
      name: (lookup(raw, KEYS.name) as string | undefined) != null ? String(lookup(raw, KEYS.name)) : null,
      lat: toNum(lookup(raw, KEYS.lat)),
      lng: toNum(lookup(raw, KEYS.lng)),
      speed_kmh: toNum(lookup(raw, KEYS.speed)),
      position_at: t.iso,
      position_text: t.text,
      mileage_raw: toNum(lookup(raw, KEYS.mileage)),
      online: toBool(lookup(raw, KEYS.online)),
      raw,
    });
  }
  return { ok: true, devices };
}

export function mileageToKm(raw: number | null, unit: "km" | "m"): number | null {
  if (raw === null) return null;
  return unit === "m" ? raw / 1000 : raw;
}

/** Plate "LDA-10-53-AG" matches a device named e.g. "Suzuki 10-53" or "LDA1053AG". */
export function matchesPlate(plate: string, deviceName: string | null): boolean {
  if (!deviceName) return false;
  const digits = plate.replace(/\D/g, "");
  if (digits.length < 3) return false;
  return deviceName.replace(/\D/g, "").includes(digits);
}

/** Usable coordinate (rejects 0,0 which trackers send before the first fix). */
export function hasFix(d: { lat: number | null; lng: number | null }): boolean {
  return d.lat !== null && d.lng !== null && Math.abs(d.lat) <= 90 && Math.abs(d.lng) <= 180 && !(d.lat === 0 && d.lng === 0);
}

export type FetchResult =
  | { ok: true; devices: GpsDevice[]; rawText: string }
  | { ok: false; error: string; tokenExpired: boolean; rawText: string | null };

export async function fetchBaanoolDevices(token: string, fetchImpl: typeof fetch = fetch): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetchImpl(BAANOOL_DEVICE_LIST_URL, {
      method: "POST",
      headers: {
        token,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Origin: "https://www.baanooliot.com",
        Referer: "https://www.baanooliot.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
      body: "",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Could not reach BAANOOL: ${e instanceof Error ? e.message : String(e)}`, tokenExpired: false, rawText: null };
  }
  const rawText = await res.text();
  if (!res.ok) {
    return { ok: false, error: `BAANOOL answered HTTP ${res.status}`, tokenExpired: res.status === 401 || res.status === 403, rawText };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "BAANOOL answered with something that is not JSON (token expired or login page?).", tokenExpired: true, rawText };
  }
  const parsed = parseDeviceList(json);
  return parsed.ok ? { ok: true, devices: parsed.devices, rawText } : { ...parsed, rawText };
}
