import type { Trend } from "@/lib/scorecard/score";

export function TrendArrow({ trend, previous }: { trend: Trend; previous: number | null }) {
  const map: Record<Trend, { sym: string; cls: string; label: string }> = {
    up: { sym: "▲", cls: "text-emerald-700", label: "a subir" },
    down: { sym: "▼", cls: "text-red-700", label: "a descer" },
    flat: { sym: "▶", cls: "text-gray-500", label: "estável" },
    none: { sym: "·", cls: "text-gray-400", label: "sem período anterior" },
  };
  const t = map[trend];
  return <span className={`text-sm ${t.cls}`} title={previous !== null ? `anterior: ${previous}` : undefined}>{t.sym} <span className="text-xs">{t.label}{previous !== null ? ` (${previous})` : ""}</span></span>;
}
