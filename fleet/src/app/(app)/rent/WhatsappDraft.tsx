"use client";
import { useState, useTransition } from "react";
import { logWhatsappSend } from "./actions";
import { waMeLink } from "@/lib/rent/whatsapp";
import { Button } from "@/components/ui";

export function WhatsappDraft({ driverId, driverName, weekStart, phone, initial }: { driverId: string; driverName: string; weekStart: string; phone: string | null; initial: string }) {
  const [message, setMessage] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const res = await logWhatsappSend({ driver_id: driverId, week_start: weekStart, phone_e164: phone, message });
      if (!res.ok) { setStatus(res.error); return; }
      setStatus("Logged. Opening WhatsApp…");
      window.open(waMeLink(phone, message), "_blank", "noopener");
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{driverName}</span>
        <span className="text-xs text-gray-500">{phone ?? "no phone on file"}</span>
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm" />
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={send} disabled={pending || message.trim().length < 10}>{pending ? "…" : "Send via WhatsApp"}</Button>
        <Button variant="ghost" type="button" onClick={() => setMessage(initial)}>Reset text</Button>
        {status && <span className="text-xs text-gray-600">{status}</span>}
      </div>
      <p className="mt-1 text-xs text-gray-500">Message is in Portuguese for the driver. Nothing is sent without your click; every send is logged.</p>
    </div>
  );
}
