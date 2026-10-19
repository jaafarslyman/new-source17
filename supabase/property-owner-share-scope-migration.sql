-- Allow property owners to store both their percentage and their unit/use scope.
-- Run after property-ownership-migration.sql. No ownership records are deleted.

begin;

alter table if exists public.contact_property_relationships
  drop constraint if exists contact_relationship_ownership_detail_check;

commit;
