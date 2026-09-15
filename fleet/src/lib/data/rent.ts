import "server-only";
import type { SB } from "./fleet";
import type { RentAlert, RentPayment, WeekStatusRow, WhatsappMessage } from "@/lib/supabase/types";
import { num } from "@/lib/supabase/types";

function coerce(r: WeekStatusRow): WeekStatusRow {
  return {
    ...r,
    weekly_rent_aoa: num(r.weekly_rent_aoa), expected_aoa: num(r.expected_aoa),
    paid_aoa: num(r.paid_aoa), outstanding_aoa: num(r.outstanding_aoa),
  };
}

export async function getWeekStatus(sb: SB, weekStart: string, asOf?: string): Promise<WeekStatusRow[]> {
  const { data, error } = await sb.rpc("week_status", { p_week_start: weekStart, ...(asOf ? { p_as_of: asOf } : {}) });
  if (error) throw new Error(`week_status: ${error.message}`);
  return ((data ?? []) as WeekStatusRow[]).map(coerce);
}

export async function getWeekStatusRange(sb: SB, from: string, to: string, asOf?: string): Promise<WeekStatusRow[]> {
  const { data, error } = await sb.rpc("week_status_range", { p_from: from, p_to: to, ...(asOf ? { p_as_of: asOf } : {}) });
  if (error) throw new Error(`week_status_range: ${error.message}`);
  return ((data ?? []) as WeekStatusRow[]).map(coerce);
}

export async function getPayments(sb: SB, opts: { weekStarts?: string[]; driverId?: string; limit?: number } = {}): Promise<RentPayment[]> {
  let q = sb.from("rent_payments").select("*").order("paid_at", { ascending: false });
  if (opts.weekStarts?.length) q = q.in("week_start", opts.weekStarts);
  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new Error(`rent_payments: ${error.message}`);
  return ((data ?? []) as RentPayment[]).map((p) => ({ ...p, amount_aoa: num(p.amount_aoa) }));
}

export async function getOpenAlerts(sb: SB, limit = 50): Promise<RentAlert[]> {
  const { data, error } = await sb.from("rent_alerts").select("*").is("acknowledged_at", null).order("week_start", { ascending: false }).limit(limit);
  if (error) throw new Error(`rent_alerts: ${error.message}`);
  return ((data ?? []) as RentAlert[]).map((a) => ({ ...a, expected_aoa: num(a.expected_aoa), paid_aoa: num(a.paid_aoa), outstanding_aoa: num(a.outstanding_aoa) }));
}

export async function getMessageLog(sb: SB, opts: { driverId?: string; limit?: number } = {}): Promise<WhatsappMessage[]> {
  let q = sb.from("whatsapp_messages").select("*").order("sent_at", { ascending: false }).limit(opts.limit ?? 30);
  if (opts.driverId) q = q.eq("driver_id", opts.driverId);
  const { data, error } = await q;
  if (error) throw new Error(`whatsapp_messages: ${error.message}`);
  return (data ?? []) as WhatsappMessage[];
}
