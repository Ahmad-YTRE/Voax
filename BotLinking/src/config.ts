import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
export const config = {
  discordToken: required("DISCORD_BOT_TOKEN"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  voaxPublicUrl: process.env.VOAX_PUBLIC_URL ?? "https://voax.app",
  pollMs: positiveInt("OUTBOX_POLL_MS", 1200),
  batchSize: positiveInt("OUTBOX_BATCH_SIZE", 10),
  maxAttempts: positiveInt("OUTBOX_MAX_ATTEMPTS", 12),
  logLevel: process.env.LOG_LEVEL ?? "info"
};
