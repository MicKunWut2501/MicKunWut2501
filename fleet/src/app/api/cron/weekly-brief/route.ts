import { NextResponse } from "next/server";
import { authorizeCron } from "../_auth";
import { runWeeklyBrief } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Manual trigger (Bearer CRON_SECRET). The schedule lives in /api/cron/daily. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runWeeklyBrief();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
