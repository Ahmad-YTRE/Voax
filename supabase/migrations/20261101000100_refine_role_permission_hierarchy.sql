-- Allow role managers to preserve permissions already present on a lower role,
-- while preventing them from newly granting permissions they do not hold.
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
    ),
    false
  );
$$;

create or replace function private.guard_server_role_permission_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permission record;
begin
  if exists (
    select 1 from public.servers s
    where s.id = new.server_id and s.created_by = auth.uid()
  ) then
    return new;
  end if;

  for permission in
    select key, value
    from jsonb_each(coalesce(new.permissions, '{}'::jsonb))
    where value = 'true'::jsonb
  loop
    if coalesce(old.permissions -> permission.key, 'false'::jsonb) <> 'true'::jsonb
      and (
        permission.key in ('manage_roles', 'manage_server')
        or not public.has_server_permission(new.server_id, permission.key)
      )
    then
      raise exception 'You cannot grant a role permission you do not have: %', permission.key
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.guard_server_role_permission_grants() from public, anon;
drop trigger if exists enforce_server_role_permission_grants on public.server_roles;
create trigger enforce_server_role_permission_grants
before update of permissions on public.server_roles
for each row execute function private.guard_server_role_permission_grants();
