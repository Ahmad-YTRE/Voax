-- Enforce Discord-style role hierarchy for custom server roles and member moderation.
-- Owners bypass hierarchy. Built-in admins rank above all custom roles, but cannot
-- manage owners or other admins. Custom role managers can only manage strictly lower ranks.

create or replace function private.server_role_position_for_user(target_server uuid, target_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = target_user
    ) then 2147483648::bigint
    when exists (
      select 1 from public.server_members sm
      where sm.server_id = target_server
        and sm.user_id = target_user
        and sm.role = 'admin'
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
$$;

create or replace function private.server_actor_role_position(target_server uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then -2147483648::bigint
    when exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    ) then 2147483648::bigint
    when exists (
      select 1 from public.server_members sm
      where sm.server_id = target_server
        and sm.user_id = auth.uid()
        and sm.role = 'admin'
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
$$;

create or replace function private.can_manage_server_member_hierarchy(target_server uuid, target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    )
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.server_members target_member
        where target_member.server_id = target_server
          and target_member.user_id = target_user
      )
      and (
        public.has_server_permission(target_server, 'manage_roles')
        or public.has_server_permission(target_server, 'kick_members')
        or public.is_server_admin(target_server)
      )
      and private.server_actor_role_position(target_server)
        > private.server_role_position_for_user(target_server, target_user)
    ),
    false
  );
$$;

create or replace function private.can_manage_server_role(target_server uuid, target_role uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    )
    or (
      auth.uid() is not null
      and public.has_server_permission(target_server, 'manage_roles')
      and private.server_actor_role_position(target_server) > (
        select sr.position::bigint
        from public.server_roles sr
        where sr.id = target_role and sr.server_id = target_server
      )
    ),
    false
  );
$$;

create or replace function private.server_actor_can_grant_role_permissions(target_server uuid, target_permissions jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    )
    or (
      auth.uid() is not null
      and public.has_server_permission(target_server, 'manage_roles')
      and not exists (
        select 1
        from jsonb_each(coalesce(target_permissions, '{}'::jsonb)) permission
        where permission.value = 'true'::jsonb
          and (
            permission.key in ('manage_roles', 'manage_server')
            or not public.has_server_permission(target_server, permission.key)
          )
      )
    ),
    false
  );
$$;

create or replace function private.can_create_server_role(target_server uuid, target_position integer, target_permissions jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    )
    or (
      auth.uid() is not null
      and public.has_server_permission(target_server, 'manage_roles')
      and target_position::bigint < private.server_actor_role_position(target_server)
      and private.server_actor_can_grant_role_permissions(target_server, target_permissions)
    ),
    false
  );
$$;

create or replace function private.can_update_server_role(target_server uuid, target_position integer, target_permissions jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.servers s
      where s.id = target_server and s.created_by = auth.uid()
    )
    or (
      auth.uid() is not null
      and public.has_server_permission(target_server, 'manage_roles')
      and target_position::bigint < private.server_actor_role_position(target_server)
      and private.server_actor_can_grant_role_permissions(target_server, target_permissions)
    ),
    false
  );
$$;

revoke all on function private.server_role_position_for_user(uuid, uuid) from public, anon;
revoke all on function private.server_actor_role_position(uuid) from public, anon;
revoke all on function private.can_manage_server_member_hierarchy(uuid, uuid) from public, anon;
revoke all on function private.can_manage_server_role(uuid, uuid) from public, anon;
revoke all on function private.server_actor_can_grant_role_permissions(uuid, jsonb) from public, anon;
revoke all on function private.can_create_server_role(uuid, integer, jsonb) from public, anon;
revoke all on function private.can_update_server_role(uuid, integer, jsonb) from public, anon;
grant execute on function private.server_role_position_for_user(uuid, uuid) to authenticated;
grant execute on function private.server_actor_role_position(uuid) to authenticated;
grant execute on function private.can_manage_server_member_hierarchy(uuid, uuid) to authenticated;
grant execute on function private.can_manage_server_role(uuid, uuid) to authenticated;
grant execute on function private.server_actor_can_grant_role_permissions(uuid, jsonb) to authenticated;
grant execute on function private.can_create_server_role(uuid, integer, jsonb) to authenticated;
grant execute on function private.can_update_server_role(uuid, integer, jsonb) to authenticated;

drop policy if exists "admins create server roles" on public.server_roles;
create policy "admins create server roles"
on public.server_roles for insert to authenticated
with check (private.can_create_server_role(server_id, position, permissions));

drop policy if exists "admins update server roles" on public.server_roles;
create policy "admins update server roles"
on public.server_roles for update to authenticated
using (private.can_manage_server_role(server_id, id))
with check (private.can_update_server_role(server_id, position, permissions));

drop policy if exists "admins delete server roles" on public.server_roles;
create policy "admins delete server roles"
on public.server_roles for delete to authenticated
using (private.can_manage_server_role(server_id, id));

drop policy if exists "admins assign server roles" on public.server_member_roles;
create policy "admins assign server roles"
on public.server_member_roles for insert to authenticated
with check (
  private.can_manage_server_member_hierarchy(server_id, user_id)
  and private.can_manage_server_role(server_id, role_id)
  and (
    user_id <> (select auth.uid())
    or exists (
      select 1 from public.servers s
      where s.id = server_member_roles.server_id
        and s.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "role managers delete assigned roles" on public.server_member_roles;
create policy "role managers delete assigned roles"
on public.server_member_roles for delete to authenticated
using (
  private.can_manage_server_member_hierarchy(server_id, user_id)
  and private.can_manage_server_role(server_id, role_id)
);

drop policy if exists "admins update member roles" on public.server_members;
create policy "admins update member roles"
on public.server_members for update to authenticated
using (
  is_server_admin(server_id)
  and user_id <> (select auth.uid())
  and private.can_manage_server_member_hierarchy(server_id, user_id)
)
with check (
  is_server_admin(server_id)
  and user_id <> (select auth.uid())
  and private.can_manage_server_member_hierarchy(server_id, user_id)
  and role = any (array['admin'::text, 'member'::text])
  and (
    role = 'member'
    or exists (
      select 1 from public.servers s
      where s.id = server_members.server_id
        and s.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "users leave server or admins manage members" on public.server_members;
create policy "users leave server or admins manage members"
on public.server_members for delete to authenticated
using (
  user_id = (select auth.uid())
  or (
    public.has_server_permission(server_id, 'kick_members')
    and private.can_manage_server_member_hierarchy(server_id, user_id)
  )
);
