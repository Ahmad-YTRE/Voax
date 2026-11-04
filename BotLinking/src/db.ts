import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
export const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
export type OutboxJob = {
  id: number; channel_link_id: string; direction: "discord_to_voax" | "voax_to_discord";
  event_type: "create" | "edit" | "delete"; source_message_id: string;
  idempotency_key: string; payload: Record<string, unknown>; attempts: number;
};
export async function enqueueDiscordEvent(input: {
  channelLinkId: string; eventType: OutboxJob["event_type"]; sourceMessageId: string; payload: Record<string, unknown>;
}) {
  const { error } = await db.from("discord_sync_outbox").upsert({
    channel_link_id: input.channelLinkId, direction: "discord_to_voax", event_type: input.eventType,
    source_message_id: input.sourceMessageId,
    idempotency_key: `discord:${input.eventType}:${input.sourceMessageId}:${input.eventType === "edit" ? String(input.payload.edited_at ?? input.payload.content ?? Date.now()) : ""}`,
    payload: input.payload, status: "pending", available_at: new Date().toISOString()
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw error;
}
export async function getActiveDiscordLink(channelId: string) {
  const { data, error } = await db.from("discord_channel_links")
    .select("id,voax_server_id,voax_channel_id,discord_channel_id,status,integration:discord_integrations!inner(id,status,installed_by)")
    .eq("discord_channel_id", channelId).eq("status", "active").eq("integration.status", "connected").maybeSingle();
  if (error) throw error;
  return data;
}
export async function getActiveVoaxLink(channelId: string) {
  const { data, error } = await db.from("discord_channel_links")
    .select("id,voax_server_id,voax_channel_id,discord_channel_id,status,integration:discord_integrations!inner(id,status,installed_by)")
    .eq("voax_channel_id", channelId).eq("status", "active").eq("integration.status", "connected").maybeSingle();
  if (error) throw error;
  return data;
}
