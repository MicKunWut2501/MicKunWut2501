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

const SYSTEM = `És o assistente de operações de uma pequena frota de táxis Yango em Luanda (Suzuki S-Presso, renda semanal fixa por motorista, em kwanzas).
Escreves em português europeu, tom directo e prático, para o dono da frota. Não inventes números: usa apenas os dados fornecidos.
Formato: título com a semana; 3 a 6 frases de situação (cobrança, custos, modelo vs realidade); depois "Acções para esta semana:" com 3 a 5 pontos accionáveis e ordenados por impacto financeiro. Máximo 220 palavras. Sem markdown além de listas com "-".`;

export function renderBriefFacts(i: BriefInput): string {
  const lines: string[] = [];
  lines.push(`Semana analisada: ${formatWeek(i.week_start)} (segunda a domingo).`);
  for (const w of i.week) {
    lines.push(`- ${w.driver_name} / ${w.plate}: ${w.status}, esperado ${formatAOA(w.expected_aoa)}, pago ${formatAOA(w.paid_aoa)}, em falta ${formatAOA(w.outstanding_aoa)}.`);
  }
  const expected = i.week.reduce((a, w) => a + Number(w.expected_aoa), 0);
  const paid = i.week.reduce((a, w) => a + Number(w.paid_aoa), 0);
  lines.push(`Taxa de cobrança da semana: ${expected > 0 ? formatPct(paid / expected) : "—"}.`);
  if (i.month) {
    const m = i.month;
    lines.push(
      `Mês ${formatMonth(m.month)} até à data: renda cobrada ${formatAOA(m.rent_paid_aoa)}, despesas ${formatAOA(m.expenses_aoa)}, ` +
        `líquido ${formatAOA(m.net_aoa)} (objectivo ${formatAOA(m.target_net_aoa)}), líquido por carro ${formatAOA(m.net_per_car_aoa)} ` +
        `vs objectivo ${formatAOA(m.target_net_per_car_aoa)}, reserva acumulada ${formatAOA(m.cum_reserve_aoa)} vs modelo ${formatAOA(m.cum_target_reserve_aoa)}.`,
    );
  }
  const due = i.reminders.flatMap((r) => r.items.filter((x) => x.state !== "ok").map((x) => `${r.plate}: ${x.label} ${x.state === "never" ? "sem registo" : x.state === "overdue" ? "EM ATRASO" : "a vencer"} (${x.reason})`));
  if (due.length) lines.push(`Manutenção: ${due.join("; ")}.`);
  const ranked = i.scores.filter((s) => s.score !== null);
  if (ranked.length) lines.push(`Scorecard: ${ranked.map((s) => `${s.driver_name} ${s.score}`).join(", ")}.`);
  lines.push(`Carro 4: faltam ${i.car4.days_remaining} dias; injecção privada ainda necessária ${formatAOA(i.car4.injection_required_aoa)}.`);
  return lines.join("\n");
}

/** Deterministic brief used when no API key is configured or the API fails. */
export function templateBrief(i: BriefInput): string {
  const problems = i.week.filter((w) => w.status === "PARTIAL" || w.status === "MISSED");
  const actions: string[] = [];
  for (const p of problems) actions.push(`- Cobrar ${formatAOA(p.outstanding_aoa)} a ${p.driver_name} (${p.plate}) via WhatsApp.`);
  for (const r of i.reminders) for (const x of r.items) if (x.state === "overdue") actions.push(`- Agendar ${x.label.toLowerCase()} da ${r.plate} (${x.reason}).`);
  if (i.month && i.month.net_per_car_aoa !== null && i.month.net_per_car_aoa < i.month.target_net_per_car_aoa) {
    actions.push(`- Líquido por carro abaixo do objectivo: rever despesas do mês (${formatAOA(i.month.expenses_aoa)}).`);
  }
  if (!actions.length) actions.push("- Sem pendências: manter o ritmo de cobrança e registar recibos da semana.");
  return `Resumo semanal — ${formatWeek(i.week_start)}\n\n${renderBriefFacts(i)}\n\nAcções para esta semana:\n${actions.slice(0, 5).join("\n")}`;
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
      messages: [{ role: "user", content: `Dados da frota:\n${renderBriefFacts(input)}\n\nEscreve o resumo semanal.` }],
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
