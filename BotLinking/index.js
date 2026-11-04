/* Voax Linking — bot-hosting.net entry point
 * CommonJS, Node.js 20+, discord.js v14, @supabase/supabase-js v2.
 * Set the environment variables in your host panel; never commit tokens.
 */
"use strict";

const { Client, GatewayIntentBits, Partials, WebhookClient } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");

const env = (name, fallback) => String(process.env[name] || fallback || "").trim();
const required = (name, aliases = []) => {
  for (const key of [name, ...aliases]) {
    const value = env(key);
    if (value) return value;
  }
  throw new Error("Missing required environment variable: " + name);
};
const DISCORD_TOKEN = required("DISCORD_BOT_TOKEN", ["BOT_TOKEN", "TOKEN"]);
const SUPABASE_URL = required("SUPABASE_URL");
const SUPABASE_KEY = required("SUPABASE_SERVICE_ROLE_KEY", ["SUPABASE_SERVICE_KEY"]);
const POLL_MS = Math.max(1000, Number(env("OUTBOX_POLL_MS", "1500")) || 1500);
const BATCH_SIZE = Math.min(50, Math.max(1, Number(env("OUTBOX_BATCH_SIZE", "10")) || 10));
const MAX_ATTEMPTS = Math.max(1, Number(env("OUTBOX_MAX_ATTEMPTS", "12")) || 12);
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const log = (level, event, details = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, event, ...details }));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});
let pollTimer = null;
let polling = false;
let shuttingDown = false;

function serializeDiscordMessage(message) {
  return {
    content: message.content || "",
    author: {
      id: message.author.id,
      username: message.author.globalName || message.author.username,
      avatar_url: message.author.displayAvatarURL({ extension: "png", size: 128 })
    },
    discord_message_id: message.id,
    edited_at: message.editedAt ? message.editedAt.toISOString() : null,
    attachments: [...message.attachments.values()].map(a => ({
      path: "discord:" + a.id,
      url: a.url,
      name: a.name || "attachment",
      mimeType: a.contentType || "application/octet-stream",
      size: a.size
    })),
    embeds: message.embeds.map(e => e.toJSON()),
    reply_to: message.reference && message.reference.messageId || null,
    mentions: [
      ...message.mentions.users.map(u => ({ id: u.id, kind: "user", name: u.globalName || u.username })),
      ...message.mentions.roles.map(r => ({ id: r.id, kind: "role", name: r.name })),
      ...message.mentions.channels.map(c => ({ id: c.id, kind: "channel", name: c.name || "channel" }))
    ]
  };
}

async function activeDiscordLink(channelId) {
  const { data, error } = await db.from("discord_channel_links")
    .select("id,voax_server_id,voax_channel_id,discord_channel_id,integration:discord_integrations!inner(id,status,installed_by)")
    .eq("discord_channel_id", channelId).eq("status", "active")
    .eq("integration.status", "connected").maybeSingle();
  if (error) throw error;
  return data;
}

async function enqueueDiscord(message, eventType) {
  if (!message.inGuild() || message.author && message.author.bot || message.webhookId) return;
  const link = await activeDiscordLink(message.channelId);
  if (!link) return;
  const payload = eventType === "delete"
    ? { discord_message_id: message.id }
    : serializeDiscordMessage(message);
  const revision = eventType === "edit"
    ? String(payload.edited_at || payload.content || Date.now())
    : "";
  const { error } = await db.from("discord_sync_outbox").upsert({
    channel_link_id: link.id,
    direction: "discord_to_voax",
    event_type: eventType,
    source_message_id: message.id,
    idempotency_key: "discord:" + eventType + ":" + message.id + ":" + revision,
    payload,
    status: "pending",
    available_at: new Date().toISOString()
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function translateDiscordMentions(content, mentions, serverId) {
  const list = Array.isArray(mentions) ? mentions : [];
  const users = list.filter(m => m.kind === "user");
  const discordIds = users.map(m => m.id);
  const { data: connections, error: connectionError } = discordIds.length
    ? await db.from("discord_user_connections").select("discord_user_id,voax_user_id").in("discord_user_id", discordIds)
    : { data: [], error: null };
  if (connectionError) throw connectionError;
  const voaxIds = (connections || []).map(c => c.voax_user_id);
  const { data: members, error: memberError } = voaxIds.length
    ? await db.from("server_members").select("user_id").eq("server_id", serverId).in("user_id", voaxIds)
    : { data: [], error: null };
  if (memberError) throw memberError;
  const memberIds = new Set((members || []).map(m => m.user_id));
  const linked = (connections || []).filter(c => memberIds.has(c.voax_user_id));
  const { data: profiles, error: profileError } = linked.length
    ? await db.from("profiles").select("id,username").in("id", linked.map(c => c.voax_user_id))
    : { data: [], error: null };
  if (profileError) throw profileError;
  const names = new Map((profiles || []).map(p => [p.id, p.username]));
  const linkedMap = new Map(linked.map(c => [c.discord_user_id, c.voax_user_id]));
  const mentionIds = [];
  let body = content || "";
  for (const mention of list) {
    let token = "";
    let replacement = "";
    if (mention.kind === "user") {
      token = "<@" + mention.id + ">";
      const voaxId = linkedMap.get(mention.id);
      if (voaxId) {
        replacement = "@" + (names.get(voaxId) || mention.name);
        mentionIds.push(voaxId);
      } else replacement = "@" + mention.name;
    } else if (mention.kind === "role") {
      token = "<@&" + mention.id + ">";
      replacement = "@" + mention.name;
    } else if (mention.kind === "channel") {
      token = "<#" + mention.id + ">";
      replacement = "#" + mention.name;
    }
    if (token) {
      body = body.split(token).join(replacement);
      if (mention.kind === "user") body = body.split("<@!" + mention.id + ">").join(replacement);
    }
  }
  return { body, mentionIds: [...new Set(mentionIds)] };
}

async function translateVoaxMentions(messageId, body) {
  const { data: rows, error } = await db.from("message_mentions")
    .select("recipient_id").eq("message_id", messageId).contains("mention_types", ["user"]);
  if (error) throw error;
  const ids = [...new Set((rows || []).map(r => r.recipient_id))];
  if (!ids.length) return { body, discordIds: [] };
  const [{ data: connections, error: connectionError }, { data: profiles, error: profileError }] = await Promise.all([
    db.from("discord_user_connections").select("voax_user_id,discord_user_id").in("voax_user_id", ids),
    db.from("profiles").select("id,username").in("id", ids)
  ]);
  if (connectionError) throw connectionError;
  if (profileError) throw profileError;
  const names = new Map((profiles || []).map(p => [p.id, p.username]));
  let content = body || "";
  const discordIds = [];
  for (const connection of connections || []) {
    const username = names.get(connection.voax_user_id);
    if (!username) continue;
    const token = "@" + username;
    if (content.includes(token)) {
      content = content.split(token).join("<@" + connection.discord_user_id + ">");
      discordIds.push(connection.discord_user_id);
    }
  }
  return { body: content, discordIds };
}

async function sendDiscordMessageToVoax(job) {
  const p = job.payload || {};
  const { data: mapping, error: mapError } = await db.from("discord_message_mappings")
    .select("voax_message_id").eq("channel_link_id", job.channel_link_id)
    .eq("direction", "discord_to_voax").eq("source_message_id", job.source_message_id).maybeSingle();
  if (mapError) throw mapError;

  if (job.event_type === "delete") {
    if (mapping && mapping.voax_message_id) {
      const { error } = await db.from("messages").delete().eq("id", mapping.voax_message_id);
      if (error) throw error;
    }
    return;
  }

  const { data: link, error: linkError } = await db.from("discord_channel_links")
    .select("voax_channel_id,voax_server_id,integration:discord_integrations!inner(installed_by)")
    .eq("id", job.channel_link_id).single();
  if (linkError) throw linkError;
  const translated = await translateDiscordMentions(String(p.content || ""), p.mentions, link.voax_server_id);

  if (job.event_type === "edit") {
    if (!mapping || !mapping.voax_message_id) return;
    const { error } = await db.rpc("update_discord_bridge_message", {
      p_message_id: mapping.voax_message_id,
      p_body: translated.body,
      p_attachments: p.attachments || [],
      p_metadata: p,
      p_mention_user_ids: translated.mentionIds
    });
    if (error) throw error;
    return;
  }
  if (mapping && mapping.voax_message_id) return;

  const integration = Array.isArray(link.integration) ? link.integration[0] : link.integration;
  const replyQuery = p.reply_to
    ? await db.from("discord_message_mappings").select("voax_message_id")
      .eq("channel_link_id", job.channel_link_id).eq("discord_message_id", String(p.reply_to)).maybeSingle()
    : { data: null, error: null };
  if (replyQuery.error) throw replyQuery.error;
  const attachments = Array.isArray(p.attachments) ? p.attachments : [];
  const { data: inserted, error } = await db.rpc("create_discord_bridge_message", {
    p_channel_id: link.voax_channel_id,
    p_author_id: integration.installed_by,
    p_body: translated.body || (attachments.length ? "Shared an attachment" : p.embeds && p.embeds.length ? "Shared an embed" : "Shared an attachment"),
    p_attachments: attachments,
    p_metadata: {
      platform: "discord",
      author: p.author || {},
      embeds: p.embeds || [],
      mentions: p.mentions || [],
      reply_external_id: p.reply_to || null,
      attribution: "[Discord]"
    },
    p_external_id: job.source_message_id,
    p_reply_to: replyQuery.data && replyQuery.data.voax_message_id || null,
    p_mention_user_ids: translated.mentionIds
  });
  if (error) throw error;
  const messageId = String(inserted);
  const { error: insertMapError } = await db.from("discord_message_mappings").insert({
    channel_link_id: job.channel_link_id,
    direction: "discord_to_voax",
    source_message_id: job.source_message_id,
    discord_message_id: job.source_message_id,
    voax_message_id: messageId,
    destination_message_id: messageId
  });
  if (insertMapError && insertMapError.code !== "23505") throw insertMapError;
}

async function getWebhook(linkId, channel) {
  const { data, error } = await db.from("discord_channel_webhooks")
    .select("webhook_id,webhook_token").eq("channel_link_id", linkId).maybeSingle();
  if (error) throw error;
  if (data) return new WebhookClient({ id: data.webhook_id, token: data.webhook_token });
  if (!channel || typeof channel.createWebhook !== "function") throw new Error("Bot cannot create a webhook in this channel.");
  const webhook = await channel.createWebhook({ name: "Voax Linking" });
  const { error: saveError } = await db.from("discord_channel_webhooks").insert({
    channel_link_id: linkId, webhook_id: webhook.id, webhook_token: webhook.token
  });
  if (saveError) {
    await webhook.delete().catch(() => {});
    throw saveError;
  }
  return new WebhookClient({ id: webhook.id, token: webhook.token });
}

function safeDiscordContent(value) {
  return String(value || "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/<(?=[@#])/g, "<\u200b");
}

async function sendVoaxMessageToDiscord(job, channel) {
  const { data: mapping, error: mapError } = await db.from("discord_message_mappings")
    .select("discord_message_id").eq("channel_link_id", job.channel_link_id)
    .eq("direction", "voax_to_discord").eq("source_message_id", job.source_message_id).maybeSingle();
  if (mapError) throw mapError;
  const webhook = await getWebhook(job.channel_link_id, channel);

  if (job.event_type === "delete") {
    if (mapping && mapping.discord_message_id) await webhook.deleteMessage(mapping.discord_message_id).catch(() => {});
    return;
  }
  if (job.event_type === "edit") {
    if (!mapping || !mapping.discord_message_id) return;
    const translated = await translateVoaxMentions(job.source_message_id, String(job.payload.body || ""));
    await webhook.editMessage(mapping.discord_message_id, {
      content: safeDiscordContent(translated.body).slice(0, 2000),
      allowedMentions: { parse: [], users: translated.discordIds }
    });
    return;
  }
  if (mapping && mapping.discord_message_id) return;

  const payload = job.payload || {};
  const { data: author, error: authorError } = await db.from("profiles")
    .select("username,avatar_url").eq("id", String(payload.author_id || "")).maybeSingle();
  if (authorError) throw authorError;
  const translated = await translateVoaxMentions(job.source_message_id, String(payload.body || ""));
  let content = translated.body;
  const files = [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  for (const attachment of attachments) {
    let url = attachment.url;
    if (!url && attachment.path) {
      const { data, error } = await db.storage.from("message-attachments").createSignedUrl(attachment.path, 3600);
      if (error) log("warn", "attachment_sign_failed", { error: error.message });
      url = data && data.signedUrl;
    }
    if (url) {
      if (Number(attachment.size || 0) > 25 * 1024 * 1024) content += "\nAttachment link: " + url;
      else files.push({ attachment: url, name: attachment.name || "attachment" });
    }
  }
  const sent = await webhook.send({
    content: safeDiscordContent(content).slice(0, 2000) || " ",
    username: String(author && author.username || "Voax user").slice(0, 65) + " [Voax]",
    avatarURL: author && author.avatar_url || undefined,
    files,
    allowedMentions: { parse: [], users: translated.discordIds }
  });
  const { error: insertError } = await db.from("discord_message_mappings").insert({
    channel_link_id: job.channel_link_id,
    direction: "voax_to_discord",
    source_message_id: job.source_message_id,
    discord_message_id: sent.id,
    voax_message_id: job.source_message_id,
    destination_message_id: sent.id
  });
  if (insertError && insertError.code !== "23505") throw insertError;
}

async function processJob(job) {
  const { data: link, error } = await db.from("discord_channel_links")
    .select("discord_channel_id,status,integration_id,integration:discord_integrations!inner(status)")
    .eq("id", job.channel_link_id).maybeSingle();
  if (error) throw error;
  if (!link || link.status === "disconnected") return;
  const integration = Array.isArray(link.integration) ? link.integration[0] : link.integration;
  if (link.status !== "active" || !integration || integration.status !== "connected") {
    throw new Error("Linked channel or Discord integration is not active.");
  }

  if (job.direction === "discord_to_voax") {
    await sendDiscordMessageToVoax(job);
  } else {
    const channel = await client.channels.fetch(link.discord_channel_id);
    if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
      throw new Error("Linked Discord channel is unavailable or inaccessible.");
    }
    await sendVoaxMessageToDiscord(job, channel);
  }
  await db.from("discord_integrations").update({
    last_success_at: new Date().toISOString(), status: "connected", last_error: null
  }).eq("id", link.integration_id);
}

async function pollOutbox() {
  if (polling || shuttingDown) return;
  polling = true;
  try {
    const { data: jobs, error } = await db.rpc("claim_discord_sync_jobs", { p_limit: BATCH_SIZE });
    if (error) throw error;
    for (const job of jobs || []) {
      try {
        await processJob(job);
        const { error: updateError } = await db.from("discord_sync_outbox").update({
          status: "sent", processed_at: new Date().toISOString(), locked_at: null, last_error: null
        }).eq("id", job.id);
        if (updateError) throw updateError;
      } catch (error) {
        const attempts = Number(job.attempts || 1);
        const dead = attempts >= MAX_ATTEMPTS;
        const delaySeconds = Math.min(3600, 3 * Math.pow(2, Math.min(attempts, 10)));
        const message = String(error && error.message || error).slice(0, 1000);
        await db.from("discord_sync_outbox").update({
          status: dead ? "dead" : "failed",
          available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
          locked_at: null,
          last_error: message
        }).eq("id", job.id);
        await db.from("discord_channel_links").update({
          status: dead ? "degraded" : "active", last_error: message
        }).eq("id", job.channel_link_id);
        log("error", "outbox_job_failed", { jobId: job.id, attempts, dead, error: message });
      }
    }
  } catch (error) {
    log("error", "outbox_poll_failed", { error: String(error && error.message || error) });
  } finally {
    polling = false;
  }
}

client.once("ready", async ready => {
  log("info", "discord_gateway_ready", { botUser: ready.user.tag, guildCount: ready.guilds.cache.size });
  const guildIds = [...ready.guilds.cache.keys()];
  if (guildIds.length) {
    const { error } = await db.from("discord_integrations").update({
      status: "connected", last_gateway_seen_at: new Date().toISOString(), last_error: null
    }).in("discord_guild_id", guildIds);
    if (error) log("error", "gateway_presence_update_failed", { error: error.message });
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => void pollOutbox(), POLL_MS);
    if (pollTimer.unref) pollTimer.unref();
  }
  void pollOutbox();
});
client.on("messageCreate", message => void enqueueDiscord(message, "create").catch(error =>
  log("error", "discord_message_enqueue_failed", { messageId: message.id, error: String(error) })));
client.on("messageUpdate", async (_oldMessage, newMessage) => {
  try {
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;
    await enqueueDiscord(message, "edit");
  } catch (error) {
    log("error", "discord_edit_enqueue_failed", { messageId: newMessage.id, error: String(error) });
  }
});
client.on("messageDelete", message => void enqueueDiscord(message, "delete").catch(error =>
  log("error", "discord_delete_enqueue_failed", { messageId: message.id, error: String(error) })));
client.on("guildCreate", guild => void db.from("discord_integrations").update({
  status: "connected", last_gateway_seen_at: new Date().toISOString(), last_error: null
}).eq("discord_guild_id", guild.id).then(({ error }) => {
  if (error) log("warn", "guild_presence_update_failed", { guildId: guild.id, error: error.message });
}));
client.on("guildDelete", guild => void db.from("discord_integrations").update({
  status: "degraded", last_error: "Bot was removed from this Discord server."
}).eq("discord_guild_id", guild.id));
client.on("error", error => log("error", "discord_client_error", { error: error.message }));
process.on("unhandledRejection", reason => log("error", "unhandled_rejection", { reason: String(reason) }));
process.on("uncaughtException", error => {
  log("error", "uncaught_exception", { error: error.stack || error.message });
  process.exitCode = 1;
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "shutdown", { signal });
  if (pollTimer) clearInterval(pollTimer);
  client.destroy();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

client.login(DISCORD_TOKEN).catch(error => {
  log("error", "discord_login_failed", { error: error.message });
  process.exit(1);
});
