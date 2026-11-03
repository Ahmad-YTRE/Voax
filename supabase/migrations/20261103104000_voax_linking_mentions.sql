-- Idempotent bridge insertion and native mention delivery for linked Discord identities.
create unique index if not exists messages_discord_bridge_external_uidx
 on public.messages(bridge_external_id)
 where bridge_source='discord' and bridge_external_id is not null;

create or replace function public.create_discord_bridge_message(
 p_channel_id uuid,p_author_id uuid,p_body text,p_attachments jsonb,p_metadata jsonb,
 p_external_id text,p_reply_to uuid,p_mention_user_ids uuid[] default '{}'::uuid[]
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_server_id uuid;v_installer uuid;v_message_id uuid;v_target uuid;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select l.voax_server_id,i.installed_by into v_server_id,v_installer
 from public.discord_channel_links l join public.discord_integrations i on i.id=l.integration_id
 where l.voax_channel_id=p_channel_id and l.status='active' and i.status='connected' limit 1;
 if v_server_id is null or v_installer is distinct from p_author_id then raise exception 'No active Discord bridge is authorized for this channel.' using errcode='42501'; end if;
 select id into v_message_id from public.messages where bridge_source='discord' and bridge_external_id=p_external_id limit 1;
 if v_message_id is not null then return v_message_id; end if;
 insert into public.messages(channel_id,author_id,body,attachments,reply_to,bridge_source,bridge_external_id,bridge_metadata)
 values(p_channel_id,p_author_id,coalesce(p_body,''),coalesce(p_attachments,'[]'::jsonb),p_reply_to,'discord',p_external_id,p_metadata)
 returning id into v_message_id;
 foreach v_target in array coalesce(p_mention_user_ids,'{}'::uuid[]) loop
  if exists(select 1 from public.server_members sm where sm.server_id=v_server_id and sm.user_id=v_target) then
   insert into public.message_mentions(message_id,recipient_id,mention_types,role_ids) values(v_message_id,v_target,array['user']::text[],'{}'::uuid[]) on conflict(message_id,recipient_id) do nothing;
   insert into public.notifications(recipient_id,actor_id,type,title,body,entity_id,interruptive) values(v_target,p_author_id,'mention','You were mentioned in Discord',left(coalesce(p_body,'Shared an attachment'),240),v_message_id,false);
  end if;
 end loop;
 return v_message_id;
end; $$;
revoke all on function public.create_discord_bridge_message(uuid,uuid,text,jsonb,jsonb,text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.create_discord_bridge_message(uuid,uuid,text,jsonb,jsonb,text,uuid,uuid[]) to service_role;
grant all on public.message_mentions,public.notifications to service_role;
