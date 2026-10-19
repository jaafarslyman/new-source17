-- FlowPoint AI: structured service settings that vary by category.
--
-- Run after services-migration.sql. This adds one JSONB object column with an
-- empty-object default, so existing service records remain valid and intact.

begin;

alter table public.services
  add column if not exists category_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_category_details_object_check'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
      add constraint services_category_details_object_check
      check (jsonb_typeof(category_details) = 'object');
  end if;
end;
$$;

commit;
