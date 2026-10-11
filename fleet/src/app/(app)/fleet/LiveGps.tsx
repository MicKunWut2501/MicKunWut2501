import { Badge, Card, Empty, Notice } from "@/components/ui";
import { formatDateTime, formatKm } from "@/lib/format";
import type { GpsSnapshot, Vehicle } from "@/lib/supabase/types";
import type { GpsSyncResult } from "@/lib/data/gps";
import { RefreshGpsButton } from "./RefreshGpsButton";

function ago(iso: string, nowMs: number): string {
  const min = Math.round((nowMs - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function osmEmbed(lat: number, lng: number): string {
  const d = 0.012;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function LiveGps({ vehicles, latest, sync, nowMs }: { vehicles: Vehicle[]; latest: Map<string, GpsSnapshot>; sync: GpsSyncResult; nowMs: number }) {
  if (sync.status === "no_token") {
    return (
      <Card title="Live GPS">
        <Empty>Connect BAANOOL in Settings → BAANOOL GPS to see the cars here.</Empty>
      </Card>
    );
  }
  return (
    <Card title="Live GPS" right={<RefreshGpsButton />}>
      {sync.status === "error" && (
        <div className="mb-3"><Notice kind="error">{sync.error}{sync.tokenExpired ? " The BAANOOL token has expired: paste a fresh one in Settings." : ""} Showing the last known positions.</Notice></div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {vehicles.map((v) => {
          const s = latest.get(v.id);
          return (
            <div key={v.id} className="overflow-hidden rounded-lg border border-gray-200">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="font-semibold">{v.plate}</span>
                {!v.gps_device_id ? <Badge tone="warn">not linked</Badge> : s?.online === false ? <Badge>offline</Badge> : s?.speed_kmh ? <Badge tone="good">{Math.round(s.speed_kmh)} km/h</Badge> : <Badge tone="info">parked</Badge>}
              </div>
              {s?.lat != null && s?.lng != null ? (
                <>
                  <iframe title={`Map ${v.plate}`} src={osmEmbed(s.lat, s.lng)} className="h-44 w-full border-0" loading="lazy" />
                  <div className="space-y-0.5 px-3 py-2 text-xs text-gray-600">
                    <div>Position: {s.position_at ? `${formatDateTime(s.position_at)} (${ago(s.position_at, nowMs)})` : s.position_text ?? "time unknown"}</div>
                    <div>Checked: {ago(s.taken_at, nowMs)} · Tracker mileage: {s.mileage_km != null ? formatKm(s.mileage_km) : "—"} · Odometer: {formatKm(v.odometer_km)}</div>
                    <a className="underline" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
                  </div>
                </>
              ) : (
                <div className="px-3 pb-3 text-xs text-gray-500">{v.gps_device_id ? "No GPS fix received yet." : "Link a device in Settings → BAANOOL GPS."}</div>
              )}
            </div>
          );
        })}
      </div>
      {sync.status === "ok" && sync.unmatched.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">{sync.unmatched.length} BAANOOL device(s) not linked to a vehicle: {sync.unmatched.map((d) => d.name ?? d.device_id).join(", ")}.</p>
      )}
    </Card>
  );
}
