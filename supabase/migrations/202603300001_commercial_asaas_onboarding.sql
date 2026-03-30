begin;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.agency_status'::regtype
      and enumlabel = 'pending_payment'
  ) then
    alter type public.agency_status add value 'pending_payment';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.subscription_status'::regtype
      and enumlabel = 'pending_payment'
  ) then
    alter type public.subscription_status add value 'pending_payment';
  end if;
end $$;

alter table public.agencies
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists owner_phone text,
  add column if not exists activated_at timestamptz;

create index if not exists idx_agencies_owner_email on public.agencies (owner_email);
create index if not exists idx_agencies_status_created_at on public.agencies (status, created_at desc);

alter table public.plans
  add column if not exists slug text,
  add column if not exists price_cents integer,
  add column if not exists billing_cycle text not null default 'monthly';

update public.plans
set
  slug = case
    when code = 'starter' then 'start'
    when code = 'pro' then 'pro'
    when code = 'agency' then 'business'
    when code = 'growth' then 'growth'
    else coalesce(slug, code)
  end,
  price_cents = coalesce(price_cents, round(price_monthly * 100)::integer),
  billing_cycle = coalesce(nullif(billing_cycle, ''), 'monthly')
where slug is null
   or price_cents is null
   or billing_cycle is null
   or billing_cycle = '';

alter table public.plans
  alter column slug set not null,
  alter column price_cents set not null;

alter table public.plans
  drop constraint if exists plans_slug_format;

alter table public.plans
  add constraint plans_slug_format check (slug ~ '^[a-z0-9_\\-]+$'),
  add constraint plans_price_cents_positive check (price_cents >= 0),
  add constraint plans_billing_cycle_check check (billing_cycle in ('monthly'));

create unique index if not exists idx_plans_slug on public.plans (slug);

create table if not exists public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  provider text not null,
  provider_checkout_id text,
  provider_customer_id text,
  provider_subscription_id text,
  checkout_url text not null,
  status text not null default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_tokens (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  email text not null,
  token text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkout_sessions_agency_status on public.checkout_sessions (agency_id, status, created_at desc);
create index if not exists idx_checkout_sessions_provider on public.checkout_sessions (provider, created_at desc);
create unique index if not exists idx_checkout_sessions_provider_checkout
  on public.checkout_sessions (provider, provider_checkout_id)
  where provider_checkout_id is not null;
create unique index if not exists idx_checkout_sessions_provider_subscription
  on public.checkout_sessions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists idx_onboarding_tokens_token on public.onboarding_tokens (token);
create index if not exists idx_onboarding_tokens_agency_email on public.onboarding_tokens (agency_id, email, created_at desc);

drop trigger if exists set_checkout_sessions_updated_at on public.checkout_sessions;
create trigger set_checkout_sessions_updated_at
before update on public.checkout_sessions
for each row
execute function public.set_updated_at();

alter table public.checkout_sessions enable row level security;
alter table public.onboarding_tokens enable row level security;

drop policy if exists "checkout_sessions_select_same_agency" on public.checkout_sessions;
create policy "checkout_sessions_select_same_agency"
on public.checkout_sessions
for select
to authenticated
using (agency_id = public.current_agency_id());

commit;
