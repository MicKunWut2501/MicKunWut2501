import Link from "next/link";
import { Card, Empty, Table, td, tdNum, th, thNum } from "@/components/ui";
import { formatDate, formatDateTime, formatKm } from "@/lib/format";
import type { MileageSummary, MileageWindow } from "@/lib/gps/mileage";
import type { DueResult } from "@/lib/maintenance/rules";
import type { Vehicle } from "@/lib/supabase/types";

function Window({ w }: { w: MileageWindow }) {
  if (w.km == null) return <span className="text-gray-400">—</span>;
  return (
    <>
      {formatKm(w.km)}
      {w.partial && w.since && <div className="text-xs font-normal text-gray-400">since {formatDate(w.since.slice(0, 10))}</div>}
    </>
  );
}

/** Current odometer per car with km driven recently and the next km-based service, from BAANOOL tracker history. */
export function CurrentKm({ vehicles, mileage, reminders, right }: {
  vehicles: Vehicle[];
  mileage: Map<string, MileageSummary>;
  reminders: Map<string, DueResult[]>;
  right?: React.ReactNode;
}) {
  return (
    <Card title="Current mileage" right={right}>
      {vehicles.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Vehicle</th><th className={thNum}>Current km</th><th className={thNum}>Last 7 days</th>
              <th className={thNum}>Last 30 days</th><th className={thNum}>Avg / day</th><th className={th}>Next km service</th><th className={th}>Last reading</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => {
              const m = mileage.get(v.id);
              const next = (reminders.get(v.id) ?? []).filter((r) => r.km_remaining != null).sort((a, b) => a.km_remaining! - b.km_remaining!)[0];
              const daysToNext = next && m?.per_day_km ? Math.max(0, Math.round(next.km_remaining! / m.per_day_km)) : null;
              return (
                <tr key={v.id}>
                  <td className={td}><Link className="font-medium hover:underline" href={`/fleet/${v.id}`}>{v.plate}</Link></td>
                  <td className={`${tdNum} text-base font-semibold`}>{formatKm(v.odometer_km)}</td>
                  <td className={tdNum}>{m ? <Window w={m.last7} /> : "—"}</td>
                  <td className={tdNum}>{m ? <Window w={m.last30} /> : "—"}</td>
                  <td className={tdNum}>{m?.per_day_km != null ? formatKm(m.per_day_km) : "—"}</td>
                  <td className={td}>
                    {next ? (
                      <span className={next.km_remaining! <= 0 ? "text-red-700" : next.km_remaining! <= 500 ? "text-amber-700" : ""}>
                        {next.label}: {next.km_remaining! <= 0 ? `${formatKm(-next.km_remaining!)} overdue` : `in ${formatKm(next.km_remaining)}`}
                        {daysToNext != null && next.km_remaining! > 0 && <span className="text-gray-400"> · ~{daysToNext} days</span>}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className={`${td} text-xs text-gray-500`}>{m?.latest_at ? formatDateTime(m.latest_at) : v.gps_device_id ? "no reading yet" : "GPS not linked"}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : <Empty>No vehicles.</Empty>}
      <p className="mt-2 text-xs text-gray-500">
        Current km = BAANOOL tracker mileage + the per-car offset set in Settings. Readings are stored when the app is opened (at most every 10 minutes) and daily by the scheduled job.
      </p>
    </Card>
  );
}
