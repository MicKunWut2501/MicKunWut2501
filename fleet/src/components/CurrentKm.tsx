import Link from "next/link";
import { Card, Empty, Table, td, tdNum, th, thNum } from "@/components/ui";
import { OdometerForm } from "@/components/OdometerForm";
import { formatDate, formatDateTime, formatKm } from "@/lib/format";
import type { MileageWindow } from "@/lib/gps/mileage";
import type { VehicleMileage } from "@/lib/data/gps";
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

/**
 * Current odometer per car with km driven recently and the next km-based service. Current km is calibrated by the
 * dashboard readings the drivers report; km driven counts from the first reading and follows the BAANOOL tracker.
 */
export function CurrentKm({ vehicles, mileage, reminders, right, entry }: {
  vehicles: Vehicle[];
  mileage: Map<string, VehicleMileage>;
  reminders: Map<string, DueResult[]>;
  right?: React.ReactNode;
  /** shows the reading form (Fleet page) */
  entry?: { today: string; drivers: Map<string, string> };
}) {
  return (
    <Card title="Current mileage" right={right}>
      {vehicles.length ? (
        <Table>
          <thead>
            <tr>
              <th className={th}>Vehicle</th><th className={thNum}>Current km</th><th className={thNum}>Since start</th><th className={thNum}>Last 7 days</th>
              <th className={thNum}>Last 30 days</th><th className={thNum}>Avg / day</th><th className={th}>Next km service</th><th className={th}>Last tracker reading</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => {
              const vm = mileage.get(v.id);
              const m = vm?.summary;
              const next = (reminders.get(v.id) ?? []).filter((r) => r.km_remaining != null).sort((a, b) => a.km_remaining! - b.km_remaining!)[0];
              const daysToNext = next && m?.per_day_km ? Math.max(0, Math.round(next.km_remaining! / m.per_day_km)) : null;
              return (
                <tr key={v.id}>
                  <td className={td}><Link className="font-medium hover:underline" href={`/fleet/${v.id}`}>{v.plate}</Link></td>
                  <td className={tdNum}>
                    <span className="text-base font-semibold">{formatKm(v.odometer_km)}</span>
                    <div className="text-xs font-normal">
                      {vm?.last
                        ? <span className="text-gray-400">dashboard {formatKm(vm.last.odometer_km)} on {formatDate(vm.last.read_on)}</span>
                        : <span className="text-amber-700">tracker only, no dashboard reading yet</span>}
                    </div>
                  </td>
                  <td className={tdNum}>
                    {m?.since_start_km != null && vm?.first ? <>{formatKm(m.since_start_km)}<div className="text-xs font-normal text-gray-400">since {formatDate(vm.first.read_on)}</div></> : <span className="text-gray-400">—</span>}
                  </td>
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
      {entry && vehicles.length > 0 && (
        <OdometerForm today={entry.today} vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plate, driver: entry.drivers.get(v.id) ?? null }))} />
      )}
      <p className="mt-2 text-xs text-gray-500">
        Current km = the last dashboard reading from the driver plus what the BAANOOL tracker has counted since. Km driven counts from each car&apos;s first
        dashboard reading. Tracker readings are stored when the app is opened (at most every 10 minutes) and daily by the scheduled job.
      </p>
    </Card>
  );
}
