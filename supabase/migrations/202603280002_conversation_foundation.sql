begin;

alter table public.users
  add column if not exists phone_number text,
  add column if not exists whatsapp_enabled boolean not null default true,
  add column if not exists is_active boolean not null default true;

alter table public.users
  drop constraint if exists users_phone_number_digits_check;

alter table public.users
  add constraint users_phone_number_digits_check
  check (phone_number is null or phone_number ~ '^[0-9]+$');

create unique index if not exists idx_users_phone_number_unique
  on public.users (phone_number)
  where phone_number is not null and btrim(phone_number) <> '';

create index if not exists idx_users_whatsapp_enabled on public.users (agency_id, whatsapp_enabled);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  phone_number text not null,
  channel text not null default 'internal_test',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  sender_type text not null check (sender_type in ('user', 'assistant', 'system')),
  content text not null,
  intent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_actions_log (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  action_type text not null,
  status text not null,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_agency_user on public.conversations (agency_id, user_id, updated_at desc);
create index if not exists idx_conversations_phone on public.conversations (phone_number, updated_at desc);
create index if not exists idx_messages_conversation_date on public.messages (conversation_id, created_at asc);
create index if not exists idx_messages_agency_date on public.messages (agency_id, created_at desc);
create index if not exists idx_ai_actions_log_agency_date on public.ai_actions_log (agency_id, created_at desc);
create index if not exists idx_ai_actions_log_conversation on public.ai_actions_log (conversation_id, created_at desc);

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

create or replace function public.validate_conversation_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  user_phone text;
begin
  select u.phone_number
  into user_phone
  from public.users u
  where u.id = new.user_id
    and u.agency_id = new.agency_id;

  if user_phone is null then
    raise exception 'user must belong to the same agency and have a phone number';
  end if;

  if user_phone <> new.phone_number then
    raise exception 'conversation phone number must match the user phone number';
  end if;

  return new;
end;
$$;

create or replace function public.validate_message_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conversation_agency uuid;
begin
  select c.agency_id
  into conversation_agency
  from public.conversations c
  where c.id = new.conversation_id;

  if conversation_agency is null then
    raise exception 'conversation not found';
  end if;

  if conversation_agency <> new.agency_id then
    raise exception 'message agency must match conversation agency';
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

create or replace function public.validate_ai_actions_log_agency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conversation_agency uuid;
begin
  if new.user_id is not null
    and not exists (
      select 1
      from public.users u
      where u.id = new.user_id
        and u.agency_id = new.agency_id
    ) then
    raise exception 'action log user must belong to the same agency';
  end if;

  if new.conversation_id is not null then
    select c.agency_id
    into conversation_agency
    from public.conversations c
    where c.id = new.conversation_id;

    if conversation_agency is null then
      raise exception 'conversation not found';
    end if;

    if conversation_agency <> new.agency_id then
      raise exception 'action log agency must match conversation agency';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_conversation_agency on public.conversations;
create trigger validate_conversation_agency
before insert or update on public.conversations
for each row
execute function public.validate_conversation_agency();

drop trigger if exists validate_message_agency on public.messages;
create trigger validate_message_agency
before insert or update on public.messages
for each row
execute function public.validate_message_agency();

drop trigger if exists validate_ai_actions_log_agency on public.ai_actions_log;
create trigger validate_ai_actions_log_agency
before insert or update on public.ai_actions_log
for each row
execute function public.validate_ai_actions_log_agency();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_actions_log enable row level security;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select"
on public.conversations
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "conversations_insert" on public.conversations;
create policy "conversations_insert"
on public.conversations
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "conversations_update" on public.conversations;
create policy "conversations_update"
on public.conversations
for update
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
on public.messages
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
on public.messages
for insert
to authenticated
with check (agency_id = public.current_agency_id());

drop policy if exists "ai_actions_log_select" on public.ai_actions_log;
create policy "ai_actions_log_select"
on public.ai_actions_log
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "ai_actions_log_insert" on public.ai_actions_log;
create policy "ai_actions_log_insert"
on public.ai_actions_log
for insert
to authenticated
with check (agency_id = public.current_agency_id());

grant select, insert, update on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert on table public.ai_actions_log to authenticated;

commit;
