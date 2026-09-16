import Link from "next/link";
import type { RentStatus } from "@/lib/supabase/types";
import type { DueState } from "@/lib/maintenance/rules";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", right }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: React.ReactNode; tone?: "neutral" | "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<RentStatus, string> = {
  PAID: "bg-emerald-100 text-emerald-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  MISSED: "bg-red-100 text-red-800",
  PENDING: "bg-gray-100 text-gray-700",
  EXEMPT: "bg-sky-100 text-sky-800",
};
const STATUS_LABELS: Record<RentStatus, string> = {
  PAID: "Paid", PARTIAL: "Partial", MISSED: "Missed", PENDING: "Pending", EXEMPT: "Exempt",
};

export function StatusBadge({ status }: { status: RentStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

const DUE_STYLES: Record<DueState, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  due: "bg-amber-50 text-amber-800 border-amber-200",
  overdue: "bg-red-50 text-red-800 border-red-200",
  never: "bg-gray-50 text-gray-600 border-gray-200",
};
const DUE_LABELS: Record<DueState, string> = { ok: "OK", due: "Due soon", overdue: "Overdue", never: "No record" };

export function DueChip({ label, state, reason }: { label: string; state: DueState; reason: string }) {
  return (
    <span title={reason} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${DUE_STYLES[state]}`}>
      <span className="font-medium">{label}</span>
      <span>· {DUE_LABELS[state]}</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "info" }) {
  const map = {
    neutral: "bg-gray-100 text-gray-700", good: "bg-emerald-100 text-emerald-800", bad: "bg-red-100 text-red-800",
    warn: "bg-amber-100 text-amber-800", info: "bg-sky-100 text-sky-800",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base = "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const map = {
    primary: "bg-gray-900 text-white hover:bg-gray-700",
    secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-gray-700 hover:bg-gray-100",
  };
  return <button className={`${base} ${map[variant]} ${className}`} {...rest}>{children}</button>;
}

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const map = { primary: "bg-gray-900 text-white hover:bg-gray-700", secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50" };
  return <Link href={href} className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${map[variant]}`}>{children}</Link>;
}

export const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none";

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export const th = "px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-200";
export const thNum = `${th} text-right`;
export const td = "px-2 py-2 border-b border-gray-100 align-top";
export const tdNum = `${td} text-right tabular`;

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">{children}</p>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  const map = { info: "border-sky-200 bg-sky-50 text-sky-900", error: "border-red-200 bg-red-50 text-red-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${map[kind]}`}>{children}</div>;
}
