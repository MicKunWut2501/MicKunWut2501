import type { Trend } from "@/lib/scorecard/score";

export function TrendArrow({ trend, previous }: { trend: Trend; previous: number | null }) {
  const map: Record<Trend, { sym: string; cls: string; label: string }> = {
    up: { sym: "▲", cls: "text-emerald-700", label: "improving" },
    down: { sym: "▼", cls: "text-red-700", label: "declining" },
    flat: { sym: "▶", cls: "text-gray-500", label: "stable" },
    none: { sym: "·", cls: "text-gray-400", label: "no previous window" },
  };
  const t = map[trend];
  return <span className={`text-sm ${t.cls}`} title={previous !== null ? `previous: ${previous}` : undefined}>{t.sym} <span className="text-xs">{t.label}{previous !== null ? ` (${previous})` : ""}</span></span>;
}
