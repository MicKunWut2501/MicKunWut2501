"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildBriefInput } from "@/lib/data/brief";
import { generateWeeklyBrief } from "@/lib/agents/weeklyBrief";
import type { ActionResult } from "@/app/(app)/cobranca/actions";

/** Runs the weekly operations agent now, with the signed-in user's permissions, and logs the run. */
export async function runWeeklyBriefNow(): Promise<ActionResult> {
  const session = await requireStaff();
  const sb = await createClient();
  try {
    const input = await buildBriefInput(sb);
    const result = await generateWeeklyBrief(input);
    const { error } = await sb.from("agent_runs").insert({
      kind: "weekly_brief", status: "ok", model: result.model, input: { week_start: input.week_start, provider: result.provider },
      output: result.text, tokens_in: result.tokens_in, tokens_out: result.tokens_out, triggered_by: session.userId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/agente");
    revalidatePath("/painel");
    return { ok: true, message: `Resumo gerado (${result.provider === "anthropic" ? result.model : "modelo local"}).` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb.from("agent_runs").insert({ kind: "weekly_brief", status: "error", error: message, triggered_by: session.userId });
    return { ok: false, error: message };
  }
}

export async function runRentAlertsNow(): Promise<ActionResult> {
  const session = await requireStaff();
  const sb = await createClient();
  const { data, error } = await sb.rpc("generate_rent_alerts");
  if (error) return { ok: false, error: error.message };
  await sb.from("agent_runs").insert({ kind: "rent_alerts", status: "ok", output: `${data} alerta(s) gerado(s)/actualizado(s)`, triggered_by: session.userId });
  revalidatePath("/agente");
  revalidatePath("/cobranca");
  return { ok: true, message: `${data} alerta(s) gerado(s).` };
}
