import { NextResponse } from "next/server";
import { getSession, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDrivers, getVehicles } from "@/lib/data/fleet";
import { getPayments, getWeekStatusRange } from "@/lib/data/rent";
import { getEvents } from "@/lib/data/maintenance";
import { getModelVsActual } from "@/lib/data/model";
import { getScorecard } from "@/lib/data/scorecard";
import { buildWorkbook, workbookToBuffer } from "@/lib/export/xlsx";
import { addDays, luandaToday, weekStartOf } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || !isStaff(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = await createClient();
  const today = luandaToday();
  const from = addDays(weekStartOf(today), -7 * 25); // 26 weeks
  const [vehicles, drivers, weeks, payments, events, model, score] = await Promise.all([
    getVehicles(sb), getDrivers(sb), getWeekStatusRange(sb, from, addDays(weekStartOf(today), 6)), getPayments(sb), getEvents(sb), getModelVsActual(sb, today), getScorecard(sb, today),
  ]);
  const wb = buildWorkbook({ generatedAt: new Date().toISOString(), vehicles, drivers, weeks, payments, events, model, scorecard: score.ranked });
  const buf = workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="frota-${today}.xlsx"`,
    },
  });
}
