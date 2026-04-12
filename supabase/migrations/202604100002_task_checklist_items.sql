alter table public.tasks
  add column if not exists checklist_items jsonb not null default '[]'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_checklist_items_is_array;

alter table public.tasks
  add constraint tasks_checklist_items_is_array
  check (jsonb_typeof(checklist_items) = 'array');

comment on column public.tasks.checklist_items is 'Checklist de execução da tarefa com itens e marcação de conclusão.';
