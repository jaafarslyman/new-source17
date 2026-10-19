-- FlowPoint AI: Property ownership details
--
-- Additive migration. It extends the existing contact_property_relationships
-- table created by contacts-team-migration.sql. Existing relationships and
-- contacts are preserved.
--
-- Ownership is represented by the existing relationship_type = 'owner'.
-- ownership_percentage stores the owner's share; ownership_scope optionally
-- records the units or uses that owner is associated with.

begin;

alter table if exists public.contact_property_relationships
  add column if not exists ownership_percentage numeric(5, 2),
  add column if not exists ownership_scope text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contact_relationship_ownership_percentage_check'
  ) then
    alter table public.contact_property_relationships
      add constraint contact_relationship_ownership_percentage_check
      check (
        ownership_percentage is null
        or (
          relationship_type = 'owner'
          and ownership_percentage >= 0
          and ownership_percentage <= 100
        )
      )
      not valid;
  end if;

end;
$$;

create index if not exists contact_property_relationships_owner_idx
  on public.contact_property_relationships (company_id, property_id)
  where relationship_type = 'owner';

commit;