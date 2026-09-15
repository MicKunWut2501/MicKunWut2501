import { NextResponse } from "next/server";
import { authorizeCron } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Monday 08:00 Luanda (07:00 UTC): compute last week's status and write rent_alerts for PARTIAL/MISSED. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("generate_rent_alerts");
  await sb.from("agent_runs").insert({
    kind: "rent_alerts", status: error ? "error" : "ok", output: error ? null : `${data} alerta(s)`, error: error?.message ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, alerts: data });
}
