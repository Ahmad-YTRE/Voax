alter table public.servers
  add column if not exists welcome_enabled boolean not null default false,
  add column if not exists welcome_channel_id uuid references public.channels(id) on delete set null,
  add column if not exists welcome_message_template text not null default 'Welcome {user} to {server}!';

create or replace function public.post_server_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server record;
  v_username text;
  v_member_count integer;
  v_body text;
begin
  select s.id, s.name, s.welcome_enabled, s.welcome_channel_id, s.welcome_message_template
    into v_server
    from public.servers s
    where s.id = new.server_id;

  if not found or not coalesce(v_server.welcome_enabled, false) or v_server.welcome_channel_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.channels c
    where c.id = v_server.welcome_channel_id
      and c.server_id = new.server_id
      and c.channel_type = 'text'
  ) then
    return new;
  end if;

  select coalesce(p.username, 'A new member')
    into v_username
    from public.profiles p
    where p.id = new.user_id;
  v_username := coalesce(v_username, 'A new member');

  select count(*)::integer
    into v_member_count
    from public.server_members sm
    where sm.server_id = new.server_id;

  v_body := replace(
    replace(
      replace(coalesce(nullif(trim(v_server.welcome_message_template), ''), 'Welcome {user} to {server}!'),
        '{user}', v_username),
      '{server}', v_server.name),
    '{member_count}', v_member_count::text
  );

  insert into public.messages (channel_id, author_id, body, bridge_metadata)
  values (
    v_server.welcome_channel_id,
    new.user_id,
    left(v_body, 4000),
    jsonb_build_object(
      'kind', 'welcome',
      'platform', 'voax',
      'welcome', jsonb_build_object(
        'member_name', v_username,
        'server_name', v_server.name,
        'member_count', v_member_count,
        'origin_platform', 'voax',
        'button_enabled', false
      )
    )
  );

  return new;
exception
  when others then
    raise warning 'Could not post server welcome message for server %: %', new.server_id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.post_server_welcome_message() from public, anon, authenticated;

drop trigger if exists server_member_welcome_message on public.server_members;
create trigger server_member_welcome_message
  after insert on public.server_members
  for each row execute function public.post_server_welcome_message();