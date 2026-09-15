"use client";
import { useActionState } from "react";
import { addDowntime } from "@/app/(app)/definicoes/actions";
import { Button, inputCls } from "@/components/ui";
import type { ActionResult } from "@/app/(app)/cobranca/actions";

export function DowntimeForm({ vehicleId, today }: { vehicleId: string; today: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(addDowntime, undefined);
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <label>De<input name="from_date" type="date" defaultValue={today} required className={inputCls} /></label>
      <label>Até<input name="to_date" type="date" defaultValue={today} required className={inputCls} /></label>
      <label className="col-span-2">Motivo<input name="reason" required placeholder="ex. oficina, acidente" className={inputCls} /></label>
      <div className="col-span-2 flex items-center gap-2"><Button type="submit" disabled={pending}>Registar paragem</Button>{state && <span className={state.ok ? "text-emerald-700" : "text-red-700"}>{state.ok ? "Guardado." : state.error}</span>}</div>
    </form>
  );
}
