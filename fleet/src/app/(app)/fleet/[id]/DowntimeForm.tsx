"use client";
import { useActionState } from "react";
import { addDowntime } from "@/app/(app)/settings/actions";
import { Button, inputCls } from "@/components/ui";
import type { ActionResult } from "@/app/(app)/rent/actions";

export function DowntimeForm({ vehicleId, today }: { vehicleId: string; today: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(addDowntime, undefined);
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <label>From<input name="from_date" type="date" defaultValue={today} required className={inputCls} /></label>
      <label>To<input name="to_date" type="date" defaultValue={today} required className={inputCls} /></label>
      <label className="col-span-2">Reason<input name="reason" required placeholder="e.g. workshop, accident" className={inputCls} /></label>
      <div className="col-span-2 flex items-center gap-2"><Button type="submit" disabled={pending}>Record downtime</Button>{state && <span className={state.ok ? "text-emerald-700" : "text-red-700"}>{state.ok ? "Saved." : state.error}</span>}</div>
    </form>
  );
}
