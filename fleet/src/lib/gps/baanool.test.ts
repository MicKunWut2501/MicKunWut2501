import { describe, expect, it } from "vitest";
import { fetchBaanoolDevices, hasFix, matchesPlate, mileageToKm, parseDeviceList, parseTime } from "./baanool";

describe("parseDeviceList", () => {
  it("reads a {code, data: [...]} shape with common field names", () => {
    const r = parseDeviceList({
      code: 0, msg: "success",
      data: [
        { imei: "861234567890123", deviceName: "Suzuki 10-53", lat: "-8.8383", lng: "13.2344", speed: 42, gpsTime: 1791754444000, totalMileage: 18234.5, online: 1 },
        { imei: "861234567890456", deviceName: "LDA 72-39", latitude: -8.9, longitude: 13.3, speed: "0", gpsTime: "2026-10-11 10:00:00" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.devices).toHaveLength(2);
    const [a, b] = r.devices;
    expect(a.device_id).toBe("861234567890123");
    expect(a.lat).toBeCloseTo(-8.8383);
    expect(a.lng).toBeCloseTo(13.2344);
    expect(a.speed_kmh).toBe(42);
    expect(a.mileage_raw).toBe(18234.5);
    expect(a.online).toBe(true);
    expect(a.position_at).toBe(new Date(1791754444000).toISOString());
    expect(b.lat).toBeCloseTo(-8.9);
    expect(b.position_at).toBeNull(); // zone-less text is not guessed
    expect(b.position_text).toBe("2026-10-11 10:00:00");
  });
  it("finds the array under data.list and nested location objects", () => {
    const r = parseDeviceList({ success: true, data: { total: 1, list: [{ deviceNo: "A1", name: "Car", location: { latitude: -8.8, longitude: 13.2 }, mileage: 5000 }] } });
    expect(r.ok && r.devices[0].lat).toBeCloseTo(-8.8);
    expect(r.ok && r.devices[0].mileage_raw).toBe(5000);
  });
  it("flags expired tokens", () => {
    const r = parseDeviceList({ code: 401, msg: "token invalid" });
    expect(r).toEqual({ ok: false, error: "token invalid", tokenExpired: true });
    const r2 = parseDeviceList({ code: 500, msg: "请重新登录" });
    expect(!r2.ok && r2.tokenExpired).toBe(true);
  });
  it("reports a missing array", () => {
    expect(parseDeviceList({ code: 0, data: { foo: 1 } }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("parses times", () => {
    expect(parseTime(1791754444).iso).toBe(new Date(1791754444000).toISOString());
    expect(parseTime("2026-10-11T09:00:00Z").iso).toBe("2026-10-11T09:00:00.000Z");
    expect(parseTime(null)).toEqual({ iso: null, text: null });
  });
  it("converts mileage and matches plates", () => {
    expect(mileageToKm(18234500, "m")).toBe(18234.5);
    expect(mileageToKm(18234.5, "km")).toBe(18234.5);
    expect(matchesPlate("LDA-10-53-AG", "Suzuki 10-53")).toBe(true);
    expect(matchesPlate("LDA-10-53-AG", "LDA1053AG")).toBe(true);
    expect(matchesPlate("LDA-10-53-AG", "LDA 72-39")).toBe(false);
    expect(hasFix({ lat: 0, lng: 0 })).toBe(false);
    expect(hasFix({ lat: -8.8, lng: 13.2 })).toBe(true);
  });
});

describe("fetchBaanoolDevices", () => {
  it("sends the token header and parses JSON", async () => {
    let seen: RequestInit | undefined;
    const fake = (async (_u: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ code: 0, data: [{ imei: "1", lat: 1, lng: 2 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchBaanoolDevices("abc", fake);
    expect((seen?.headers as Record<string, string>).token).toBe("abc");
    expect(seen?.method).toBe("POST");
    expect(r.ok && r.devices[0].device_id).toBe("1");
  });
  it("treats an HTML login page as an expired token", async () => {
    const fake = (async () => new Response("<html>login</html>", { status: 200 })) as unknown as typeof fetch;
    const r = await fetchBaanoolDevices("abc", fake);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.tokenExpired).toBe(true);
  });
});
