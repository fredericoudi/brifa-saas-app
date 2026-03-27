drop policy if exists "jobs_insert" on public.jobs;
create policy "jobs_insert"
on public.jobs
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "jobs_update" on public.jobs;
create policy "jobs_update"
on public.jobs
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

drop policy if exists "jobs_delete" on public.jobs;
create policy "jobs_delete"
on public.jobs
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
on public.tasks
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

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete"
on public.tasks
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "task_assignees_insert" on public.task_assignees;
create policy "task_assignees_insert"
on public.task_assignees
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "task_assignees_update" on public.task_assignees;
create policy "task_assignees_update"
on public.task_assignees
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

drop policy if exists "task_assignees_delete" on public.task_assignees;
create policy "task_assignees_delete"
on public.task_assignees
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "job_events_insert" on public.job_events;
create policy "job_events_insert"
on public.job_events
for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  and exists (
    select 1
    from public.jobs j
    where j.id = job_events.job_id
      and j.agency_id = public.current_agency_id()
  )
);
