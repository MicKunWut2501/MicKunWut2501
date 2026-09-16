import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVehicles } from "@/lib/data/fleet";
import { env } from "@/lib/env";
import { luandaToday } from "@/lib/time";
import { ReceiptReview } from "./ReceiptReview";

export const dynamic = "force-dynamic";

export default async function NewReceiptPage() {
  await requireStaff();
  const sb = await createClient();
  const vehicles = (await getVehicles(sb)).filter((v) => !v.in_service_to);
  return (
    <>
      <PageHeader title="New receipt" subtitle={env.receiptExtractor() === "anthropic" ? "Automatic extraction pre-fills the form; review before saving." : "Automatic extraction is off (no ANTHROPIC_API_KEY): fill the form manually."} />
      <ReceiptReview vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plate, odometer_km: v.odometer_km }))} today={luandaToday()} />
    </>
  );
}
