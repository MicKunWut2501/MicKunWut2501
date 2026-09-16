import { Card, Empty, LinkButton, PageHeader, Table, td, tdNum, th, thNum, Badge } from "@/components/ui";
import { requireUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEvents, getReceipts } from "@/lib/data/maintenance";
import { getVehicles } from "@/lib/data/fleet";
import { CATEGORY_LABELS } from "@/lib/maintenance/categories";
import { formatAOA, formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const session = await requireUser();
  const sb = await createClient();
  const staff = isStaff(session);
  const [receipts, vehicles, events] = await Promise.all([getReceipts(sb), getVehicles(sb), staff ? getEvents(sb, { limit: 50 }) : Promise.resolve([])]);
  const plate = new Map(vehicles.map((v) => [v.id, v.plate]));
  const eventByReceipt = new Map(events.filter((e) => e.receipt_id).map((e) => [e.receipt_id as string, e]));
  const signed = await Promise.all(receipts.map(async (r) => {
    const { data } = await sb.storage.from("receipts").createSignedUrl(r.storage_path, 600);
    return [r.id, data?.signedUrl ?? null] as const;
  }));
  const url = new Map(signed);

  return (
    <>
      <PageHeader title="Receipts and expenses" subtitle={staff ? "Every saved expense has a vehicle and a category; it feeds the model vs actual figures." : "Upload receipts for vehicle expenses."} actions={staff ? <LinkButton href="/receipts/new" variant="primary">New receipt</LinkButton> : undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Latest uploaded receipts">
          {receipts.length ? (
            <Table>
              <thead><tr><th className={th}>Uploaded</th><th className={th}>Vehicle</th><th className={th}>Status</th><th className={th}></th></tr></thead>
              <tbody>
                {receipts.map((r) => {
                  const ev = eventByReceipt.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td className={td}>{formatDateTime(r.uploaded_at)}</td>
                      <td className={td}>{r.vehicle_id ? plate.get(r.vehicle_id) : "—"}</td>
                      <td className={td}>{ev ? <Badge tone="good">{CATEGORY_LABELS[ev.category]} · {formatAOA(ev.total_aoa)}</Badge> : <Badge tone="warn">unclassified</Badge>}</td>
                      <td className={td}>{url.get(r.id) && <a className="text-xs underline" href={url.get(r.id)!} target="_blank" rel="noreferrer">open</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : <Empty>No receipts.</Empty>}
        </Card>
        {staff && (
          <Card title="Latest expenses">
            {events.length ? (
              <Table>
                <thead><tr><th className={th}>Date</th><th className={th}>Vehicle</th><th className={th}>Category</th><th className={thNum}>Total</th><th className={th}>Vendor</th></tr></thead>
                <tbody>{events.map((e) => (<tr key={e.id}><td className={td}>{formatDate(e.event_date)}</td><td className={td}>{plate.get(e.vehicle_id)}</td><td className={td}>{CATEGORY_LABELS[e.category]}</td><td className={tdNum}>{formatAOA(e.total_aoa)}</td><td className={td}>{e.vendor ?? "—"}</td></tr>))}</tbody>
              </Table>
            ) : <Empty>No expenses.</Empty>}
          </Card>
        )}
      </div>
    </>
  );
}
