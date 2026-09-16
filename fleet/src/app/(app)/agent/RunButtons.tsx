"use client";
import { useState, useTransition } from "react";
import { runRentAlertsNow, runWeeklyBriefNow } from "./actions";
import { Button } from "@/components/ui";

export function RunButtons() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? r.message ?? "OK" : r.error ?? "error");
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} onClick={() => run(runWeeklyBriefNow)}>{pending ? "…" : "Generate weekly brief now"}</Button>
      <Button variant="secondary" disabled={pending} onClick={() => run(runRentAlertsNow)}>Generate rent alerts now</Button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
