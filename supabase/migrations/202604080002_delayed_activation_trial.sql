begin;

alter table public.agencies
  add column if not exists trial_activated boolean not null default false;

update public.agencies
set trial_activated = true
where (trial_starts_at is not null or trial_ends_at is not null or status = 'trial')
  and trial_activated = false;

create or replace function public.ensure_default_agency_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starter_plan_id uuid;
  period_start timestamptz;
begin
  if exists (select 1 from public.agency_subscriptions where agency_id = new.id) then
    return new;
  end if;

  select id into starter_plan_id from public.plans where code = 'starter' limit 1;

  if starter_plan_id is null then
    raise exception 'Starter plan not found';
  end if;

  period_start := coalesce(new.created_at, now());

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
    'active',
    'monthly',
    null,
    null,
    period_start,
    null,
    null
  )
  on conflict (agency_id) do nothing;

  return new;
end;
$$;

commit;
