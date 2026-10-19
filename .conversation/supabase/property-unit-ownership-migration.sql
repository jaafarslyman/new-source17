-- Additive property fields for multi-unit construction status and per-unit owners.
-- Safe for existing records; does not delete or rewrite property/contact data.
begin;

alter table public.properties
  add column if not exists units_under_construction boolean not null default false,
  add column if not exists unit_ownership_map jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_unit_ownership_map_array_check'
  ) then
    alter table public.properties
      add constraint properties_unit_ownership_map_array_check
      check (jsonb_typeof(unit_ownership_map) = 'array')
      not valid;
  end if;
end;
$$;

-- Preserve ownership already assigned directly to existing units.
with existing_unit_owners as (
  select
    property.id as property_id,
    jsonb_agg(
      jsonb_build_object(
        'unit_number', unit.unit_number,
        'contact_id', relationship.contact_id,
        'ownership_percentage', relationship.ownership_percentage
      )
      order by unit.unit_number, relationship.contact_id
    ) as ownership_map
  from public.properties as property
  join public.units as unit on unit.property_id = property.id
  join public.contact_property_relationships as relationship
    on relationship.unit_id = unit.id
   and relationship.property_id = property.id
   and relationship.relationship_type = 'owner'
  where property.property_type in ('multifamily_units', 'apartment_building')
  group by property.id
)
update public.properties as property
set unit_ownership_map = existing_unit_owners.ownership_map
from existing_unit_owners
where property.id = existing_unit_owners.property_id
  and property.unit_ownership_map = '[]'::jsonb;

-- A sole property-level owner already owns every planned unit. Record that map
-- so unit forms can inherit the owner and prevent accidental reassignment.
with sole_property_owner as (
  select
    property.id as property_id,
    property.units_count,
    min(relationship.contact_id::text) as contact_id
  from public.properties as property
  join public.contact_property_relationships as relationship
    on relationship.property_id = property.id
   and relationship.unit_id is null
   and relationship.relationship_type = 'owner'
  where property.property_type in ('multifamily_units', 'apartment_building')
    and property.units_count > 0
  group by property.id, property.units_count
  having count(*) = 1
),
sole_owner_map as (
  select
    owner.property_id,
    jsonb_agg(
      jsonb_build_object(
        'unit_number', slot.unit_number::text,
        'contact_id', owner.contact_id,
        'ownership_percentage', null
      )
      order by slot.unit_number
    ) as ownership_map
  from sole_property_owner as owner
  cross join lateral generate_series(1, owner.units_count) as slot(unit_number)
  group by owner.property_id
)
update public.properties as property
set unit_ownership_map = sole_owner_map.ownership_map
from sole_owner_map
where property.id = sole_owner_map.property_id
  and property.unit_ownership_map = '[]'::jsonb;

comment on column public.properties.units_under_construction is
  'True when some configured units have not been added because construction is incomplete.';
comment on column public.properties.unit_ownership_map is
  'Per-unit owner contact IDs and optional shares; null shares mean one owner holds the entire unit.';

create or replace function public.validate_property_units_construction_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  recorded_units integer;
begin
  if new.property_type in ('multifamily_units', 'apartment_building')
    and new.units_count is not null
    and not new.units_under_construction
  then
    select count(*)::integer
      into recorded_units
      from public.units
      where property_id = new.id;

    if recorded_units < new.units_count then
      raise exception
        'Add all configured units or mark the remaining units as under construction.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_property_units_construction_state on public.properties;
create trigger validate_property_units_construction_state
before insert or update of property_type, units_count, units_under_construction
on public.properties
for each row
execute function public.validate_property_units_construction_state();

notify pgrst, 'reload schema';

commit;
