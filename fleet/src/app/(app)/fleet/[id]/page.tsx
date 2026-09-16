import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DueChip, Empty, PageHeader, Stat, Table, td, tdNum, th, thNum, Badge } from "@/components/ui";
import { CategoryStackChart } from "@/components/Charts";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDowntime, getDrivers, getSchedules, getVehicle, getVehicles } from "@/lib/data/fleet";
import { getEvents, getReminders } from "@/lib/data/maintenance";
import { CATEGORY_LABELS, costPerKm, monthlyByCategory, EXPENSE_CATEGORIES } from "@/lib/maintenance/categories";
import { formatAOA, formatDate, formatKm, formatMonth } from "@/lib/format";
import { luandaToday } from "@/lib/time";
import { DowntimeForm } from "./DowntimeForm";

export const dynamic = "force-dynamic";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sb = await createClient();
  const today = luandaToday();
  const vehicle = await getVehicle(sb, id);
  if (!vehicle) notFound();
  const [events, downtime, schedules, drivers, allVehicles] = await Promise.all([
    getEvents(sb, { vehicleId: id }), getDowntime(sb, id), getSchedules(sb), getDrivers(sb), getVehicles(sb),
  ]);
  const reminders = (await getReminders(sb, allVehicles.filter((v) => v.id === id), today)).get(id) ?? [];
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));
  const byMonth = monthlyByCategory(events);
  const months = [...new Set(byMonth.map((r) => r.month))].sort();
  const usedCats = EXPENSE_CATEGORIES.filter((c) => byMonth.some((r) => r.category === c));
  const chartRows = months.map((m) => {
    const row: Record<string, number | string> = { month: m };
    for (const c of usedCats) row[c] = byMonth.filter((r) => r.month === m && r.category === c).reduce((a, r) => a + r.total_aoa, 0);
    return row;
  });
  const cpk = costPerKm(events);
  const total = events.reduce((a, e) => a + e.total_aoa, 0);

  return (
    <>
      <PageHeader title={vehicle.plate} subtitle={`${vehicle.model} · in service since ${formatDate(vehicle.in_service_from)} · ${formatKm(vehicle.odometer_km)}`} actions={<Link href="/receipts/new" className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white">Log expense</Link>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total cost logged" value={formatAOA(total)} sub={`${events.length} event(s)`} />
        <Stat label="Cost per km" value={cpk ? `${formatAOA(cpk.per_km, { decimals: 1 })}/km` : "—"} sub={cpk ? `${formatKm(cpk.km)} between readings` : "needs 2 odometer readings"} />
        <Card title="Reminders">
          <div className="flex flex-wrap gap-1">{reminders.map((r) => <DueChip key={r.category} label={r.label} state={r.state} reason={r.reason} />)}</div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Monthly cost by category">
          {chartRows.length ? <CategoryStackChart rows={chartRows} categories={usedCats} labels={CATEGORY_LABELS} /> : <Empty>No expenses logged.</Empty>}
        </Card>
        <Card title="Monthly table">
          {months.length ? (
            <Table>
              <thead><tr><th className={th}>Month</th>{usedCats.map((c) => <th key={c} className={thNum}>{CATEGORY_LABELS[c]}</th>)}<th className={thNum}>Total</th></tr></thead>
              <tbody>
                {months.slice().reverse().map((m) => {
                  const rowTotal = byMonth.filter((r) => r.month === m).reduce((a, r) => a + r.total_aoa, 0);
                  return (
                    <tr key={m}><td className={td}>{formatMonth(m)}</td>
                      {usedCats.map((c) => <td key={c} className={tdNum}>{formatAOA(byMonth.find((r) => r.month === m && r.category === c)?.total_aoa ?? 0)}</td>)}
                      <td className={`${tdNum} font-medium`}>{formatAOA(rowTotal)}</td></tr>
                  );
                })}
              </tbody>
            </Table>
          ) : <Empty>No data.</Empty>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Event timeline">
          {events.length ? (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-gray-100 pb-2 text-sm">
                  <div className="w-24 shrink-0 text-gray-500">{formatDate(e.event_date)}</div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone="info">{CATEGORY_LABELS[e.category]}</Badge><span className="font-medium">{formatAOA(e.total_aoa)}</span>{e.odometer_km != null && <span className="text-gray-500">{formatKm(e.odometer_km)}</span>}{e.vendor && <span className="text-gray-500">· {e.vendor}</span>}</div>
                    {e.notes && <div className="text-gray-600">{e.notes}</div>}
                    {e.line_items?.length > 0 && <div className="text-xs text-gray-500">{e.line_items.map((li) => `${li.qty}× ${li.description}`).join(", ")}</div>}
                  </div>
                </li>
              ))}
            </ol>
          ) : <Empty>No events.</Empty>}
        </Card>
        <div className="space-y-4">
          <Card title="Drivers">
            <ul className="space-y-1 text-sm">
              {schedules.filter((s) => s.vehicle_id === id).map((s) => (<li key={s.id}>{driverName.get(s.driver_id)} · {formatAOA(s.weekly_rent_aoa)}/wk · {formatDate(s.valid_from)} → {s.valid_to ? formatDate(s.valid_to) : "current"}</li>))}
            </ul>
          </Card>
          <Card title="Downtime (no rent expected)">
            {downtime.length ? <ul className="space-y-1 text-sm">{downtime.map((d) => <li key={d.id}>{formatDate(d.from_date)} → {formatDate(d.to_date)} · {d.reason}</li>)}</ul> : <Empty>No downtime recorded.</Empty>}
            <DowntimeForm vehicleId={id} today={today} />
          </Card>
        </div>
      </div>
    </>
  );
}
