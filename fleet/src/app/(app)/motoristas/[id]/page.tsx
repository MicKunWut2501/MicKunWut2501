import { notFound } from "next/navigation";
import { Badge, Card, Empty, PageHeader, Stat, StatusBadge, Table, td, tdNum, th, thNum } from "@/components/ui";
import { TrendArrow } from "@/components/TrendArrow";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDowntime, getDriver, getSchedules, getVehicles } from "@/lib/data/fleet";
import { getScorecard } from "@/lib/data/scorecard";
import { getMessageLog, getPayments } from "@/lib/data/rent";
import { CATEGORY_LABELS } from "@/lib/maintenance/categories";
import { formatAOA, formatDate, formatDateTime, formatWeek } from "@/lib/format";
import { luandaToday } from "@/lib/time";
import { num } from "@/lib/supabase/types";
import type { RentStatus } from "@/lib/supabase/types";
import type { ExpenseCategory } from "@/lib/maintenance/categories";

export const dynamic = "force-dynamic";

const HEAT: Record<RentStatus, string> = {
  PAID: "bg-emerald-500", PARTIAL: "bg-amber-400", MISSED: "bg-red-500", PENDING: "bg-gray-300", EXEMPT: "bg-sky-300",
};

export default async function DriverPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sb = await createClient();
  const today = luandaToday();
  const driver = await getDriver(sb, id);
  if (!driver) notFound();
  const [{ ranked, window }, schedules, vehicles, allDowntime, payments, log, incRes] = await Promise.all([
    getScorecard(sb, today), getSchedules(sb), getVehicles(sb), getDowntime(sb), getPayments(sb, { driverId: id, limit: 30 }), getMessageLog(sb, { driverId: id }),
    sb.from("driver_incidents").select("event_id, vehicle_id, event_date, category, total_aoa, notes").eq("driver_id", id).order("event_date", { ascending: false }),
  ]);
  const me = ranked.find((r) => r.driver_id === id);
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));
  const mySchedules = schedules.filter((s) => s.driver_id === id);
  const myVehicleIds = new Set(mySchedules.map((s) => s.vehicle_id));
  const downtime = allDowntime.filter((d) => myVehicleIds.has(d.vehicle_id) && mySchedules.some((s) => s.vehicle_id === d.vehicle_id && d.to_date >= s.valid_from && (!s.valid_to || d.from_date <= s.valid_to)));
  const incidents = ((incRes.data ?? []) as { event_id: string; vehicle_id: string; event_date: string; category: ExpenseCategory; total_aoa: number; notes: string | null }[]).map((i) => ({ ...i, total_aoa: num(i.total_aoa) }));
  const weeks = (me?.weeks ?? []).slice().sort((a, b) => a.week_start.localeCompare(b.week_start));
  const assignments = mySchedules.map((s) => `${plate.get(s.vehicle_id)} (${formatDate(s.valid_from)}${s.valid_to ? " → " + formatDate(s.valid_to) : ""})`).join(", ");
  const subtitle = `${driver.phone_e164 ?? "sem telefone"} · ${driver.active ? "activo" : "inactivo"} · ${assignments || "sem atribuição"}`;

  return (
    <>
      <PageHeader title={driver.full_name} subtitle={subtitle} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pontuação" value={me?.score === null || me?.score === undefined ? "—" : String(me.score)} sub={me ? (me.score === null ? <Badge tone="warn">dados insuficientes</Badge> : <TrendArrow trend={me.trend} previous={me.previous_score} />) : undefined} />
        <Stat label="Melhor factor" value={me?.top_positive?.label ?? "—"} sub={me?.top_positive?.raw_label} />
        <Stat label="Pior factor" value={me?.top_negative?.label ?? "—"} sub={me?.top_negative?.raw_label} />
      </div>

      <Card className="mt-6" title={`Histórico de renda · ${formatWeek(window.from)} → ${formatWeek(window.to)}`}>
        {weeks.length ? (
          <>
            <div className="flex flex-wrap gap-1">
              {weeks.map((w) => (
                <div key={w.week_start} title={`${formatWeek(w.week_start)}: ${w.status} · pago ${formatAOA(w.paid_aoa)} de ${formatAOA(w.expected_aoa)}`} className={`h-8 w-8 rounded ${HEAT[w.status]}`} />
              ))}
            </div>
            <Table className="mt-3">
              <thead><tr><th className={th}>Semana</th><th className={th}>Viatura</th><th className={th}>Estado</th><th className={thNum}>Esperado</th><th className={thNum}>Pago</th><th className={thNum}>Em falta</th></tr></thead>
              <tbody>{weeks.slice().reverse().map((w) => (<tr key={w.week_start}><td className={td}>{formatWeek(w.week_start)}</td><td className={td}>{w.plate}</td><td className={td}><StatusBadge status={w.status} /></td><td className={tdNum}>{formatAOA(w.expected_aoa)}</td><td className={tdNum}>{formatAOA(w.paid_aoa)}</td><td className={tdNum}>{formatAOA(w.outstanding_aoa)}</td></tr>))}</tbody>
            </Table>
          </>
        ) : <Empty>Sem semanas com renda no período.</Empty>}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Incidentes de custo (reparação, travões, pneus, multas)">
          {incidents.length ? <ul className="space-y-1 text-sm">{incidents.map((i) => <li key={i.event_id}>{formatDate(i.event_date)} · {plate.get(i.vehicle_id)} · {CATEGORY_LABELS[i.category]} · <span className="font-medium">{formatAOA(i.total_aoa)}</span>{i.notes && <span className="text-gray-500"> · {i.notes}</span>}</li>)}</ul> : <Empty>Sem incidentes.</Empty>}
        </Card>
        <Card title="Paragens da viatura">
          {downtime.length ? <ul className="space-y-1 text-sm">{downtime.map((d) => <li key={d.id}>{formatDate(d.from_date)} → {formatDate(d.to_date)} · {plate.get(d.vehicle_id)} · {d.reason}</li>)}</ul> : <Empty>Sem paragens.</Empty>}
        </Card>
        <Card title="Pagamentos e mensagens">
          <ul className="space-y-1 text-sm">
            {payments.slice(0, 10).map((p) => <li key={p.id}>{formatDateTime(p.paid_at)} · {formatWeek(p.week_start)} · {formatAOA(p.amount_aoa)}</li>)}
            {log.slice(0, 5).map((m) => <li key={m.id} className="text-gray-500">WhatsApp {formatDateTime(m.sent_at)} · {formatWeek(m.week_start)}</li>)}
            {!payments.length && !log.length && <Empty>Nada registado.</Empty>}
          </ul>
        </Card>
      </div>
    </>
  );
}
