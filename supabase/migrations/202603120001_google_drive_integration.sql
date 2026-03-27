begin;

create table if not exists public.agency_integrations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  provider text not null check (provider in ('google_drive')),
  access_token text not null,
  refresh_token text not null,
  root_folder_id text,
  created_at timestamptz not null default now(),
  unique (agency_id, provider)
);

create index if not exists idx_agency_integrations_agency_provider
  on public.agency_integrations (agency_id, provider);

alter table public.jobs
  add column if not exists job_code text,
  add column if not exists drive_folder_id text,
  add column if not exists drive_folder_url text;

create unique index if not exists idx_jobs_agency_job_code
  on public.jobs (agency_id, job_code)
  where job_code is not null;

alter table public.agency_integrations enable row level security;

drop policy if exists "agency_integrations_select" on public.agency_integrations;
create policy "agency_integrations_select"
on public.agency_integrations
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_integrations_insert_admin" on public.agency_integrations;
create policy "agency_integrations_insert_admin"
on public.agency_integrations
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_integrations_update_admin" on public.agency_integrations;
create policy "agency_integrations_update_admin"
on public.agency_integrations
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

drop policy if exists "agency_integrations_delete_admin" on public.agency_integrations;
create policy "agency_integrations_delete_admin"
on public.agency_integrations
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

grant select, insert, update, delete on table public.agency_integrations to authenticated;

commit;
