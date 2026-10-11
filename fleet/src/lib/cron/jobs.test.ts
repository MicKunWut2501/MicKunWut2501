import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isLuandaMonday } from "./jobs";

describe("isLuandaMonday", () => {
  it("uses Luanda time, not UTC", () => {
    expect(isLuandaMonday(new Date("2026-10-12T07:00:00Z"))).toBe(true); // Monday 08:00 Luanda
    expect(isLuandaMonday(new Date("2026-10-11T23:30:00Z"))).toBe(true); // Sunday UTC, already Monday 00:30 Luanda
    expect(isLuandaMonday(new Date("2026-10-12T23:30:00Z"))).toBe(false); // Tuesday 00:30 Luanda
  });
});
