"use client";
import { useActionState, useState } from "react";
import { saveReceiptEvent, type SaveResult } from "../actions";
import { Button, Card, Field, inputCls, Notice } from "@/components/ui";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/maintenance/categories";
import type { ReceiptDraft, ReceiptLineItem } from "@/lib/receipts/extract";

type VehicleOpt = { id: string; plate: string; odometer_km: number };

export function ReceiptReview({ vehicles, today }: { vehicles: VehicleOpt[]; today: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(today);
  const [total, setTotal] = useState<string>("");
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [odometer, setOdometer] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptLineItem[]>([]);
  const [state, action, pending] = useActionState<SaveResult | undefined, FormData>(saveReceiptEvent, undefined);

  async function analyse() {
    if (!file) return;
    setExtracting(true); setExtractError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/receipts/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const d = (await res.json()) as ReceiptDraft;
      setDraft(d);
      if (d.vendor) setVendor(d.vendor);
      if (d.date) setDate(d.date);
      if (d.total_aoa != null) setTotal(String(d.total_aoa));
      if (d.category) setCategory(d.category);
      if (d.odometer_km != null) setOdometer(String(d.odometer_km));
      if (d.notes) setNotes(d.notes);
      setItems(d.line_items ?? []);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Falha na extracção");
    } finally {
      setExtracting(false);
    }
  }

  function updateItem(i: number, patch: Partial<ReceiptLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  if (state?.ok) {
    return (
      <Notice kind="success">
        {state.message} <a className="underline" href="/recibos/novo">Registar outra</a> · <a className="underline" href="/recibos">Ver lista</a>
      </Notice>
    );
  }

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-3">
      <Card title="1 · Ficheiro" className="lg:col-span-1">
        <input name="file" type="file" accept="image/*,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDraft(null); }} className="block w-full text-sm" />
        <Button type="button" variant="secondary" className="mt-3" disabled={!file || extracting} onClick={analyse}>{extracting ? "A analisar…" : "Analisar recibo"}</Button>
        {extractError && <p className="mt-2 text-xs text-red-700">{extractError}</p>}
        {draft && (
          <p className="mt-2 text-xs text-gray-500">
            Extraído via {draft.provider === "anthropic" ? `Claude (${draft.usage?.model ?? "vision"})` : "sem IA"} · confiança {Math.round(draft.confidence * 100)}%
            {draft.notes && <><br />Nota: {draft.notes}</>}
          </p>
        )}
        <input type="hidden" name="extraction" value={draft ? JSON.stringify(draft) : ""} />
        <input type="hidden" name="extraction_provider" value={draft?.provider ?? "none"} />
        <p className="mt-3 text-xs text-gray-500">O ficheiro é opcional: pode registar uma despesa só com o formulário.</p>
      </Card>

      <Card title="2 · Rever e guardar" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Viatura *">
            <select name="vehicle_id" required className={inputCls} defaultValue="">
              <option value="" disabled>escolha…</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.odometer_km} km</option>)}
            </select>
          </Field>
          <Field label="Categoria *">
            <select name="category" required className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              <option value="" disabled>escolha…</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="Data *"><input name="event_date" type="date" required className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Total (Kz) *"><input name="total_aoa" type="number" min={0} step="0.01" required className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
          <Field label="Fornecedor"><input name="vendor" className={inputCls} value={vendor} onChange={(e) => setVendor(e.target.value)} /></Field>
          <Field label="Odómetro (km)" hint="actualiza o odómetro da viatura se for superior"><input name="odometer_km" type="number" min={0} className={inputCls} value={odometer} onChange={(e) => setOdometer(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Notas"><textarea name="notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium text-gray-700">Linhas</span><Button type="button" variant="ghost" onClick={() => setItems((p) => [...p, { description: "", qty: 1, unit_price_aoa: 0 }])}>+ linha</Button></div>
          {items.length ? (
            <div className="space-y-1">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-1">
                  <input className={`${inputCls} col-span-7`} placeholder="descrição" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                  <input className={`${inputCls} col-span-2`} type="number" step="0.01" value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })} />
                  <input className={`${inputCls} col-span-2`} type="number" step="0.01" value={it.unit_price_aoa} onChange={(e) => updateItem(i, { unit_price_aoa: Number(e.target.value) })} />
                  <button type="button" className="col-span-1 text-xs text-red-700" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">Sem linhas (opcional).</p>}
          <input type="hidden" name="line_items" value={JSON.stringify(items)} />
        </div>

        {state && !state.ok && <div className="mt-3"><Notice kind="error">{state.error}</Notice></div>}
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={pending || !category}>{pending ? "A guardar…" : "Guardar despesa"}</Button>
          <span className="text-xs text-gray-500">Nada é guardado sem a sua confirmação.</span>
        </div>
      </Card>
    </form>
  );
}
