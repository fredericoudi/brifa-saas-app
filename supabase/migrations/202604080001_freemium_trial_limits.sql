begin;

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_logs_agency_created_at on public.ai_logs (agency_id, created_at desc);

alter table public.ai_logs enable row level security;

drop policy if exists "ai_logs_select_same_agency" on public.ai_logs;
create policy "ai_logs_select_same_agency"
on public.ai_logs
for select
to authenticated
using (agency_id = public.current_agency_id());

drop policy if exists "ai_logs_insert_same_agency" on public.ai_logs;
create policy "ai_logs_insert_same_agency"
on public.ai_logs
for insert
to authenticated
with check (agency_id = public.current_agency_id());

grant select, insert on table public.ai_logs to authenticated;

create or replace function public.default_trial_ends_at(start_at timestamptz)
returns timestamptz
language sql
immutable
as $$
  select start_at + interval '7 days';
$$;

update public.plans
set
  max_users = case
    when code = 'starter' then 3
    when code = 'pro' then 5
    when code = 'agency' then 10
    when code = 'growth' then 5
    else max_users
  end,
  ai_briefing_enabled = case
    when code = 'starter' then true
    else ai_briefing_enabled
  end,
  updated_at = now()
where code in ('starter', 'pro', 'agency', 'growth');

commit;
