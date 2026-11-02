alter table public.ticket_panels
  add column if not exists embed_color text not null default '#5865F2',
  add column if not exists image_url text;
alter table public.ticket_panels drop constraint if exists ticket_panels_embed_color_check;
alter table public.ticket_panels add constraint ticket_panels_embed_color_check check (embed_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.ticket_panels drop constraint if exists ticket_panels_image_url_check;
alter table public.ticket_panels add constraint ticket_panels_image_url_check check (image_url is null or image_url ~ '^https?://');

drop function if exists public.save_ticket_panel(uuid,text,text,text,text,jsonb,uuid[],boolean,boolean,boolean);
create or replace function public.save_ticket_panel(
  p_channel_id uuid,p_title text,p_description text,p_button_label text,p_welcome_message text,
  p_embed_color text,p_image_url text,p_categories jsonb,p_support_role_ids uuid[],
  p_allow_user_close boolean,p_allow_claim boolean,p_save_transcripts boolean
) returns void language plpgsql security definer set search_path=public,auth as $$
declare v_server_id uuid; v_support_role_ids uuid[]:=coalesce(p_support_role_ids,'{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  select server_id into v_server_id from public.ticket_panels where channel_id=p_channel_id for update;
  if v_server_id is null then raise exception 'Ticket panel not found.' using errcode='P0002'; end if;
  if not public.has_server_permission(v_server_id,'manage_channels') then raise exception 'You do not have permission to manage this ticket panel.' using errcode='42501'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 or char_length(coalesce(p_description,''))>500
    or p_button_label is null or char_length(btrim(p_button_label)) not between 1 and 40 or char_length(coalesce(p_welcome_message,''))>2000
    or coalesce(p_embed_color,'') !~ '^#[0-9A-Fa-f]{6}$' or (p_image_url is not null and p_image_url !~ '^https?://')
    or jsonb_typeof(coalesce(p_categories,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_categories,'[]'::jsonb))>12 then
    raise exception 'Invalid ticket panel settings.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(v_support_role_ids) role_id where not exists(select 1 from public.server_roles sr where sr.id=role_id and sr.server_id=v_server_id)) then
    raise exception 'One or more support roles do not belong to this server.' using errcode='22023';
  end if;
  update public.ticket_panels set title=btrim(p_title),description=coalesce(p_description,''),button_label=btrim(p_button_label),
    welcome_message=coalesce(p_welcome_message,''),embed_color=p_embed_color,image_url=nullif(btrim(p_image_url),''),
    categories=coalesce(p_categories,'[]'::jsonb),support_role_ids=v_support_role_ids,
    allow_user_close=coalesce(p_allow_user_close,true),allow_claim=coalesce(p_allow_claim,true),
    save_transcripts=coalesce(p_save_transcripts,true),updated_at=now() where channel_id=p_channel_id;
  delete from public.channel_permission_overwrites o using public.tickets t
  where t.panel_channel_id=p_channel_id and o.channel_id=t.channel_id and o.target_type='role';
  insert into public.channel_permission_overwrites(server_id,channel_id,target_type,target_id,allow_permissions)
  select t.server_id,t.channel_id,'role',role_id,array['view_channel','send_messages','read_message_history']
  from public.tickets t cross join unnest(v_support_role_ids) role_id where t.panel_channel_id=p_channel_id;
end;
$$;
revoke all on function public.save_ticket_panel(uuid,text,text,text,text,text,text,jsonb,uuid[],boolean,boolean,boolean) from public,anon;
grant execute on function public.save_ticket_panel(uuid,text,text,text,text,text,text,jsonb,uuid[],boolean,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';