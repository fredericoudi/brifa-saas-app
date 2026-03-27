begin;

alter table public.clients
  add column if not exists prefix text;

create index if not exists idx_clients_agency_prefix
  on public.clients (agency_id, prefix);

commit;
