"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncGps } from "@/lib/data/gps";

export async function refreshGps(): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const sb = await createClient();
  const r = await syncGps(sb, { force: true });
  revalidatePath("/fleet");
  return r.status === "ok" ? { ok: true } : { ok: false, error: r.status === "error" ? r.error : "No token saved." };
}
