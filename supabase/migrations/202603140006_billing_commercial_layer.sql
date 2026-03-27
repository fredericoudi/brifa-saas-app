begin;

alter type public.agency_plan add value if not exists 'agency';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('trial', 'active', 'past_due', 'canceled', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_billing_cycle') then
    create type public.subscription_billing_cycle as enum ('monthly');
  end if;
end $$;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly numeric(10,2) not null default 0,
  max_users integer,
  max_jobs integer,
  ai_briefing_enabled boolean not null default false,
  google_drive_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_format check (code ~ '^[a-z0-9_\\-]+$'),
  constraint plans_max_users_positive check (max_users is null or max_users > 0),
  constraint plans_max_jobs_positive check (max_jobs is null or max_jobs > 0)
);

create table if not exists public.agency_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status public.subscription_status not null default 'trial',
  billing_cycle public.subscription_billing_cycle not null default 'monthly',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date timestamptz,
  canceled_at timestamptz,
  external_customer_id text,
  external_subscription_id text,
  payment_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id)
);

create index if not exists idx_plans_code on public.plans (code);
create index if not exists idx_plans_active on public.plans (active);
create index if not exists idx_agency_subscriptions_status on public.agency_subscriptions (status);
create index if not exists idx_agency_subscriptions_next_billing on public.agency_subscriptions (next_billing_date);

drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

drop trigger if exists set_agency_subscriptions_updated_at on public.agency_subscriptions;
create trigger set_agency_subscriptions_updated_at
before update on public.agency_subscriptions
for each row
execute function public.set_updated_at();

insert into public.plans (
  code,
  name,
  price_monthly,
  max_users,
  max_jobs,
  ai_briefing_enabled,
  google_drive_enabled,
  active
)
values
  ('starter', 'Starter', 49, 5, 100, false, false, true),
  ('pro', 'Pro', 99, 15, null, true, true, true),
  ('agency', 'Agency', 199, null, null, true, true, true),
  ('growth', 'Growth (legado)', 99, 15, null, true, true, false)
on conflict (code) do update
set
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  max_users = excluded.max_users,
  max_jobs = excluded.max_jobs,
  ai_briefing_enabled = excluded.ai_briefing_enabled,
  google_drive_enabled = excluded.google_drive_enabled,
  active = excluded.active,
  updated_at = now();

create or replace function public.default_trial_ends_at(start_at timestamptz)
returns timestamptz
language sql
immutable
as $$
  select start_at + interval '14 days';
$$;

create or replace function public.sync_agency_commercial_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_code text;
begin
  select code
  into plan_code
  from public.plans
  where id = new.plan_id;

  update public.agencies
  set
    plan = case
      when plan_code in ('starter', 'growth', 'pro', 'agency') then plan_code::public.agency_plan
      else plan
    end,
    trial_starts_at = new.trial_started_at,
    trial_ends_at = new.trial_ends_at,
    updated_at = now()
  where id = new.agency_id;

  return new;
end;
$$;

create or replace function public.ensure_default_agency_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starter_plan_id uuid;
  trial_start timestamptz;
  trial_end timestamptz;
begin
  if exists (select 1 from public.agency_subscriptions where agency_id = new.id) then
    return new;
  end if;

  select id into starter_plan_id from public.plans where code = 'starter' limit 1;

  if starter_plan_id is null then
    raise exception 'Starter plan not found';
  end if;

  trial_start := coalesce(new.created_at, now());
  trial_end := public.default_trial_ends_at(trial_start);

  insert into public.agency_subscriptions (
    agency_id,
    plan_id,
    status,
    billing_cycle,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    next_billing_date
  )
  values (
    new.id,
    starter_plan_id,
    'trial',
    'monthly',
    trial_start,
    trial_end,
    trial_start,
    trial_end,
    trial_end
  )
  on conflict (agency_id) do nothing;

  return new;
end;
$$;

drop trigger if exists sync_agency_commercial_cache on public.agency_subscriptions;
create trigger sync_agency_commercial_cache
after insert or update on public.agency_subscriptions
for each row
execute function public.sync_agency_commercial_cache();

drop trigger if exists ensure_default_agency_subscription on public.agencies;
create trigger ensure_default_agency_subscription
after insert on public.agencies
for each row
execute function public.ensure_default_agency_subscription();

insert into public.agency_subscriptions (
  agency_id,
  plan_id,
  status,
  billing_cycle,
  trial_started_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  next_billing_date,
  created_at,
  updated_at
)
select
  agency.id,
  plan.id,
  case
    when agency.status = 'suspended' then 'suspended'::public.subscription_status
    when agency.status = 'trial' then 'trial'::public.subscription_status
    else 'active'::public.subscription_status
  end,
  'monthly'::public.subscription_billing_cycle,
  coalesce(agency.trial_starts_at, agency.created_at),
  case
    when agency.status = 'trial' then coalesce(agency.trial_ends_at, public.default_trial_ends_at(coalesce(agency.trial_starts_at, agency.created_at)))
    else agency.trial_ends_at
  end,
  coalesce(agency.trial_starts_at, agency.created_at),
  case
    when agency.status = 'trial' then coalesce(agency.trial_ends_at, public.default_trial_ends_at(coalesce(agency.trial_starts_at, agency.created_at)))
    else null
  end,
  case
    when agency.status = 'trial' then coalesce(agency.trial_ends_at, public.default_trial_ends_at(coalesce(agency.trial_starts_at, agency.created_at)))
    else null
  end,
  agency.created_at,
  now()
from public.agencies agency
join public.plans plan
  on plan.code = case
    when agency.plan::text in ('starter', 'growth', 'pro', 'agency') then agency.plan::text
    else 'starter'
  end
where not exists (
  select 1
  from public.agency_subscriptions subscription
  where subscription.agency_id = agency.id
);

alter table public.plans enable row level security;
alter table public.agency_subscriptions enable row level security;

drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated"
on public.plans
for select
to authenticated
using (true);

drop policy if exists "agency_subscriptions_select_same_agency" on public.agency_subscriptions;
create policy "agency_subscriptions_select_same_agency"
on public.agency_subscriptions
for select
to authenticated
using (agency_id = public.current_agency_id());

commit;
