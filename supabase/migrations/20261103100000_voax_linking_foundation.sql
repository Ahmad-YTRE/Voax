-- Voax Linking: durable Discord <-> Voax channel bridge.
-- All Discord credentials and queue processing are backend-only (service_role).

create table if not exists public.discord_integrations (
  id uuid primary key default gen_random_uuid(),
  voax_server_id uuid not null references public.servers(id) on delete cascade,
  discord_guild_id text not null,
  discord_guild_name text not null,
  installed_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','connected','degraded','disconnected')),
  last_gateway_seen_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (voax_server_id, discord_guild_id),
  unique (discord_guild_id)
);
create index if not exists discord_integrations_server_idx on public.discord_integrations(voax_server_id);

create table if not exists public.discord_channel_links (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.discord_integrations(id) on delete cascade,
  voax_server_id uuid not null references public.servers(id) on delete cascade,
  voax_channel_id uuid not null references public.channels(id) on delete cascade,
  discord_channel_id text not null,
  discord_channel_name text not null,
  discord_channel_type text not null check (discord_channel_type in ('text','announcement')),
  is_private boolean not null default false,
  privacy_confirmed_at timestamptz,
  status text not null default 'active' check (status in ('active','paused','degraded','disconnected')),
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists discord_channel_links_active_discord_uidx on public.discord_channel_links(discord_channel_id) where status <> 'disconnected';
create unique index if not exists discord_channel_links_active_voax_uidx on public.discord_channel_links(voax_channel_id) where status <> 'disconnected';
create index if not exists discord_channel_links_integration_idx on public.discord_channel_links(integration_id);
create index if not exists discord_channel_links_status_idx on public.discord_channel_links(status);

create table if not exists public.discord_user_connections (
  id uuid primary key default gen_random_uuid(),
  voax_user_id uuid not null references auth.users(id) on delete cascade,
  discord_user_id text not null unique,
  discord_username text not null,
  discord_global_name text,
  discord_avatar_url text,
  linked_at timestamptz not null default now(),
  unique(voax_user_id)
);
create index if not exists discord_user_connections_voax_idx on public.discord_user_connections(voax_user_id);

create table if not exists public.discord_message_mappings (
  id uuid primary key default gen_random_uuid(),
  channel_link_id uuid not null references public.discord_channel_links(id) on delete cascade,
  direction text not null check (direction in ('discord_to_voax','voax_to_discord')),
  discord_message_id text,
  voax_message_id uuid references public.messages(id) on delete set null,
  source_message_id text not null,
  destination_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_link_id, direction, source_message_id),
  unique(channel_link_id, discord_message_id),
  unique(channel_link_id, voax_message_id)
);
create index if not exists discord_message_mappings_voax_idx on public.discord_message_mappings(voax_message_id) where voax_message_id is not null;

create table if not exists public.discord_sync_outbox (
  id bigint generated always as identity primary key,
  channel_link_id uuid not null references public.discord_channel_links(id) on delete cascade,
  direction text not null check (direction in ('discord_to_voax','voax_to_discord')),
  event_type text not null check (event_type in ('create','edit','delete')),
  source_message_id text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists discord_sync_outbox_ready_idx
  on public.discord_sync_outbox(status, available_at, id) where status in ('pending','failed');
create index if not exists discord_sync_outbox_link_order_idx
  on public.discord_sync_outbox(channel_link_id, id);

create table if not exists public.discord_oauth_states (
  state_hash text primary key,
  voax_user_id uuid not null references auth.users(id) on delete cascade,
  voax_server_id uuid references public.servers(id) on delete cascade,
  purpose text not null check (purpose in ('install','connect_account')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists discord_oauth_states_expiry_idx on public.discord_oauth_states(expires_at);

alter table public.messages add column if not exists bridge_metadata jsonb;
alter table public.messages add column if not exists bridge_source text check (bridge_source is null or bridge_source in ('discord','voax'));
alter table public.messages add column if not exists bridge_external_id text;
create index if not exists messages_bridge_external_idx on public.messages(bridge_source, bridge_external_id) where bridge_external_id is not null;

-- Add Manage Integrations to the existing JSON permission model; no existing role is elevated.
-- Permission checks continue to use public.has_server_permission().
alter table public.server_roles alter column permissions set default
  '{"kick_members":false,"manage_roles":false,"manage_server":false,"manage_channels":false,"manage_messages":false,"manage_integrations":false}'::jsonb;

alter table public.discord_integrations enable row level security;
alter table public.discord_channel_links enable row level security;
alter table public.discord_user_connections enable row level security;
alter table public.discord_message_mappings enable row level security;
alter table public.discord_sync_outbox enable row level security;
alter table public.discord_oauth_states enable row level security;

revoke all on public.discord_integrations, public.discord_channel_links,
  public.discord_user_connections, public.discord_message_mappings,
  public.discord_sync_outbox, public.discord_oauth_states from anon, public;

grant select, insert, update, delete on public.discord_integrations, public.discord_channel_links to authenticated;
grant select, insert, delete on public.discord_user_connections to authenticated;

create policy "Integration managers view Discord integrations"
on public.discord_integrations for select to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers create Discord integrations"
on public.discord_integrations for insert to authenticated
with check (installed_by=(select auth.uid()) and
  (public.has_server_permission(voax_server_id,'manage_integrations')
   or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid()))));

create policy "Integration managers update Discord integrations"
on public.discord_integrations for update to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())))
with check (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers delete Discord integrations"
on public.discord_integrations for delete to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers view Discord channel links"
on public.discord_channel_links for select to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers create Discord channel links"
on public.discord_channel_links for insert to authenticated
with check (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers update Discord channel links"
on public.discord_channel_links for update to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())))
with check (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Integration managers delete Discord channel links"
on public.discord_channel_links for delete to authenticated
using (public.has_server_permission(voax_server_id,'manage_integrations')
  or exists(select 1 from public.servers s where s.id=voax_server_id and s.created_by=(select auth.uid())));

create policy "Users view own Discord identity"
on public.discord_user_connections for select to authenticated using (voax_user_id=(select auth.uid()));
create policy "Users link own Discord identity"
on public.discord_user_connections for insert to authenticated with check (voax_user_id=(select auth.uid()));
create policy "Users unlink own Discord identity"
on public.discord_user_connections for delete to authenticated using (voax_user_id=(select auth.uid()));

-- Only service_role can read or mutate queue, mappings, and OAuth state. No client policies.
revoke all on public.discord_sync_outbox, public.discord_message_mappings, public.discord_oauth_states from authenticated;
grant all on public.discord_sync_outbox, public.discord_message_mappings, public.discord_oauth_states to service_role;
grant all on public.discord_integrations, public.discord_channel_links to service_role;
grant all on public.discord_user_connections to service_role;
grant usage, select on sequence public.discord_sync_outbox_id_seq to service_role;

create or replace function public.enqueue_voax_linking_message()
returns trigger language plpgsql security definer set search_path='' as $$
declare link_row public.discord_channel_links%rowtype;
begin
  if new.channel_id is null or new.bridge_source is not null then return new; end if;
  select * into link_row from public.discord_channel_links
    where voax_channel_id=new.channel_id and status='active' limit 1;
  if not found then return new; end if;
  insert into public.discord_sync_outbox(channel_link_id,direction,event_type,source_message_id,idempotency_key,payload)
  values(link_row.id,'voax_to_discord','create',new.id::text,'voax:create:'||new.id::text,
    jsonb_build_object('message_id',new.id,'author_id',new.author_id,'body',new.body,'attachments',new.attachments,'reply_to',new.reply_to))
  on conflict(idempotency_key) do nothing;
  return new;
end; $$;
revoke all on function public.enqueue_voax_linking_message() from public,anon,authenticated;
drop trigger if exists voax_linking_enqueue_message on public.messages;
create trigger voax_linking_enqueue_message after insert on public.messages
for each row execute function public.enqueue_voax_linking_message();

create or replace function public.enqueue_voax_linking_edit()
returns trigger language plpgsql security definer set search_path='' as $$
declare link_row public.discord_channel_links%rowtype;
begin
  if new.channel_id is null or new.bridge_source is not null or old.body is not distinct from new.body then return new; end if;
  select * into link_row from public.discord_channel_links where voax_channel_id=new.channel_id and status='active' limit 1;
  if not found then return new; end if;
  insert into public.discord_sync_outbox(channel_link_id,direction,event_type,source_message_id,idempotency_key,payload)
  values(link_row.id,'voax_to_discord','edit',new.id::text,'voax:edit:'||new.id::text||':'||coalesce(new.edited_at::text,clock_timestamp()::text),
    jsonb_build_object('message_id',new.id,'body',new.body))
  on conflict(idempotency_key) do nothing;
  return new;
end; $$;
revoke all on function public.enqueue_voax_linking_edit() from public,anon,authenticated;
drop trigger if exists voax_linking_enqueue_edit on public.messages;
create trigger voax_linking_enqueue_edit after update of body on public.messages
for each row execute function public.enqueue_voax_linking_edit();

create or replace function public.enqueue_voax_linking_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare link_row public.discord_channel_links%rowtype;
begin
  if old.channel_id is null or old.bridge_source is not null then return old; end if;
  select * into link_row from public.discord_channel_links where voax_channel_id=old.channel_id and status='active' limit 1;
  if not found then return old; end if;
  insert into public.discord_sync_outbox(channel_link_id,direction,event_type,source_message_id,idempotency_key,payload)
  values(link_row.id,'voax_to_discord','delete',old.id::text,'voax:delete:'||old.id::text,
    jsonb_build_object('message_id',old.id))
  on conflict(idempotency_key) do nothing;
  return old;
end; $$;
revoke all on function public.enqueue_voax_linking_delete() from public,anon,authenticated;
drop trigger if exists voax_linking_enqueue_delete on public.messages;
create trigger voax_linking_enqueue_delete after delete on public.messages
for each row execute function public.enqueue_voax_linking_delete();

-- Restrict bridge metadata writes to the service role; authenticated users cannot set it via column grants.
revoke update (bridge_metadata,bridge_source,bridge_external_id) on public.messages from anon,authenticated;
grant update (bridge_metadata,bridge_source,bridge_external_id) on public.messages to service_role;
