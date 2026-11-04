-- Keep native Voax mention rows and notifications in sync when a bridged Discord message is edited.
create or replace function public.update_discord_bridge_message(
  p_message_id uuid,
  p_body text,
  p_attachments jsonb,
  p_metadata jsonb,
  p_mention_user_ids uuid[] default '{}'::uuid[]
) returns void
language plpgsql
set search_path=''
as $$
declare
  v_server_id uuid;
  v_author_id uuid;
  v_channel_id uuid;
  v_old_user_ids uuid[] := '{}'::uuid[];
  v_target uuid;
begin
  select c.server_id, m.author_id, m.channel_id
    into v_server_id, v_author_id, v_channel_id
  from public.messages m
  join public.channels c on c.id = m.channel_id
  where m.id = p_message_id and m.bridge_source = 'discord';

  if v_server_id is null then
    raise exception 'Discord bridge message not found.' using errcode='P0002';
  end if;

  if not exists (
    select 1 from public.discord_channel_links l
    where l.voax_channel_id = v_channel_id and l.voax_server_id = v_server_id
      and l.status = 'active'
  ) then
    raise exception 'No active Discord bridge is authorized for this message.' using errcode='42501';
  end if;

  select coalesce(array_agg(mm.recipient_id), '{}'::uuid[])
    into v_old_user_ids
  from public.message_mentions mm
  where mm.message_id = p_message_id
    and mm.mention_types @> array['user']::text[];

  update public.messages
    set body = coalesce(p_body, ''),
        attachments = coalesce(p_attachments, '[]'::jsonb),
        edited_at = now(),
        bridge_metadata = coalesce(p_metadata, '{}'::jsonb)
  where id = p_message_id;

  delete from public.message_mentions
  where message_id = p_message_id
    and mention_types @> array['user']::text[];

  for v_target in
    select distinct recipients.mentioned_user_id
    from unnest(coalesce(p_mention_user_ids, '{}'::uuid[])) as recipients(mentioned_user_id)
  loop
    if exists (
      select 1 from public.server_members sm
      where sm.server_id = v_server_id and sm.user_id = v_target
    ) then
      insert into public.message_mentions(message_id, recipient_id, mention_types, role_ids)
      values (p_message_id, v_target, array['user']::text[], '{}'::uuid[])
      on conflict (message_id, recipient_id) do nothing;

      if not (v_target = any(v_old_user_ids)) then
        insert into public.notifications(recipient_id, actor_id, type, title, body, entity_id, interruptive)
        values (
          v_target,
          v_author_id,
          'mention',
          'You were mentioned in Discord',
          left(coalesce(nullif(p_body, ''), 'Shared an attachment'), 240),
          p_message_id,
          false
        );
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.update_discord_bridge_message(uuid, text, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.update_discord_bridge_message(uuid, text, jsonb, uuid[]) to service_role;
