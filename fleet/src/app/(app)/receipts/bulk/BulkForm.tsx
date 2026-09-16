"use client";
import { useActionState, useMemo, useState } from "react";
import { bulkUpdateEvents } from "./actions";
import type { ActionResult } from "@/app/(app)/rent/actions";
import { Button, inputCls, Notice, Table, td, tdNum, th, thNum } from "@/components/ui";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from "@/lib/maintenance/categories";
import { formatAOA, formatDate } from "@/lib/format";

export type BulkRow = { id: string; date: string; plate: string; category: string; total_aoa: number; odometer_km: number | null; vendor: string | null; notes: string | null };

export function BulkForm({ rows }: { rows: BulkRow[] }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(bulkUpdateEvents, undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [minAmount, setMinAmount] = useState<string>("");
  const visible = useMemo(() => rows.filter((r) => minAmount === "" || r.total_aoa >= Number(minAmount)), [rows, minAmount]);
  const allVisible = visible.length > 0 && visible.every((r) => checked.has(r.id));

  function toggleAll() {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisible) visible.forEach((r) => next.delete(r.id)); else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggle(id: string) {
    setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return (
    <form action={action}>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <label>Apply category to ticked rows
          <select name="category" defaultValue="" className={`${inputCls} w-48`}>
            <option value="">choose…</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label>Vendor (optional)<input name="vendor" className={`${inputCls} w-44`} placeholder="e.g. Sonangol" /></label>
        <label>Quick filter: amount ≥<input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className={`${inputCls} w-32`} placeholder="e.g. 10000" /></label>
        <Button type="submit" disabled={pending}>{pending ? "…" : `Apply to ${checked.size} ticked`}</Button>
        <span className="text-xs text-gray-500">Odometer values you type are saved on submit even for unticked rows.</span>
      </div>
      {state && <div className="mb-3"><Notice kind={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</Notice></div>}
      <Table>
        <thead>
          <tr>
            <th className={th}><input type="checkbox" checked={allVisible} onChange={toggleAll} aria-label="select all" /></th>
            <th className={th}>Date</th><th className={th}>Vehicle</th><th className={th}>Category</th><th className={thNum}>Amount</th>
            <th className={th}>Odometer (km)</th><th className={th}>Vendor</th><th className={th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} className={checked.has(r.id) ? "bg-amber-50" : ""}>
              <td className={td}><input type="checkbox" name="selected" value={r.id} checked={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className={td}>{formatDate(r.date)}</td>
              <td className={td}>{r.plate}</td>
              <td className={td}>{CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] ?? r.category}</td>
              <td className={tdNum}>{formatAOA(r.total_aoa)}</td>
              <td className={td}><input name={`odo_${r.id}`} type="number" min={0} defaultValue={r.odometer_km ?? ""} className={`${inputCls} w-28`} /></td>
              <td className={`${td} text-gray-600`}>{r.vendor ?? "—"}</td>
              <td className={`${td} text-xs text-gray-500`}>{r.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-gray-500">{visible.length} of {rows.length} rows shown.</p>
    </form>
  );
}
