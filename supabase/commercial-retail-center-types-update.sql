-- Align the retail-center subtype constraint with the options shown by the app.
-- Safe to run more than once; existing rows are not deleted or rewritten.
begin;

alter table public.properties
  drop constraint if exists properties_commercial_details_check;

alter table public.properties
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
          'shopping_mall',
          'strip_mall',
          'shopping_center',
          'outlet_center',
          'market_hall',
          'neighborhood_center',
          'community_center',
          'power_center',
          'lifestyle_center',
          'open_air_center',
          'specialty_center',
          'retail_park',
          'other'
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
          'restaurant', 'cafe', 'bar', 'hotel',
          'event_venue', 'food_hall', 'other'
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

commit;
