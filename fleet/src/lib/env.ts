/** Central env access. Public vars are inlined by Next at build time; server vars are read at runtime. */
export const env = {
  supabaseUrl: () => must("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => must("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => must("SUPABASE_SERVICE_ROLE_KEY"),
  cronSecret: () => process.env.CRON_SECRET ?? "",
  anthropicApiKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  /** 'anthropic' | 'none'. Defaults to anthropic when a key is present. */
  receiptExtractor: (): "anthropic" | "none" => {
    const v = process.env.RECEIPT_EXTRACTOR;
    if (v === "anthropic" || v === "none") return v;
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  },
  fleetName: () => process.env.NEXT_PUBLIC_FLEET_NAME ?? "Frota Luanda",
};

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
