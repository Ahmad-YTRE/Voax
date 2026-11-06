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

  insert into public.messages (channel_id, author_id, body, bridge_metadata, bridge_source)
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
    ),
    'voax'
  );

  return new;
exception
  when others then
    raise warning 'Could not post server welcome message for server %: %', new.server_id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.post_server_welcome_message() from public, anon, authenticated;