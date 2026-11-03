import { WebhookClient, type Message as DiscordMessage, type TextBasedChannel, type TextChannel } from "discord.js";
import { db, enqueueDiscordEvent, getActiveDiscordLink, type OutboxJob } from "./db.js";
import { discordToVoaxMarkdown, escapeDiscordMentions, voaxToDiscordMarkdown } from "./markdown.js";
import { log } from "./logger.js";

function avatar(message:DiscordMessage){return message.author.displayAvatarURL({extension:"png",size:128});}
function serialize(message:DiscordMessage){return {content:discordToVoaxMarkdown(message.content),author:{id:message.author.id,username:message.author.globalName||message.author.username,avatar_url:avatar(message)},discord_message_id:message.id,edited_at:message.editedAt?.toISOString()||null,attachments:message.attachments.map(a=>({path:"discord:"+a.id,url:a.url,name:a.name||"attachment",mimeType:a.contentType||"application/octet-stream",size:a.size})),embeds:message.embeds.map(e=>e.toJSON()),reply_to:message.reference?.messageId||null};}
export async function onDiscordMessage(message:DiscordMessage){if(message.author.bot||message.webhookId||!message.inGuild())return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"create",sourceMessageId:message.id,payload:serialize(message)});}
export async function onDiscordEdit(message:DiscordMessage){if(message.author.bot||message.webhookId||!message.inGuild())return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"edit",sourceMessageId:message.id,payload:serialize(message)});}
export async function onDiscordDelete(message:DiscordMessage){if(!message.inGuild()||message.author?.bot||message.webhookId)return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"delete",sourceMessageId:message.id,payload:{discord_message_id:message.id}});}
async function webhookFor(linkId:string,channel:TextBasedChannel){
 const {data:stored}=await db.from("discord_channel_webhooks").select("webhook_id,webhook_token").eq("channel_link_id",linkId).maybeSingle();
 if(stored)return new WebhookClient({id:stored.webhook_id,token:stored.webhook_token});
 if(!("createWebhook" in channel))throw new Error("This Discord channel cannot create webhooks.");
 const created=await (channel as TextChannel).createWebhook({name:"Voax Linking"});
 const {error}=await db.from("discord_channel_webhooks").insert({channel_link_id:linkId,webhook_id:created.id,webhook_token:created.token});
 if(error){await created.delete().catch(()=>undefined);throw error;}
 return new WebhookClient({id:created.id,token:created.token!});
}
async function sendToVoax(job:OutboxJob){
 const p=job.payload;
 const {data:map}=await db.from("discord_message_mappings").select("voax_message_id").eq("channel_link_id",job.channel_link_id).eq("direction","discord_to_voax").eq("source_message_id",job.source_message_id).maybeSingle();
 if(job.event_type==="delete"){if(map?.voax_message_id){const {error}=await db.from("messages").delete().eq("id",map.voax_message_id);if(error)throw error;}return;}
 if(job.event_type==="edit"){if(map?.voax_message_id){const {error}=await db.from("messages").update({body:String(p.content||""),edited_at:new Date().toISOString(),bridge_metadata:p,bridge_source:"discord"}).eq("id",map.voax_message_id);if(error)throw error;}return;}
 if(map?.voax_message_id)return;
 const {data:link,error:linkError}=await db.from("discord_channel_links").select("voax_channel_id,integration:discord_integrations!inner(installed_by)").eq("id",job.channel_link_id).single();if(linkError)throw linkError;
 const author=(p.author||{}) as Record<string,unknown>;const owner=(link.integration as unknown as {installed_by:string}).installed_by;
 const {data:reply}=p.reply_to?await db.from("discord_message_mappings").select("voax_message_id").eq("channel_link_id",job.channel_link_id).eq("discord_message_id",String(p.reply_to)).maybeSingle():{data:null};
 const attachments=Array.isArray(p.attachments)?p.attachments:[];
 const {data:inserted,error}=await db.from("messages").insert({channel_id:link.voax_channel_id,author_id:owner,body:String(p.content||"")||(attachments.length?"Shared an attachment":""),attachments,reply_to:reply?.voax_message_id||null,bridge_source:"discord",bridge_external_id:job.source_message_id,bridge_metadata:{platform:"discord",author,embeds:p.embeds||[],reply_external_id:p.reply_to||null,attribution:"[Discord]"}}).select("id").single();
 if(error)throw error;
 const {error:mapError}=await db.from("discord_message_mappings").insert({channel_link_id:job.channel_link_id,direction:"discord_to_voax",source_message_id:job.source_message_id,discord_message_id:job.source_message_id,voax_message_id:inserted.id,destination_message_id:inserted.id});
 if(mapError)throw mapError;
}
async function sendToDiscord(job:OutboxJob,channel:TextBasedChannel){
 const {data:map}=await db.from("discord_message_mappings").select("discord_message_id").eq("channel_link_id",job.channel_link_id).eq("direction","voax_to_discord").eq("source_message_id",job.source_message_id).maybeSingle();
 const webhook=await webhookFor(job.channel_link_id,channel);
 if(job.event_type==="delete"){if(map?.discord_message_id)await webhook.deleteMessage(map.discord_message_id).catch(()=>undefined);return;}
 if(job.event_type==="edit"){if(map?.discord_message_id)await webhook.editMessage(map.discord_message_id,{content:escapeDiscordMentions(voaxToDiscordMarkdown(String(job.payload.body||""))),allowedMentions:{parse:[]}});return;}
 if(map?.discord_message_id)return;
 const {data:author}=await db.from("profiles").select("username,avatar_url").eq("id",String(job.payload.author_id||"")).maybeSingle();
 const username=String(author?.username||"Voax user").slice(0,70);
 const files=[] as {attachment:string;name:string}[];
 const attachments=Array.isArray(job.payload.attachments)?job.payload.attachments as Array<{path?:string;name?:string;url?:string}>:[];
 for(const attachment of attachments){let source=attachment.url;if(!source&&attachment.path){const {data}=await db.storage.from("message-attachments").createSignedUrl(attachment.path,3600);source=data?.signedUrl;}if(source)files.push({attachment:source,name:attachment.name||"attachment"});}
 let content=voaxToDiscordMarkdown(String(job.payload.body||""));
 const replyTo=String(job.payload.reply_to||"");
 if(replyTo){const {data:original}=await db.from("messages").select("body,author_id").eq("id",replyTo).maybeSingle();if(original){const {data:replyAuthor}=await db.from("profiles").select("username").eq("id",original.author_id).maybeSingle();content="↪ Replying to "+(replyAuthor?.username||"member")+": "+String(original.body||"").slice(0,240)+"\\n\\n"+content;}}
 const sent=await webhook.send({content:escapeDiscordMentions(content).slice(0,2000),username:username+" [Voax]",avatarURL:author?.avatar_url||undefined,files,allowedMentions:{parse:[]}});
 const {error}=await db.from("discord_message_mappings").insert({channel_link_id:job.channel_link_id,direction:"voax_to_discord",source_message_id:job.source_message_id,discord_message_id:sent.id,voax_message_id:job.source_message_id,destination_message_id:sent.id});
 if(error)throw error;
}
export async function processOutboxJob(job:OutboxJob,resolver:(id:string)=>Promise<TextBasedChannel|null>){
 const {data:link,error}=await db.from("discord_channel_links").select("discord_channel_id,status,integration_id,integration:discord_integrations!inner(status)").eq("id",job.channel_link_id).maybeSingle();if(error)throw error;if(!link||link.status==="disconnected")return;if(link.status!=="active"||(link.integration as any)?.status!=="connected")throw new Error("Linked channel needs attention before synchronization can continue.");
 if(job.direction==="discord_to_voax")await sendToVoax(job);else{const channel=await resolver(link.discord_channel_id);if(!channel||!("send" in channel))throw new Error("Linked Discord channel is unavailable or inaccessible.");await sendToDiscord(job,channel);}
 await db.from("discord_integrations").update({last_success_at:new Date().toISOString(),status:"connected",last_error:null}).eq("id",link.integration_id);
 log("info","outbox_job_sent",{jobId:job.id,direction:job.direction,eventType:job.event_type});
}
