import { env } from "@/lib/env";

/** Vercel cron sends Authorization: Bearer $CRON_SECRET. Reject anything else. */
export function authorizeCron(request: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
