import { db, type OutboxJob } from "./db.js";
import { config } from "./config.js";
import { log } from "./logger.js";
import { processOutboxJob } from "./bridge.js";
import type { Client, TextBasedChannel } from "discord.js";

function describeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, code: undefined, details: undefined, hint: undefined };
  }
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" | ");
    let fallback = "Unknown synchronization error";
    try { fallback = JSON.stringify(error) || fallback; } catch { /* keep fallback */ }
    return {
      message: (message || fallback).slice(0, 1000),
      code: typeof value.code === "string" ? value.code : undefined,
      details: typeof value.details === "string" ? value.details : undefined,
      hint: typeof value.hint === "string" ? value.hint : undefined
    };
  }
  return { message: String(error).slice(0, 1000), code: undefined, details: undefined, hint: undefined };
}

export function startOutboxWorker(client: Client) {
  let running = false;
  const resolve = async (id: string): Promise<TextBasedChannel | null> => {
    const channel = await client.channels.fetch(id).catch(() => null);
    return channel && channel.isTextBased() ? channel : null;
  };
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { data: jobs, error } = await db.rpc("claim_discord_sync_jobs", { p_limit: config.batchSize });
      if (error) throw error;
      for (const job of (jobs || []) as OutboxJob[]) {
        try {
          await processOutboxJob(job, resolve);
          await db.from("discord_sync_outbox").update({
            status: "sent", processed_at: new Date().toISOString(), locked_at: null, last_error: null
          }).eq("id", job.id);
        } catch (error) {
          const attempts = job.attempts;
          const dead = attempts >= config.maxAttempts;
          const delay = Math.min(3600, 3 * 2 ** Math.min(attempts, 10));
          const failure = describeError(error);
          await db.from("discord_sync_outbox").update({
            status: dead ? "dead" : "failed",
            available_at: new Date(Date.now() + delay * 1000).toISOString(),
            locked_at: null,
            last_error: failure.message
          }).eq("id", job.id);
          await db.from("discord_channel_links").update({
            status: dead ? "degraded" : "active", last_error: failure.message
          }).eq("id", job.channel_link_id);
          log("error", "outbox_job_failed", {
            jobId: job.id, attempts, dead, error: failure.message,
            errorCode: failure.code, errorDetails: failure.details, errorHint: failure.hint
          });
        }
      }
    } catch (error) {
      const failure = describeError(error);
      log("error", "outbox_poll_failed", {
        error: failure.message, errorCode: failure.code,
        errorDetails: failure.details, errorHint: failure.hint
      });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), config.pollMs);
  void tick();
  return () => clearInterval(timer);
}
