import { NextResponse } from "next/server";
import { authorizeCron } from "../_auth";
import { runRentAlerts } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";

/** Manual trigger (Bearer CRON_SECRET). The schedule lives in /api/cron/daily. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runRentAlerts();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
