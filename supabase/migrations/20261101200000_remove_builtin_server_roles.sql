-- Remove the legacy built-in server membership roles. Ownership is derived only
-- from servers.created_by; all other authority comes from custom server roles.
update public.server_members set role = 'member' where role <> 'member';

alter table public.server_members alter column role set default 'member';
alter table public.server_members drop constraint if exists server_members_role_check;
alter table public.server_members add constraint server_members_role_check check (role = 'member');

drop policy if exists "admins update member roles" on public.server_members;
drop policy if exists "creator joins own server" on public.server_members;
create policy "creator joins own server"
on public.server_members
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'member'
  and exists (
    select 1 from public.servers s
    where s.id = server_members.server_id
      and s.created_by = (select auth.uid())
  )
);

create or replace function public.is_server_admin(target_server uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.servers s
    where s.id = target_server and s.created_by = auth.uid()
  );
$function$;

create or replace function public.has_server_permission(target_server uuid, permission_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.server_members sm
      where sm.server_id = target_server
        and sm.user_id = auth.uid()
        and (
          exists (
            select 1 from public.servers s
            where s.id = target_server and s.created_by = auth.uid()
          )
          or exists (
            select 1
            from public.server_member_roles smr
            join public.server_roles sr
              on sr.id = smr.role_id and sr.server_id = smr.server_id
            where smr.server_id = target_server
              and smr.user_id = auth.uid()
              and coalesce((sr.permissions ->> permission_name)::boolean, false)
          )
        )
    ),
    false
  );
$function$;

create or replace function private.server_actor_role_position(target_server uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when auth.uid() is null then -2147483648::bigint
    when exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    ) then 2147483648::bigint
    else coalesce((
      select max(sr.position)::bigint
      from public.server_member_roles smr
      join public.server_roles sr
        on sr.id = smr.role_id and sr.server_id = smr.server_id
      where smr.server_id = target_server
        and smr.user_id = auth.uid()
    ), -2147483648::bigint)
  end;
$function$;

create or replace function private.server_role_position_for_user(target_server uuid, target_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = target_user
    ) then 2147483648::bigint
    else coalesce((
      select max(sr.position)::bigint
      from public.server_member_roles smr
      join public.server_roles sr
        on sr.id = smr.role_id and sr.server_id = smr.server_id
      where smr.server_id = target_server
        and smr.user_id = target_user
    ), -2147483648::bigint)
  end;
$function$;
