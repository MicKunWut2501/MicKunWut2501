"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/maintenance/categories";
import type { ActionResult } from "@/app/(app)/cobranca/actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

const EventSchema = z.object({
  vehicle_id: z.string().uuid(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(EXPENSE_CATEGORIES),
  total_aoa: z.coerce.number().min(0),
  odometer_km: z.union([z.literal(""), z.coerce.number().int().min(0)]).optional(),
  vendor: z.string().max(200).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  line_items: z.string().optional().default("[]"),
  extraction: z.string().optional().default(""),
  extraction_provider: z.string().optional().default("none"),
});

export type SaveResult = ActionResult & { eventId?: string };

/** Uploads the file (if any) to the private bucket, creates the receipt row and the maintenance event. Owner reviewed everything in the form. */
export async function saveReceiptEvent(_prev: SaveResult | undefined, formData: FormData): Promise<SaveResult> {
  const session = await requireUser();
  if (!isStaff(session)) return { ok: false, error: "Apenas o proprietário/administrador pode guardar despesas." };
  const parsed = EventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Verifique viatura, data, categoria e total." };
  const p = parsed.data;
  const sb = await createClient();

  let receiptId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { ok: false, error: "Ficheiro acima de 10 MB." };
    if (!ALLOWED.has(file.type)) return { ok: false, error: "Formato não suportado (JPG, PNG, WEBP, GIF ou PDF)." };
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    const path = `${p.vehicle_id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await sb.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: `Upload falhou: ${upErr.message}` };
    let extraction: unknown = null;
    try { extraction = p.extraction ? JSON.parse(p.extraction) : null; } catch { extraction = null; }
    const { data: rec, error: recErr } = await sb.from("receipts").insert({
      vehicle_id: p.vehicle_id, storage_path: path, mime_type: file.type, file_size: file.size, uploaded_by: session.userId,
      extraction, extraction_provider: p.extraction_provider,
    }).select("id").single();
    if (recErr) return { ok: false, error: recErr.message };
    receiptId = rec.id as string;
  }

  let lineItems: unknown = [];
  try { lineItems = JSON.parse(p.line_items || "[]"); } catch { lineItems = []; }
  const { data: ev, error } = await sb.from("maintenance_events").insert({
    vehicle_id: p.vehicle_id, receipt_id: receiptId, event_date: p.event_date, category: p.category,
    odometer_km: p.odometer_km === "" || p.odometer_km === undefined ? null : p.odometer_km,
    total_aoa: p.total_aoa, vendor: p.vendor || null, notes: p.notes || null, line_items: lineItems, created_by: session.userId,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/frota");
  revalidatePath(`/frota/${p.vehicle_id}`);
  revalidatePath("/recibos");
  revalidatePath("/painel");
  return { ok: true, message: "Despesa guardada.", eventId: ev.id as string };
}
