alter table public.discord_channel_links
  add column if not exists welcome_discord_enabled boolean not null default false,
  add column if not exists welcome_voax_enabled boolean not null default false,
  add column if not exists discord_welcome_sticker_id text,
  add column if not exists voax_welcome_sticker_url text,
  add column if not exists welcome_message_template text not null default 'Welcome {user} to {server}!';

create table if not exists public.discord_welcome_events (
  id uuid primary key default gen_random_uuid(),
  channel_link_id uuid not null references public.discord_channel_links(id) on delete cascade,
  source_platform text not null check (source_platform in ('discord','voax')),
  idempotency_key text not null unique,
  voax_user_id uuid references auth.users(id) on delete set null,
  external_member_id text not null,
  member_name text not null,
  member_avatar_url text,
  joined_at timestamptz not null default now(),
  member_count integer,
  discord_message_id text,
  voax_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists discord_welcome_events_pending_idx
  on public.discord_welcome_events(status, available_at, created_at);

create table if not exists public.discord_welcome_actions (
  id uuid primary key default gen_random_uuid(),
  welcome_event_id uuid not null references public.discord_welcome_events(id) on delete cascade,
  source_platform text not null check (source_platform in ('discord','voax')),
  idempotency_key text not null unique,
  actor_voax_user_id uuid references auth.users(id) on delete set null,
  actor_external_user_id text,
  actor_name text not null,
  sticker_id text,
  sticker_url text,
  discord_reply_message_id text,
  voax_reply_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists discord_welcome_actions_pending_idx
  on public.discord_welcome_actions(status, available_at, created_at);

alter table public.discord_welcome_events enable row level security;
alter table public.discord_welcome_actions enable row level security;

revoke all on public.discord_welcome_events from anon, authenticated;
revoke all on public.discord_welcome_actions from anon, authenticated;
grant select, insert, update, delete on public.discord_welcome_events to service_role;
grant select, insert, update, delete on public.discord_welcome_actions to service_role;

create or replace function public.claim_discord_welcome_events(p_limit integer default 10)
returns setof public.discord_welcome_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.discord_welcome_events
    set status='failed', locked_at=null, available_at=now()
    where status='processing' and locked_at < now()-interval '5 minutes';

  return query
  with picked as (
    select e.id
    from public.discord_welcome_events e
    where e.status in ('pending','failed')
      and e.available_at <= now()
      and e.attempts < 8
    order by e.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10),50))
  )
  update public.discord_welcome_events e
    set status='processing', attempts=e.attempts+1, locked_at=now()
  from picked
  where e.id=picked.id
  returning e.*;
end;
$$;

create or replace function public.claim_discord_welcome_actions(p_limit integer default 10)
returns setof public.discord_welcome_actions
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.discord_welcome_actions
    set status='failed', locked_at=null, available_at=now()
    where status='processing' and locked_at < now()-interval '5 minutes';

  return query
  with picked as (
    select a.id
    from public.discord_welcome_actions a
    where a.status in ('pending','failed')
      and a.available_at <= now()
      and a.attempts < 8
    order by a.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10),50))
  )
  update public.discord_welcome_actions a
    set status='processing', attempts=a.attempts+1, locked_at=now()
  from picked
  where a.id=picked.id
  returning a.*;
end;
$$;

revoke all on function public.claim_discord_welcome_events(integer) from public, anon, authenticated;
revoke all on function public.claim_discord_welcome_actions(integer) from public, anon, authenticated;
grant execute on function public.claim_discord_welcome_events(integer) to service_role;
grant execute on function public.claim_discord_welcome_actions(integer) to service_role;

create or replace function public.enqueue_voax_member_welcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_member_count integer;
  v_link record;
begin
  select p.username, p.avatar_url
    into v_profile
    from public.profiles p
    where p.id = new.user_id;

  select count(*)::integer into v_member_count
    from public.server_members sm
    where sm.server_id = new.server_id;

  for v_link in
    select l.id
    from public.discord_channel_links l
    join public.discord_integrations i on i.id=l.integration_id
    where l.voax_server_id=new.server_id
      and l.status='active'
      and i.status='connected'
      and l.welcome_voax_enabled=true
  loop
    insert into public.discord_welcome_events(
      channel_link_id, source_platform, idempotency_key, voax_user_id,
      external_member_id, member_name, member_avatar_url, member_count
    )
    values(
      v_link.id, 'voax',
      'voax_join:'||v_link.id::text||':'||new.user_id::text,
      new.user_id, new.user_id::text,
      coalesce(v_profile.username,'Voax member'),
      v_profile.avatar_url, v_member_count
    )
    on conflict(idempotency_key) do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function public.enqueue_voax_member_welcome() from public, anon, authenticated;

drop trigger if exists voax_linking_member_welcome on public.server_members;
create trigger voax_linking_member_welcome
  after insert on public.server_members
  for each row execute function public.enqueue_voax_member_welcome();
