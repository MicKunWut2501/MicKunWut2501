import "server-only";
import type { SB } from "./fleet";
import { getVehicles } from "./fleet";
import { getWeekStatus } from "./rent";
import { getReminders } from "./maintenance";
import { getModelVsActual } from "./model";
import { getScorecard } from "./scorecard";
import type { BriefInput } from "@/lib/agents/weeklyBrief";
import { addDays, luandaToday, weekStartOf } from "@/lib/time";

export async function buildBriefInput(sb: SB, today = luandaToday()): Promise<BriefInput> {
  const lastWeek = addDays(weekStartOf(today), -7);
  const [week, vehicles, model, score] = await Promise.all([getWeekStatus(sb, lastWeek), getVehicles(sb), getModelVsActual(sb, today), getScorecard(sb, today)]);
  const reminders = await getReminders(sb, vehicles, today);
  return {
    generated_at: new Date().toISOString(),
    week_start: lastWeek,
    week,
    month: model.thisMonth,
    reminders: vehicles.map((v) => ({ plate: v.plate, items: reminders.get(v.id) ?? [] })),
    scores: score.ranked,
    car4: { days_remaining: model.car4.days_remaining, injection_required_aoa: model.car4.injection_required_aoa },
  };
}
