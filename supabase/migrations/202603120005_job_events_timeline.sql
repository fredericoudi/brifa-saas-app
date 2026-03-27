begin;

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  event_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_events_job_date on public.job_events (job_id, created_at desc);
create index if not exists idx_job_events_user on public.job_events (user_id);

create or replace function public.validate_job_events_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  event_agency_id uuid;
begin
  select agency_id
  into event_agency_id
  from public.jobs
  where id = new.job_id;

  if event_agency_id is null then
    raise exception 'job not found';
  end if;

  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = event_agency_id
    ) then
    raise exception 'user must belong to the same agency as the job';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_job_events_agency on public.job_events;
create trigger validate_job_events_agency
before insert or update on public.job_events
for each row
execute function public.validate_job_events_agency();

insert into public.job_events (job_id, user_id, event_type, description, created_at)
select
  old_events.job_id,
  old_events.actor_id,
  case
    when lower(old_events.action) like '%job criado%' then 'job_created'
    when lower(old_events.action) like '%responsável%' then 'assignee_defined'
    when lower(old_events.action) like '%tarefa criada%' then 'task_created'
    when lower(old_events.action) like '%tarefa concluída%' then 'task_completed'
    when lower(old_events.action) like '%briefing%' then 'briefing_updated'
    when lower(old_events.action) like '%status%' then 'job_status_changed'
    when lower(old_events.action) like '%pasta%' then 'file_attached'
    else 'task_edited'
  end as event_type,
  coalesce(
    nullif(old_events.metadata->>'titulo', ''),
    nullif(old_events.metadata->>'tarefa', ''),
    nullif(old_events.metadata->>'url', ''),
    old_events.action
  ) as description,
  old_events.created_at
from public.job_timeline_events old_events
where not exists (
  select 1
  from public.job_events new_events
  where new_events.job_id = old_events.job_id
    and coalesce(new_events.user_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(old_events.actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and new_events.description = coalesce(
      nullif(old_events.metadata->>'titulo', ''),
      nullif(old_events.metadata->>'tarefa', ''),
      nullif(old_events.metadata->>'url', ''),
      old_events.action
    )
    and new_events.created_at = old_events.created_at
);

alter table public.job_events enable row level security;

drop policy if exists "job_events_select" on public.job_events;
create policy "job_events_select"
on public.job_events
for select
to authenticated
using (
  exists (
    select 1
    from public.jobs j
    where j.id = job_events.job_id
      and j.agency_id = public.current_agency_id()
  )
);

drop policy if exists "job_events_insert" on public.job_events;
create policy "job_events_insert"
on public.job_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.jobs j
    where j.id = job_events.job_id
      and j.agency_id = public.current_agency_id()
  )
);

drop policy if exists "job_events_delete_admin" on public.job_events;
create policy "job_events_delete_admin"
on public.job_events
for delete
to authenticated
using (
  public.current_user_role() = 'admin'
  and exists (
    select 1
    from public.jobs j
    where j.id = job_events.job_id
      and j.agency_id = public.current_agency_id()
  )
);

grant select, insert, delete on table public.job_events to authenticated;

commit;
