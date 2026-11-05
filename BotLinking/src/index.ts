import { Client, GatewayIntentBits, MessageType, Partials } from "discord.js";
import { config } from "./config.js";
import { log } from "./logger.js";
import { onDiscordDelete, onDiscordEdit, onDiscordMessage } from "./bridge.js";
import { startOutboxWorker } from "./worker.js";
import { db } from "./db.js";
// @ts-ignore - JavaScript module is intentionally shared with the Node hosting entry point.
import { attachWelcomeHandlers } from "./welcome.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});
const stopWelcomeQueues = attachWelcomeHandlers(client);

client.once("ready", async ready => {
  log("info","discord_gateway_ready",{botUser:ready.user.tag,guildCount:ready.guilds.cache.size});
  const { error } = await db.from("discord_integrations").update({ status: "connected", last_gateway_seen_at: new Date().toISOString(), last_error: null }).in("discord_guild_id",ready.guilds.cache.map(g=>g.id));
  if (error) log("error","gateway_presence_update_failed",{error:error.message});
  startOutboxWorker(client);
});
client.on("messageCreate", message => { if (message.type === MessageType.UserJoin) return; void onDiscordMessage(message).catch(error=>log("error","discord_message_enqueue_failed",{messageId:message.id,error:String(error)})); });
client.on("messageUpdate", (_old,message) => { if (message.partial) return; void onDiscordEdit(message).catch(error=>log("error","discord_edit_enqueue_failed",{messageId:message.id,error:String(error)})); });
client.on("messageDelete", message => void onDiscordDelete(message).catch(error=>log("error","discord_delete_enqueue_failed",{messageId:message.id,error:String(error)})));
client.on("guildCreate", guild => void db.from("discord_integrations").update({status:"connected",last_gateway_seen_at:new Date().toISOString(),last_error:null}).eq("discord_guild_id",guild.id));
client.on("guildDelete", guild => void db.from("discord_integrations").update({status:"degraded",last_error:"Bot was removed from this Discord server."}).eq("discord_guild_id",guild.id));
client.on("error",error=>log("error","discord_client_error",{error:error.message}));
process.on("unhandledRejection",reason=>log("error","unhandled_rejection",{reason:String(reason)}));
process.on("SIGTERM",()=>{log("info","shutdown_signal");stopWelcomeQueues();client.destroy();process.exit(0);});
process.on("SIGINT",()=>{stopWelcomeQueues();client.destroy();process.exit(0);});
await client.login(config.discordToken);
