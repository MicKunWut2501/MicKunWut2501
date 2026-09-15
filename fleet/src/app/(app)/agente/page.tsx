import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { env } from "@/lib/env";
import type { AgentRun } from "@/lib/supabase/types";
import { RunButtons } from "./RunButtons";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { weekly_brief: "Resumo semanal", rent_alerts: "Alertas de renda", receipt_extraction: "Extracção de recibo" };

export default async function AgentePage() {
  await requireStaff();
  const sb = await createClient();
  const { data } = await sb.from("agent_runs").select("*").order("ran_at", { ascending: false }).limit(40);
  const runs = (data ?? []) as AgentRun[];
  const ai = Boolean(env.anthropicApiKey());
  return (
    <>
      <PageHeader title="Agente de operações" subtitle="Automatismos: segunda 08:00 (Luanda) alertas de renda; 08:30 resumo semanal com acções recomendadas. Tudo fica registado; nada é enviado a motoristas automaticamente." actions={<RunButtons />} />
      <div className="mb-4 text-sm">
        {ai ? <Badge tone="good">IA activa · {env.anthropicModel()}</Badge> : <Badge tone="warn">Sem ANTHROPIC_API_KEY: resumo por modelo local e extracção de recibos desactivada</Badge>}
      </div>
      <div className="space-y-3">
        {runs.map((r) => (
          <Card key={r.id} title={`${KIND[r.kind] ?? r.kind} · ${formatDateTime(r.ran_at)}`} right={<Badge tone={r.status === "ok" ? "good" : "bad"}>{r.status}{r.model ? ` · ${r.model}` : ""}{r.tokens_in != null ? ` · ${r.tokens_in}/${r.tokens_out} tokens` : ""}</Badge>}>
            {r.output ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{r.output}</pre> : <span className="text-sm text-red-700">{r.error}</span>}
          </Card>
        ))}
        {!runs.length && <Empty>Sem execuções ainda.</Empty>}
      </div>
    </>
  );
}
