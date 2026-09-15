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

export default async function DefinicoesPage() {
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
      <PageHeader title="Definições" subtitle="Objectivos do modelo, pesos do scorecard, frota, motoristas e utilizadores." />
      {!owner && <div className="mb-4"><Notice>Objectivos, pesos e funções de utilizador só podem ser alterados pelo proprietário.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Objectivos do modelo (fleet_targets)">
          <ActionForm action={updateTargets} submit="Guardar objectivos">
            <fieldset disabled={!owner} className="grid grid-cols-2 gap-3">
              <Field label="Líquido por carro / mês (Kz)"><input name="net_per_car_month_aoa" type="number" defaultValue={targets.net_per_car_month_aoa} className={inputCls} /></Field>
              <Field label="Cash livre por carro / mês (Kz)"><input name="free_cash_per_car_month_aoa" type="number" defaultValue={targets.free_cash_per_car_month_aoa} className={inputCls} /></Field>
              <Field label="Reserva por carro / mês (Kz)" hint="líquido − reserva = cash livre"><input name="reserve_rate_aoa_month" type="number" defaultValue={targets.reserve_rate_aoa_month} className={inputCls} /></Field>
              <Field label="Inflação anual" hint="0.20 = 20 %"><input name="inflation_rate_yearly" type="number" step="0.01" defaultValue={targets.inflation_rate_yearly} className={inputCls} /></Field>
              <Field label="Ano base da reserva"><input name="reserve_base_year" type="number" defaultValue={targets.reserve_base_year} className={inputCls} /></Field>
              <Field label="Data de compra do carro 4"><input name="car4_purchase_date" type="date" defaultValue={targets.car4_purchase_date} className={inputCls} /></Field>
              <Field label="Injecção privada carro 4 (Kz)"><input name="car4_private_injection_aoa" type="number" defaultValue={targets.car4_private_injection_aoa} className={inputCls} /></Field>
              <Field label="Meta de rendimento passivo / mês (Kz)"><input name="passive_income_goal_aoa_month" type="number" defaultValue={targets.passive_income_goal_aoa_month} className={inputCls} /></Field>
              <Field label="Frota alvo 2026"><input name="fleet_size_target_2026" type="number" defaultValue={targets.fleet_size_target_2026} className={inputCls} /></Field>
            </fieldset>
          </ActionForm>
        </Card>

        <div className="space-y-4">
          <Card title="Dinheiro em caixa (cash_positions)">
            <p className="mb-2 text-sm text-gray-600">Último registo: {cash ? `${formatAOA(cash.cash_aoa)} em ${formatDate(cash.as_of)}` : "nenhum"}.</p>
            <ActionForm action={addCashPosition} submit="Registar saldo">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Data"><input name="as_of" type="date" defaultValue={today} className={inputCls} /></Field>
                <Field label="Saldo (Kz)"><input name="cash_aoa" type="number" min={0} required className={inputCls} /></Field>
                <Field label="Nota"><input name="note" className={inputCls} /></Field>
              </div>
            </ActionForm>
          </Card>
          <Card title="Pesos do scorecard (score_weights)">
            <ActionForm action={updateWeights} submit="Guardar pesos">
              <fieldset disabled={!owner} className="grid grid-cols-3 gap-3">
                <Field label="Pontualidade %"><input name="on_time_pct" type="number" defaultValue={weights.on_time_pct} className={inputCls} /></Field>
                <Field label="Valor em falta %"><input name="shortfall_pct" type="number" defaultValue={weights.shortfall_pct} className={inputCls} /></Field>
                <Field label="Incidentes %"><input name="incidents_pct" type="number" defaultValue={weights.incidents_pct} className={inputCls} /></Field>
                <Field label="Dias parado %"><input name="downtime_pct" type="number" defaultValue={weights.downtime_pct} className={inputCls} /></Field>
                <Field label="Mínimo de semanas"><input name="min_weeks" type="number" defaultValue={weights.min_weeks} className={inputCls} /></Field>
                <Field label="Janela (semanas)"><input name="window_weeks" type="number" defaultValue={weights.window_weeks} className={inputCls} /></Field>
              </fieldset>
            </ActionForm>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Viaturas">
          <ul className="mb-3 space-y-1 text-sm">{vehicles.map((v) => <li key={v.id}>{v.plate} · {v.model} · desde {formatDate(v.in_service_from)}{v.in_service_to && <Badge tone="warn">até {formatDate(v.in_service_to)}</Badge>}</li>)}</ul>
          <ActionForm action={addVehicle} submit="Adicionar viatura">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Matrícula"><input name="plate" required className={inputCls} placeholder="LD-00-00-AA" /></Field>
              <Field label="Modelo"><input name="model" defaultValue="Suzuki S-Presso" className={inputCls} /></Field>
              <Field label="Em serviço desde"><input name="in_service_from" type="date" defaultValue={today} className={inputCls} /></Field>
              <Field label="Odómetro (km)"><input name="odometer_km" type="number" defaultValue={0} className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Motoristas">
          <ul className="mb-3 space-y-1 text-sm">{drivers.map((d) => <li key={d.id}>{d.full_name} · {d.phone_e164 ?? "sem telefone"}{!d.active && <Badge>inactivo</Badge>}</li>)}</ul>
          <ActionForm action={addDriver} submit="Adicionar motorista">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nome"><input name="full_name" required className={inputCls} /></Field>
              <Field label="Telefone (E.164)"><input name="phone_e164" placeholder="+244923000000" className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Atribuições e renda (rent_schedule)">
          <Table className="mb-3">
            <thead><tr><th className={th}>Motorista</th><th className={th}>Viatura</th><th className={th}>Renda/sem</th><th className={th}>Período</th><th className={th}></th></tr></thead>
            <tbody>{schedules.map((s) => (<tr key={s.id}><td className={td}>{dname.get(s.driver_id)}</td><td className={td}>{plate.get(s.vehicle_id)}</td><td className={td}>{formatAOA(s.weekly_rent_aoa)}</td><td className={td}>{formatDate(s.valid_from)} → {s.valid_to ? formatDate(s.valid_to) : "actual"}</td><td className={td}>{!s.valid_to && <EndScheduleButton id={s.id} today={today} />}</td></tr>))}</tbody>
          </Table>
          <ActionForm action={addSchedule} submit="Guardar atribuição">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Motorista"><select name="driver_id" required className={inputCls} defaultValue="">
                <option value="" disabled>escolha…</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
              <Field label="Viatura"><select name="vehicle_id" required className={inputCls} defaultValue="">
                <option value="" disabled>escolha…</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
              <Field label="Renda semanal (Kz)"><input name="weekly_rent_aoa" type="number" min={1} required className={inputCls} /></Field>
              <Field label="Início"><input name="valid_from" type="date" defaultValue={today} className={inputCls} /></Field>
              <Field label="Fim (opcional)"><input name="valid_to" type="date" className={inputCls} /></Field>
              <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="close_previous" defaultChecked /> fechar atribuição anterior</label>
            </div>
          </ActionForm>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Regras de manutenção (maintenance_rules)">
          <div className="space-y-2">
            {rules.map((r) => {
              const row = r as typeof r & { id: string };
              return (
                <ActionForm key={row.id} action={updateRule} submit="Guardar" className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-2">
                  <input type="hidden" name="id" value={row.id} />
                  <span className="w-44 text-sm font-medium">{r.label}</span>
                  <label className="text-xs">a cada km<input name="every_km" type="number" defaultValue={r.every_km ?? 0} className={`${inputCls} w-24`} /></label>
                  <label className="text-xs">a cada meses<input name="every_months" type="number" defaultValue={r.every_months ?? 0} className={`${inputCls} w-20`} /></label>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={r.active} /> activa</label>
                </ActionForm>
              );
            })}
          </div>
        </Card>
        {owner && (
          <Card title="Utilizadores e funções (profiles)">
            <p className="mb-2 text-xs text-gray-500">Crie contas em Supabase Auth; aparecem aqui como “motorista” até serem promovidas. Ligue contas de motoristas ao registo do motorista para verem só os seus pagamentos.</p>
            <div className="space-y-2">
              {profiles.map((p) => (
                <ActionForm key={p.id} action={updateProfileRole} submit="Guardar" className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-2">
                  <input type="hidden" name="id" value={p.id} />
                  <span className="w-44 truncate text-sm">{p.full_name ?? p.id}</span>
                  <select name="role" defaultValue={p.role} className={`${inputCls} w-36`}><option value="owner">Proprietário</option><option value="admin">Administrador</option><option value="driver">Motorista</option></select>
                  <select name="driver_id" defaultValue={p.driver_id ?? ""} className={`${inputCls} w-44`}><option value="">— sem motorista —</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>
                </ActionForm>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
