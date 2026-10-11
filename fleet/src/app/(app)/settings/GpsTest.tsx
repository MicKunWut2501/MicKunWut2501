"use client";
import { useState, useTransition } from "react";
import { testGpsConnection, type GpsTestResult } from "./actions";
import { Button, Notice, Table, td, th } from "@/components/ui";

export function GpsTest() {
  const [res, setRes] = useState<GpsTestResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setRes(await testGpsConnection()))}>
        {pending ? "Contacting BAANOOL…" : "Test connection"}
      </Button>
      {res && !res.ok && (
        <div className="mt-2 space-y-2">
          <Notice kind="error">{res.error}{res.tokenExpired ? " Log in at baanooliot.com, copy a fresh token and save it above." : ""}</Notice>
          {res.raw && <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs">{res.raw}</pre>}
        </div>
      )}
      {res && res.ok && (
        <div className="mt-2 space-y-2">
          <Notice kind="success">{res.devices.length} device(s) found. Linked devices were saved as a position snapshot.</Notice>
          <Table>
            <thead><tr><th className={th}>Device ID</th><th className={th}>Name</th><th className={th}>Position</th><th className={th}>Mileage (raw)</th><th className={th}>Time</th><th className={th}>Linked to</th></tr></thead>
            <tbody>
              {res.devices.map((d) => (
                <tr key={d.device_id}>
                  <td className={`${td} font-mono text-xs`}>{d.device_id}</td><td className={td}>{d.name ?? "—"}</td>
                  <td className={td}>{d.lat != null && d.lng != null ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : "—"}</td>
                  <td className={td}>{d.mileage ?? "—"}</td><td className={td}>{d.time ?? "—"}</td><td className={td}>{d.linkedTo ?? <span className="text-amber-700">not linked</span>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <details className="text-xs"><summary className="cursor-pointer text-gray-600">Raw answer from BAANOOL (send this to Claude if a column is empty)</summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-gray-50 p-2">{res.raw}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
