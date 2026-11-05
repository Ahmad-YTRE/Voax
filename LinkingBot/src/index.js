import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageType,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";

const required = ["DISCORD_BOT_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});
const pollInterval = Math.max(750, Number(process.env.POLL_INTERVAL_MS || 1500));
let queueBusy = false;

function logError(scope, error) {
  console.error(`[Voax Linking] ${scope}:`, error instanceof Error ? error.message : error);
}

function renderTemplate(template, values) {
  return String(template || "Welcome {user} to {server}!")
    .slice(0, 500)
    .replace(/\{user\}/g, values.user)
    .replace(/\{server\}/g, values.server)
    .replace(/\{member_count\}/g, String(values.memberCount ?? ""));
}

async function getLinkContext(linkId) {
  const { data: link, error } = await supabase
    .from("discord_channel_links")
    .select("*, integration:discord_integrations!inner(id,voax_server_id,discord_guild_id,discord_guild_name,installed_by,status)")
    .eq("id", linkId)
    .maybeSingle();
  if (error) throw error;
  if (!link || link.status !== "active" || link.integration?.status !== "connected") {
    throw new Error("The linked channel is no longer active.");
  }
  const [{ data: server, error: serverError }, { data: channel, error: channelError }] = await Promise.all([
    supabase.from("servers").select("id,name").eq("id", link.voax_server_id).maybeSingle(),
    supabase.from("channels").select("id,name").eq("id", link.voax_channel_id).maybeSingle(),
  ]);
  if (serverError) throw serverError;
  if (channelError) throw channelError;
  if (!server || !channel) throw new Error("The linked Voax channel or server no longer exists.");
  return { link, integration: link.integration, server, channel };
}

async function getDiscordTextChannel(channelId) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || typeof channel.send !== "function") {
    throw new Error("The bot cannot send messages in the linked Discord channel.");
  }
  return channel;
}

async function findExistingWelcomeMessage(channel, eventId) {
  const recent = await channel.messages.fetch({ limit: 75 });
  return recent.find(message =>
    message.author.id === client.user.id &&
    message.embeds.some(embed => (embed.footer?.text || "").includes(`welcome-event:${eventId}`))
  ) || null;
}

async function createVoaxWelcomeMessage(event, context, discordMessageId) {
  const externalId = `welcome:${event.id}`;
  const { data: existing, error: lookupError } = await supabase
    .from("messages")
    .select("id")
    .eq("channel_id", context.link.voax_channel_id)
    .eq("bridge_source", event.source_platform)
    .eq("bridge_external_id", externalId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;

  const originName = event.source_platform === "discord" ? "Discord" : "Voax";
  const joinedServer = event.source_platform === "discord"
    ? context.integration.discord_guild_name
    : context.server.name;
  const body = renderTemplate(context.link.voax_welcome_message_template || context.link.welcome_message_template, { user: event.member_name, server: joinedServer, memberCount: event.member_count });
  const buttonEnabled = Boolean(context.link.discord_welcome_sticker_id && context.link.voax_welcome_sticker_url);
  const metadata = {
    platform: event.source_platform,
    kind: "welcome",
    author: { username: "Voax", avatar_url: null },
    welcome: {
      event_id: event.id,
      origin_platform: event.source_platform,
      member_name: event.member_name,
      member_avatar_url: event.member_avatar_url || null,
      server_name: joinedServer,
      discord_server_name: context.integration.discord_guild_name,
      voax_server_name: context.server.name,
      discord_message_id: discordMessageId,
      button_enabled: buttonEnabled,
    },
  };
  const { data, error } = await supabase.from("messages").insert({
    channel_id: context.link.voax_channel_id,
    author_id: context.integration.installed_by,
    body,
    attachments: [],
    bridge_source: event.source_platform,
    bridge_external_id: externalId,
    bridge_metadata: metadata,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function processWelcomeEvent(event) {
  const context = await getLinkContext(event.channel_link_id);
  const channel = await getDiscordTextChannel(context.link.discord_channel_id);
  const originName = event.source_platform === "discord" ? "Discord" : "Voax";
  const joinedServer = event.source_platform === "discord"
    ? context.integration.discord_guild_name
    : context.server.name;
  const messageText = renderTemplate(context.link.discord_welcome_message_template || context.link.welcome_message_template, {
    user: event.member_name,
    server: joinedServer,
    memberCount: event.member_count,
  });
  const buttonEnabled = Boolean(context.link.discord_welcome_sticker_id && context.link.voax_welcome_sticker_url);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Welcome to the community!")
    .setDescription(messageText)
    .addFields(
      { name: "Member", value: event.member_name.slice(0, 256), inline: true },
      { name: "Joined via", value: originName, inline: true },
      { name: "Server", value: joinedServer.slice(0, 256), inline: false },
    )
    .setFooter({ text: `welcome-event:${event.id}` })
    .setTimestamp(new Date(event.joined_at || Date.now()));
  if (event.member_avatar_url) embed.setThumbnail(event.member_avatar_url);

  let discordMessageId = event.discord_message_id;
  if (!discordMessageId) {
    let discordMessage = await findExistingWelcomeMessage(channel, event.id);
    if (!discordMessage) {
      const components = buttonEnabled ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`welcome-sticker:${event.id}`)
            .setLabel("Send Welcome Sticker")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("👋"),
        ),
      ] : [];
      discordMessage = await channel.send({
        embeds: [embed],
        components,
        allowedMentions: { parse: [] },
      });
    }
    discordMessageId = discordMessage.id;
    const { error } = await supabase.from("discord_welcome_events")
      .update({ discord_message_id: discordMessageId })
      .eq("id", event.id);
    if (error) throw error;
  }

  const voaxMessageId = await createVoaxWelcomeMessage(event, context, discordMessageId);
  const { error } = await supabase.from("discord_welcome_events").update({
    discord_message_id: discordMessageId,
    voax_message_id: voaxMessageId,
    status: "sent",
    locked_at: null,
    last_error: null,
    processed_at: new Date().toISOString(),
  }).eq("id", event.id);
  if (error) throw error;
}

async function createVoaxStickerReply(action, event, context) {
  if (action.voax_reply_message_id) return action.voax_reply_message_id;
  const externalId = `welcome-action:${action.id}`;
  const { data: existing, error: lookupError } = await supabase
    .from("messages").select("id")
    .eq("channel_id", context.link.voax_channel_id)
    .eq("bridge_source", action.source_platform)
    .eq("bridge_external_id", externalId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;

  const authorId = action.actor_voax_user_id || context.integration.installed_by;
  const metadata = {
    platform: action.source_platform,
    kind: "welcome_sticker",
    author: {
      username: action.actor_name,
      avatar_url: null,
    },
    welcome_event_id: event.id,
  };
  const { data, error } = await supabase.from("messages").insert({
    channel_id: context.link.voax_channel_id,
    author_id: authorId,
    body: "sent a welcome sticker",
    reply_to: event.voax_message_id,
    attachments: [{
      path: `welcome-sticker:${action.id}`,
      name: "Welcome sticker",
      mimeType: /\\.gif(?:[?#]|$)/i.test(action.sticker_url || context.link.voax_welcome_sticker_url || "") ? "image/gif" : "image/png",
      size: 0,
      url: action.sticker_url || context.link.voax_welcome_sticker_url,
    }],
    bridge_source: action.source_platform,
    bridge_external_id: externalId,
    bridge_metadata: metadata,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function processWelcomeAction(action) {
  const { data: event, error: eventError } = await supabase
    .from("discord_welcome_events").select("*").eq("id", action.welcome_event_id).maybeSingle();
  if (eventError) throw eventError;
  if (!event || !event.discord_message_id) {
    throw new Error("The welcome message is not ready for sticker replies.");
  }
  const context = await getLinkContext(event.channel_link_id);
  const stickerId = action.sticker_id || context.link.discord_welcome_sticker_id;
  const stickerUrl = action.sticker_url || context.link.voax_welcome_sticker_url;
  if (!stickerUrl) throw new Error("No accessible sticker image is available for the Voax reply.");
  let discordReplyMessageId = action.discord_reply_message_id;
  if (!discordReplyMessageId) {
    if (!stickerId) throw new Error("A Discord welcome sticker has not been configured.");
    const channel = await getDiscordTextChannel(context.link.discord_channel_id);
    const welcomeMessage = await channel.messages.fetch(event.discord_message_id);
    const reply = await welcomeMessage.reply({
      stickers: [stickerId],
      allowedMentions: { parse: [] },
    });
    discordReplyMessageId = reply.id;
    const { error } = await supabase.from("discord_welcome_actions")
      .update({ discord_reply_message_id: discordReplyMessageId })
      .eq("id", action.id);
    if (error) throw error;
  }

  const voaxReplyMessageId = await createVoaxStickerReply(action, event, context);
  const { error } = await supabase.from("discord_welcome_actions").update({
    discord_reply_message_id: discordReplyMessageId,
    voax_reply_message_id: voaxReplyMessageId,
    status: "sent",
    locked_at: null,
    last_error: null,
    processed_at: new Date().toISOString(),
  }).eq("id", action.id);
  if (error) throw error;
}

async function markFailed(table, row, error) {
  const attempts = Number(row.attempts || 1);
  const dead = attempts >= 8;
  const delaySeconds = Math.min(300, Math.max(5, attempts * 10));
  await supabase.from(table).update({
    status: dead ? "dead" : "failed",
    locked_at: null,
    available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    last_error: String(error instanceof Error ? error.message : error).slice(0, 1000),
  }).eq("id", row.id);
}

async function processQueues() {
  if (queueBusy || !client.isReady()) return;
  queueBusy = true;
  try {
    const [eventsResult, actionsResult] = await Promise.all([
      supabase.rpc("claim_discord_welcome_events", { p_limit: 10 }),
      supabase.rpc("claim_discord_welcome_actions", { p_limit: 10 }),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (actionsResult.error) throw actionsResult.error;
    for (const event of eventsResult.data || []) {
      try { await processWelcomeEvent(event); }
      catch (error) { logError(`welcome event ${event.id}`, error); await markFailed("discord_welcome_events", event, error); }
    }
    for (const action of actionsResult.data || []) {
      try { await processWelcomeAction(action); }
      catch (error) { logError(`welcome action ${action.id}`, error); await markFailed("discord_welcome_actions", action, error); }
    }
  } catch (error) {
    logError("queue poll", error);
  } finally {
    queueBusy = false;
  }
}

async function recordDiscordJoin(member) {
  if (member.user.bot) return;
  const { data: links, error } = await supabase
    .from("discord_channel_links")
    .select("id,integration:discord_integrations!inner(discord_guild_id,status)")
    .eq("status", "active")
    .eq("welcome_discord_enabled", true)
    .eq("integration.discord_guild_id", member.guild.id)
    .eq("integration.status", "connected");
  if (error) throw error;
  for (const link of links || []) {
    const now = new Date();
    const joinedAt = member.joinedAt?.toISOString() || now.toISOString();
    const { data: existing, error: lookupError } = await supabase.from("discord_welcome_events")
      .select("id").eq("channel_link_id", link.id).eq("source_platform", "discord")
      .eq("external_member_id", member.id).in("status", ["pending", "processing"])
      .gte("joined_at", new Date(now.getTime() - 60000).toISOString())
      .lte("joined_at", new Date(now.getTime() + 60000).toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    const payload = {
      channel_link_id: link.id, source_platform: "discord",
      idempotency_key: `discord_join:${link.id}:${member.id}:${member.joinedTimestamp || "unknown"}`,
      external_member_id: member.id,
      member_name: member.user.globalName || member.user.username,
      member_avatar_url: member.user.displayAvatarURL({ size: 128 }),
      member_count: member.guild.memberCount,
      joined_at: joinedAt,
      available_at: new Date(Date.now() + 5000).toISOString(),
    };
    const write = existing
      ? await supabase.from("discord_welcome_events").update(payload).eq("id", existing.id)
      : await supabase.from("discord_welcome_events").upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (write.error) throw write.error;
  }
}

async function recordDiscordSystemWelcome(message) {
  const guild = message.guild;
  const joinedUser = message.mentions.users.first();
  if (!guild || !joinedUser || joinedUser.bot) return;
  const { data: links, error } = await supabase
    .from("discord_channel_links")
    .select("id,integration:discord_integrations!inner(discord_guild_id,status)")
    .eq("status", "active")
    .eq("welcome_discord_enabled", true)
    .eq("discord_channel_id", message.channelId)
    .eq("integration.discord_guild_id", guild.id)
    .eq("integration.status", "connected");
  if (error) throw error;
  for (const link of links || []) {
    const windowStart = new Date(message.createdTimestamp - 60000).toISOString();
    const windowEnd = new Date(message.createdTimestamp + 60000).toISOString();
    const { data: existing, error: lookupError } = await supabase.from("discord_welcome_events")
      .select("id").eq("channel_link_id", link.id).eq("source_platform", "discord")
      .eq("external_member_id", joinedUser.id).in("status", ["pending", "processing"])
      .gte("joined_at", windowStart).lte("joined_at", windowEnd)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      const { error: updateError } = await supabase.from("discord_welcome_events")
        .update({ discord_message_id: message.id, available_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("discord_welcome_events").upsert({
        channel_link_id: link.id,
        source_platform: "discord",
        idempotency_key: `discord_system_join:${link.id}:${message.id}`,
        external_member_id: joinedUser.id,
        member_name: joinedUser.globalName || joinedUser.username,
        member_avatar_url: joinedUser.displayAvatarURL({ size: 128 }),
        member_count: guild.memberCount,
        joined_at: new Date(message.createdTimestamp).toISOString(),
        discord_message_id: message.id,
      }, { onConflict: "idempotency_key", ignoreDuplicates: true });
      if (insertError) throw insertError;
    }
  }
}

async function recordNativeWelcomeStickerReply(message) {
  if (message.author.bot || !message.guildId || !message.reference?.messageId || !message.stickers?.size) return;
  const { data: events, error } = await supabase.from("discord_welcome_events")
    .select("id,channel_link_id")
    .eq("discord_message_id", message.reference.messageId)
    .eq("status", "sent");
  if (error) throw error;
  if (!events?.length) return;
  const sticker = message.stickers.first();
  if (!sticker) return;
  for (const event of events) {
    const linkContext = await getLinkContext(event.channel_link_id);
    if (linkContext.integration.discord_guild_id !== message.guildId ||
        linkContext.link.discord_channel_id !== message.channelId) continue;
    const { error: insertError } = await supabase.from("discord_welcome_actions").upsert({
      welcome_event_id: event.id,
      source_platform: "discord",
      idempotency_key: `discord:${event.id}:${message.author.id}`,
      actor_external_user_id: message.author.id,
      actor_name: message.member?.displayName || message.author.globalName || message.author.username,
      sticker_id: sticker.id,
      sticker_url: sticker.url,
      discord_reply_message_id: message.id,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }
}

async function handleWelcomeButton(interaction) {
  const eventId = interaction.customId.slice("welcome-sticker:".length);
  const { data: event, error } = await supabase.from("discord_welcome_events")
    .select("id,channel_link_id,status,discord_message_id,voax_message_id")
    .eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!event || event.status !== "sent" || !event.discord_message_id || !event.voax_message_id) {
    await interaction.reply({ content: "This welcome message is no longer available.", ephemeral: true });
    return;
  }
  const context = await getLinkContext(event.channel_link_id);
  if (interaction.guildId !== context.integration.discord_guild_id ||
      interaction.channelId !== context.link.discord_channel_id) {
    await interaction.reply({ content: "This welcome button is not valid in this channel.", ephemeral: true });
    return;
  }
  const idempotencyKey = `discord:${eventId}:${interaction.user.id}`;
  const { error: insertError } = await supabase.from("discord_welcome_actions").upsert({
    welcome_event_id: eventId,
    source_platform: "discord",
    idempotency_key: idempotencyKey,
    actor_external_user_id: interaction.user.id,
    actor_name: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
    sticker_id: context.link.discord_welcome_sticker_id,
    sticker_url: context.link.voax_welcome_sticker_url,
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (insertError) throw insertError;
  await interaction.reply({ content: "Your welcome sticker is on its way!", ephemeral: true });
}

client.on(Events.MessageCreate, message => {
  if (message.type === MessageType.UserJoin) {
    void recordDiscordSystemWelcome(message).catch(error => logError("Discord system welcome", error));
    return;
  }
  if (message.stickers?.size) {
    void recordNativeWelcomeStickerReply(message).catch(error => logError("native welcome sticker reply", error));
  }
});

client.on(Events.GuildMemberAdd, member => {
  void recordDiscordJoin(member).catch(error => logError("Discord member join", error));
});

client.on(Events.InteractionCreate, interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith("welcome-sticker:")) return;
  void handleWelcomeButton(interaction).catch(async error => {
    logError("welcome sticker interaction", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Couldn't send that welcome sticker. Please try again later.", ephemeral: true }).catch(() => {});
    }
  });
});

client.once(Events.ClientReady, readyClient => {
  console.log(`[Voax Linking] Connected as ${readyClient.user.tag}`);
  void processQueues();
  setInterval(() => void processQueues(), pollInterval);
});

client.login(process.env.DISCORD_BOT_TOKEN);
