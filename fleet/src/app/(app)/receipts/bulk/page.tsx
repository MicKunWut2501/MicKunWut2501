import { Card, Empty, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVehicles } from "@/lib/data/fleet";
import { getEvents } from "@/lib/data/maintenance";
import { BulkForm } from "./BulkForm";

export const dynamic = "force-dynamic";

export default async function BulkPage({ searchParams }: { searchParams: Promise<{ vehicle?: string; scope?: string }> }) {
  await requireStaff();
  const { vehicle, scope } = await searchParams;
  const sb = await createClient();
  const vehicles = await getVehicles(sb);
  let events = await getEvents(sb, { vehicleId: vehicle && vehicle !== "all" ? vehicle : undefined, limit: 400 });
  const onlyOther = scope !== "all";
  if (onlyOther) events = events.filter((e) => e.category === "other");
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));

  return (
    <>
      <PageHeader
        title="Bulk categorise expenses"
        subtitle="Tick rows, pick a category, apply. Fill an odometer reading on any row to record it; the vehicle odometer follows the highest reading."
      />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label>Vehicle
          <select name="vehicle" defaultValue={vehicle ?? "all"} className="ml-1 rounded border border-gray-300 px-2 py-1">
            <option value="all">all</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
          </select>
        </label>
        <label>Show
          <select name="scope" defaultValue={onlyOther ? "other" : "all"} className="ml-1 rounded border border-gray-300 px-2 py-1">
            <option value="other">only “Other” (uncategorised)</option>
            <option value="all">all categories</option>
          </select>
        </label>
        <button className="rounded border border-gray-300 px-2 py-1">Filter</button>
      </form>
      <Card>
        {events.length ? (
          <BulkForm rows={events.map((e) => ({ id: e.id, date: e.event_date, plate: plate.get(e.vehicle_id) ?? "", category: e.category, total_aoa: e.total_aoa, odometer_km: e.odometer_km, vendor: e.vendor, notes: e.notes }))} />
        ) : <Empty>Nothing to categorise with these filters.</Empty>}
      </Card>
    </>
  );
}
