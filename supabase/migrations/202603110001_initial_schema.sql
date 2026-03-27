begin;

create extension if not exists pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agency_plan') THEN
    CREATE TYPE public.agency_plan AS ENUM ('starter', 'growth', 'pro');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'member');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE public.job_status AS ENUM ('briefing', 'criacao', 'revisao', 'aprovado', 'finalizado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE public.task_priority AS ENUM ('baixa', 'media', 'alta');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE public.task_status AS ENUM ('a_fazer', 'em_andamento', 'revisao', 'concluido');
  END IF;
END $$;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan public.agency_plan not null default 'starter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  email text not null,
  role public.user_role not null default 'member',
  weekly_capacity_hours numeric(8,2) not null default 40 check (weekly_capacity_hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, email),
  unique (id, agency_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id)
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  client_id uuid not null,
  title text not null,
  description text,
  status public.job_status not null default 'briefing',
  due_date date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, agency_id),
  constraint jobs_client_agency_fkey
    foreign key (client_id, agency_id)
    references public.clients (id, agency_id)
    on delete restrict
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  job_id uuid not null,
  title text not null,
  description text,
  assigned_to uuid references public.users (id) on delete set null,
  priority public.task_priority not null default 'media',
  status public.task_status not null default 'a_fazer',
  estimated_hours numeric(8,2) not null default 1 check (estimated_hours >= 0),
  due_date date,
  position integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_job_agency_fkey
    foreign key (job_id, agency_id)
    references public.jobs (id, agency_id)
    on delete cascade
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  invited_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (agency_id, email)
);

create index if not exists idx_users_agency_id on public.users (agency_id);
create index if not exists idx_clients_agency_id on public.clients (agency_id);
create index if not exists idx_jobs_agency_status on public.jobs (agency_id, status);
create index if not exists idx_jobs_due_date on public.jobs (due_date);
create index if not exists idx_tasks_agency_status on public.tasks (agency_id, status);
create index if not exists idx_tasks_assigned_to on public.tasks (assigned_to);
create index if not exists idx_tasks_due_date on public.tasks (due_date);
create index if not exists idx_tasks_job_id on public.tasks (job_id);
create index if not exists idx_team_invitations_agency on public.team_invitations (agency_id, accepted_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_agency_id uuid;
  role_value public.user_role;
  agency_name text;
  full_name text;
begin
  full_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1));

  if new.raw_user_meta_data ? 'invited_agency_id' then
    new_agency_id := (new.raw_user_meta_data->>'invited_agency_id')::uuid;
    role_value := coalesce((new.raw_user_meta_data->>'invited_role')::public.user_role, 'member');
  else
    agency_name := nullif(trim(new.raw_user_meta_data->>'agency_name'), '');
    if agency_name is null then
      agency_name := full_name || ' Agência';
    end if;

    insert into public.agencies (name, plan)
    values (agency_name, 'starter')
    returning id into new_agency_id;

    role_value := 'admin';
  end if;

  insert into public.users (id, agency_id, name, email, role)
  values (new.id, new_agency_id, full_name, new.email, role_value);

  update public.team_invitations
  set accepted_at = now()
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

create or replace function public.validate_job_user_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.created_by
        and u.agency_id = new.agency_id
    ) then
    raise exception 'created_by must belong to the same agency';
  end if;

  return new;
end;
$$;

create or replace function public.validate_task_assignee_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_to is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.assigned_to
        and u.agency_id = new.agency_id
    ) then
    raise exception 'assigned_to must belong to the same agency';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

drop trigger if exists set_agencies_updated_at on public.agencies;
create trigger set_agencies_updated_at
before update on public.agencies
for each row
execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row
execute function public.set_updated_at();

drop trigger if exists validate_jobs_agency_consistency on public.jobs;
create trigger validate_jobs_agency_consistency
before insert or update on public.jobs
for each row
execute function public.validate_job_user_agency();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists validate_tasks_assignee_agency on public.tasks;
create trigger validate_tasks_assignee_agency
before insert or update on public.tasks
for each row
execute function public.validate_task_assignee_agency();

alter table public.agencies enable row level security;
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
alter table public.tasks enable row level security;
alter table public.team_invitations enable row level security;

drop policy if exists "agencies_select" on public.agencies;
create policy "agencies_select"
on public.agencies
for select
to authenticated
using (id = public.current_agency_id());

drop policy if exists "agencies_update_admin" on public.agencies;
create policy "agencies_update_admin"
on public.agencies
for update
to authenticated
using (
  id = public.current_agency_id()
  and public.current_user_role() = 'admin'
)
with check (
  id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "users_select_same_agency" on public.users;
create policy "users_select_same_agency"
on public.users
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "users_update_self_or_admin" on public.users;
create policy "users_update_self_or_admin"
on public.users
for update
to authenticated
using (
  agency_id = public.current_agency_id()
  and (id = auth.uid() or public.current_user_role() = 'admin')
)
with check (
  agency_id = public.current_agency_id()
  and (id = auth.uid() or public.current_user_role() = 'admin')
);

drop policy if exists "users_delete_admin" on public.users;
create policy "users_delete_admin"
on public.users
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
  and id <> auth.uid()
);

drop policy if exists "clients_select" on public.clients;
create policy "clients_select"
on public.clients
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert"
on public.clients
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "clients_update" on public.clients;
create policy "clients_update"
on public.clients
for update
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete"
on public.clients
for delete
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "jobs_select" on public.jobs;
create policy "jobs_select"
on public.jobs
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "jobs_insert" on public.jobs;
create policy "jobs_insert"
on public.jobs
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "jobs_update" on public.jobs;
create policy "jobs_update"
on public.jobs
for update
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "jobs_delete" on public.jobs;
create policy "jobs_delete"
on public.jobs
for delete
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
for update
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete"
on public.tasks
for delete
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "team_invitations_select_admin" on public.team_invitations;
create policy "team_invitations_select_admin"
on public.team_invitations
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "team_invitations_insert_admin" on public.team_invitations;
create policy "team_invitations_insert_admin"
on public.team_invitations
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "team_invitations_update_admin" on public.team_invitations;
create policy "team_invitations_update_admin"
on public.team_invitations
for update
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
)
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "team_invitations_delete_admin" on public.team_invitations;
create policy "team_invitations_delete_admin"
on public.team_invitations
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_agency_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

commit;
