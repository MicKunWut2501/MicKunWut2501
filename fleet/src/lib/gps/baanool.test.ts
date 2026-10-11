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

describe("real BAANOOL answer shape (2026-10-12, values altered)", () => {
  const answer = {
    chart: null,
    data: [{
      devices: [
        { acc: 0, speed: 0.0, uid: 1, id: 5825574, lat: -8.93336, mileage: 22717, dno: "869700000000001", lng: 13.19523, carNum: "LDA-13-06-AN", timeZone: "1.0", updateTime: "2026-10-12 05:34:40", alarmTime: "2026-10-12 05:34:40", name: "SUZUKI SPRESS LDA-13-06-AN", online: 0 },
        { acc: 0, speed: 37.5, uid: 1, id: 5310159, lat: -8.93545, mileage: 80682, dno: "869700000000002", lng: 13.20192, carNum: "LDA 10 53", timeZone: "1.0", updateTime: "2026-10-12 06:13:26", name: "Suzuki Espresso LDA-10 53 AG", online: 1 },
      ],
      groups: [{ createTime: null, id: 0, name: "defaultGroup", status: null, userId: null }],
      deviceNums: { offline: 1, total: 2, online: 1 },
    }],
    length: null, page: null, resmsg: "SUCCESS", status: 0, tips: null, totalrow: 1,
  };
  it("finds data[0].devices, not the groups array", () => {
    const r = parseDeviceList(answer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.devices.map((d) => d.device_id)).toEqual(["869700000000001", "869700000000002"]);
  });
  it("maps dno, carNum, coordinates, km mileage, online and the device-local time", () => {
    const r = parseDeviceList(answer);
    if (!r.ok) throw new Error("parse failed");
    const [a, b] = r.devices;
    expect(a.name).toBe("LDA-13-06-AN");
    expect(a.lat).toBeCloseTo(-8.93336);
    expect(a.lng).toBeCloseTo(13.19523);
    expect(a.mileage_raw).toBe(22717);
    expect(a.online).toBe(false);
    expect(b.online).toBe(true);
    expect(b.speed_kmh).toBe(37.5);
    expect(a.position_at).toBe("2026-10-12T04:34:40.000Z"); // 05:34:40 at UTC+1
    expect(matchesPlate("LDA-10-53-AG", b.name)).toBe(true);
  });
  it("reports a non-zero status as an error with resmsg", () => {
    const r = parseDeviceList({ status: 1001, resmsg: "token invalid", data: null });
    expect(r).toEqual({ ok: false, error: "token invalid", tokenExpired: true });
  });
});
