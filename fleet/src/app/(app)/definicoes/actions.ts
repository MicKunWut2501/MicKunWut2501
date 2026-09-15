"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/cobranca/actions";

function revalidateAll() {
  for (const p of ["/painel", "/cobranca", "/frota", "/motoristas", "/definicoes", "/recibos"]) revalidatePath(p);
}

const TargetsSchema = z.object({
  net_per_car_month_aoa: z.coerce.number().min(0),
  free_cash_per_car_month_aoa: z.coerce.number().min(0),
  reserve_rate_aoa_month: z.coerce.number().min(0),
  inflation_rate_yearly: z.coerce.number().min(0).max(5),
  reserve_base_year: z.coerce.number().int().min(2020).max(2100),
  car4_purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  car4_private_injection_aoa: z.coerce.number().min(0),
  passive_income_goal_aoa_month: z.coerce.number().min(0),
  fleet_size_target_2026: z.coerce.number().int().min(1).max(100),
});

export async function updateTargets(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const parsed = TargetsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const sb = await createClient();
  const { error } = await sb.from("fleet_targets").update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: s.userId }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Objectivos guardados." };
}

const WeightsSchema = z.object({
  on_time_pct: z.coerce.number().min(0).max(100), shortfall_pct: z.coerce.number().min(0).max(100),
  incidents_pct: z.coerce.number().min(0).max(100), downtime_pct: z.coerce.number().min(0).max(100),
  min_weeks: z.coerce.number().int().min(1).max(52), window_weeks: z.coerce.number().int().min(4).max(52),
});

export async function updateWeights(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const s = await requireOwner();
  const parsed = WeightsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const w = parsed.data;
  if (Math.round((w.on_time_pct + w.shortfall_pct + w.incidents_pct + w.downtime_pct) * 100) / 100 !== 100) return { ok: false, error: "Os pesos têm de somar 100." };
  const sb = await createClient();
  const { error } = await sb.from("score_weights").update({ ...w, updated_at: new Date().toISOString(), updated_by: s.userId }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Pesos guardados." };
}

export async function addCashPosition(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cash_aoa: z.coerce.number().min(0), note: z.string().max(200).optional().default("") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const sb = await createClient();
  const { error } = await sb.from("cash_positions").insert({ ...parsed.data, note: parsed.data.note || null, recorded_by: s.userId });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Saldo registado." };
}

export async function addVehicle(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const parsed = z.object({ plate: z.string().min(3).max(20), model: z.string().min(1).max(60), in_service_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), odometer_km: z.coerce.number().int().min(0) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const sb = await createClient();
  const { error } = await sb.from("vehicles").insert({ ...parsed.data, plate: parsed.data.plate.toUpperCase().trim() });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Viatura adicionada." };
}

export async function addDriver(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const parsed = z.object({ full_name: z.string().min(2).max(120), phone_e164: z.string().regex(/^\+[1-9][0-9]{6,14}$/).or(z.literal("")) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Nome ou telefone inválido (formato +244...)." };
  const sb = await createClient();
  const { error } = await sb.from("drivers").insert({ full_name: parsed.data.full_name.trim(), phone_e164: parsed.data.phone_e164 || null });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Motorista adicionado." };
}

export async function addSchedule(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const parsed = z.object({
    driver_id: z.string().uuid(), vehicle_id: z.string().uuid(), weekly_rent_aoa: z.coerce.number().positive(),
    valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
    close_previous: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const p = parsed.data;
  const sb = await createClient();
  if (p.close_previous === "on") {
    // end any open schedule for this driver or vehicle the day before the new one starts
    const dayBefore = new Date(Date.parse(p.valid_from) - 86_400_000).toISOString().slice(0, 10);
    await sb.from("rent_schedule").update({ valid_to: dayBefore }).is("valid_to", null).or(`driver_id.eq.${p.driver_id},vehicle_id.eq.${p.vehicle_id}`).lt("valid_from", p.valid_from);
  }
  const { error } = await sb.from("rent_schedule").insert({ driver_id: p.driver_id, vehicle_id: p.vehicle_id, weekly_rent_aoa: p.weekly_rent_aoa, valid_from: p.valid_from, valid_to: p.valid_to || null });
  if (error) return { ok: false, error: error.message.includes("overlap") ? "Sobreposição: o motorista ou a viatura já têm uma atribuição nesse período. Marque 'fechar atribuição anterior'." : error.message };
  revalidateAll();
  return { ok: true, message: "Atribuição guardada." };
}

export async function endSchedule(id: string, validTo: string): Promise<ActionResult> {
  await requireStaff();
  const sb = await createClient();
  const { error } = await sb.from("rent_schedule").update({ valid_to: validTo }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function addDowntime(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const parsed = z.object({ vehicle_id: z.string().uuid(), from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().min(2).max(200) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  if (parsed.data.to_date < parsed.data.from_date) return { ok: false, error: "A data final é anterior à inicial." };
  const sb = await createClient();
  const { error } = await sb.from("vehicle_downtime").insert({ ...parsed.data, created_by: s.userId });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Paragem registada." };
}

export async function updateProfileRole(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireOwner();
  const parsed = z.object({ id: z.string().uuid(), role: z.enum(["owner", "admin", "driver"]), driver_id: z.string().uuid().or(z.literal("")) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const sb = await createClient();
  const { error } = await sb.from("profiles").update({ role: parsed.data.role, driver_id: parsed.data.driver_id || null }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Utilizador actualizado." };
}

const RuleSchema = z.object({ id: z.string().uuid(), every_km: z.coerce.number().int().min(0), every_months: z.coerce.number().int().min(0), active: z.string().optional() });
export async function updateRule(_p: ActionResult | undefined, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const parsed = RuleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Valores inválidos." };
  const r = parsed.data;
  if (!r.every_km && !r.every_months) return { ok: false, error: "Indique km ou meses." };
  const sb = await createClient();
  const { error } = await sb.from("maintenance_rules").update({ every_km: r.every_km || null, every_months: r.every_months || null, active: r.active === "on" }).eq("id", r.id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, message: "Regra guardada." };
}
