begin;

create table if not exists public.platform_channels (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta_cloud', 'twilio', 'z_api')),
  phone_number text not null check (phone_number ~ '^[0-9]+$'),
  external_account_id text,
  access_token text,
  refresh_token text,
  webhook_verify_token text,
  is_active boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_platform_channels_provider_unique
  on public.platform_channels (provider);

create unique index if not exists idx_platform_channels_provider_phone_unique
  on public.platform_channels (provider, phone_number);

create unique index if not exists idx_platform_channels_provider_external_unique
  on public.platform_channels (provider, external_account_id)
  where external_account_id is not null and btrim(external_account_id) <> '';

create index if not exists idx_platform_channels_active
  on public.platform_channels (is_active, updated_at desc);

drop trigger if exists set_platform_channels_updated_at on public.platform_channels;
create trigger set_platform_channels_updated_at
before update on public.platform_channels
for each row
execute function public.set_updated_at();

alter table public.platform_channels enable row level security;

drop policy if exists "platform_channels_select_super_admin" on public.platform_channels;
create policy "platform_channels_select_super_admin"
on public.platform_channels
for select
using (public.current_platform_role() = 'super_admin');

drop policy if exists "platform_channels_insert_super_admin" on public.platform_channels;
create policy "platform_channels_insert_super_admin"
on public.platform_channels
for insert
with check (public.current_platform_role() = 'super_admin');

drop policy if exists "platform_channels_update_super_admin" on public.platform_channels;
create policy "platform_channels_update_super_admin"
on public.platform_channels
for update
using (public.current_platform_role() = 'super_admin')
with check (public.current_platform_role() = 'super_admin');

drop policy if exists "platform_channels_delete_super_admin" on public.platform_channels;
create policy "platform_channels_delete_super_admin"
on public.platform_channels
for delete
using (public.current_platform_role() = 'super_admin');

grant select, insert, update, delete on table public.platform_channels to authenticated;

commit;
