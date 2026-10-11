"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshGps } from "./actions";

export function RefreshGpsButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50" disabled={pending}
      onClick={() => start(async () => { await refreshGps(); router.refresh(); })}>
      {pending ? "Refreshing…" : "Refresh now"}
    </button>
  );
}
