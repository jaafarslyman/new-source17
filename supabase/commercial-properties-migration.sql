-- Add commercial-property details and mixed-use unit types without deleting
-- or rebuilding existing properties, units, contacts, or relationships.
-- Run after the existing properties and units tables are set up, before using
-- the commercial property forms.

begin;

create or replace function public.property_integer_array_sum(input_values integer[])
returns bigint
language sql
immutable
parallel safe
as $$
  select coalesce(sum(value), 0)::bigint
  from unnest(input_values) as values_table(value)
$$;

alter table public.properties
  add column if not exists office_in_building boolean,
  add column if not exists office_floor integer,
  add column if not exists commercial_space_type text,
  add column if not exists mixed_use_components text[] not null default '{}';

alter table public.properties
  drop constraint if exists properties_structure_check,
  drop constraint if exists properties_rental_details_check,
  drop constraint if exists properties_commercial_details_check;

alter table public.properties
  add constraint properties_structure_check
    check (
      (
        property_type = 'single_family_home'
        and room_count is not null and room_count >= 0
        and floor_count is not null and floor_count >= 1
        and units_count is null
        and cardinality(floor_unit_counts) = 0
      )
      or
      (
        property_type = 'multifamily_units'
        and units_count is not null and units_count > 0
        and floor_count is null
        and room_count is null
        and cardinality(floor_unit_counts) = 0
      )
      or
      (
        property_type = 'apartment_building'
        and units_count is not null and units_count > 0
        and floor_count is not null and floor_count > 0
        and cardinality(floor_unit_counts) = floor_count
        and array_position(floor_unit_counts, null) is null
        and 0 <= all(floor_unit_counts)
        and public.property_integer_array_sum(floor_unit_counts) = units_count
      )
      or
      (
        property_type = 'mixed_use_development'
        and units_count is null
        and floor_count is not null and floor_count > 0
        and room_count is null
        and cardinality(floor_unit_counts) = 0
      )
      or
      (
        property_type not in (
          'single_family_home',
          'multifamily_units',
          'apartment_building',
          'mixed_use_development'
        )
        and units_count is null
        and floor_count is null
        and room_count is null
        and cardinality(floor_unit_counts) = 0
      )
    ) not valid,
  add constraint properties_rental_details_check
    check (
      (
        not is_rented
        and monthly_rent is null
        and lease_term_type is null
        and lease_start_date is null
        and lease_end_date is null
      )
      or
      (
        is_rented
        and property_type in (
          'single_family_home',
          'office_building',
          'retail_center',
          'restaurant_hospitality'
        )
        and monthly_rent is not null and monthly_rent > 0
        and lease_start_date is not null
        and (
          (lease_term_type = 'fixed' and lease_end_date is not null and lease_end_date >= lease_start_date)
          or
          (lease_term_type = 'until_termination' and lease_end_date is null)
        )
      )
    ) not valid,
  add constraint properties_commercial_details_check
    check (
      (
        property_type = 'office_building'
        and office_in_building is not null
        and (
          (office_in_building and office_floor is not null and office_floor >= 0)
          or (not office_in_building and office_floor is null)
        )
        and commercial_space_type is null
        and cardinality(mixed_use_components) = 0
      )
      or
      (
        property_type = 'retail_center'
        and office_in_building is null
        and office_floor is null
        and commercial_space_type is not null
        and commercial_space_type in (
          'shopping_mall', 'strip_mall', 'shopping_center',
          'outlet_center', 'market_hall', 'other'
        )
        and cardinality(mixed_use_components) = 0
      )
      or
      (
        property_type = 'restaurant_hospitality'
        and office_in_building is null
        and office_floor is null
        and commercial_space_type is not null
        and commercial_space_type in (
          'restaurant', 'cafe', 'bar', 'hotel', 'event_venue', 'food_hall', 'other'
        )
        and cardinality(mixed_use_components) = 0
      )
      or
      (
        property_type = 'mixed_use_development'
        and office_in_building is null
        and office_floor is null
        and commercial_space_type is null
        and cardinality(mixed_use_components) > 0
        and mixed_use_components <@ array[
          'apartment', 'office', 'retail_store',
          'restaurant_hospitality', 'warehouse'
        ]::text[]
      )
      or
      (
        property_type not in (
          'office_building',
          'retail_center',
          'restaurant_hospitality',
          'mixed_use_development'
        )
        and office_in_building is null
        and office_floor is null
        and commercial_space_type is null
        and cardinality(mixed_use_components) = 0
      )
    ) not valid;

alter table public.units
  add column if not exists commercial_space_type text;

alter table public.units
  drop constraint if exists units_unit_type_check;

alter table public.units
  add constraint units_unit_type_check
  check (
    unit_type in (
      'apartment', 'house', 'condo', 'townhouse', 'commercial',
      'office', 'retail_store', 'restaurant_hospitality', 'warehouse', 'other'
    )
  ) not valid;

alter table public.units
  drop constraint if exists units_commercial_space_details_check;

alter table public.units
  add constraint units_commercial_space_details_check
  check (
    (
      unit_type = 'retail_store'
      and commercial_space_type is not null
      and commercial_space_type in (
        'boutique', 'convenience_store', 'supermarket', 'department_store',
        'pharmacy', 'showroom', 'other'
      )
    )
    or
    (
      unit_type = 'restaurant_hospitality'
      and commercial_space_type is not null
      and commercial_space_type in (
        'restaurant', 'cafe', 'bar', 'hotel', 'event_venue', 'food_hall', 'other'
      )
    )
    or
    (
      unit_type not in ('retail_store', 'restaurant_hospitality')
      and commercial_space_type is null
    )
  ) not valid;

commit;
