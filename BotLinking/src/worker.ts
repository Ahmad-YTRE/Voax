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
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idlePollMs = config.pollMs;
  const maxIdlePollMs = Math.max(config.pollMs, 5000);
  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(() => void tick(), delay);
  };
  const resolve = async (id: string): Promise<TextBasedChannel | null> => {
    const channel = await client.channels.fetch(id).catch(() => null);
    return channel && channel.isTextBased() ? channel : null;
  };
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    let nextDelay = idlePollMs;
    try {
      const { data: jobs, error } = await db.rpc("claim_discord_sync_jobs", { p_limit: config.batchSize });
      if (error) throw error;
      const claimedJobs = (jobs || []) as OutboxJob[];
      for (const job of claimedJobs) {
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
      idlePollMs = claimedJobs.length ? config.pollMs : Math.min(maxIdlePollMs, Math.max(config.pollMs, idlePollMs * 2));
      nextDelay = claimedJobs.length ? config.pollMs : idlePollMs;
    } catch (error) {
      const failure = describeError(error);
      log("error", "outbox_poll_failed", {
        error: failure.message, errorCode: failure.code,
        errorDetails: failure.details, errorHint: failure.hint
      });
      idlePollMs = Math.min(maxIdlePollMs, Math.max(config.pollMs, idlePollMs * 2));
      nextDelay = idlePollMs;
    } finally {
      running = false;
      schedule(nextDelay);
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
