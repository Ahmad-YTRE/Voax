import { createClient } from "@supabase/supabase-js";
// @ts-ignore Node built-ins are available in the Vercel Node runtime.
import { createHash, randomBytes } from "node:crypto";
const env=(globalThis as any).process?.env||{};
const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL||"";
const anonKey=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY||"";
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||"";
const clientId=env.DISCORD_CLIENT_ID||"";
const clientSecret=env.DISCORD_CLIENT_SECRET||"";
const configuredPublicOrigin=String(env.VOAX_PUBLIC_URL||"https://staging.voax.cc.cd").replace(/\/+$/,"");
const supportedHosts=new Set(["staging.voax.cc.cd","voax.cc.cd"]);
function publicOrigin(req:any){
 const forwarded=String(req.headers?.["x-forwarded-host"]||"").split(",")[0].trim().toLowerCase();
 const host=String(forwarded||req.headers?.host||"").split(",")[0].trim().toLowerCase().split(":")[0];
 return supportedHosts.has(host)?"https://"+host:configuredPublicOrigin;
}
function callbackUri(req:any){return publicOrigin(req)+"/api/linking/oauth?action=callback";}
function decodeReturnPath(state:string){
 const parts=state.split(".");
 if(parts.length!==2)return "";
 try{
  const encoded=parts[1].replace(/-/g,"+").replace(/_/g,"/");
  const path=atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,"="));
  return path.startsWith("/channel/")||path.startsWith("/channels/")?path:"";
 }catch{return "";}
}
const permissions="0";
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const userClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const reply=(res:any,status:number,body:unknown)=>res.status(status).json(body);
async function auth(req:any){const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!token)throw new Error("Unauthorized");const {data,error}=await userClient.auth.getUser(token);if(error||!data.user)throw new Error("Unauthorized");return data.user;}
async function canManage(serverId:string,userId:string){const {data:s}=await admin.from("servers").select("created_by").eq("id",serverId).maybeSingle();if(s?.created_by===userId)return true;const {data:member,error:memberError}=await admin.from("server_members").select("role").eq("server_id",serverId).eq("user_id",userId).maybeSingle();if(memberError)throw memberError;if(!member)return false;if(member.role==="owner"||member.role==="admin")return true;const {data:assignments,error}=await admin.from("server_member_roles").select("role_id").eq("server_id",serverId).eq("user_id",userId);if(error)throw error;const roleIds=(assignments||[]).map((row:any)=>row.role_id);if(!roleIds.length)return false;const {data:roles,error:roleError}=await admin.from("server_roles").select("permissions").eq("server_id",serverId).in("id",roleIds);if(roleError)throw roleError;return (roles||[]).some((role:any)=>Boolean(role.permissions?.manage_integrations));}
async function discord(path:string){const token=env.DISCORD_BOT_TOKEN;if(!token)throw new Error("Discord bot is not configured.");const r=await fetch("https://discord.com/api/v10"+path,{headers:{Authorization:"Bot "+token}});const data=await r.json() as any;if(!r.ok)throw new Error(data.message||"Discord API request failed.");return data;}
function installUrl(guildId:string){const q=new URLSearchParams({client_id:clientId,scope:"bot applications.commands",permissions,guild_id:guildId,disable_guild_select:"true"});return "https://discord.com/oauth2/authorize?"+q.toString();}
export default async function handler(req:any,res:any){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 const action=String(req.query?.action||"");
 if(action==="callback"&&req.method==="GET"){
  try{
   if(req.query.error)return res.redirect(302,publicOrigin(req)+"/app?discord_error="+encodeURIComponent(String(req.query.error)));
   const code=String(req.query.code||""),state=String(req.query.state||"");if(!code||!state)return reply(res,400,{error:"Invalid OAuth callback."});
   const {data:st}=await admin.from("discord_oauth_states").select("*").eq("state_hash",hash(state)).gt("expires_at",new Date().toISOString()).maybeSingle();if(!st)return reply(res,400,{error:"Authorization expired. Start again in Voax."});
   const tokenR=await fetch("https://discord.com/api/v10/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:"authorization_code",code,redirect_uri:callbackUri(req)})});
   const token=await tokenR.json() as any;if(!tokenR.ok)throw new Error("Discord authorization could not be verified.");
   const meR=await fetch("https://discord.com/api/v10/users/@me",{headers:{Authorization:"Bearer "+token.access_token}});const me=await meR.json() as any;if(!meR.ok||!me.id)throw new Error("Discord identity verification failed.");
   const avatar=me.avatar?"https://cdn.discordapp.com/avatars/"+me.id+"/"+me.avatar+".png?size=128":null;
   if(st.purpose==="connect_account"){
    const {error}=await admin.from("discord_user_connections").upsert({voax_user_id:st.voax_user_id,discord_user_id:me.id,discord_username:me.global_name||me.username,discord_global_name:me.global_name,discord_avatar_url:avatar},{onConflict:"voax_user_id"});if(error)throw error;
    await admin.from("discord_oauth_states").delete().eq("state_hash",hash(state));return res.redirect(302,publicOrigin(req)+"/app?discord_account=connected");
   }
   const guildR=await fetch("https://discord.com/api/v10/users/@me/guilds",{headers:{Authorization:"Bearer "+token.access_token}});const guilds=await guildR.json() as any[];if(!guildR.ok||!Array.isArray(guilds))throw new Error("Could not retrieve Discord servers.");
   const allowed=guilds.filter(g=>{const p=BigInt(g.permissions||"0");return (p&32n)!==0n||(p&8n)!==0n;}).map(g=>({id:g.id,name:g.name,icon:g.icon,owner:Boolean(g.owner)}));
   await admin.from("discord_oauth_states").update({discord_user_id:me.id,discord_username:me.global_name||me.username,discord_avatar_url:avatar,guilds:allowed}).eq("state_hash",hash(state));
   const origin=publicOrigin(req),returnPath=decodeReturnPath(state);
   const destination=returnPath?origin+returnPath:origin+"/app";
   return res.redirect(302,destination+"?discord_install_state="+encodeURIComponent(state)+"&discord_install_server="+encodeURIComponent(st.voax_server_id));
  }catch(e){return res.redirect(302,publicOrigin(req)+"/app?discord_error="+encodeURIComponent(e instanceof Error?e.message:"OAuth failed."));}
 }
 try{
  const user=await auth(req);
  if(action==="start"&&req.method==="POST"){
   const purpose=req.body?.purpose||"install",serverId=req.body?.serverId;if(!["install","connect_account"].includes(purpose))return reply(res,400,{error:"Invalid purpose."});
   if(purpose==="install"&&(!serverId||!(await canManage(String(serverId),user.id))))return reply(res,403,{error:"Manage Integrations permission is required."});
   const returnPath=String(req.body?.returnPath||"");
   const safeReturnPath=purpose==="install"&&(returnPath.startsWith("/channel/")||returnPath.startsWith("/channels/"))?returnPath:"";
   const nonce=randomBytes(32).toString("base64url");
   const state=purpose==="install"&&safeReturnPath?nonce+"."+btoa(safeReturnPath).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""):nonce;
   const {error}=await admin.from("discord_oauth_states").insert({state_hash:hash(state),voax_user_id:user.id,voax_server_id:purpose==="install"?serverId:null,purpose,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw error;
   const q=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:callbackUri(req),scope:"identify guilds",state});return reply(res,200,{authorize_url:"https://discord.com/oauth2/authorize?"+q.toString()});
  }
  if(action==="guilds"&&req.method==="GET"){
   const state=String(req.query.state||"");const {data}=await admin.from("discord_oauth_states").select("guilds").eq("state_hash",hash(state)).eq("voax_user_id",user.id).eq("purpose","install").gt("expires_at",new Date().toISOString()).maybeSingle();if(!data)return reply(res,404,{error:"Selection expired."});return reply(res,200,{guilds:data.guilds||[]});
  }
  if(action==="connect-guild"&&req.method==="POST"){
   const {state,guildId}=req.body||{};const {data}=await admin.from("discord_oauth_states").select("*").eq("state_hash",hash(String(state||""))).eq("voax_user_id",user.id).eq("purpose","install").gt("expires_at",new Date().toISOString()).maybeSingle();if(!data||!data.voax_server_id)return reply(res,404,{error:"Selection expired."});
   if(!(await canManage(data.voax_server_id,user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});
   const guild=(data.guilds||[]).find((g:any)=>g.id===String(guildId));if(!guild)return reply(res,403,{error:"You cannot manage that Discord server."});
   const {error}=await admin.from("discord_integrations").upsert({voax_server_id:data.voax_server_id,discord_guild_id:guild.id,discord_guild_name:guild.name,installed_by:user.id,status:"pending"},{onConflict:"voax_server_id,discord_guild_id"});if(error)throw error;
   await admin.from("discord_oauth_states").delete().eq("state_hash",hash(String(state)));const installed=await discord("/guilds/"+guild.id).then(()=>true).catch(()=>false);if(installed)await admin.from("discord_integrations").update({status:"connected",last_gateway_seen_at:new Date().toISOString(),last_error:null}).eq("voax_server_id",data.voax_server_id).eq("discord_guild_id",guild.id);return reply(res,200,{already_installed:installed,install_url:installed?null:installUrl(guild.id),guild_name:guild.name});
  }
  if(action==="channels"&&req.method==="GET"){
   const serverId=String(req.query.serverId||""),guildId=String(req.query.guildId||"");if(!(await canManage(serverId,user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});
   const {data}=await admin.from("discord_integrations").select("id").eq("voax_server_id",serverId).eq("discord_guild_id",guildId).maybeSingle();if(!data)return reply(res,404,{error:"Discord server not connected."});
   const channels=await discord("/guilds/"+guildId+"/channels");return reply(res,200,{channels:channels.filter((c:any)=>c.type===0||c.type===5).map((c:any)=>({id:c.id,name:c.name,type:c.type===5?"announcement":"text"}))});
  }
  if(action==="create-link"&&req.method==="POST"){
   const {serverId,guildId,discordChannelId,voaxChannelId,privateConfirmed}=req.body||{};if(!(await canManage(String(serverId),user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});
   const {data:integration}=await admin.from("discord_integrations").select("id").eq("voax_server_id",serverId).eq("discord_guild_id",guildId).maybeSingle();
   const {data:vc}=await admin.from("channels").select("id,server_id,channel_type").eq("id",voaxChannelId).eq("server_id",serverId).maybeSingle();if(!integration||!vc||vc.channel_type!=="text")return reply(res,400,{error:"Choose a standard Voax text channel."});
   const ds=await discord("/guilds/"+guildId+"/channels");const dc=ds.find((c:any)=>c.id===discordChannelId&&(c.type===0||c.type===5));if(!dc)return reply(res,400,{error:"Choose a text or announcement channel."});
   const everyoneOverwrite=(dc.permission_overwrites||[]).find((o:any)=>o.id===guildId&&o.type===0);const isPrivate=Boolean(everyoneOverwrite&&(BigInt(everyoneOverwrite.deny||"0")&1024n)!==0n);if(isPrivate&&!privateConfirmed)return reply(res,400,{error:"Private-channel confirmation is required."});try{await discord("/channels/"+dc.id);}catch{return reply(res,403,{error:"The bot cannot access this channel yet. Grant it View Channel and the other required channel permissions in Discord, then try again."});}
   const {data,error}=await admin.from("discord_channel_links").insert({integration_id:integration.id,voax_server_id:serverId,voax_channel_id:voaxChannelId,discord_channel_id:dc.id,discord_channel_name:dc.name,discord_channel_type:dc.type===5?"announcement":"text",is_private:isPrivate,privacy_confirmed_at:isPrivate?new Date().toISOString():null}).select("id").single();if(error)throw error;return reply(res,200,{id:data.id});
  }
  if(action==="reconnect-link"&&req.method==="POST"){const {serverId,linkId}=req.body||{};if(!(await canManage(String(serverId),user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});const {data:link}=await admin.from("discord_channel_links").select("discord_channel_id,integration:discord_integrations!inner(discord_guild_id)").eq("id",linkId).eq("voax_server_id",serverId).maybeSingle();if(!link)return reply(res,404,{error:"Channel link not found."});const guildId=(link.integration as any).discord_guild_id;await discord("/guilds/"+guildId);await discord("/channels/"+link.discord_channel_id);const {error}=await admin.from("discord_channel_links").update({status:"active",last_error:null}).eq("id",linkId);if(error)throw error;await admin.from("discord_sync_outbox").update({status:"pending",attempts:0,available_at:new Date().toISOString(),locked_at:null,last_error:null}).eq("channel_link_id",linkId).in("status",["failed","dead"]);await admin.from("discord_integrations").update({status:"connected",last_error:null}).eq("discord_guild_id",guildId);return reply(res,200,{ok:true});}
  if(action==="welcome-settings"&&req.method==="POST"){
   const {serverId,linkId}=req.body||{};
   if(!serverId||!linkId||!(await canManage(String(serverId),user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});
   const discordStickerId=String(req.body?.discordWelcomeStickerId||"").trim();
   const voaxStickerUrl=String(req.body?.voaxWelcomeStickerUrl||"").trim();
   const template=String(req.body?.welcomeMessageTemplate||"Welcome {user} to {server}!").trim();
   if(discordStickerId&&!/^\\d{17,20}$/.test(discordStickerId))return reply(res,400,{error:"Enter a valid Discord sticker ID."});
   if(voaxStickerUrl){
    try{const parsed=new URL(voaxStickerUrl);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error();}
    catch{return reply(res,400,{error:"The Voax sticker must be a valid public HTTPS image or GIF URL."});}
   }
   if(template.length<1||template.length>500)return reply(res,400,{error:"Welcome message templates must be 1–500 characters."});
   const {data,error}=await admin.from("discord_channel_links").update({
    welcome_discord_enabled:Boolean(req.body?.welcomeDiscordEnabled),
    welcome_voax_enabled:Boolean(req.body?.welcomeVoaxEnabled),
    discord_welcome_sticker_id:discordStickerId||null,
    voax_welcome_sticker_url:voaxStickerUrl||null,
    welcome_message_template:template
   }).eq("id",linkId).eq("voax_server_id",serverId).select("id").maybeSingle();
   if(error)throw error;if(!data)return reply(res,404,{error:"Channel link not found."});
   return reply(res,200,{ok:true});
  }
  if(action==="welcome-click"&&req.method==="POST"){
   const eventId=String(req.body?.eventId||"");
   const {data:event,error:eventError}=await admin.from("discord_welcome_events")
    .select("id,channel_link_id,status,voax_message_id,discord_message_id,channel_link:discord_channel_links!inner(id,voax_server_id,discord_welcome_sticker_id,voax_welcome_sticker_url)")
    .eq("id",eventId).maybeSingle();
   if(eventError)throw eventError;
   if(!event||event.status!=="sent"||!event.voax_message_id||!event.discord_message_id)return reply(res,404,{error:"This welcome message is no longer available."});
   const link=Array.isArray(event.channel_link)?event.channel_link[0]:event.channel_link;
   if(!link||!link.discord_welcome_sticker_id||!link.voax_welcome_sticker_url)return reply(res,400,{error:"Welcome stickers have not been configured for both platforms."});
   const {data:member,error:memberError}=await admin.from("server_members").select("user_id").eq("server_id",link.voax_server_id).eq("user_id",user.id).maybeSingle();
   if(memberError)throw memberError;if(!member)return reply(res,403,{error:"You must be a member of this Voax server to send its welcome sticker."});
   const {data:profile}=await admin.from("profiles").select("username").eq("id",user.id).maybeSingle();
   const idempotencyKey="voax:"+eventId+":"+user.id;
   const {error:insertError}=await admin.from("discord_welcome_actions").upsert({
    welcome_event_id:eventId,source_platform:"voax",idempotency_key:idempotencyKey,
    actor_voax_user_id:user.id,actor_name:profile?.username||"Voax member",
    sticker_id:link.discord_welcome_sticker_id,sticker_url:link.voax_welcome_sticker_url
   },{onConflict:"idempotency_key",ignoreDuplicates:true});
   if(insertError)throw insertError;
   const {data:action,error:actionError}=await admin.from("discord_welcome_actions").select("id,status").eq("idempotency_key",idempotencyKey).single();
   if(actionError)throw actionError;
   return reply(res,200,{ok:true,actionId:action.id,status:action.status});
  }
  if(action==="disconnect-link"&&req.method==="POST"){
   const {serverId,linkId}=req.body||{};if(!(await canManage(String(serverId),user.id)))return reply(res,403,{error:"Manage Integrations permission is required."});const {error}=await admin.from("discord_channel_links").update({status:"disconnected"}).eq("id",linkId).eq("voax_server_id",serverId);if(error)throw error;return reply(res,200,{ok:true});
  }
  if(action==="unlink-account"&&req.method==="POST"){const {error}=await admin.from("discord_user_connections").delete().eq("voax_user_id",user.id);if(error)throw error;return reply(res,200,{ok:true});}
  return reply(res,405,{error:"Unsupported action."});
 }catch(e){const message=e instanceof Error?e.message:"Request failed.";return reply(res,message==="Unauthorized"?401:400,{error:message});}
}
