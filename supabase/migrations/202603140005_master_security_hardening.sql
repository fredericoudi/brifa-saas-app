begin;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_agency_id uuid;
  role_value public.user_role;
  agency_role_value text;
  agency_name text;
  full_name text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));

  if new.raw_user_meta_data ? 'invited_agency_id' then
    new_agency_id := (new.raw_user_meta_data->>'invited_agency_id')::uuid;
    role_value := coalesce((new.raw_user_meta_data->>'invited_role')::public.user_role, 'member');
    agency_role_value := coalesce(nullif(trim(new.raw_user_meta_data->>'invited_agency_role'), ''), 'Outro');
  else
    agency_name := nullif(trim(new.raw_user_meta_data->>'agency_name'), '');
    if agency_name is null then
      agency_name := full_name || ' Agência';
    end if;

    insert into public.agencies (name, slug, plan, status)
    values (
      agency_name,
      public.generate_unique_agency_slug(agency_name),
      'starter',
      'active'
    )
    returning id into new_agency_id;

    role_value := 'admin';
    agency_role_value := coalesce(nullif(trim(new.raw_user_meta_data->>'agency_role'), ''), 'Outro');
  end if;

  insert into public.users (id, agency_id, name, email, role, agency_role, platform_role)
  values (new.id, new_agency_id, full_name, new.email, role_value, agency_role_value, 'normal_user');

  update public.team_invitations
  set accepted_at = now(),
      name = coalesce(nullif(name, ''), full_name),
      agency_role = coalesce(nullif(agency_role, ''), agency_role_value)
  where agency_id = new_agency_id
    and lower(email) = lower(new.email)
    and accepted_at is null;

  return new;
exception
  when others then
    raise warning 'handle_new_auth_user failed for %: %', new.email, sqlerrm;
    return new;
end;
$$;

create or replace function public.protect_platform_role_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role
    and coalesce(auth.role(), '') <> 'service_role'
    and public.current_platform_role() <> 'super_admin' then
    raise exception 'platform_role can only be changed by the platform super admin';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_platform_role_changes on public.users;
create trigger protect_platform_role_changes
before update on public.users
for each row
execute function public.protect_platform_role_changes();

commit;
