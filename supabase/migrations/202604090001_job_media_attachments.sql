begin;

create table if not exists public.job_media_files (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_media_files_job_created_at
  on public.job_media_files (job_id, created_at desc);

create index if not exists idx_job_media_files_agency_created_at
  on public.job_media_files (agency_id, created_at desc);

create or replace function public.validate_job_media_files_agency()
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

  if new.created_by is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.created_by
        and u.agency_id = new.agency_id
    ) then
    raise exception 'user must belong to the same agency';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_job_media_files_agency on public.job_media_files;
create trigger validate_job_media_files_agency
before insert or update on public.job_media_files
for each row
execute function public.validate_job_media_files_agency();

alter table public.job_media_files enable row level security;

drop policy if exists "job_media_files_select" on public.job_media_files;
create policy "job_media_files_select"
on public.job_media_files
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "job_media_files_insert_admin" on public.job_media_files;
create policy "job_media_files_insert_admin"
on public.job_media_files
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "job_media_files_update_admin" on public.job_media_files;
create policy "job_media_files_update_admin"
on public.job_media_files
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

drop policy if exists "job_media_files_delete_admin" on public.job_media_files;
create policy "job_media_files_delete_admin"
on public.job_media_files
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

grant select, insert, update, delete on table public.job_media_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'job-attachments',
  'job-attachments',
  false,
  52428800
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "job_attachments_select_same_agency" on storage.objects;
create policy "job_attachments_select_same_agency"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-attachments'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
);

drop policy if exists "job_attachments_insert_admin" on storage.objects;
create policy "job_attachments_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'job-attachments'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);

drop policy if exists "job_attachments_update_admin" on storage.objects;
create policy "job_attachments_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'job-attachments'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
)
with check (
  bucket_id = 'job-attachments'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);

drop policy if exists "job_attachments_delete_admin" on storage.objects;
create policy "job_attachments_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'job-attachments'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);

commit;
