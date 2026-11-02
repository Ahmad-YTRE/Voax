-- Archived tickets remain readable, but no one (including administrators) can mutate them.
create or replace function public.has_channel_permission(target_channel uuid, permission_name text)
returns boolean language plpgsql stable security definer set search_path=public,auth
as $function$
declare
  v_uid uuid:=auth.uid(); v_server_id uuid; v_category_id uuid; v_synced boolean;
  v_role_ids uuid[]:='{}'::uuid[]; v_overwrite_scope text; v_allowed boolean;
begin
  if v_uid is null then return false; end if;
  select c.server_id,c.category_id,c.permissions_synced into v_server_id,v_category_id,v_synced
  from public.channels c where c.id=target_channel;
  if v_server_id is null or not public.is_server_member(v_server_id) then return false; end if;
  if permission_name='send_messages' and exists(select 1 from public.tickets t where t.channel_id=target_channel and t.status='archived') then return false; end if;
  if public.is_server_admin(v_server_id) or public.has_server_permission(v_server_id,'manage_server')
    or (permission_name='manage_channels' and public.has_server_permission(v_server_id,'manage_channels'))
    or (permission_name='manage_messages' and public.has_server_permission(v_server_id,'manage_messages')) then return true; end if;
  select coalesce(array_agg(smr.role_id),'{}'::uuid[]) into v_role_ids from public.server_member_roles smr where smr.server_id=v_server_id and smr.user_id=v_uid;
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

drop policy if exists "Authors edit their own messages" on public.messages;
create policy "Authors edit messages in accessible active scopes" on public.messages for update to authenticated
using (author_id=(select auth.uid()) and ((channel_id is not null and public.has_channel_permission(channel_id,'send_messages')) or (conversation_id is not null and public.is_conversation_member(conversation_id))))
with check (author_id=(select auth.uid()) and ((channel_id is not null and public.has_channel_permission(channel_id,'send_messages')) or (conversation_id is not null and public.is_conversation_member(conversation_id))));

drop policy if exists "authors or moderators delete messages" on public.messages;
create policy "authors or moderators delete messages in accessible scopes" on public.messages for delete to authenticated
using (
  (author_id=(select auth.uid()) and ((channel_id is not null and public.has_channel_permission(channel_id,'send_messages')) or (conversation_id is not null and public.is_conversation_member(conversation_id))))
  or (channel_id is not null and exists(select 1 from public.channels c where c.id=messages.channel_id and public.has_server_permission(c.server_id,'manage_messages')))
);

-- Cover user-reference foreign keys used by ticket membership, events, and transcripts.
create index if not exists tickets_created_by_idx on public.tickets(created_by);
create index if not exists tickets_assigned_to_idx on public.tickets(assigned_to);

notify pgrst, 'reload schema';