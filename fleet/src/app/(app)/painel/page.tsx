import Link from "next/link";
import { Card, Empty, LinkButton, PageHeader, Stat, StatusBadge, Table, td, tdNum, th, thNum } from "@/components/ui";
import { NetPerCarChart, ReserveChart } from "@/components/Charts";
import { isStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getModelVsActual } from "@/lib/data/model";
import { getWeekStatus, getWeekStatusRange, getPayments } from "@/lib/data/rent";
import { getVehicles } from "@/lib/data/fleet";
import { getReminders } from "@/lib/data/maintenance";
import { formatAOA, formatDate, formatDateTime, formatMonth, formatPct, formatWeek } from "@/lib/format";
import { addDays, luandaToday, weekStartOf } from "@/lib/time";
import { delta } from "@/lib/model/model";
import type { AgentRun } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const session = await requireUser();
  const sb = await createClient();
  const today = luandaToday();
  if (!isStaff(session)) return <DriverPanel driverId={session.profile.driver_id} today={today} />;

  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const [model, week, last, vehicles, briefRes] = await Promise.all([
    getModelVsActual(sb, today),
    getWeekStatus(sb, thisWeek),
    getWeekStatus(sb, lastWeek),
    getVehicles(sb),
    sb.from("agent_runs").select("*").eq("kind", "weekly_brief").eq("status", "ok").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const reminders = await getReminders(sb, vehicles, today);
  const brief = (briefRes.data as AgentRun | null) ?? null;
  const m = model.thisMonth;
  const t = model.targets;
  const netDelta = delta(m?.net_per_car_aoa ?? null, t.net_per_car_month_aoa);
  const reserveGap = m ? m.cum_reserve_aoa - m.cum_target_reserve_aoa : null;
  const collect = m?.collection_rate ?? null;
  const problems = last.filter((r) => r.status === "PARTIAL" || r.status === "MISSED");
  const dueItems = vehicles.flatMap((v) => (reminders.get(v.id) ?? []).filter((r) => r.state === "due" || r.state === "overdue").map((r) => ({ plate: v.plate, ...r })));

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={`${formatMonth(today.slice(0, 7) + "-01", true)} · ${vehicles.length} viaturas · objectivo ${t.fleet_size_target_2026} em 2026`}
        actions={<LinkButton href="/api/export">Exportar XLSX</LinkButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Líquido por carro (mês)"
          value={formatAOA(m?.net_per_car_aoa ?? null)}
          tone={netDelta.abs === null ? "neutral" : netDelta.abs >= 0 ? "good" : "bad"}
          sub={<>objectivo {formatAOA(t.net_per_car_month_aoa)} · {formatAOA(netDelta.abs, { signed: true })} ({formatPct(netDelta.pct, 0, true)})</>}
        />
        <Stat
          label="Líquido da frota vs meta"
          value={formatAOA(m?.net_aoa ?? null)}
          tone={model.goal_progress !== null && model.goal_progress >= 1 ? "good" : "neutral"}
          sub={<>meta {formatAOA(t.passive_income_goal_aoa_month)}/mês · {formatPct(model.goal_progress)} da meta</>}
        />
        <Stat
          label="Reserva acumulada"
          value={formatAOA(m?.cum_reserve_aoa ?? model.car4.reserve_balance_aoa)}
          tone={reserveGap === null ? "neutral" : reserveGap >= 0 ? "good" : "warn"}
          sub={<>modelo esperava {formatAOA(m?.cum_target_reserve_aoa ?? null)} · {formatAOA(reserveGap, { signed: true })}</>}
        />
        <Stat
          label="Taxa de cobrança (mês)"
          value={formatPct(collect)}
          tone={collect === null ? "neutral" : collect >= 0.95 ? "good" : collect >= 0.8 ? "warn" : "bad"}
          sub={<>{formatAOA(m?.rent_paid_aoa ?? 0)} de {formatAOA(m?.rent_expected_aoa ?? 0)}</>}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Líquido por carro: real vs objectivo">
          {model.fleetMonths.length ? (
            <NetPerCarChart data={model.fleetMonths.map((fm) => ({ month: fm.month, actual: fm.net_per_car_aoa, target: fm.target_net_per_car_aoa }))} />
          ) : <Empty>Sem viaturas activas ainda.</Empty>}
        </Card>
        <Card title="Reserva de substituição: real vs modelo">
          {model.fleetMonths.length ? (
            <ReserveChart data={model.fleetMonths.map((fm) => ({ month: fm.month, actual: fm.cum_reserve_aoa, model: fm.cum_target_reserve_aoa }))} />
          ) : <Empty>Sem dados.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Carro 4 · contagem decrescente">
          <div className="text-3xl font-semibold tabular">
            {model.car4.months_remaining} <span className="text-base font-normal text-gray-500">meses</span> {model.car4.days_after_months} <span className="text-base font-normal text-gray-500">dias</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">compra prevista {formatDate(model.car4.purchase_date)} · {model.car4.days_remaining} dias</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Injecção privada prevista" v={formatAOA(model.car4.injection_target_aoa)} />
            <Row k="Reserva acumulada" v={formatAOA(model.car4.reserve_balance_aoa)} />
            <Row k={`Dinheiro em caixa${model.cash_as_of ? ` (${formatDate(model.cash_as_of)})` : ""}`} v={formatAOA(model.car4.cash_on_hand_aoa)} />
            <Row k="Injecção ainda necessária" v={formatAOA(model.car4.injection_required_aoa)} strong />
          </dl>
          <p className="mt-2 text-xs text-gray-500">Actualize o dinheiro em caixa em <Link className="underline" href="/definicoes">Definições</Link>.</p>
        </Card>

        <Card title={`Cobrança · semana ${formatWeek(thisWeek)}`} right={<Link href="/cobranca" className="text-xs underline">abrir</Link>}>
          <Table>
            <thead><tr><th className={th}>Motorista</th><th className={th}>Estado</th><th className={thNum}>Em falta</th></tr></thead>
            <tbody>
              {week.map((r) => (
                <tr key={r.driver_id}><td className={td}>{r.driver_name} <span className="text-gray-400">· {r.plate}</span></td><td className={td}><StatusBadge status={r.status} /></td><td className={tdNum}>{formatAOA(r.outstanding_aoa)}</td></tr>
              ))}
              {!week.length && <tr><td className={td} colSpan={3}><Empty>Sem motoristas activos.</Empty></td></tr>}
            </tbody>
          </Table>
          {problems.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">Semana passada: {problems.length} motorista(s) com renda em falta ({formatAOA(problems.reduce((a, p) => a + p.outstanding_aoa, 0))}).</p>
          )}
        </Card>

        <Card title="Manutenção a vencer" right={<Link href="/frota" className="text-xs underline">frota</Link>}>
          {dueItems.length ? (
            <ul className="space-y-1 text-sm">
              {dueItems.map((d) => (
                <li key={d.plate + d.category} className="flex justify-between gap-2">
                  <span><span className="font-medium">{d.plate}</span> · {d.label}</span>
                  <span className={d.state === "overdue" ? "text-red-700" : "text-amber-700"}>{d.reason}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nada a vencer nos próximos 30 dias / 500 km.</Empty>}
        </Card>
      </div>

      <Card className="mt-6" title="Resumo semanal do agente" right={<Link href="/agente" className="text-xs underline">histórico e gerar agora</Link>}>
        {brief ? (
          <>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{brief.output}</pre>
            <p className="mt-2 text-xs text-gray-500">gerado {formatDateTime(brief.ran_at)}{brief.model ? ` · ${brief.model}` : " · modelo local"}</p>
          </>
        ) : <Empty>Ainda não foi gerado nenhum resumo. O agente corre às segundas-feiras às 08:30 (Luanda) ou a pedido em <Link className="underline" href="/agente">Agente</Link>.</Empty>}
      </Card>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{k}</dt>
      <dd className={`tabular ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}

async function DriverPanel({ driverId, today }: { driverId: string | null; today: string }) {
  const sb = await createClient();
  if (!driverId) {
    return (
      <>
        <PageHeader title="A minha renda" />
        <Empty>A sua conta ainda não está ligada a um motorista. Contacte a gestão da frota.</Empty>
      </>
    );
  }
  const thisWeek = weekStartOf(today);
  const [rows, payments] = await Promise.all([
    getWeekStatusRange(sb, addDays(thisWeek, -7 * 11), addDays(thisWeek, 6)),
    getPayments(sb, { driverId, limit: 20 }),
  ]);
  const mine = rows.filter((r) => r.driver_id === driverId).sort((a, b) => b.week_start.localeCompare(a.week_start));
  const current = mine.find((r) => r.week_start === thisWeek);
  return (
    <>
      <PageHeader title="A minha renda" subtitle={current ? `${current.plate} · renda semanal ${formatAOA(current.weekly_rent_aoa)}` : undefined} />
      {current && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={`Semana ${formatWeek(thisWeek)}`} value={formatAOA(current.expected_aoa)} sub="esperado" />
          <Stat label="Pago" value={formatAOA(current.paid_aoa)} tone={current.status === "PAID" ? "good" : "neutral"} />
          <Stat label="Em falta" value={formatAOA(current.outstanding_aoa)} tone={current.outstanding_aoa > 0 ? "bad" : "good"} sub={<>prazo domingo 23:59 · <StatusBadge status={current.status} /></>} />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Últimas 12 semanas">
          <Table>
            <thead><tr><th className={th}>Semana</th><th className={th}>Estado</th><th className={thNum}>Esperado</th><th className={thNum}>Pago</th></tr></thead>
            <tbody>{mine.map((r) => (<tr key={r.week_start}><td className={td}>{formatWeek(r.week_start)}</td><td className={td}><StatusBadge status={r.status} /></td><td className={tdNum}>{formatAOA(r.expected_aoa)}</td><td className={tdNum}>{formatAOA(r.paid_aoa)}</td></tr>))}</tbody>
          </Table>
        </Card>
        <Card title="Pagamentos registados">
          {payments.length ? (
            <Table>
              <thead><tr><th className={th}>Data</th><th className={th}>Semana</th><th className={thNum}>Valor</th><th className={th}>Método</th></tr></thead>
              <tbody>{payments.map((p) => (<tr key={p.id}><td className={td}>{formatDateTime(p.paid_at)}</td><td className={td}>{formatWeek(p.week_start)}</td><td className={tdNum}>{formatAOA(p.amount_aoa)}</td><td className={td}>{p.method}</td></tr>))}</tbody>
            </Table>
          ) : <Empty>Sem pagamentos registados.</Empty>}
        </Card>
      </div>
    </>
  );
}
