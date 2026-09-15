"use client";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { formatAOA, formatMonth } from "@/lib/format";

const COLORS = ["#111827", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#4b5563", "#be185d", "#65a30d"];

const kz = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`);
const tooltipAOA = (value: unknown) => formatAOA(typeof value === "number" ? value : Number(value));

export function NetPerCarChart({ data }: { data: { month: string; actual: number | null; target: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data.map((d) => ({ ...d, label: formatMonth(d.month) }))} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={kz} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={tooltipAOA} />
        <Legend />
        <Line type="monotone" dataKey="actual" name="Líquido por carro (real)" stroke={COLORS[1]} strokeWidth={2} dot connectNulls={false} />
        <Line type="monotone" dataKey="target" name="Objectivo" stroke={COLORS[0]} strokeDasharray="6 4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ReserveChart({ data }: { data: { month: string; actual: number; model: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data.map((d) => ({ ...d, label: formatMonth(d.month) }))} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={kz} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={tooltipAOA} />
        <Legend />
        <Line type="monotone" dataKey="actual" name="Reserva acumulada (real)" stroke={COLORS[2]} strokeWidth={2} />
        <Line type="monotone" dataKey="model" name="Reserva segundo o modelo" stroke={COLORS[0]} strokeDasharray="6 4" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Stacked monthly cost by category for one vehicle. rows: [{month, fuel: n, tyres: n, ...}] */
export function CategoryStackChart({ rows, categories, labels }: { rows: Record<string, number | string>[]; categories: string[]; labels: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows.map((r) => ({ ...r, label: formatMonth(String(r.month)) }))} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={kz} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={tooltipAOA} />
        <Legend />
        {categories.map((c, i) => (
          <Bar key={c} dataKey={c} name={labels[c] ?? c} stackId="a" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Side-by-side monthly maintenance cost per car; outliers drawn in red. */
export function FleetCompareChart({ rows, average }: { rows: { plate: string; total_aoa: number; outlier: boolean }[]; average: number }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey="plate" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={kz} tick={{ fontSize: 12 }} width={48} />
        <Tooltip formatter={tooltipAOA} />
        <Bar dataKey="total_aoa" name={`Custo do mês (média ${formatAOA(average)})`}>
          {rows.map((r) => (
            <Cell key={r.plate} fill={r.outlier ? COLORS[4] : COLORS[1]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
