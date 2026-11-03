-- Persistent queue claiming and private webhook credentials for the Voax Linking worker.
create table if not exists public.discord_channel_webhooks (
  channel_link_id uuid primary key references public.discord_channel_links(id) on delete cascade,
  webhook_id text not null,
  webhook_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.discord_channel_webhooks enable row level security;
revoke all on public.discord_channel_webhooks from anon, public, authenticated;
grant all on public.discord_channel_webhooks to service_role;

create or replace function public.claim_discord_sync_jobs(p_limit integer default 10)
returns setof public.discord_sync_outbox
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  return query
  with picked as (
    select id from public.discord_sync_outbox
    where status in ('pending','failed') and available_at <= now()
    order by id
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  )
  update public.discord_sync_outbox q
  set status='processing', attempts=q.attempts+1, locked_at=now()
  from picked
  where q.id=picked.id
  returning q.*;
end;
$$;
revoke all on function public.claim_discord_sync_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_discord_sync_jobs(integer) to service_role;

-- A crashed worker must not strand jobs forever.
update public.discord_sync_outbox
set status='failed', locked_at=null, available_at=now()
where status='processing' and locked_at < now()-interval '5 minutes';
