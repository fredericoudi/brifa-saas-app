begin;

create extension if not exists unaccent;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type public.platform_role as enum ('super_admin', 'normal_user');
  end if;

  if not exists (select 1 from pg_type where typname = 'agency_status') then
    create type public.agency_status as enum ('active', 'inactive', 'suspended', 'trial');
  end if;

  if not exists (select 1 from pg_type where typname = 'agency_invitation_type') then
    create type public.agency_invitation_type as enum ('agency_admin_activation', 'team_invitation');
  end if;

  if not exists (select 1 from pg_type where typname = 'agency_invitation_status') then
    create type public.agency_invitation_status as enum ('pending', 'used', 'expired', 'cancelled');
  end if;
end $$;

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.generate_unique_agency_slug(base_name text, ignore_agency_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_base text;
  candidate text;
  suffix integer := 1;
begin
  normalized_base := coalesce(nullif(public.slugify(base_name), ''), 'agencia');
  candidate := normalized_base;

  while exists (
    select 1
    from public.agencies a
    where a.slug = candidate
      and (ignore_agency_id is null or a.id <> ignore_agency_id)
  ) loop
    suffix := suffix + 1;
    candidate := normalized_base || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

alter table public.agencies
  add column if not exists slug text,
  add column if not exists status public.agency_status not null default 'active',
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

with prepared as (
  select
    id,
    coalesce(nullif(public.slugify(name), ''), 'agencia') as base_slug,
    row_number() over (
      partition by coalesce(nullif(public.slugify(name), ''), 'agencia')
      order by created_at, id
    ) as row_num
  from public.agencies
)
update public.agencies a
set slug = case
  when prepared.row_num = 1 then prepared.base_slug
  else prepared.base_slug || '-' || prepared.row_num
end
from prepared
where a.id = prepared.id
  and (a.slug is null or trim(a.slug) = '');

alter table public.agencies
  alter column slug set not null;

create unique index if not exists idx_agencies_slug on public.agencies (slug);
create index if not exists idx_agencies_status on public.agencies (status);

alter table public.users
  add column if not exists platform_role public.platform_role not null default 'normal_user';

create index if not exists idx_users_platform_role on public.users (platform_role);

create or replace function public.current_platform_role()
returns public.platform_role
language sql
stable
security definer
set search_path = public
as $$
  select platform_role from public.users where id = auth.uid() limit 1;
$$;

create table if not exists public.agency_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text not null,
  name text,
  token text not null unique,
  invitation_type public.agency_invitation_type not null default 'agency_admin_activation',
  status public.agency_invitation_status not null default 'pending',
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agency_invitations_agency_status
  on public.agency_invitations (agency_id, status, created_at desc);

create unique index if not exists idx_agency_invitations_pending_activation
  on public.agency_invitations (agency_id, invitation_type)
  where invitation_type = 'agency_admin_activation'
    and status = 'pending';

drop trigger if exists set_agency_invitations_updated_at on public.agency_invitations;
create trigger set_agency_invitations_updated_at
before update on public.agency_invitations
for each row
execute function public.set_updated_at();

alter table public.agency_invitations enable row level security;

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
  platform_role_value public.platform_role;
  agency_name text;
  full_name text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));
  platform_role_value := case coalesce(new.raw_user_meta_data->>'platform_role', '')
    when 'super_admin' then 'super_admin'::public.platform_role
    else 'normal_user'::public.platform_role
  end;

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
  values (new.id, new_agency_id, full_name, new.email, role_value, agency_role_value, platform_role_value);

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

grant execute on function public.current_platform_role() to authenticated;

commit;
