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

export default async function DriversPage() {
  await requireStaff();
  const sb = await createClient();
  const today = luandaToday();
  const [{ ranked, window }, weights] = await Promise.all([getScorecard(sb, today), getScoreWeights(sb)]);
  return (
    <>
      <PageHeader
        title="Driver scorecard"
        subtitle={`Window: ${formatWeek(window.from)} → ${formatWeek(window.to)} (${weights.window_weeks} weeks) · weights: on-time ${weights.on_time_pct}%, shortfall ${weights.shortfall_pct}%, incidents ${weights.incidents_pct}%, downtime ${weights.downtime_pct}%`}
      />
      <div className="space-y-4">
        {ranked.map((d, i) => (
          <Card key={d.driver_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold tabular text-gray-400">{d.score === null ? "—" : `#${i + 1}`}</span>
                <div>
                  <Link href={`/drivers/${d.driver_id}`} className="text-lg font-semibold hover:underline">{d.driver_name}</Link>
                  <div className="text-xs text-gray-500">{d.tenure_weeks} weeks of tenure · {d.scored_weeks} weeks scored</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <TrendArrow trend={d.trend} previous={d.previous_score} />
                {d.score === null ? <Badge tone="warn">Insufficient data (min. {weights.min_weeks} weeks)</Badge> : <span className="text-3xl font-semibold tabular">{d.score}</span>}
              </div>
            </div>
            <Table className="mt-3">
              <thead><tr><th className={th}>Component</th><th className={thNum}>Weight</th><th className={th}>Value</th><th className={thNum}>Normalised</th><th className={thNum}>Contribution</th><th className={th}>Explanation</th></tr></thead>
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
        {!ranked.length && <Empty>No drivers.</Empty>}
      </div>
    </>
  );
}
