import { NextResponse } from "next/server";
import { authorizeCron } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBriefInput } from "@/lib/data/brief";
import { generateWeeklyBrief } from "@/lib/agents/weeklyBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Monday 08:30 Luanda (07:30 UTC): weekly operations brief with recommended actions. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = createAdminClient();
  try {
    const input = await buildBriefInput(sb);
    const result = await generateWeeklyBrief(input);
    await sb.from("agent_runs").insert({
      kind: "weekly_brief", status: "ok", model: result.model, input: { week_start: input.week_start, provider: result.provider },
      output: result.text, tokens_in: result.tokens_in, tokens_out: result.tokens_out,
    });
    return NextResponse.json({ ok: true, provider: result.provider });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb.from("agent_runs").insert({ kind: "weekly_brief", status: "error", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
