begin;

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table if not exists public.job_timeline_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  action text not null,
  actor_id uuid references public.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_assignees_agency on public.task_assignees (agency_id);
create index if not exists idx_task_assignees_task on public.task_assignees (task_id);
create index if not exists idx_task_assignees_user on public.task_assignees (user_id);
create index if not exists idx_job_timeline_job_date on public.job_timeline_events (job_id, created_at desc);
create index if not exists idx_job_timeline_agency on public.job_timeline_events (agency_id, created_at desc);

insert into public.task_assignees (agency_id, task_id, user_id)
select t.agency_id, t.id, t.assigned_to
from public.tasks t
where t.assigned_to is not null
on conflict (task_id, user_id) do nothing;

create or replace function public.validate_task_assignee_link_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tasks t
    where t.id = new.task_id
      and t.agency_id = new.agency_id
  ) then
    raise exception 'task must belong to the same agency';
  end if;

  if not exists (
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

create or replace function public.validate_job_timeline_agency()
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

  if new.actor_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.actor_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'actor must belong to the same agency';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_task_assignee_link_agency on public.task_assignees;
create trigger validate_task_assignee_link_agency
before insert or update on public.task_assignees
for each row
execute function public.validate_task_assignee_link_agency();

drop trigger if exists validate_job_timeline_agency on public.job_timeline_events;
create trigger validate_job_timeline_agency
before insert or update on public.job_timeline_events
for each row
execute function public.validate_job_timeline_agency();

alter table public.task_assignees enable row level security;
alter table public.job_timeline_events enable row level security;

drop policy if exists "task_assignees_select" on public.task_assignees;
create policy "task_assignees_select"
on public.task_assignees
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "task_assignees_insert" on public.task_assignees;
create policy "task_assignees_insert"
on public.task_assignees
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "task_assignees_update" on public.task_assignees;
create policy "task_assignees_update"
on public.task_assignees
for update
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "task_assignees_delete" on public.task_assignees;
create policy "task_assignees_delete"
on public.task_assignees
for delete
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "job_timeline_select" on public.job_timeline_events;
create policy "job_timeline_select"
on public.job_timeline_events
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "job_timeline_insert" on public.job_timeline_events;
create policy "job_timeline_insert"
on public.job_timeline_events
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "job_timeline_delete_admin" on public.job_timeline_events;
create policy "job_timeline_delete_admin"
on public.job_timeline_events
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

grant select, insert, update, delete on table public.task_assignees to authenticated;
grant select, insert, delete on table public.job_timeline_events to authenticated;

commit;
