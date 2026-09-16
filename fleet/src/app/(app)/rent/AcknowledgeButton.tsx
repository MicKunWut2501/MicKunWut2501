"use client";
import { useTransition } from "react";
import { acknowledgeAlert } from "./actions";
import { Button } from "@/components/ui";

export function AcknowledgeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await acknowledgeAlert(id); })}>{pending ? "…" : "Done"}</Button>;
}
