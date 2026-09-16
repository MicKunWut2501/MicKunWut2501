import Link from "next/link";
import { Card, Empty, LinkButton, PageHeader, Stat, StatusBadge, Table, td, tdNum, th, thNum } from "@/components/ui";
import { NetPerCarChart, ReserveChart } from "@/components/Charts";
import { isStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getModelVsActual } from "@/lib/data/model";
import { getWeekStatus, getWeekStatusRange, getPayments } from "@/lib/data/rent";
import { getVehicles } from "@/lib/data/fleet";
import { getReminders } from "@/lib/data/maintenance";
import { formatAOA, formatDate, formatDateTime, formatEUR, formatMonth, formatPct, formatWeek } from "@/lib/format";
import { addDays, luandaToday, weekStartOf } from "@/lib/time";
import { delta } from "@/lib/model/model";
import type { AgentRun } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
        title="Dashboard"
        subtitle={`${formatMonth(today.slice(0, 7) + "-01", true)} · ${vehicles.length} vehicles · target ${t.fleet_size_target_2026} in 2026`}
        actions={<LinkButton href="/api/export">Export XLSX</LinkButton>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Net per car (this month)"
          value={formatAOA(m?.net_per_car_aoa ?? null)}
          tone={netDelta.abs === null ? "neutral" : netDelta.abs >= 0 ? "good" : "bad"}
          sub={<>target {formatAOA(t.net_per_car_month_aoa)} · {formatAOA(netDelta.abs, { signed: true })} ({formatPct(netDelta.pct, 0, true)})</>}
        />
        <Stat
          label="Fleet net vs goal"
          value={formatAOA(m?.net_aoa ?? null)}
          tone={model.goal_progress !== null && model.goal_progress >= 1 ? "good" : "neutral"}
          sub={<>goal {formatAOA(t.passive_income_goal_aoa_month)}/month · {formatPct(model.goal_progress)} of goal</>}
        />
        <Stat
          label="Cumulative reserve"
          value={formatAOA(m?.cum_reserve_aoa ?? model.car4.reserve_balance_aoa)}
          tone={reserveGap === null ? "neutral" : reserveGap >= 0 ? "good" : "warn"}
          sub={<>model expects {formatAOA(m?.cum_target_reserve_aoa ?? null)} · {formatAOA(reserveGap, { signed: true })}</>}
        />
        <Stat
          label="Collection rate (this month)"
          value={formatPct(collect)}
          tone={collect === null ? "neutral" : collect >= 0.95 ? "good" : collect >= 0.8 ? "warn" : "bad"}
          sub={<>{formatAOA(m?.rent_paid_aoa ?? 0)} of {formatAOA(m?.rent_expected_aoa ?? 0)}</>}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Net per car: actual vs target">
          {model.fleetMonths.length ? (
            <NetPerCarChart data={model.fleetMonths.map((fm) => ({ month: fm.month, actual: fm.net_per_car_aoa, target: fm.target_net_per_car_aoa }))} />
          ) : <Empty>No active vehicles yet.</Empty>}
        </Card>
        <Card title="Replacement reserve: actual vs model">
          {model.fleetMonths.length ? (
            <ReserveChart data={model.fleetMonths.map((fm) => ({ month: fm.month, actual: fm.cum_reserve_aoa, model: fm.cum_target_reserve_aoa }))} />
          ) : <Empty>No data.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card title={`Loan coverage · ${model.lastFullMonth ? formatMonth(model.lastFullMonth.month) : "—"} (last full month)`}>
          {model.loan_last_full_month ? (
            <>
              <div className="text-3xl font-semibold tabular">{model.loan_last_full_month.coverage === null ? "—" : `${model.loan_last_full_month.coverage.toFixed(2)}×`}</div>
              <p className="mt-1 text-xs text-gray-500">fleet net {formatEUR(model.loan_last_full_month.net_eur, 2)} vs instalment {formatEUR(model.loan_last_full_month.installment_eur, 2)} at {t.fx_aoa_per_eur} AOA/EUR</p>
              <dl className="mt-3 space-y-1 text-sm">
                <Row k="Monthly surplus after instalment" v={formatEUR(model.loan_last_full_month.surplus_eur, 2)} strong />
                <Row k="This month so far" v={model.loan_this_month ? `${formatEUR(model.loan_this_month.net_eur, 2)} · ${model.loan_this_month.coverage === null ? "—" : model.loan_this_month.coverage.toFixed(2) + "×"}` : "—"} />
                <Row k="Instalments paid / left" v={`${model.loan_last_full_month.months_elapsed} / ${model.loan_last_full_month.months_remaining}`} />
                <Row k="Still to repay" v={formatEUR(model.loan_last_full_month.remaining_eur)} />
              </dl>
            </>
          ) : <Empty>No completed month yet.</Empty>}
        </Card>
        <Card title="Car 4 · countdown">
          <div className="text-3xl font-semibold tabular">
            {model.car4.months_remaining} <span className="text-base font-normal text-gray-500">months</span> {model.car4.days_after_months} <span className="text-base font-normal text-gray-500">days</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">planned purchase {formatDate(model.car4.purchase_date)} · {model.car4.days_remaining} days</p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row k="Planned private injection" v={formatAOA(model.car4.injection_target_aoa)} />
            <Row k="Cumulative reserve" v={formatAOA(model.car4.reserve_balance_aoa)} />
            <Row k={`Cash on hand${model.cash_as_of ? ` (${formatDate(model.cash_as_of)})` : ""}`} v={formatAOA(model.car4.cash_on_hand_aoa)} />
            <Row k="Injection still required" v={formatAOA(model.car4.injection_required_aoa)} strong />
          </dl>
          <p className="mt-2 text-xs text-gray-500">Update cash on hand in <Link className="underline" href="/settings">Settings</Link>.</p>
        </Card>

        <Card title={`Rent · week ${formatWeek(thisWeek)}`} right={<Link href="/rent" className="text-xs underline">open</Link>}>
          <Table>
            <thead><tr><th className={th}>Driver</th><th className={th}>Status</th><th className={thNum}>Outstanding</th></tr></thead>
            <tbody>
              {week.map((r) => (
                <tr key={r.driver_id}><td className={td}>{r.driver_name} <span className="text-gray-400">· {r.plate}</span></td><td className={td}><StatusBadge status={r.status} /></td><td className={tdNum}>{formatAOA(r.outstanding_aoa)}</td></tr>
              ))}
              {!week.length && <tr><td className={td} colSpan={3}><Empty>No active drivers.</Empty></td></tr>}
            </tbody>
          </Table>
          {problems.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">Last week: {problems.length} driver(s) with rent outstanding ({formatAOA(problems.reduce((a, p) => a + p.outstanding_aoa, 0))}).</p>
          )}
        </Card>

        <Card title="Maintenance due" right={<Link href="/fleet" className="text-xs underline">fleet</Link>}>
          {dueItems.length ? (
            <ul className="space-y-1 text-sm">
              {dueItems.map((d) => (
                <li key={d.plate + d.category} className="flex justify-between gap-2">
                  <span><span className="font-medium">{d.plate}</span> · {d.label}</span>
                  <span className={d.state === "overdue" ? "text-red-700" : "text-amber-700"}>{d.reason}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing due within 30 days / 500 km.</Empty>}
        </Card>
      </div>

      <Card className="mt-6" title="Weekly brief from the agent" right={<Link href="/agent" className="text-xs underline">history and run now</Link>}>
        {brief ? (
          <>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{brief.output}</pre>
            <p className="mt-2 text-xs text-gray-500">generated {formatDateTime(brief.ran_at)}{brief.model ? ` · ${brief.model}` : " · local template"}</p>
          </>
        ) : <Empty>No brief yet. The agent runs on Mondays at 08:30 (Luanda) or on demand from <Link className="underline" href="/agent">Agent</Link>.</Empty>}
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
        <PageHeader title="My rent" />
        <Empty>Your account is not linked to a driver yet. Contact the fleet manager.</Empty>
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
      <PageHeader title="My rent" subtitle={current ? `${current.plate} · weekly rent ${formatAOA(current.weekly_rent_aoa)}` : undefined} />
      {current && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={`Week ${formatWeek(thisWeek)}`} value={formatAOA(current.expected_aoa)} sub="expected" />
          <Stat label="Paid" value={formatAOA(current.paid_aoa)} tone={current.status === "PAID" ? "good" : "neutral"} />
          <Stat label="Outstanding" value={formatAOA(current.outstanding_aoa)} tone={current.outstanding_aoa > 0 ? "bad" : "good"} sub={<>deadline Sunday 23:59 · <StatusBadge status={current.status} /></>} />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Last 12 weeks">
          <Table>
            <thead><tr><th className={th}>Week</th><th className={th}>Status</th><th className={thNum}>Expected</th><th className={thNum}>Paid</th></tr></thead>
            <tbody>{mine.map((r) => (<tr key={r.week_start}><td className={td}>{formatWeek(r.week_start)}</td><td className={td}><StatusBadge status={r.status} /></td><td className={tdNum}>{formatAOA(r.expected_aoa)}</td><td className={tdNum}>{formatAOA(r.paid_aoa)}</td></tr>))}</tbody>
          </Table>
        </Card>
        <Card title="Recorded payments">
          {payments.length ? (
            <Table>
              <thead><tr><th className={th}>Date</th><th className={th}>Week</th><th className={thNum}>Amount</th><th className={th}>Method</th></tr></thead>
              <tbody>{payments.map((p) => (<tr key={p.id}><td className={td}>{formatDateTime(p.paid_at)}</td><td className={td}>{formatWeek(p.week_start)}</td><td className={tdNum}>{formatAOA(p.amount_aoa)}</td><td className={td}>{p.method}</td></tr>))}</tbody>
            </Table>
          ) : <Empty>No payments recorded.</Empty>}
        </Card>
      </div>
    </>
  );
}
