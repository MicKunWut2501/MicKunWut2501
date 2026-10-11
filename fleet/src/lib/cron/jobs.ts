import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBriefInput } from "@/lib/data/brief";
import { generateWeeklyBrief } from "@/lib/agents/weeklyBrief";
import { env } from "@/lib/env";

export type JobResult = { job: string; ok: boolean; detail: string };

/**
 * Free-tier Supabase projects pause after 7 days without database activity. One tiny read with the public anon
 * key counts as activity and needs no secrets. RLS returns zero rows to anon; the request itself is what matters.
 */
export async function keepAlive(): Promise<JobResult> {
  try {
    const sb = createSupabaseClient(env.supabaseUrl(), env.supabaseAnonKey(), { auth: { persistSession: false } });
    const { error } = await sb.from("maintenance_rules").select("id").limit(1);
    return { job: "keepalive", ok: !error, detail: error ? error.message : "database touched" };
  } catch (e) {
    return { job: "keepalive", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function runRentAlerts(): Promise<JobResult> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("generate_rent_alerts");
  await sb.from("agent_runs").insert({
    kind: "rent_alerts", status: error ? "error" : "ok", output: error ? null : `${data} alert(s)`, error: error?.message ?? null,
  });
  return { job: "rent_alerts", ok: !error, detail: error ? error.message : `${data} alert(s)` };
}

export async function runWeeklyBrief(): Promise<JobResult> {
  const sb = createAdminClient();
  try {
    const input = await buildBriefInput(sb);
    const result = await generateWeeklyBrief(input);
    await sb.from("agent_runs").insert({
      kind: "weekly_brief", status: "ok", model: result.model, input: { week_start: input.week_start, provider: result.provider },
      output: result.text, tokens_in: result.tokens_in, tokens_out: result.tokens_out,
    });
    return { job: "weekly_brief", ok: true, detail: result.provider };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb.from("agent_runs").insert({ kind: "weekly_brief", status: "error", error: message });
    return { job: "weekly_brief", ok: false, detail: message };
  }
}

export async function runGpsSnapshot(): Promise<JobResult> {
  const { syncGps } = await import("@/lib/data/gps");
  const r = await syncGps(createAdminClient());
  if (r.status === "ok") return { job: "gps", ok: true, detail: `${r.matched.length} vehicle(s) updated` };
  if (r.status === "no_token") return { job: "gps", ok: true, detail: "no BAANOOL token saved" };
  return { job: "gps", ok: false, detail: r.error };
}

/** Monday in Luanda (UTC+1). */
export function isLuandaMonday(now: Date = new Date()): boolean {
  return new Date(now.getTime() + 3600_000).getUTCDay() === 1;
}
