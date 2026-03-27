begin;

alter table public.jobs
add column if not exists client_need text;

commit;
