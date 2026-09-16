"use client";
import { useActionState, useState } from "react";
import { recordPayment, type ActionResult } from "./actions";
import { Button, inputCls } from "@/components/ui";

function luandaNowLocal(): string {
  return new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
}

export function PaymentForm({ driverId, weekStart, suggested }: { driverId: string; weekStart: string; suggested: number }) {
  const [open, setOpen] = useState(false);
  const [defaultPaidAt] = useState(luandaNowLocal);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(recordPayment, undefined);
  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="secondary" onClick={() => setOpen(true)}>Record payment</Button>
        {state?.ok && <span className="text-xs text-emerald-700">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="driver_id" value={driverId} />
      <input type="hidden" name="week_start" value={weekStart} />
      <label className="text-xs">Amount (Kz)<input name="amount_aoa" type="number" min={1} step={1} defaultValue={suggested > 0 ? suggested : undefined} required className={`${inputCls} w-32`} /></label>
      <label className="text-xs">Date<input name="paid_at" type="datetime-local" defaultValue={defaultPaidAt} required className={`${inputCls} w-44`} /></label>
      <label className="text-xs">Method
        <select name="method" defaultValue="transfer" className={`${inputCls} w-32`}>
          <option value="transfer">Bank transfer</option><option value="multicaixa">Multicaixa</option><option value="cash">Cash</option><option value="other">Other</option>
        </select>
      </label>
      <label className="text-xs">Note<input name="note" className={`${inputCls} w-36`} placeholder="receipt ref." /></label>
      <Button type="submit" disabled={pending}>{pending ? "…" : "Save"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {state && !state.ok && <span className="w-full text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
