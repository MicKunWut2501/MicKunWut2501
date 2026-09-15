import Link from "next/link";
import { Badge, Card, DueChip, Empty, PageHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { FleetCompareChart } from "@/components/Charts";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSchedules, getVehicles, getDrivers } from "@/lib/data/fleet";
import { getEvents, getReminders } from "@/lib/data/maintenance";
import { getScorecard } from "@/lib/data/scorecard";
import { fleetMonthComparison, CATEGORY_LABELS } from "@/lib/maintenance/categories";
import { formatAOA, formatDate, formatKm, formatMonth, formatPct } from "@/lib/format";
import { luandaToday, monthEndOf, monthStartOf, monthsBetween } from "@/lib/time";
import { TrendArrow } from "@/components/TrendArrow";

export const dynamic = "force-dynamic";

export default async function FrotaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireStaff();
  const sb = await createClient();
  const today = luandaToday();
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : monthStartOf(today);
  const [vehicles, drivers, schedules, events, score] = await Promise.all([
    getVehicles(sb), getDrivers(sb), getSchedules(sb), getEvents(sb, { from: month, to: monthEndOf(month) }), getScorecard(sb, today),
  ]);
  const reminders = await getReminders(sb, vehicles, today);
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
  const currentDriver = (vehicleId: string) => schedules.find((s) => s.vehicle_id === vehicleId && s.valid_from <= today && (!s.valid_to || s.valid_to >= today));
  const cmp = fleetMonthComparison(
    vehicles.filter((v) => v.in_service_from <= monthEndOf(month)).map((v) => ({
      vehicle_id: v.id, plate: v.plate, total_aoa: events.filter((e) => e.vehicle_id === v.id).reduce((a, e) => a + e.total_aoa, 0),
    })),
  );
  const firstMonth = vehicles.length ? monthStartOf(vehicles.map((v) => v.in_service_from).sort()[0]) : month;
  const monthOptions = monthsBetween(firstMonth, today).reverse();

  return (
    <>
      <PageHeader title="Frota" subtitle={`${vehicles.length} viaturas`} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((v) => {
          const s = currentDriver(v.id);
          const rem = reminders.get(v.id) ?? [];
          return (
            <Card key={v.id}>
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/frota/${v.id}`} className="text-lg font-semibold hover:underline">{v.plate}</Link>
                  <div className="text-sm text-gray-500">{v.model} · desde {formatDate(v.in_service_from)} · {formatKm(v.odometer_km)}</div>
                </div>
                {v.in_service_to && <Badge tone="warn">fora de serviço</Badge>}
              </div>
              <div className="mt-2 text-sm">
                {s ? <>Motorista: <span className="font-medium">{driverName.get(s.driver_id)}</span> · {formatAOA(s.weekly_rent_aoa)}/semana</> : <span className="text-amber-700">Sem motorista atribuído</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {rem.map((r) => <DueChip key={r.category} label={r.label} state={r.state} reason={r.reason} />)}
              </div>
            </Card>
          );
        })}
        {!vehicles.length && <Empty>Sem viaturas. Adicione em Definições.</Empty>}
      </div>

      <Card className="mt-6" title="Custo de manutenção por carro" right={
        <form className="text-xs"><select name="mes" defaultValue={month.slice(0, 7)} className="rounded border border-gray-300 px-2 py-1">
          {monthOptions.map((m) => <option key={m} value={m.slice(0, 7)}>{formatMonth(m)}</option>)}
        </select> <button className="ml-1 rounded border border-gray-300 px-2 py-1">ver</button></form>
      }>
        {cmp.rows.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <FleetCompareChart rows={cmp.rows} average={cmp.average_aoa} />
            <Table>
              <thead><tr><th className={th}>Viatura</th><th className={thNum}>Custo {formatMonth(month)}</th><th className={thNum}>vs média</th><th className={th}></th></tr></thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.vehicle_id} className={r.outlier ? "bg-red-50" : ""}>
                    <td className={td}><Link className="hover:underline" href={`/frota/${r.vehicle_id}`}>{r.plate}</Link></td>
                    <td className={tdNum}>{formatAOA(r.total_aoa)}</td>
                    <td className={tdNum}>{formatPct(r.vs_avg, 0, true)}</td>
                    <td className={td}>{r.outlier && <Badge tone="bad">&gt; 30% acima da média</Badge>}</td>
                  </tr>
                ))}
                <tr><td className={`${td} font-medium`}>Média da frota</td><td className={`${tdNum} font-medium`}>{formatAOA(cmp.average_aoa)}</td><td className={td} colSpan={2}></td></tr>
              </tbody>
            </Table>
          </div>
        ) : <Empty>Sem viaturas activas neste mês.</Empty>}
        <p className="mt-2 text-xs text-gray-500">Categorias: {Object.values(CATEGORY_LABELS).join(", ")}.</p>
      </Card>

      <Card className="mt-6" title={`Scorecard de motoristas · últimas ${score.ranked[0]?.weeks ? 12 : 12} semanas`} right={<Link href="/motoristas" className="text-xs underline">detalhe</Link>}>
        <Table>
          <thead><tr><th className={th}>#</th><th className={th}>Motorista</th><th className={thNum}>Pontuação</th><th className={th}>Tendência</th><th className={th}>Melhor factor</th><th className={th}>Pior factor</th></tr></thead>
          <tbody>
            {score.ranked.map((d, i) => (
              <tr key={d.driver_id}>
                <td className={td}>{d.score === null ? "—" : i + 1}</td>
                <td className={td}><Link className="hover:underline" href={`/motoristas/${d.driver_id}`}>{d.driver_name}</Link></td>
                <td className={`${tdNum} font-semibold`}>{d.score === null ? <Badge>dados insuficientes ({d.scored_weeks} sem.)</Badge> : d.score}</td>
                <td className={td}><TrendArrow trend={d.trend} previous={d.previous_score} /></td>
                <td className={td}>{d.top_positive ? `${d.top_positive.label} (${d.top_positive.score})` : "—"}</td>
                <td className={td}>{d.top_negative ? `${d.top_negative.label} (${d.top_negative.score})` : "—"}</td>
              </tr>
            ))}
            {!score.ranked.length && <tr><td colSpan={6} className={td}><Empty>Sem motoristas.</Empty></td></tr>}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
