-- Voax ticket channels: private channel-backed tickets with server-side authorization.
alter table public.channels drop constraint if exists channels_channel_type_check;
alter table public.channels
  add constraint channels_channel_type_check
  check (channel_type = any (array['text','announcement','forum','ticket_panel','ticket']::text[]));

create table if not exists public.ticket_panels (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  title text not null default 'Support Center' check (char_length(title) between 1 and 100),
  description text not null default 'Need help? Create a private ticket and our team will assist you.' check (char_length(description) <= 500),
  button_label text not null default 'Create Ticket' check (char_length(button_label) between 1 and 40),
  welcome_message text not null default 'Please describe your issue. A support team member will be with you shortly.' check (char_length(welcome_message) <= 2000),
  categories jsonb not null default '["General","Technical Support","Report a User"]'::jsonb
    check (jsonb_typeof(categories) = 'array' and jsonb_array_length(categories) <= 12),
  support_role_ids uuid[] not null default '{}',
  allow_user_close boolean not null default true,
  allow_claim boolean not null default true,
  save_transcripts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  panel_channel_id uuid not null references public.ticket_panels(channel_id) on delete cascade,
  channel_id uuid not null unique references public.channels(id) on delete cascade,
  ticket_number bigint not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text not null default 'General',
  status text not null default 'open' check (status in ('open','claimed','archived')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique(server_id, ticket_number)
);

create unique index if not exists tickets_one_active_per_user_server
  on public.tickets(server_id, created_by)
  where status in ('open','claimed');
create index if not exists tickets_server_status_created_idx on public.tickets(server_id, status, created_at desc);
create index if not exists tickets_panel_status_idx on public.tickets(panel_channel_id, status);

create table if not exists public.ticket_members (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(ticket_id, user_id)
);

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 40),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ticket_events_ticket_created_idx on public.ticket_events(ticket_id, created_at);

create table if not exists public.ticket_transcripts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists private.ticket_counters (
  server_id uuid primary key references public.servers(id) on delete cascade,
  last_ticket_number bigint not null default 0
);

alter table public.ticket_panels enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_members enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_transcripts enable row level security;

-- Explicit grants are required for new public tables on current Supabase projects.
grant select on public.ticket_panels, public.tickets, public.ticket_members,
  public.ticket_events, public.ticket_transcripts to authenticated;

drop policy if exists "Members read visible ticket panels" on public.ticket_panels;
create policy "Members read visible ticket panels" on public.ticket_panels for select to authenticated
using (public.has_channel_permission(channel_id, 'view_channel'));

drop policy if exists "Members read tickets they can access" on public.tickets;
create policy "Members read tickets they can access" on public.tickets for select to authenticated
using (public.has_channel_permission(channel_id, 'view_channel'));

drop policy if exists "Members read ticket participants they can access" on public.ticket_members;
create policy "Members read ticket participants they can access" on public.ticket_members for select to authenticated
using (exists (select 1 from public.tickets t where t.id=ticket_id and public.has_channel_permission(t.channel_id,'view_channel')));

drop policy if exists "Members read ticket events they can access" on public.ticket_events;
create policy "Members read ticket events they can access" on public.ticket_events for select to authenticated
using (exists (select 1 from public.tickets t where t.id=ticket_id and public.has_channel_permission(t.channel_id,'view_channel')));

drop policy if exists "Members read ticket transcripts they can access" on public.ticket_transcripts;
create policy "Members read ticket transcripts they can access" on public.ticket_transcripts for select to authenticated
using (exists (select 1 from public.tickets t where t.id=ticket_id and public.has_channel_permission(t.channel_id,'view_channel')));

create or replace function public.has_channel_permission(target_channel uuid, permission_name text)
returns boolean language plpgsql stable security definer set search_path=public,auth
as $function$
declare
  v_uid uuid:=auth.uid();
  v_server_id uuid;
  v_category_id uuid;
  v_synced boolean;
  v_role_ids uuid[]:='{}'::uuid[];
  v_overwrite_scope text;
  v_allowed boolean;
begin
  if v_uid is null then return false; end if;
  select c.server_id,c.category_id,c.permissions_synced into v_server_id,v_category_id,v_synced
  from public.channels c where c.id=target_channel;
  if v_server_id is null or not public.is_server_member(v_server_id) then return false; end if;
  if public.is_server_admin(v_server_id) or public.has_server_permission(v_server_id,'manage_server')
     or (permission_name='manage_channels' and public.has_server_permission(v_server_id,'manage_channels'))
     or (permission_name='manage_messages' and public.has_server_permission(v_server_id,'manage_messages')) then return true; end if;
  if permission_name='send_messages' and exists(select 1 from public.tickets t where t.channel_id=target_channel and t.status='archived') then return false; end if;
  select coalesce(array_agg(smr.role_id),'{}'::uuid[]) into v_role_ids
  from public.server_member_roles smr where smr.server_id=v_server_id and smr.user_id=v_uid;
  v_allowed:=permission_name not in ('manage_channels','manage_messages','manage_threads','publish_announcements','manage_announcements');
  if public.has_server_permission(v_server_id,permission_name) then v_allowed:=true; end if;
  if v_synced and v_category_id is not null then v_overwrite_scope:='category'; else v_overwrite_scope:='channel'; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='everyone' and permission_name=any(o.deny_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=false; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='everyone' and permission_name=any(o.allow_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=true; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='role' and o.target_id=any(v_role_ids) and permission_name=any(o.deny_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=false; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='role' and o.target_id=any(v_role_ids) and permission_name=any(o.allow_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=true; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='member' and o.target_id=v_uid and permission_name=any(o.deny_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=false; end if;
  if exists(select 1 from public.channel_permission_overwrites o where o.server_id=v_server_id and o.target_type='member' and o.target_id=v_uid and permission_name=any(o.allow_permissions) and ((v_overwrite_scope='category' and o.category_id=v_category_id) or (v_overwrite_scope='channel' and o.channel_id=target_channel))) then v_allowed:=true; end if;
  return coalesce(v_allowed,false);
end;
$function$;
revoke all on function public.has_channel_permission(uuid,text) from public,anon;
grant execute on function public.has_channel_permission(uuid,text) to authenticated;

create or replace function public.create_server_channel(p_server_id uuid,p_name text,p_category text default 'Text Channels',p_category_id uuid default null,p_channel_type text default 'text',p_description text default '')
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare v_user_id uuid:=auth.uid(); v_channel public.channels;
begin
  if v_user_id is null then raise exception 'Authentication required to create a channel.' using errcode='42501'; end if;
  if p_server_id is null then raise exception 'A server is required.' using errcode='22004'; end if;
  if not public.has_server_permission(p_server_id,'manage_channels') then raise exception 'You do not have permission to create a channel in this server.' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name))<1 or length(p_name)>80 then raise exception 'Channel name must be between 1 and 80 characters.' using errcode='22023'; end if;
  if p_channel_type not in ('text','announcement','forum','ticket_panel') then raise exception 'Invalid channel type.' using errcode='22023'; end if;
  if p_category_id is not null and not exists(select 1 from public.channel_categories cc where cc.id=p_category_id and cc.server_id=p_server_id) then raise exception 'The selected category does not belong to this server.' using errcode='22023'; end if;
  insert into public.channels(server_id,name,category,category_id,channel_type,permissions_synced,description,created_by)
  values(p_server_id,btrim(p_name),coalesce(nullif(btrim(p_category),''),'Text Channels'),p_category_id,p_channel_type,true,coalesce(p_description,''),v_user_id)
  returning * into v_channel;
  if p_channel_type='ticket_panel' then insert into public.ticket_panels(channel_id,server_id) values(v_channel.id,p_server_id); end if;
  return to_jsonb(v_channel);
end;
$$;
revoke all on function public.create_server_channel(uuid,text,text,uuid,text,text) from public,anon;
grant execute on function public.create_server_channel(uuid,text,text,uuid,text,text) to authenticated;

create or replace function public.save_ticket_panel(
  p_channel_id uuid,p_title text,p_description text,p_button_label text,p_welcome_message text,
  p_categories jsonb,p_support_role_ids uuid[],p_allow_user_close boolean,p_allow_claim boolean,p_save_transcripts boolean
) returns void language plpgsql security definer set search_path=public,auth as $$
declare v_server_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select server_id into v_server_id from public.ticket_panels where channel_id=p_channel_id for update;
  if v_server_id is null then raise exception 'Ticket panel not found.' using errcode='P0002'; end if;
  if not public.has_server_permission(v_server_id,'manage_channels') then raise exception 'You do not have permission to manage this ticket panel.' using errcode='42501'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 or char_length(coalesce(p_description,''))>500
    or p_button_label is null or char_length(btrim(p_button_label)) not between 1 and 40 or char_length(coalesce(p_welcome_message,''))>2000
    or jsonb_typeof(coalesce(p_categories,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_categories,'[]'::jsonb))>12 then
    raise exception 'Invalid ticket panel settings.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(coalesce(p_support_role_ids,'{}'::uuid[])) role_id where not exists(select 1 from public.server_roles sr where sr.id=role_id and sr.server_id=v_server_id)) then
    raise exception 'One or more support roles do not belong to this server.' using errcode='22023';
  end if;
  update public.ticket_panels set title=btrim(p_title),description=coalesce(p_description,''),button_label=btrim(p_button_label),
    welcome_message=coalesce(p_welcome_message,''),categories=coalesce(p_categories,'[]'::jsonb),
    support_role_ids=coalesce(p_support_role_ids,'{}'::uuid[]),allow_user_close=coalesce(p_allow_user_close,true),
    allow_claim=coalesce(p_allow_claim,true),save_transcripts=coalesce(p_save_transcripts,true),updated_at=now()
  where channel_id=p_channel_id;
end;
$$;
revoke all on function public.save_ticket_panel(uuid,text,text,text,text,jsonb,uuid[],boolean,boolean,boolean) from public,anon;
grant execute on function public.save_ticket_panel(uuid,text,text,text,text,jsonb,uuid[],boolean,boolean,boolean) to authenticated;

create or replace function public.create_ticket(p_panel_channel_id uuid,p_category text default 'General')
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_uid uuid:=auth.uid(); v_panel public.ticket_panels; v_server public.servers; v_category_id uuid;
  v_number bigint; v_channel public.channels; v_ticket public.tickets; v_role_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to create a ticket.' using errcode='42501'; end if;
  select * into v_panel from public.ticket_panels where channel_id=p_panel_channel_id;
  if not found then raise exception 'This channel is not a ticket panel.' using errcode='22023'; end if;
  if not public.has_channel_permission(p_panel_channel_id,'view_channel') then raise exception 'You cannot access this ticket panel.' using errcode='42501'; end if;
  select * into v_server from public.servers where id=v_panel.server_id for update;
  if not found then raise exception 'Server not found.' using errcode='P0002'; end if;
  if not exists(select 1 from public.channels c where c.id=p_panel_channel_id and c.channel_type='ticket_panel') then raise exception 'This channel is not configured as a ticket panel.' using errcode='22023'; end if;
  if not exists(select 1 from jsonb_array_elements_text(v_panel.categories) c(value) where c.value=coalesce(nullif(btrim(p_category),''),'General')) then raise exception 'Choose a valid ticket category.' using errcode='22023'; end if;
  if exists(select 1 from public.tickets t where t.server_id=v_panel.server_id and t.created_by=v_uid and t.status in ('open','claimed')) then raise exception 'You already have an open ticket in this server. Close it before creating another.' using errcode='23505'; end if;
  insert into public.channel_categories(server_id,name,position,created_by) values(v_panel.server_id,'Tickets',2147483000,v_uid)
    on conflict(server_id,name) do update set name=excluded.name returning id into v_category_id;
  insert into private.ticket_counters(server_id,last_ticket_number) values(v_panel.server_id,1)
    on conflict(server_id) do update set last_ticket_number=private.ticket_counters.last_ticket_number+1 returning last_ticket_number into v_number;
  insert into public.channels(server_id,name,description,created_by,category,category_id,channel_type,permissions_synced,position)
  values(v_panel.server_id,'ticket-'||lpad(v_number::text,3,'0'),'Private support ticket',v_uid,'Tickets',v_category_id,'ticket',false,2147483000)
  returning * into v_channel;
  insert into public.tickets(server_id,panel_channel_id,channel_id,ticket_number,created_by,category)
  values(v_panel.server_id,p_panel_channel_id,v_channel.id,v_number,v_uid,coalesce(nullif(btrim(p_category),''),'General'))
  returning * into v_ticket;
  insert into public.channel_permission_overwrites(server_id,channel_id,target_type,target_id,deny_permissions)
  values(v_panel.server_id,v_channel.id,'everyone',null,array['view_channel','send_messages','read_message_history']);
  insert into public.channel_permission_overwrites(server_id,channel_id,target_type,target_id,allow_permissions)
  values(v_panel.server_id,v_channel.id,'member',v_uid,array['view_channel','send_messages','read_message_history']);
  foreach v_role_id in array v_panel.support_role_ids loop
    insert into public.channel_permission_overwrites(server_id,channel_id,target_type,target_id,allow_permissions)
    values(v_panel.server_id,v_channel.id,'role',v_role_id,array['view_channel','send_messages','read_message_history']);
  end loop;
  insert into public.ticket_events(ticket_id,actor_id,action,details)
  values(v_ticket.id,v_uid,'created',jsonb_build_object('category',v_ticket.category,'ticket_number',v_number));
  return jsonb_build_object('id',v_ticket.id,'channel_id',v_channel.id,'ticket_number',v_number,'status',v_ticket.status);
exception when unique_violation then raise exception 'You already have an open ticket in this server.' using errcode='23505';
end;
$$;
revoke all on function public.create_ticket(uuid,text) from public,anon;
grant execute on function public.create_ticket(uuid,text) to authenticated;

create or replace function public.manage_ticket(p_ticket_id uuid,p_action text,p_member_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_uid uuid:=auth.uid(); v_ticket public.tickets; v_panel public.ticket_panels; v_is_support boolean;
  v_category_id uuid; v_content text;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select * into v_ticket from public.tickets where id=p_ticket_id for update;
  if not found then raise exception 'Ticket not found.' using errcode='P0002'; end if;
  select * into v_panel from public.ticket_panels where channel_id=v_ticket.panel_channel_id;
  v_is_support:=public.is_server_admin(v_ticket.server_id) or public.has_server_permission(v_ticket.server_id,'manage_channels')
    or exists(select 1 from public.server_member_roles smr where smr.server_id=v_ticket.server_id and smr.user_id=v_uid and smr.role_id=any(v_panel.support_role_ids));
  if not public.is_server_member(v_ticket.server_id) then raise exception 'You are no longer a member of this server.' using errcode='42501'; end if;

  if p_action='claim' then
    if not v_is_support or not v_panel.allow_claim then raise exception 'Only the support team can claim tickets.' using errcode='42501'; end if;
    if v_ticket.status='archived' then raise exception 'Archived tickets must be reopened first.' using errcode='22023'; end if;
    update public.tickets set status='claimed',assigned_to=v_uid,updated_at=now() where id=p_ticket_id;
  elsif p_action='close' then
    if not v_is_support and not (v_panel.allow_user_close and v_ticket.created_by=v_uid) then raise exception 'You cannot close this ticket.' using errcode='42501'; end if;
    if v_ticket.status='archived' then raise exception 'This ticket is already archived.' using errcode='22023'; end if;
    insert into public.channel_categories(server_id,name,position,created_by) values(v_ticket.server_id,'Closed Tickets',2147483001,v_uid)
      on conflict(server_id,name) do update set name=excluded.name returning id into v_category_id;
    update public.channels set category='Closed Tickets',category_id=v_category_id,position=2147483001 where id=v_ticket.channel_id;
    update public.tickets set status='archived',archived_at=now(),archived_by=v_uid,updated_at=now() where id=p_ticket_id;
    if v_panel.save_transcripts then
      select coalesce(string_agg(to_char(m.created_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||' UTC - '||
        coalesce(p.username,'Member')||': '||m.body||
        case when jsonb_array_length(coalesce(m.attachments,'[]'::jsonb))>0 then E'\n[Attachments: '||
          (select string_agg(coalesce(a->>'name','attachment'),', ') from jsonb_array_elements(m.attachments) a)||']' else '' end,
        E'\n\n' order by m.created_at),'No messages were sent in this ticket.')
      into v_content from public.messages m left join public.profiles p on p.id=m.author_id where m.channel_id=v_ticket.channel_id;
      insert into public.ticket_transcripts(ticket_id,content,created_by) values(p_ticket_id,v_content,v_uid)
        on conflict(ticket_id) do update set content=excluded.content,created_by=excluded.created_by,created_at=now();
    end if;
  elsif p_action='reopen' then
    if not v_is_support then raise exception 'Only the support team can reopen tickets.' using errcode='42501'; end if;
    if v_ticket.status<>'archived' then raise exception 'This ticket is not archived.' using errcode='22023'; end if;
    insert into public.channel_categories(server_id,name,position,created_by) values(v_ticket.server_id,'Tickets',2147483000,v_uid)
      on conflict(server_id,name) do update set name=excluded.name returning id into v_category_id;
    update public.channels set category='Tickets',category_id=v_category_id,position=2147483000 where id=v_ticket.channel_id;
    update public.tickets set status='open',assigned_to=null,archived_at=null,archived_by=null,updated_at=now() where id=p_ticket_id;
  elsif p_action='add_member' then
    if not v_is_support then raise exception 'Only the support team can add ticket members.' using errcode='42501'; end if;
    if p_member_id is null or not exists(select 1 from public.server_members sm where sm.server_id=v_ticket.server_id and sm.user_id=p_member_id) then raise exception 'Choose a member of this server.' using errcode='22023'; end if;
    if p_member_id=v_ticket.created_by then raise exception 'The ticket creator already has access.' using errcode='22023'; end if;
    insert into public.ticket_members(ticket_id,user_id,added_by) values(p_ticket_id,p_member_id,v_uid) on conflict(ticket_id,user_id) do nothing;
    if exists(select 1 from public.channel_permission_overwrites o where o.channel_id=v_ticket.channel_id and o.target_type='member' and o.target_id=p_member_id) then
      update public.channel_permission_overwrites set allow_permissions=array['view_channel','send_messages','read_message_history'],deny_permissions='{}'
      where channel_id=v_ticket.channel_id and target_type='member' and target_id=p_member_id;
    else
      insert into public.channel_permission_overwrites(server_id,channel_id,target_type,target_id,allow_permissions)
      values(v_ticket.server_id,v_ticket.channel_id,'member',p_member_id,array['view_channel','send_messages','read_message_history']);
    end if;
  elsif p_action='remove_member' then
    if not v_is_support then raise exception 'Only the support team can remove ticket members.' using errcode='42501'; end if;
    if p_member_id is null or p_member_id=v_ticket.created_by then raise exception 'The ticket creator cannot be removed.' using errcode='22023'; end if;
    delete from public.ticket_members where ticket_id=p_ticket_id and user_id=p_member_id;
    delete from public.channel_permission_overwrites where channel_id=v_ticket.channel_id and target_type='member' and target_id=p_member_id;
  else raise exception 'Unknown ticket action.' using errcode='22023';
  end if;
  insert into public.ticket_events(ticket_id,actor_id,action,details)
  values(p_ticket_id,v_uid,p_action,case when p_member_id is not null then jsonb_build_object('member_id',p_member_id) else '{}'::jsonb end);
  return jsonb_build_object('success',true,'action',p_action);
end;
$$;
revoke all on function public.manage_ticket(uuid,text,uuid) from public,anon;
grant execute on function public.manage_ticket(uuid,text,uuid) to authenticated;

create or replace function public.get_ticket_transcript(p_ticket_id uuid)
returns text language plpgsql stable security definer set search_path=public,auth as $$
declare v_channel_id uuid; v_content text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select channel_id into v_channel_id from public.tickets where id=p_ticket_id;
  if v_channel_id is null or not public.has_channel_permission(v_channel_id,'view_channel') then raise exception 'You cannot access this ticket transcript.' using errcode='42501'; end if;
  select content into v_content from public.ticket_transcripts where ticket_id=p_ticket_id;
  if v_content is null then raise exception 'No saved transcript is available yet.' using errcode='P0002'; end if;
  return v_content;
end;
$$;
revoke all on function public.get_ticket_transcript(uuid) from public,anon;
grant execute on function public.get_ticket_transcript(uuid) to authenticated;

notify pgrst, 'reload schema';