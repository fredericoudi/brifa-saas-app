alter table public.agencies
  add column if not exists logo_url text,
  add column if not exists brand_color text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agency-assets',
  'agency-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "agency_assets_public_read" on storage.objects;
create policy "agency_assets_public_read"
on storage.objects
for select
to public
using (bucket_id = 'agency-assets');

drop policy if exists "agency_assets_insert_admin" on storage.objects;
create policy "agency_assets_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'agency-assets'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_assets_update_admin" on storage.objects;
create policy "agency_assets_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'agency-assets'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
)
with check (
  bucket_id = 'agency-assets'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_assets_delete_admin" on storage.objects;
create policy "agency_assets_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'agency-assets'
  and (storage.foldername(name))[1] = public.current_agency_id()::text
  and public.current_user_role() = 'admin'
);
