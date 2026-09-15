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
        <Button variant="secondary" onClick={() => setOpen(true)}>Registar pagamento</Button>
        {state?.ok && <span className="text-xs text-emerald-700">{state.message}</span>}
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="driver_id" value={driverId} />
      <input type="hidden" name="week_start" value={weekStart} />
      <label className="text-xs">Valor (Kz)<input name="amount_aoa" type="number" min={1} step={1} defaultValue={suggested > 0 ? suggested : undefined} required className={`${inputCls} w-32`} /></label>
      <label className="text-xs">Data<input name="paid_at" type="datetime-local" defaultValue={defaultPaidAt} required className={`${inputCls} w-44`} /></label>
      <label className="text-xs">Método
        <select name="method" defaultValue="transfer" className={`${inputCls} w-32`}>
          <option value="transfer">Transferência</option><option value="multicaixa">Multicaixa</option><option value="cash">Numerário</option><option value="other">Outro</option>
        </select>
      </label>
      <label className="text-xs">Nota<input name="note" className={`${inputCls} w-36`} placeholder="ref. comprovativo" /></label>
      <Button type="submit" disabled={pending}>{pending ? "…" : "Guardar"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      {state && !state.ok && <span className="w-full text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
