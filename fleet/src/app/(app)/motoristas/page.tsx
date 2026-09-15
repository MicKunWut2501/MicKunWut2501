import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { TrendArrow } from "@/components/TrendArrow";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getScorecard } from "@/lib/data/scorecard";
import { getScoreWeights } from "@/lib/data/fleet";
import { formatWeek } from "@/lib/format";
import { luandaToday } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function MotoristasPage() {
  await requireStaff();
  const sb = await createClient();
  const today = luandaToday();
  const [{ ranked, window }, weights] = await Promise.all([getScorecard(sb, today), getScoreWeights(sb)]);
  return (
    <>
      <PageHeader
        title="Scorecard de motoristas"
        subtitle={`Janela: ${formatWeek(window.from)} → ${formatWeek(window.to)} (${weights.window_weeks} semanas) · pesos: pontualidade ${weights.on_time_pct}%, valor em falta ${weights.shortfall_pct}%, incidentes ${weights.incidents_pct}%, dias parado ${weights.downtime_pct}%`}
      />
      <div className="space-y-4">
        {ranked.map((d, i) => (
          <Card key={d.driver_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold tabular text-gray-400">{d.score === null ? "—" : `#${i + 1}`}</span>
                <div>
                  <Link href={`/motoristas/${d.driver_id}`} className="text-lg font-semibold hover:underline">{d.driver_name}</Link>
                  <div className="text-xs text-gray-500">{d.tenure_weeks} semanas de antiguidade · {d.scored_weeks} semanas avaliadas</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <TrendArrow trend={d.trend} previous={d.previous_score} />
                {d.score === null ? <Badge tone="warn">Dados insuficientes (mín. {weights.min_weeks} semanas)</Badge> : <span className="text-3xl font-semibold tabular">{d.score}</span>}
              </div>
            </div>
            <Table className="mt-3">
              <thead><tr><th className={th}>Componente</th><th className={thNum}>Peso</th><th className={th}>Valor</th><th className={thNum}>Normalizado</th><th className={thNum}>Contribuição</th><th className={th}>Explicação</th></tr></thead>
              <tbody>
                {d.components.map((c) => (
                  <tr key={c.key}>
                    <td className={`${td} font-medium`}>{c.label}</td><td className={tdNum}>{c.weight_pct}%</td><td className={td}>{c.raw_label}</td>
                    <td className={tdNum}>{c.score}</td><td className={tdNum}>{c.weighted}</td><td className={`${td} text-gray-500`}>{c.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
        {!ranked.length && <Empty>Sem motoristas.</Empty>}
      </div>
    </>
  );
}
