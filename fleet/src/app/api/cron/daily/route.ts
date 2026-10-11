import { NextResponse } from "next/server";
import { authorizeCron } from "../_auth";
import { isLuandaMonday, keepAlive, runGpsSnapshot, runRentAlerts, runWeeklyBrief, type JobResult } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily 07:00 UTC (08:00 Luanda). Always keeps the free-tier database awake. On Mondays, and only when the request
 * carries the CRON_SECRET (Vercel adds it once the env var exists), also runs rent alerts and the weekly brief.
 */
export async function GET(request: Request) {
  const results: JobResult[] = [await keepAlive()];
  // daily GPS snapshot keeps the odometer moving even when nobody opens the Fleet page (needs the service-role key)
  if (authorizeCron(request)) results.push(await runGpsSnapshot());
  if (isLuandaMonday()) {
    if (authorizeCron(request)) {
      results.push(await runRentAlerts());
      results.push(await runWeeklyBrief());
    } else {
      results.push({ job: "monday_jobs", ok: false, detail: "skipped: CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY not configured" });
    }
  }
  return NextResponse.json({ ok: results.every((r) => r.ok || r.job === "monday_jobs"), results });
}
