"use client";
import { useActionState } from "react";
import { signIn } from "./actions";
import { Button, Field, inputCls, Notice } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail"><input name="email" type="email" autoComplete="email" required className={inputCls} /></Field>
      <Field label="Palavra-passe"><input name="password" type="password" autoComplete="current-password" required className={inputCls} /></Field>
      {state?.error && <Notice kind="error">{state.error}</Notice>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "A entrar…" : "Entrar"}</Button>
    </form>
  );
}
