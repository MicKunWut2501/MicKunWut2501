"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { weekStartOf } from "@/lib/time";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const PaymentSchema = z.object({
  driver_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_aoa: z.coerce.number().positive(),
  paid_at: z.string().min(1),
  method: z.enum(["transfer", "cash", "multicaixa", "other"]),
  note: z.string().max(500).optional().default(""),
});

export async function recordPayment(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = PaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Dados inválidos: verifique valor e data." };
  const p = parsed.data;
  if (weekStartOf(p.week_start) !== p.week_start) return { ok: false, error: "A semana tem de começar numa segunda-feira." };
  const sb = await createClient();
  // datetime-local has no zone: interpret as Luanda (UTC+1)
  const paidAt = new Date(p.paid_at + (p.paid_at.length === 16 ? ":00" : "") + "+01:00").toISOString();
  const { error } = await sb.from("rent_payments").insert({
    driver_id: p.driver_id, week_start: p.week_start, amount_aoa: p.amount_aoa, paid_at: paidAt, method: p.method,
    note: p.note || null, recorded_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cobranca");
  revalidatePath("/painel");
  return { ok: true, message: "Pagamento registado." };
}

const SendSchema = z.object({
  driver_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone_e164: z.string().nullable(),
  message: z.string().min(10).max(4000),
});

/** Logs the send. The browser opens the wa.me link only after this resolves. */
export async function logWhatsappSend(input: z.infer<typeof SendSchema>): Promise<ActionResult> {
  const session = await requireStaff();
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensagem inválida." };
  const sb = await createClient();
  const { error } = await sb.from("whatsapp_messages").insert({ ...parsed.data, sent_by: session.userId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cobranca");
  return { ok: true };
}

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  const session = await requireStaff();
  const sb = await createClient();
  const { error } = await sb.from("rent_alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: session.userId }).eq("id", alertId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cobranca");
  return { ok: true };
}
