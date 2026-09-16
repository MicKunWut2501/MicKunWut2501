import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { formatAOA, formatMonth, formatPct, formatWeek } from "@/lib/format";
import type { FleetMonth } from "@/lib/model/model";
import type { DueResult } from "@/lib/maintenance/rules";
import type { DriverScore } from "@/lib/scorecard/score";
import type { WeekStatusRow } from "@/lib/supabase/types";

/** Everything the weekly operations agent looks at. Assembled by src/lib/data/brief.ts. */
export type BriefInput = {
  generated_at: string;
  week_start: string; // last completed week
  week: WeekStatusRow[];
  month: FleetMonth | null; // month-to-date fleet figures
  reminders: { plate: string; items: DueResult[] }[];
  scores: DriverScore[];
  car4: { days_remaining: number; injection_required_aoa: number };
};

export type BriefResult = {
  text: string;
  provider: "anthropic" | "template";
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
};

const SYSTEM = `You are the operations assistant of a small Yango ride-hailing fleet in Luanda, Angola (Suzuki S-Presso cars, fixed weekly rent per driver, amounts in Angolan kwanza "Kz").
Write in English, direct and practical, for the fleet owner. Never invent numbers: use only the data provided.
Format: a title with the week; 3 to 6 sentences on the situation (collection, costs, model vs actual); then "Actions for this week:" with 3 to 5 actionable points ordered by financial impact. Maximum 220 words. No markdown other than "-" lists.`;

export function renderBriefFacts(i: BriefInput): string {
  const lines: string[] = [];
  lines.push(`Week analysed: ${formatWeek(i.week_start)} (Monday to Sunday).`);
  for (const w of i.week) {
    lines.push(`- ${w.driver_name} / ${w.plate}: ${w.status}, expected ${formatAOA(w.expected_aoa)}, paid ${formatAOA(w.paid_aoa)}, outstanding ${formatAOA(w.outstanding_aoa)}.`);
  }
  const expected = i.week.reduce((a, w) => a + Number(w.expected_aoa), 0);
  const paid = i.week.reduce((a, w) => a + Number(w.paid_aoa), 0);
  lines.push(`Collection rate for the week: ${expected > 0 ? formatPct(paid / expected) : "—"}.`);
  if (i.month) {
    const m = i.month;
    lines.push(
      `Month ${formatMonth(m.month)} to date: rent collected ${formatAOA(m.rent_paid_aoa)}, expenses ${formatAOA(m.expenses_aoa)}, ` +
        `net ${formatAOA(m.net_aoa)} (target ${formatAOA(m.target_net_aoa)}), net per car ${formatAOA(m.net_per_car_aoa)} ` +
        `vs target ${formatAOA(m.target_net_per_car_aoa)}, cumulative reserve ${formatAOA(m.cum_reserve_aoa)} vs model ${formatAOA(m.cum_target_reserve_aoa)}.`,
    );
  }
  const due = i.reminders.flatMap((r) => r.items.filter((x) => x.state !== "ok").map((x) => `${r.plate}: ${x.label} ${x.state === "never" ? "no record" : x.state === "overdue" ? "OVERDUE" : "due soon"} (${x.reason})`));
  if (due.length) lines.push(`Maintenance: ${due.join("; ")}.`);
  const ranked = i.scores.filter((s) => s.score !== null);
  if (ranked.length) lines.push(`Scorecard: ${ranked.map((s) => `${s.driver_name} ${s.score}`).join(", ")}.`);
  lines.push(`Car 4: ${i.car4.days_remaining} days to go; private injection still required ${formatAOA(i.car4.injection_required_aoa)}.`);
  return lines.join("\n");
}

/** Deterministic brief used when no API key is configured or the API fails. */
export function templateBrief(i: BriefInput): string {
  const problems = i.week.filter((w) => w.status === "PARTIAL" || w.status === "MISSED");
  const actions: string[] = [];
  for (const p of problems) actions.push(`- Collect ${formatAOA(p.outstanding_aoa)} from ${p.driver_name} (${p.plate}) via WhatsApp.`);
  for (const r of i.reminders) for (const x of r.items) if (x.state === "overdue") actions.push(`- Book ${x.label.toLowerCase()} for ${r.plate} (${x.reason}).`);
  if (i.month && i.month.net_per_car_aoa !== null && i.month.net_per_car_aoa < i.month.target_net_per_car_aoa) {
    actions.push(`- Net per car is below target: review this month's expenses (${formatAOA(i.month.expenses_aoa)}).`);
  }
  if (!actions.length) actions.push("- Nothing outstanding: keep the collection rhythm and log this week's receipts.");
  return `Weekly brief — ${formatWeek(i.week_start)}\n\n${renderBriefFacts(i)}\n\nActions for this week:\n${actions.slice(0, 5).join("\n")}`;
}

export async function generateWeeklyBrief(input: BriefInput): Promise<BriefResult> {
  const apiKey = env.anthropicApiKey();
  if (!apiKey) return { text: templateBrief(input), provider: "template", model: null, tokens_in: null, tokens_out: null };
  const client = new Anthropic({ apiKey });
  const model = env.anthropicModel();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: `Fleet data:\n${renderBriefFacts(input)}\n\nWrite the weekly brief.` }],
    });
    if (response.stop_reason === "refusal") {
      return { text: templateBrief(input), provider: "template", model, tokens_in: null, tokens_out: null };
    }
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    return { text: text || templateBrief(input), provider: "anthropic", model: response.model, tokens_in: response.usage.input_tokens, tokens_out: response.usage.output_tokens };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { text: templateBrief(input), provider: "template", model, tokens_in: null, tokens_out: null };
    }
    throw err;
  }
}
