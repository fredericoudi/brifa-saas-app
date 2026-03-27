begin;

alter table public.jobs
add column if not exists start_date date,
add column if not exists start_time time,
add column if not exists due_time time;

alter table public.tasks
add column if not exists due_time time;

commit;
