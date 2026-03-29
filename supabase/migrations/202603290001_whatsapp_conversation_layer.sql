begin;

create table if not exists public.agency_channels (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  provider text not null check (provider in ('meta_cloud', 'twilio', 'z_api', 'internal_test')),
  phone_number text not null check (phone_number ~ '^[0-9]+$'),
  external_account_id text,
  access_token text,
  refresh_token text,
  webhook_verify_token text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_agency_channels_provider_phone_unique
  on public.agency_channels (provider, phone_number);
create unique index if not exists idx_agency_channels_provider_external_unique
  on public.agency_channels (provider, external_account_id)
  where external_account_id is not null and btrim(external_account_id) <> '';
create index if not exists idx_agency_channels_agency_active
  on public.agency_channels (agency_id, is_active, updated_at desc);
create index if not exists idx_agency_channels_agency_provider
  on public.agency_channels (agency_id, provider);

create table if not exists public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  channel_id uuid references public.agency_channels (id) on delete set null,
  external_contact_id text not null,
  channel text not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_threads_agency_updated
  on public.conversation_threads (agency_id, updated_at desc);
create index if not exists idx_conversation_threads_channel_contact
  on public.conversation_threads (channel, external_contact_id, updated_at desc);
create index if not exists idx_conversation_threads_user
  on public.conversation_threads (user_id, updated_at desc);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.conversation_threads (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  sender_type text not null check (sender_type in ('user', 'assistant', 'system')),
  message_text text not null,
  intent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_messages_thread_date
  on public.conversation_messages (thread_id, created_at asc);
create index if not exists idx_conversation_messages_agency_date
  on public.conversation_messages (agency_id, created_at desc);

create table if not exists public.conversation_actions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  thread_id uuid references public.conversation_threads (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  action_type text not null,
  status text not null,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_actions_agency_date
  on public.conversation_actions (agency_id, created_at desc);
create index if not exists idx_conversation_actions_thread_date
  on public.conversation_actions (thread_id, created_at desc);

create or replace function public.validate_agency_channel_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.agency_id is null then
    raise exception 'agency channel must belong to an agency';
  end if;

  return new;
end;
$$;

create or replace function public.validate_conversation_thread_agency()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'thread user must belong to the same agency';
  end if;

  if new.channel_id is not null
    and not exists (
      select 1
      from public.agency_channels c
      where c.id = new.channel_id
        and c.agency_id = new.agency_id
    ) then
    raise exception 'thread channel must belong to the same agency';
  end if;

  return new;
end;
$$;

create or replace function public.validate_conversation_message_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  thread_agency uuid;
begin
  select t.agency_id
  into thread_agency
  from public.conversation_threads t
  where t.id = new.thread_id;

  if thread_agency is null then
    raise exception 'thread not found';
  end if;

  if thread_agency <> new.agency_id then
    raise exception 'message agency must match thread agency';
  end if;

  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'message user must belong to the same agency';
  end if;

  return new;
end;
$$;

create or replace function public.validate_conversation_action_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  thread_agency uuid;
begin
  if new.thread_id is not null then
    select t.agency_id
    into thread_agency
    from public.conversation_threads t
    where t.id = new.thread_id;

    if thread_agency is null then
      raise exception 'thread not found';
    end if;

    if thread_agency <> new.agency_id then
      raise exception 'action agency must match thread agency';
    end if;
  end if;

  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'action user must belong to the same agency';
  end if;

  return new;
end;
$$;

drop trigger if exists set_agency_channels_updated_at on public.agency_channels;
create trigger set_agency_channels_updated_at
before update on public.agency_channels
for each row
execute function public.set_updated_at();

drop trigger if exists set_conversation_threads_updated_at on public.conversation_threads;
create trigger set_conversation_threads_updated_at
before update on public.conversation_threads
for each row
execute function public.set_updated_at();

drop trigger if exists validate_agency_channel_agency on public.agency_channels;
create trigger validate_agency_channel_agency
before insert or update on public.agency_channels
for each row
execute function public.validate_agency_channel_agency();

drop trigger if exists validate_conversation_thread_agency on public.conversation_threads;
create trigger validate_conversation_thread_agency
before insert or update on public.conversation_threads
for each row
execute function public.validate_conversation_thread_agency();

drop trigger if exists validate_conversation_message_agency on public.conversation_messages;
create trigger validate_conversation_message_agency
before insert or update on public.conversation_messages
for each row
execute function public.validate_conversation_message_agency();

drop trigger if exists validate_conversation_action_agency on public.conversation_actions;
create trigger validate_conversation_action_agency
before insert or update on public.conversation_actions
for each row
execute function public.validate_conversation_action_agency();

alter table public.agency_channels enable row level security;
alter table public.conversation_threads enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_actions enable row level security;

drop policy if exists "agency_channels_select" on public.agency_channels;
create policy "agency_channels_select"
on public.agency_channels
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_channels_insert_admin" on public.agency_channels;
create policy "agency_channels_insert_admin"
on public.agency_channels
for insert
to authenticated
with check (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "agency_channels_update_admin" on public.agency_channels;
create policy "agency_channels_update_admin"
on public.agency_channels
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

drop policy if exists "agency_channels_delete_admin" on public.agency_channels;
create policy "agency_channels_delete_admin"
on public.agency_channels
for delete
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "conversation_threads_select" on public.conversation_threads;
create policy "conversation_threads_select"
on public.conversation_threads
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "conversation_messages_select" on public.conversation_messages;
create policy "conversation_messages_select"
on public.conversation_messages
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists "conversation_actions_select" on public.conversation_actions;
create policy "conversation_actions_select"
on public.conversation_actions
for select
to authenticated
using (
  agency_id = public.current_agency_id()
  and public.current_user_role() = 'admin'
);

grant select, insert, update, delete on table public.agency_channels to authenticated;
grant select on table public.conversation_threads to authenticated;
grant select on table public.conversation_messages to authenticated;
grant select on table public.conversation_actions to authenticated;

commit;
