create or replace function public.enforce_channel_send_permission()
returns trigger
language plpgsql
set search_path = 'public', 'auth'
as $$
begin
  if new.bridge_source is not null and current_user in ('postgres','service_role') then
    return new;
  end if;
  if new.channel_id is not null then
    if not public.has_channel_permission(new.channel_id, 'view_channel')
       or not public.has_channel_permission(new.channel_id, 'send_messages') then
      raise exception 'You do not have permission to send messages in this channel.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;