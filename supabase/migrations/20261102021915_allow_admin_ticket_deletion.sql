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
    if v_ticket.status<>'open' then raise exception 'Only open tickets can be claimed.' using errcode='22023'; end if;
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
    if exists(select 1 from public.tickets t where t.server_id=v_ticket.server_id and t.created_by=v_ticket.created_by and t.id<>p_ticket_id and t.status in ('open','claimed')) then
      raise exception 'This user already has another open ticket. Close it before reopening this one.' using errcode='23505';
    end if;
    insert into public.channel_categories(server_id,name,position,created_by) values(v_ticket.server_id,'Tickets',2147483000,v_uid)
      on conflict(server_id,name) do update set name=excluded.name returning id into v_category_id;
    update public.channels set category='Tickets',category_id=v_category_id,position=2147483000 where id=v_ticket.channel_id;
    update public.tickets set status='open',assigned_to=null,archived_at=null,archived_by=null,updated_at=now() where id=p_ticket_id;
  elsif p_action='add_member' then
    if not v_is_support then raise exception 'Only the support team can add ticket members.' using errcode='42501'; end if;
    if v_ticket.status='archived' then raise exception 'Reopen this ticket before adding members.' using errcode='22023'; end if;
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
  elsif p_action='delete' then
    if not public.is_server_admin(v_ticket.server_id) and not public.has_server_permission(v_ticket.server_id,'manage_channels') then
      raise exception 'Only server administrators can permanently delete tickets.' using errcode='42501';
    end if;
    delete from public.channels where id=v_ticket.channel_id;
    return jsonb_build_object('success',true,'action','delete');
  else raise exception 'Unknown ticket action.' using errcode='22023';
  end if;
  insert into public.ticket_events(ticket_id,actor_id,action,details)
  values(p_ticket_id,v_uid,p_action,case when p_member_id is not null then jsonb_build_object('member_id',p_member_id) else '{}'::jsonb end);
  return jsonb_build_object('success',true,'action',p_action);
end;
$$;
revoke all on function public.manage_ticket(uuid,text,uuid) from public,anon;
grant execute on function public.manage_ticket(uuid,text,uuid) to authenticated;
notify pgrst, 'reload schema';