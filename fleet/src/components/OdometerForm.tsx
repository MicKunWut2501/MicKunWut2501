"use client";
import { useActionState } from "react";
import { recordOdometerReadings } from "@/app/(app)/fleet/actions";
import { Button, inputCls } from "@/components/ui";
import type { ActionResult } from "@/app/(app)/rent/actions";

/** Batch entry of the dashboard km the drivers send in; each reading calibrates that car's tracker. */
export function OdometerForm({ vehicles, today }: { vehicles: { id: string; plate: string; driver: string | null }[]; today: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(recordOdometerReadings, undefined);
  return (
    <form action={action} className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
      <div className="mb-2 text-sm font-medium">Record dashboard km from the drivers</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label>Date of the reading<input name="read_on" type="date" defaultValue={today} max={today} required className={inputCls} /></label>
        {vehicles.map((v) => (
          <label key={v.id}>
            {v.plate}{v.driver ? ` · ${v.driver}` : ""}
            <input name={`km_${v.id}`} inputMode="numeric" pattern="[0-9 .,]*" placeholder="km on the dashboard" className={inputCls} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save readings"}</Button>
        {state && <span className={state.ok ? "text-emerald-700" : "text-red-700"}>{state.ok ? state.message : state.error}</span>}
      </div>
      <p className="mt-2 text-gray-500">
        Leave a car blank to skip it. Each reading sets that car&apos;s current km to the dashboard value and corrects the tracker from then on.
        The first reading per car is the starting point for &quot;km driven&quot;.
      </p>
    </form>
  );
}
