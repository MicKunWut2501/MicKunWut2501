"use client";
import { useTransition } from "react";
import { endSchedule } from "./actions";

export function EndScheduleButton({ id, today }: { id: string; today: string }) {
  const [pending, start] = useTransition();
  return <button disabled={pending} className="text-xs text-red-700 underline" onClick={() => { if (confirm("End this assignment today?")) start(async () => { await endSchedule(id, today); }); }}>end</button>;
}
