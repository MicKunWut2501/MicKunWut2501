"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/maintenance/categories";
import type { ActionResult } from "@/app/(app)/rent/actions";

/**
 * Applies a category (and optional vendor) to every ticked row, and an odometer reading to every row
 * whose odometer field was filled in, ticked or not. Rows are identified by hidden `id_<n>` inputs.
 */
export async function bulkUpdateEvents(_prev: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const category = String(fd.get("category") ?? "");
  const vendor = String(fd.get("vendor") ?? "").trim();
  const selected = fd.getAll("selected").map(String).filter((id) => z.string().uuid().safeParse(id).success);
  const odometer: { id: string; km: number }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("odo_")) continue;
    const id = key.slice(4);
    const km = Number(value);
    if (z.string().uuid().safeParse(id).success && String(value).trim() !== "" && Number.isInteger(km) && km >= 0) odometer.push({ id, km });
  }
  if (!selected.length && !odometer.length) return { ok: false, error: "Tick at least one row or enter an odometer reading." };
  if (selected.length && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Choose a category to apply to the ticked rows." };

  const sb = await createClient();
  let updated = 0;
  if (selected.length) {
    const patch: Record<string, unknown> = { category };
    if (vendor) patch.vendor = vendor;
    const { error, count } = await sb.from("maintenance_events").update(patch, { count: "exact" }).in("id", selected);
    if (error) return { ok: false, error: error.message };
    updated += count ?? 0;
  }
  for (const o of odometer) {
    const { error } = await sb.from("maintenance_events").update({ odometer_km: o.km }).eq("id", o.id);
    if (error) return { ok: false, error: error.message };
    updated += 1;
  }
  for (const p of ["/receipts", "/receipts/bulk", "/fleet", "/dashboard", "/drivers"]) revalidatePath(p);
  return { ok: true, message: `${updated} row(s) updated.` };
}
