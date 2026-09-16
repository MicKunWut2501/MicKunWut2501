import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export type Session = { userId: string; email: string | null; profile: Profile };

export async function getSession(): Promise<Session | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { userId: user.id, email: user.email ?? null, profile: profile as Profile };
}

export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export function isStaff(s: Session): boolean {
  return s.profile.role === "owner" || s.profile.role === "admin";
}

/** Owner/admin only pages. Drivers are sent to their own panel. */
export async function requireStaff(): Promise<Session> {
  const s = await requireUser();
  if (!isStaff(s)) redirect("/dashboard");
  return s;
}

export async function requireOwner(): Promise<Session> {
  const s = await requireUser();
  if (s.profile.role !== "owner") redirect("/dashboard");
  return s;
}
