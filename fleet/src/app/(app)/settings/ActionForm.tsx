"use client";
import { useActionState } from "react";
import type { ActionResult } from "@/app/(app)/rent/actions";
import { Button } from "@/components/ui";

type Action = (prev: ActionResult | undefined, fd: FormData) => Promise<ActionResult>;

/** Generic form wrapper: renders children (inputs) + submit + result message. */
export function ActionForm({ action, submit, children, className = "" }: { action: Action; submit: string; children: React.ReactNode; className?: string }) {
  const [state, act, pending] = useActionState<ActionResult | undefined, FormData>(action, undefined);
  return (
    <form action={act} className={className}>
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "…" : submit}</Button>
        {state && <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.ok ? state.message ?? "Saved." : state.error}</span>}
      </div>
    </form>
  );
}
