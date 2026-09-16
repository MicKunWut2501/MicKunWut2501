import { Card, Empty, PageHeader, StatusBadge, Table, td, tdNum, th, thNum } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMessageLog, getOpenAlerts, getPayments, getWeekStatus } from "@/lib/data/rent";
import { getDrivers } from "@/lib/data/fleet";
import { buildRentMessage } from "@/lib/rent/whatsapp";
import { formatAOA, formatDateTime, formatWeek } from "@/lib/format";
import { addDays, luandaToday, weekStartOf } from "@/lib/time";
import { env } from "@/lib/env";
import { PaymentForm } from "./PaymentForm";
import { WhatsappDraft } from "./WhatsappDraft";
import { AcknowledgeButton } from "./AcknowledgeButton";
import type { WeekStatusRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function RentPage() {
  await requireStaff();
  const sb = await createClient();
  const today = luandaToday();
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const [cur, prev, payments, alerts, log, drivers] = await Promise.all([
    getWeekStatus(sb, thisWeek), getWeekStatus(sb, lastWeek),
    getPayments(sb, { weekStarts: [thisWeek, lastWeek] }), getOpenAlerts(sb), getMessageLog(sb, { limit: 20 }), getDrivers(sb),
  ]);
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
  const deadline = addDays(today, 2);
  const drafts = [...prev, ...cur].filter((r) => r.status === "PARTIAL" || r.status === "MISSED");
  const totalOutstanding = [...prev, ...cur].reduce((a, r) => a + r.outstanding_aoa, 0);

  return (
    <>
      <PageHeader title="Rent collection" subtitle={`Weekly rents · outstanding across both weeks: ${formatAOA(totalOutstanding)}`} />

      <WeekTable title={`Current week · ${formatWeek(thisWeek)}`} rows={cur} note="Deadline: Sunday 23:59 (Luanda)." />
      <WeekTable title={`Last week · ${formatWeek(lastWeek)}`} rows={prev} />

      <Card className="mt-6" title="WhatsApp reminders (editable drafts, in Portuguese for the driver)">
        {drafts.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {drafts.map((r) => (
              <WhatsappDraft
                key={r.driver_id + r.week_start}
                driverId={r.driver_id}
                driverName={`${r.driver_name} · ${r.plate} · ${formatWeek(r.week_start)}`}
                weekStart={r.week_start}
                phone={r.phone_e164}
                initial={buildRentMessage({
                  driverName: r.driver_name, plate: r.plate, weekStart: r.week_start, expectedAoa: r.expected_aoa, paidAoa: r.paid_aoa,
                  outstandingAoa: r.outstanding_aoa, status: r.status, deadline, fleetName: env.fleetName(),
                })}
              />
            ))}
          </div>
        ) : <Empty>No driver with partial or missed rent.</Empty>}
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Open alerts (generated Monday 08:00)">
          {alerts.length ? (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span>{driverName.get(a.driver_id) ?? a.driver_id} · {formatWeek(a.week_start)} · <StatusBadge status={a.status} /> · {formatAOA(a.outstanding_aoa)}</span>
                  <AcknowledgeButton id={a.id} />
                </li>
              ))}
            </ul>
          ) : <Empty>No open alerts.</Empty>}
        </Card>
        <Card title="Payments (2 weeks)">
          {payments.length ? (
            <Table>
              <thead><tr><th className={th}>Driver</th><th className={th}>Week</th><th className={thNum}>Amount</th><th className={th}>Date</th></tr></thead>
              <tbody>{payments.map((p) => (<tr key={p.id}><td className={td}>{driverName.get(p.driver_id)}</td><td className={td}>{formatWeek(p.week_start)}</td><td className={tdNum}>{formatAOA(p.amount_aoa)}</td><td className={td}>{formatDateTime(p.paid_at)}</td></tr>))}</tbody>
            </Table>
          ) : <Empty>No payments.</Empty>}
        </Card>
        <Card title="WhatsApp sends logged">
          {log.length ? (
            <ul className="space-y-1 text-sm">
              {log.map((m) => (<li key={m.id}><span className="text-gray-500">{formatDateTime(m.sent_at)}</span> · {driverName.get(m.driver_id)} · {formatWeek(m.week_start)}</li>))}
            </ul>
          ) : <Empty>No sends yet.</Empty>}
        </Card>
      </div>
    </>
  );
}

function WeekTable({ title, rows, note }: { title: string; rows: WeekStatusRow[]; note?: string }) {
  return (
    <Card className="mt-4" title={title} right={note ? <span className="text-xs text-gray-500">{note}</span> : undefined}>
      <Table>
        <thead>
          <tr>
            <th className={th}>Driver</th><th className={th}>Vehicle</th><th className={th}>Status</th>
            <th className={thNum}>Expected</th><th className={thNum}>Paid</th><th className={thNum}>Outstanding</th><th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driver_id}>
              <td className={td}>{r.driver_name}</td>
              <td className={td}>{r.plate}{r.active_days < 7 && <span className="ml-1 text-xs text-gray-400">({r.active_days}/7 days)</span>}</td>
              <td className={td}><StatusBadge status={r.status} /></td>
              <td className={tdNum}>{formatAOA(r.expected_aoa)}</td>
              <td className={tdNum}>{formatAOA(r.paid_aoa)}</td>
              <td className={`${tdNum} ${r.outstanding_aoa > 0 ? "font-semibold text-red-700" : ""}`}>{formatAOA(r.outstanding_aoa)}</td>
              <td className={`${td} text-right`}><PaymentForm driverId={r.driver_id} weekStart={r.week_start} suggested={r.outstanding_aoa} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className={td}><Empty>No drivers with rent due this week.</Empty></td></tr>}
        </tbody>
      </Table>
    </Card>
  );
}
