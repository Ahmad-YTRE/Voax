-- Keep all integration writes behind the authenticated API/service role. The API validates
-- Discord installation, guild permissions, channel types, and private-channel consent.
revoke insert,update,delete on public.discord_integrations from authenticated;
revoke insert,update,delete on public.discord_channel_links from authenticated;
revoke insert,delete on public.discord_user_connections from authenticated;
grant select on public.discord_integrations,public.discord_channel_links,public.discord_user_connections to authenticated;
drop policy if exists "Integration managers create Discord integrations" on public.discord_integrations;
drop policy if exists "Integration managers update Discord integrations" on public.discord_integrations;
drop policy if exists "Integration managers delete Discord integrations" on public.discord_integrations;
drop policy if exists "Integration managers create Discord channel links" on public.discord_channel_links;
drop policy if exists "Integration managers update Discord channel links" on public.discord_channel_links;
drop policy if exists "Integration managers delete Discord channel links" on public.discord_channel_links;
drop policy if exists "Users link own Discord identity" on public.discord_user_connections;
drop policy if exists "Users unlink own Discord identity" on public.discord_user_connections;

-- Preserve strict FIFO order per linked channel and recover jobs from a crashed worker.
create or replace function public.claim_discord_sync_jobs(p_limit integer default 10)
returns setof public.discord_sync_outbox language plpgsql set search_path='' as $
begin
 update public.discord_sync_outbox set status='failed',locked_at=null,available_at=now() where status='processing' and locked_at < now()-interval '5 minutes';
 return query with picked as (
  select q.id from public.discord_sync_outbox q where q.status in ('pending','failed') and q.available_at<=now()
   and not exists(select 1 from public.discord_sync_outbox earlier where earlier.channel_link_id=q.channel_link_id and earlier.id<q.id and earlier.status in ('pending','failed','processing'))
  order by q.id for update skip locked limit greatest(1,least(coalesce(p_limit,10),50))
 ) update public.discord_sync_outbox q set status='processing',attempts=q.attempts+1,locked_at=now() from picked where q.id=picked.id returning q.*;
end; $$;
revoke all on function public.claim_discord_sync_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_discord_sync_jobs(integer) to service_role;
