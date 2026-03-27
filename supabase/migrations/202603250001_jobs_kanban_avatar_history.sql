begin;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_participation_end_reason') THEN
    CREATE TYPE public.job_participation_end_reason AS ENUM ('completed', 'removed', 'finished_job');
  END IF;
END $$;

alter table public.users
  add column if not exists avatar_url text;

create table if not exists public.job_participants_history (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  user_name text not null,
  task_title text,
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  start_job_status public.job_status not null,
  latest_job_status public.job_status,
  start_task_status public.task_status,
  latest_task_status public.task_status,
  end_reason public.job_participation_end_reason,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_participants_history_agency on public.job_participants_history (agency_id, assigned_at desc);
create index if not exists idx_job_participants_history_job on public.job_participants_history (job_id, assigned_at desc);
create index if not exists idx_job_participants_history_user on public.job_participants_history (user_id, assigned_at desc);
create index if not exists idx_job_participants_history_task on public.job_participants_history (task_id);
create index if not exists idx_job_participants_history_active_job on public.job_participants_history (job_id, is_active);
create unique index if not exists idx_job_participants_history_active_task_user
  on public.job_participants_history (task_id, user_id)
  where is_active = true and task_id is not null and user_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-assets',
  'user-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user_assets_public_read" on storage.objects;
create policy "user_assets_public_read"
on storage.objects
for select
to public
using (bucket_id = 'user-assets');

drop policy if exists "user_assets_insert_own" on storage.objects;
create policy "user_assets_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user_assets_update_own" on storage.objects;
create policy "user_assets_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "user_assets_delete_own" on storage.objects;
create policy "user_assets_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.validate_job_participants_history_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.jobs j
    where j.id = new.job_id
      and j.agency_id = new.agency_id
  ) then
    raise exception 'job must belong to the same agency';
  end if;

  if new.task_id is not null
    and not exists (
      select 1
      from public.tasks t
      where t.id = new.task_id
        and t.job_id = new.job_id
        and t.agency_id = new.agency_id
    ) then
    raise exception 'task must belong to the same agency and job';
  end if;

  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'user must belong to the same agency';
  end if;

  return new;
end;
$$;

create or replace function public.capture_job_participation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record record;
  job_record record;
  user_record record;
  assigned_at_value timestamptz;
  started_at_value timestamptz;
  ended_at_value timestamptz;
  end_reason_value public.job_participation_end_reason;
  active_value boolean := true;
begin
  if exists (
    select 1
    from public.job_participants_history history
    where history.task_id = new.task_id
      and history.user_id = new.user_id
      and history.is_active = true
  ) then
    return new;
  end if;

  select t.id, t.agency_id, t.job_id, t.title, t.status
  into task_record
  from public.tasks t
  where t.id = new.task_id;

  if task_record.id is null then
    return new;
  end if;

  select j.id, j.status
  into job_record
  from public.jobs j
  where j.id = task_record.job_id;

  select u.id, u.name
  into user_record
  from public.users u
  where u.id = new.user_id;

  if job_record.id is null or user_record.id is null then
    return new;
  end if;

  assigned_at_value := coalesce(new.created_at, now());

  if task_record.status = 'em_andamento' then
    started_at_value := assigned_at_value;
  end if;

  if task_record.status = 'concluido' then
    active_value := false;
    ended_at_value := now();
    end_reason_value := 'completed';
  elsif job_record.status = 'finalizado' then
    active_value := false;
    ended_at_value := now();
    end_reason_value := 'finished_job';
  end if;

  insert into public.job_participants_history (
    agency_id,
    job_id,
    task_id,
    user_id,
    user_name,
    task_title,
    assigned_at,
    started_at,
    ended_at,
    start_job_status,
    latest_job_status,
    start_task_status,
    latest_task_status,
    end_reason,
    is_active
  )
  values (
    task_record.agency_id,
    task_record.job_id,
    task_record.id,
    user_record.id,
    user_record.name,
    task_record.title,
    assigned_at_value,
    started_at_value,
    ended_at_value,
    job_record.status,
    job_record.status,
    task_record.status,
    task_record.status,
    end_reason_value,
    active_value
  );

  return new;
end;
$$;

create or replace function public.capture_job_participation_assignment_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_record record;
  job_record record;
  fallback_reason public.job_participation_end_reason := 'removed';
begin
  select t.id, t.status, t.job_id
  into task_record
  from public.tasks t
  where t.id = old.task_id;

  if task_record.id is not null then
    select j.status
    into job_record
    from public.jobs j
    where j.id = task_record.job_id;

    if job_record.status = 'finalizado' then
      fallback_reason := 'finished_job';
    end if;
  end if;

  update public.job_participants_history history
  set ended_at = coalesce(history.ended_at, now()),
      end_reason = coalesce(history.end_reason, fallback_reason),
      latest_task_status = coalesce(task_record.status, history.latest_task_status),
      latest_job_status = coalesce(job_record.status, history.latest_job_status),
      is_active = false,
      updated_at = now()
  where history.task_id = old.task_id
    and history.user_id = old.user_id
    and history.is_active = true;

  return old;
end;
$$;

create or replace function public.capture_job_participation_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_job_status public.job_status;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select j.status
  into current_job_status
  from public.jobs j
  where j.id = new.job_id;

  update public.job_participants_history history
  set latest_task_status = new.status,
      latest_job_status = coalesce(current_job_status, history.latest_job_status),
      started_at = case
        when new.status = 'em_andamento' and history.started_at is null then now()
        else history.started_at
      end,
      ended_at = case
        when new.status = 'concluido' and history.ended_at is null then now()
        else history.ended_at
      end,
      end_reason = case
        when new.status = 'concluido' and history.end_reason is null then 'completed'::public.job_participation_end_reason
        else history.end_reason
      end,
      is_active = case
        when new.status = 'concluido' then false
        else history.is_active
      end,
      updated_at = now()
  where history.task_id = new.id
    and history.is_active = true;

  return new;
end;
$$;

create or replace function public.capture_job_participation_job_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'finalizado' then
    update public.job_participants_history history
    set latest_job_status = new.status,
        ended_at = coalesce(history.ended_at, now()),
        end_reason = coalesce(history.end_reason, 'finished_job'::public.job_participation_end_reason),
        is_active = false,
        updated_at = now()
    where history.job_id = new.id
      and history.is_active = true;
  else
    update public.job_participants_history history
    set latest_job_status = new.status,
        updated_at = now()
    where history.job_id = new.id
      and history.is_active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists set_job_participants_history_updated_at on public.job_participants_history;
create trigger set_job_participants_history_updated_at
before update on public.job_participants_history
for each row
execute function public.set_updated_at();

drop trigger if exists validate_job_participants_history_agency on public.job_participants_history;
create trigger validate_job_participants_history_agency
before insert or update on public.job_participants_history
for each row
execute function public.validate_job_participants_history_agency();

drop trigger if exists capture_job_participation_assignment on public.task_assignees;
create trigger capture_job_participation_assignment
after insert on public.task_assignees
for each row
execute function public.capture_job_participation_assignment();

drop trigger if exists capture_job_participation_assignment_removal on public.task_assignees;
create trigger capture_job_participation_assignment_removal
before delete on public.task_assignees
for each row
execute function public.capture_job_participation_assignment_removal();

drop trigger if exists capture_job_participation_task_status on public.tasks;
create trigger capture_job_participation_task_status
after update of status on public.tasks
for each row
execute function public.capture_job_participation_task_status();

drop trigger if exists capture_job_participation_job_status on public.jobs;
create trigger capture_job_participation_job_status
after update of status on public.jobs
for each row
execute function public.capture_job_participation_job_status();

insert into public.job_participants_history (
  agency_id,
  job_id,
  task_id,
  user_id,
  user_name,
  task_title,
  assigned_at,
  started_at,
  ended_at,
  start_job_status,
  latest_job_status,
  start_task_status,
  latest_task_status,
  end_reason,
  is_active
)
select
  ta.agency_id,
  t.job_id,
  t.id,
  u.id,
  u.name,
  t.title,
  ta.created_at,
  case
    when t.status = 'em_andamento' then ta.created_at
    else null
  end,
  case
    when t.status = 'concluido' then coalesce(t.updated_at, ta.created_at)
    when j.status = 'finalizado' then coalesce(t.updated_at, ta.created_at)
    else null
  end,
  j.status,
  j.status,
  t.status,
  t.status,
  case
    when t.status = 'concluido' then 'completed'::public.job_participation_end_reason
    when j.status = 'finalizado' then 'finished_job'::public.job_participation_end_reason
    else null
  end,
  case
    when t.status = 'concluido' then false
    when j.status = 'finalizado' then false
    else true
  end
from public.task_assignees ta
join public.tasks t on t.id = ta.task_id
join public.jobs j on j.id = t.job_id
join public.users u on u.id = ta.user_id
where not exists (
  select 1
  from public.job_participants_history history
  where history.task_id = ta.task_id
    and history.user_id = ta.user_id
);

alter table public.job_participants_history enable row level security;

drop policy if exists "job_participants_history_select" on public.job_participants_history;
create policy "job_participants_history_select"
on public.job_participants_history
for select
to authenticated
using (agency_id = public.current_agency_id());

grant select on table public.job_participants_history to authenticated;

commit;
