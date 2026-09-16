import { Card, Field, inputCls, PageHeader, Table, td, th, Notice, Badge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDrivers, getLatestCash, getProfiles, getSchedules, getScoreWeights, getTargets, getVehicles } from "@/lib/data/fleet";
import { getRules } from "@/lib/data/maintenance";
import { formatAOA, formatDate } from "@/lib/format";
import { luandaToday } from "@/lib/time";
import { ActionForm } from "./ActionForm";
import { addCashPosition, addDriver, addSchedule, addVehicle, updateProfileRole, updateRule, updateTargets, updateWeights } from "./actions";
import { EndScheduleButton } from "./EndScheduleButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireStaff();
  const owner = session.profile.role === "owner";
  const sb = await createClient();
  const today = luandaToday();
  const [targets, weights, cash, vehicles, drivers, schedules, profiles, rules] = await Promise.all([
    getTargets(sb), getScoreWeights(sb), getLatestCash(sb), getVehicles(sb), getDrivers(sb), getSchedules(sb), owner ? getProfiles(sb) : Promise.resolve([]), getRules(sb),
  ]);
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));
  const dname = new Map(drivers.map((d) => [d.id, d.full_name]));

  return (
    <>
      <PageHeader title="Settings" subtitle="Model targets, scorecard weights, fleet, drivers and users." />
      {!owner && <div className="mb-4"><Notice>Targets, weights and user roles can only be changed by the owner.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Model targets (fleet_targets)">
          <ActionForm action={updateTargets} submit="Save targets">
            <fieldset disabled={!owner} className="grid grid-cols-2 gap-3">
              <Field label="Net per car / month (Kz)"><input name="net_per_car_month_aoa" type="number" defaultValue={targets.net_per_car_month_aoa} className={inputCls} /></Field>
              <Field label="Free cash per car / month (Kz)"><input name="free_cash_per_car_month_aoa" type="number" defaultValue={targets.free_cash_per_car_month_aoa} className={inputCls} /></Field>
              <Field label="Reserve per car / month (Kz)" hint="net − reserve = free cash"><input name="reserve_rate_aoa_month" type="number" defaultValue={targets.reserve_rate_aoa_month} className={inputCls} /></Field>
              <Field label="Yearly inflation" hint="0.20 = 20 %"><input name="inflation_rate_yearly" type="number" step="0.01" defaultValue={targets.inflation_rate_yearly} className={inputCls} /></Field>
              <Field label="Reserve base year"><input name="reserve_base_year" type="number" defaultValue={targets.reserve_base_year} className={inputCls} /></Field>
              <Field label="Car 4 purchase date"><input name="car4_purchase_date" type="date" defaultValue={targets.car4_purchase_date} className={inputCls} /></Field>
              <Field label="Car 4 private injection (Kz)"><input name="car4_private_injection_aoa" type="number" defaultValue={targets.car4_private_injection_aoa} className={inputCls} /></Field>
              <Field label="Passive income goal / month (Kz)"><input name="passive_income_goal_aoa_month" type="number" defaultValue={targets.passive_income_goal_aoa_month} className={inputCls} /></Field>
              <Field label="Fleet size target 2026"><input name="fleet_size_target_2026" type="number" defaultValue={targets.fleet_size_target_2026} className={inputCls} /></Field>
            </fieldset>
          </ActionForm>
        </Card>

        <div className="space-y-4">
          <Card title="Cash on hand (cash_positions)">
            <p className="mb-2 text-sm text-gray-600">Latest entry: {cash ? `${formatAOA(cash.cash_aoa)} on ${formatDate(cash.as_of)}` : "none"}.</p>
            <ActionForm action={addCashPosition} submit="Record cash position">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date"><input name="as_of" type="date" defaultValue={today} className={inputCls} /></Field>
                <Field label="Cash (Kz)"><input name="cash_aoa" type="number" min={0} required className={inputCls} /></Field>
                <Field label="Note"><input name="note" className={inputCls} /></Field>
              </div>
            </ActionForm>
          </Card>
          <Card title="Scorecard weights (score_weights)">
            <ActionForm action={updateWeights} submit="Save weights">
              <fieldset disabled={!owner} className="grid grid-cols-3 gap-3">
                <Field label="On-time %"><input name="on_time_pct" type="number" defaultValue={weights.on_time_pct} className={inputCls} /></Field>
                <Field label="Shortfall %"><input name="shortfall_pct" type="number" defaultValue={weights.shortfall_pct} className={inputCls} /></Field>
                <Field label="Incidents %"><input name="incidents_pct" type="number" defaultValue={weights.incidents_pct} className={inputCls} /></Field>
                <Field label="Downtime %"><input name="downtime_pct" type="number" defaultValue={weights.downtime_pct} className={inputCls} /></Field>
                <Field label="Minimum weeks"><input name="min_weeks" type="number" defaultValue={weights.min_weeks} className={inputCls} /></Field>
                <Field label="Window (weeks)"><input name="window_weeks" type="number" defaultValue={weights.window_weeks} className={inputCls} /></Field>
              </fieldset>
            </ActionForm>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Vehicles">
          <ul className="mb-3 space-y-1 text-sm">{vehicles.map((v) => <li key={v.id}>{v.plate} · {v.model} · since {formatDate(v.in_service_from)}{v.purchase_price_aoa != null && <> · {formatAOA(v.purchase_price_aoa)}</>}{v.in_service_to && <Badge tone="warn">until {formatDate(v.in_service_to)}</Badge>}</li>)}</ul>
          <ActionForm action={addVehicle} submit="Add vehicle">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Plate"><input name="plate" required className={inputCls} placeholder="LDA-00-00-AA" /></Field>
              <Field label="Model"><input name="model" defaultValue="Suzuki S-Presso" className={inputCls} /></Field>
              <Field label="In service from"><input name="in_service_from" type="date" defaultValue={today} className={inputCls} /></Field>
              <Field label="Odometer (km)"><input name="odometer_km" type="number" defaultValue={0} className={inputCls} /></Field>
              <Field label="Purchase price (Kz)"><input name="purchase_price_aoa" type="number" min={0} className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Drivers">
          <ul className="mb-3 space-y-1 text-sm">{drivers.map((d) => <li key={d.id}>{d.full_name} · {d.phone_e164 ?? "no phone"}{!d.active && <Badge>inactive</Badge>}</li>)}</ul>
          <ActionForm action={addDriver} submit="Add driver">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name"><input name="full_name" required className={inputCls} /></Field>
              <Field label="Phone (E.164)"><input name="phone_e164" placeholder="+244923000000" className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Assignments and rent (rent_schedule)">
          <Table className="mb-3">
            <thead><tr><th className={th}>Driver</th><th className={th}>Vehicle</th><th className={th}>Rent/wk</th><th className={th}>Period</th><th className={th}></th></tr></thead>
            <tbody>{schedules.map((s) => (<tr key={s.id}><td className={td}>{dname.get(s.driver_id)}</td><td className={td}>{plate.get(s.vehicle_id)}</td><td className={td}>{formatAOA(s.weekly_rent_aoa)}</td><td className={td}>{formatDate(s.valid_from)} → {s.valid_to ? formatDate(s.valid_to) : "current"}</td><td className={td}>{!s.valid_to && <EndScheduleButton id={s.id} today={today} />}</td></tr>))}</tbody>
          </Table>
          <ActionForm action={addSchedule} submit="Save assignment">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Driver"><select name="driver_id" required className={inputCls} defaultValue="">
                <option value="" disabled>choose…</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
              <Field label="Vehicle"><select name="vehicle_id" required className={inputCls} defaultValue="">
                <option value="" disabled>choose…</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
              <Field label="Weekly rent (Kz)"><input name="weekly_rent_aoa" type="number" min={1} required className={inputCls} /></Field>
              <Field label="Start"><input name="valid_from" type="date" defaultValue={today} className={inputCls} /></Field>
              <Field label="End (optional)"><input name="valid_to" type="date" className={inputCls} /></Field>
              <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="close_previous" defaultChecked /> close previous assignment</label>
            </div>
          </ActionForm>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Maintenance rules (maintenance_rules)">
          <div className="space-y-2">
            {rules.map((r) => {
              const row = r as typeof r & { id: string };
              return (
                <ActionForm key={row.id} action={updateRule} submit="Save" className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-2">
                  <input type="hidden" name="id" value={row.id} />
                  <span className="w-44 text-sm font-medium">{r.label}</span>
                  <label className="text-xs">every km<input name="every_km" type="number" defaultValue={r.every_km ?? 0} className={`${inputCls} w-24`} /></label>
                  <label className="text-xs">every months<input name="every_months" type="number" defaultValue={r.every_months ?? 0} className={`${inputCls} w-20`} /></label>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={r.active} /> active</label>
                </ActionForm>
              );
            })}
          </div>
        </Card>
        {owner && (
          <Card title="Users and roles (profiles)">
            <p className="mb-2 text-xs text-gray-500">Create accounts in Supabase Auth; they appear here as “driver” until promoted. Link driver accounts to their driver record so they only see their own payments.</p>
            <div className="space-y-2">
              {profiles.map((p) => (
                <ActionForm key={p.id} action={updateProfileRole} submit="Save" className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-2">
                  <input type="hidden" name="id" value={p.id} />
                  <span className="w-44 truncate text-sm">{p.full_name ?? p.id}</span>
                  <select name="role" defaultValue={p.role} className={`${inputCls} w-36`}><option value="owner">Owner</option><option value="admin">Admin</option><option value="driver">Driver</option></select>
                  <select name="driver_id" defaultValue={p.driver_id ?? ""} className={`${inputCls} w-44`}><option value="">— no driver —</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>
                </ActionForm>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
