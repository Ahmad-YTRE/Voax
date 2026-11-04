import { db, type OutboxJob } from "./db.js";
import { config } from "./config.js";
import { log } from "./logger.js";
import { processOutboxJob } from "./bridge.js";
import type { Client, TextBasedChannel } from "discord.js";
export function startOutboxWorker(client:Client){
 let running=false;
 const resolve=async(id:string):Promise<TextBasedChannel|null>=>{const channel=await client.channels.fetch(id).catch(()=>null);return channel&&channel.isTextBased()?channel:null;};
 const tick=async()=>{if(running)return;running=true;try{const {data:jobs,error}=await db.rpc("claim_discord_sync_jobs",{p_limit:config.batchSize});if(error)throw error;
  for(const job of (jobs||[]) as OutboxJob[]){try{await processOutboxJob(job,resolve);await db.from("discord_sync_outbox").update({status:"sent",processed_at:new Date().toISOString(),locked_at:null,last_error:null}).eq("id",job.id);}
   catch(e){const attempts=job.attempts;const dead=attempts>=config.maxAttempts;const delay=Math.min(3600,3*2**Math.min(attempts,10));const message=e instanceof Error?e.message.slice(0,1000):"Unknown synchronization error";await db.from("discord_sync_outbox").update({status:dead?"dead":"failed",available_at:new Date(Date.now()+delay*1000).toISOString(),locked_at:null,last_error:message}).eq("id",job.id);await db.from("discord_channel_links").update({status:dead?"degraded":"active",last_error:message}).eq("id",job.channel_link_id);log("error","outbox_job_failed",{jobId:job.id,attempts,dead,error:message});}}
 }catch(e){log("error","outbox_poll_failed",{error:e instanceof Error?e.message:String(e)});}finally{running=false;}};
 const timer=setInterval(()=>void tick(),config.pollMs);void tick();return()=>clearInterval(timer);
}
