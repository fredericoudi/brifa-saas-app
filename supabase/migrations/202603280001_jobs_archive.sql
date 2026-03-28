begin;

alter table public.jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users (id) on delete set null;

create index if not exists idx_jobs_agency_archived_at on public.jobs (agency_id, archived_at);
create index if not exists idx_jobs_archived_by on public.jobs (archived_by);

commit;
