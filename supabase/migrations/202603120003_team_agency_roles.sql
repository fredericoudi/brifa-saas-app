begin;

alter table public.users
  add column if not exists agency_role text;

update public.users
set agency_role = 'Outro'
where agency_role is null or trim(agency_role) = '';

alter table public.users
  alter column agency_role set default 'Outro',
  alter column agency_role set not null;

alter table public.team_invitations
  add column if not exists name text,
  add column if not exists agency_role text;

update public.team_invitations
set name = split_part(email, '@', 1)
where name is null or trim(name) = '';

update public.team_invitations
set agency_role = 'Outro'
where agency_role is null or trim(agency_role) = '';

alter table public.team_invitations
  alter column name set not null,
  alter column agency_role set default 'Outro',
  alter column agency_role set not null;

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

    insert into public.agencies (name, plan)
    values (agency_name, 'starter')
    returning id into new_agency_id;

    role_value := 'admin';
    agency_role_value := coalesce(nullif(trim(new.raw_user_meta_data->>'agency_role'), ''), 'Outro');
  end if;

  insert into public.users (id, agency_id, name, email, role, agency_role)
  values (new.id, new_agency_id, full_name, new.email, role_value, agency_role_value);

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

commit;
