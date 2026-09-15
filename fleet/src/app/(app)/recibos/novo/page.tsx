import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVehicles } from "@/lib/data/fleet";
import { env } from "@/lib/env";
import { luandaToday } from "@/lib/time";
import { ReceiptReview } from "./ReceiptReview";

export const dynamic = "force-dynamic";

export default async function NovoReciboPage() {
  await requireStaff();
  const sb = await createClient();
  const vehicles = (await getVehicles(sb)).filter((v) => !v.in_service_to);
  return (
    <>
      <PageHeader title="Novo recibo" subtitle={env.receiptExtractor() === "anthropic" ? "A extracção automática pré-preenche o formulário; reveja antes de guardar." : "Extracção automática desactivada (sem ANTHROPIC_API_KEY): preencha manualmente."} />
      <ReceiptReview vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plate, odometer_km: v.odometer_km }))} today={luandaToday()} />
    </>
  );
}
