import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractReceipt } from "@/lib/receipts/extract";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

/** multipart/form-data { file } -> ReceiptDraft. Never writes anything except an agent_runs log line. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "File missing." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File larger than 10 MB." }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Unsupported format." }, { status: 415 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const draft = await extractReceipt({ bytes, mimeType: file.type, fileName: file.name });
  const sb = await createClient();
  await sb.from("agent_runs").insert({
    kind: "receipt_extraction", status: "ok", model: draft.usage?.model ?? null, tokens_in: draft.usage?.input_tokens ?? null, tokens_out: draft.usage?.output_tokens ?? null,
    input: { file: file.name, size: file.size, provider: draft.provider }, output: JSON.stringify({ vendor: draft.vendor, total_aoa: draft.total_aoa, category: draft.category, confidence: draft.confidence }),
    triggered_by: session.userId,
  });
  return NextResponse.json(draft);
}
