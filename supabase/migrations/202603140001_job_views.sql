begin;

create table if not exists public.job_views (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (job_id, user_id)
);

create index if not exists idx_job_views_agency_job on public.job_views (agency_id, job_id);
create index if not exists idx_job_views_user on public.job_views (user_id);

create or replace function public.validate_job_view_agency()
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

drop trigger if exists validate_job_view_agency on public.job_views;
create trigger validate_job_view_agency
before insert or update on public.job_views
for each row
execute function public.validate_job_view_agency();

alter table public.job_views enable row level security;

drop policy if exists "job_views_select" on public.job_views;
create policy "job_views_select"
on public.job_views
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "job_views_insert_own" on public.job_views;
create policy "job_views_insert_own"
on public.job_views
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and user_id = auth.uid()
);

grant select, insert on table public.job_views to authenticated;

commit;
