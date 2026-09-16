"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildBriefInput } from "@/lib/data/brief";
import { generateWeeklyBrief } from "@/lib/agents/weeklyBrief";
import type { ActionResult } from "@/app/(app)/rent/actions";

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
    revalidatePath("/agent");
    revalidatePath("/dashboard");
    return { ok: true, message: `Brief generated (${result.provider === "anthropic" ? result.model : "local template"}).` };
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
  await sb.from("agent_runs").insert({ kind: "rent_alerts", status: "ok", output: `${data} alert(s) generated/updated`, triggered_by: session.userId });
  revalidatePath("/agent");
  revalidatePath("/rent");
  return { ok: true, message: `${data} alert(s) generated.` };
}
