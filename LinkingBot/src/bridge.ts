import { WebhookClient, type Message as DiscordMessage, type TextBasedChannel, type TextChannel, type PartialMessage } from "discord.js";
import { db, enqueueDiscordEvent, getActiveDiscordLink, type OutboxJob } from "./db.js";
import { discordToVoaxMarkdown, escapeDiscordMentions, voaxToDiscordMarkdown } from "./markdown.js";
import { log } from "./logger.js";

function avatar(message:DiscordMessage){return message.author.displayAvatarURL({extension:"png",size:128});}
function serialize(message:DiscordMessage){return {content:discordToVoaxMarkdown(message.content),author:{id:message.author.id,username:message.author.globalName||message.author.username,avatar_url:avatar(message)},discord_message_id:message.id,edited_at:message.editedAt?.toISOString()||null,attachments:message.attachments.map(a=>({path:"discord:"+a.id,url:a.url,name:a.name||"attachment",mimeType:a.contentType||"application/octet-stream",size:a.size})),embeds:message.embeds.map(e=>e.toJSON()),reply_to:message.reference?.messageId||null,mentions:[...message.mentions.users.map(u=>({id:u.id,kind:"user",name:u.globalName||u.username})),...message.mentions.roles.map(r=>({id:r.id,kind:"role",name:r.name})),...message.mentions.channels.map(c=>({id:c.id,kind:"channel",name:"name" in c?String(c.name):"channel"}))]};}
export async function onDiscordMessage(message:DiscordMessage){if(message.author.bot||message.webhookId||!message.inGuild())return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"create",sourceMessageId:message.id,payload:serialize(message)});}
export async function onDiscordEdit(message:DiscordMessage){if(message.author.bot||message.webhookId||!message.inGuild())return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"edit",sourceMessageId:message.id,payload:serialize(message)});}
export async function onDiscordDelete(message:DiscordMessage|PartialMessage){if(!message.inGuild()||message.author?.bot||message.webhookId)return;const link=await getActiveDiscordLink(message.channelId);if(link)await enqueueDiscordEvent({channelLinkId:link.id,eventType:"delete",sourceMessageId:message.id,payload:{discord_message_id:message.id}});}
async function webhookFor(linkId:string,channel:TextBasedChannel){
 const {data:stored}=await db.from("discord_channel_webhooks").select("webhook_id,webhook_token").eq("channel_link_id",linkId).maybeSingle();
 if(stored)return new WebhookClient({id:stored.webhook_id,token:stored.webhook_token});
 if(!("createWebhook" in channel))throw new Error("This Discord channel cannot create webhooks.");
 const created=await (channel as TextChannel).createWebhook({name:"Voax Linking"});
 const {error}=await db.from("discord_channel_webhooks").insert({channel_link_id:linkId,webhook_id:created.id,webhook_token:created.token});
 if(error){await created.delete().catch(()=>undefined);throw error;}
 return new WebhookClient({id:created.id,token:created.token!});
}
async function translateDiscordMentions(content:string,mentions:unknown,serverId:string){
 const list=Array.isArray(mentions)?mentions as Array<{id:string;kind:string;name:string}>:[];
 const users=list.filter(m=>m.kind==="user");const ids=users.map(m=>m.id);
 const {data:connections}=ids.length?await db.from("discord_user_connections").select("discord_user_id,voax_user_id").in("discord_user_id",ids):{data:[] as any[]};
 const voaxIds=(connections||[]).map((c:any)=>c.voax_user_id);
 const {data:members}=voaxIds.length?await db.from("server_members").select("user_id").eq("server_id",serverId).in("user_id",voaxIds):{data:[] as any[]};
 const memberIds=new Set((members||[]).map((m:any)=>m.user_id));
 const linked=(connections||[]).filter((c:any)=>memberIds.has(c.voax_user_id));
 const {data:profiles}=linked.length?await db.from("profiles").select("id,username").in("id",linked.map((c:any)=>c.voax_user_id)):{data:[] as any[]};
 const names=new Map((profiles||[]).map((p:any)=>[p.id,p.username]));const linkedMap=new Map(linked.map((c:any)=>[c.discord_user_id,c.voax_user_id]));const mentionIds:string[]=[];let body=content;
 for(const m of list){let token="";let replacement="";if(m.kind==="user"){token="<@"+m.id+">";const voaxId=linkedMap.get(m.id);if(voaxId){replacement="@"+(names.get(voaxId)||m.name);mentionIds.push(voaxId);}else replacement="@"+m.name;}else if(m.kind==="role"){token="<@&"+m.id+">";replacement="@"+m.name;}else if(m.kind==="channel"){token="<#"+m.id+">";replacement="#"+m.name;}if(token){body=body.replaceAll(token,replacement);if(m.kind==="user")body=body.replaceAll("<@!"+m.id+">",replacement);}}
 return {body,mentionIds};
}
async function translateVoaxMentions(messageId:string,body:string){
 const {data:rows}=await db.from("message_mentions").select("recipient_id").eq("message_id",messageId).contains("mention_types",["user"]);
 const ids=[...new Set((rows||[]).map((r:any)=>r.recipient_id))];if(!ids.length)return {body,discordIds:[] as string[]};
 const {data:connections}=await db.from("discord_user_connections").select("voax_user_id,discord_user_id").in("voax_user_id",ids);
 const {data:profiles}=await db.from("profiles").select("id,username").in("id",ids);const names=new Map((profiles||[]).map((p:any)=>[p.id,p.username]));
 let content=body;const discordIds:string[]=[];for(const c of connections||[]){const username=names.get(c.voax_user_id);if(!username)continue;const token="@"+username;if(content.includes(token)){content=content.replaceAll(token,"<@"+c.discord_user_id+">");discordIds.push(c.discord_user_id);}}
 return {body:content,discordIds};
}
async function sendToVoax(job:OutboxJob){
 const p=job.payload;const {data:map}=await db.from("discord_message_mappings").select("voax_message_id").eq("channel_link_id",job.channel_link_id).eq("direction","discord_to_voax").eq("source_message_id",job.source_message_id).maybeSingle();
 if(job.event_type==="delete"){if(map?.voax_message_id){const {error}=await db.from("messages").delete().eq("id",map.voax_message_id);if(error)throw error;}return;}
 if(job.event_type==="edit"){if(map?.voax_message_id){const {data:link,error:linkError}=await db.from("discord_channel_links").select("voax_server_id").eq("id",job.channel_link_id).single();if(linkError||!link)throw linkError||new Error("Channel link not found.");const translated=await translateDiscordMentions(String(p.content||""),p.mentions,link.voax_server_id);const {error}=await db.rpc("update_discord_bridge_message",{p_message_id:map.voax_message_id,p_body:translated.body,p_metadata:p,p_mention_user_ids:translated.mentionIds});if(error)throw error;}return;}
 if(map?.voax_message_id)return;
 const {data:link,error:linkError}=await db.from("discord_channel_links").select("voax_channel_id,voax_server_id,integration:discord_integrations!inner(installed_by)").eq("id",job.channel_link_id).single();if(linkError)throw linkError;
 const author=(p.author||{}) as Record<string,unknown>;const owner=(link.integration as unknown as {installed_by:string}).installed_by;
 const {data:reply}=p.reply_to?await db.from("discord_message_mappings").select("voax_message_id").eq("channel_link_id",job.channel_link_id).eq("discord_message_id",String(p.reply_to)).maybeSingle():{data:null};
 const attachments=Array.isArray(p.attachments)?p.attachments:[];const translated=await translateDiscordMentions(String(p.content||""),p.mentions,link.voax_server_id);
 const {data:inserted,error}=await db.rpc("create_discord_bridge_message",{p_channel_id:link.voax_channel_id,p_author_id:owner,p_body:translated.body||(attachments.length?"Shared an attachment":Array.isArray(p.embeds)&&p.embeds.length?"Shared an embed":"Shared an attachment"),p_attachments:attachments,p_metadata:{platform:"discord",author,embeds:p.embeds||[],mentions:p.mentions||[],reply_external_id:p.reply_to||null,attribution:"[Discord]"},p_external_id:job.source_message_id,p_reply_to:reply?.voax_message_id||null,p_mention_user_ids:translated.mentionIds});
 if(error)throw error;const voaxMessageId=String(inserted);
 const {error:mapError}=await db.from("discord_message_mappings").insert({channel_link_id:job.channel_link_id,direction:"discord_to_voax",source_message_id:job.source_message_id,discord_message_id:job.source_message_id,voax_message_id:voaxMessageId,destination_message_id:voaxMessageId});if(mapError)throw mapError;
}
async function sendToDiscord(job:OutboxJob,channel:TextBasedChannel){
 const {data:map}=await db.from("discord_message_mappings").select("discord_message_id").eq("channel_link_id",job.channel_link_id).eq("direction","voax_to_discord").eq("source_message_id",job.source_message_id).maybeSingle();const webhook=await webhookFor(job.channel_link_id,channel);
 if(job.event_type==="delete"){if(map?.discord_message_id)await webhook.deleteMessage(map.discord_message_id).catch(()=>undefined);return;}
 if(job.event_type==="edit"){if(map?.discord_message_id){const translated=await translateVoaxMentions(job.source_message_id,String(job.payload.body||""));await webhook.editMessage(map.discord_message_id,{content:escapeDiscordMentions(translated.body).slice(0,2000),allowedMentions:{parse:[],users:translated.discordIds}});}return;}
 if(map?.discord_message_id)return;
 const {data:author}=await db.from("profiles").select("username,avatar_url").eq("id",String(job.payload.author_id||"")).maybeSingle();const username=String(author?.username||"Voax user").slice(0,70);
 const files=[] as {attachment:string;name:string}[];const attachments=Array.isArray(job.payload.attachments)?job.payload.attachments as Array<{path?:string;name?:string;url?:string;size?:number}>:[];
 let content=String(job.payload.body||"");const translated=await translateVoaxMentions(job.source_message_id,content);content=translated.body;
 for(const attachment of attachments){let source=attachment.url;if(!source&&attachment.path){const {data}=await db.storage.from("message-attachments").createSignedUrl(attachment.path,3600);source=data?.signedUrl;}if(source){if((attachment.size||0)>25*1024*1024)content+="\nAttachment too large to upload: "+source;else files.push({attachment:source,name:attachment.name||"attachment"});}}
 const replyTo=String(job.payload.reply_to||"");if(replyTo){const {data:original}=await db.from("messages").select("body,author_id").eq("id",replyTo).maybeSingle();if(original){const {data:replyAuthor}=await db.from("profiles").select("username").eq("id",original.author_id).maybeSingle();content="↪ Replying to "+(replyAuthor?.username||"member")+": "+String(original.body||"").slice(0,240)+"\n\n"+content;}}
 const sent=await webhook.send({content:escapeDiscordMentions(voaxToDiscordMarkdown(content)).slice(0,2000),username:username+" [Voax]",avatarURL:author?.avatar_url||undefined,files,allowedMentions:{parse:[],users:translated.discordIds}});
 const {error}=await db.from("discord_message_mappings").insert({channel_link_id:job.channel_link_id,direction:"voax_to_discord",source_message_id:job.source_message_id,discord_message_id:sent.id,voax_message_id:job.source_message_id,destination_message_id:sent.id});if(error)throw error;
}
export async function processOutboxJob(job:OutboxJob,resolver:(id:string)=>Promise<TextBasedChannel|null>){
 const {data:link,error}=await db.from("discord_channel_links").select("discord_channel_id,status,integration_id,integration:discord_integrations!inner(status)").eq("id",job.channel_link_id).maybeSingle();if(error)throw error;if(!link||link.status==="disconnected")return;if(link.status!=="active"||(link.integration as any)?.status!=="connected")throw new Error("Linked channel needs attention before synchronization can continue.");
 if(job.direction==="discord_to_voax")await sendToVoax(job);else{const channel=await resolver(link.discord_channel_id);if(!channel||!("send" in channel))throw new Error("Linked Discord channel is unavailable or inaccessible.");await sendToDiscord(job,channel);}
 await db.from("discord_integrations").update({last_success_at:new Date().toISOString(),status:"connected",last_error:null}).eq("id",link.integration_id);log("info","outbox_job_sent",{jobId:job.id,direction:job.direction,eventType:job.event_type});
}
