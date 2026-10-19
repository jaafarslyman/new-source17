-- Industrial-property subtype fields for warehouses, distribution centers,
-- manufacturing plants, and research & development facilities.
-- Safe additive migration: it does not delete or rebuild existing records.
-- Run after the property setup and commercial-properties migration.

begin;

alter table public.properties
  add column if not exists industrial_in_building boolean,
  add column if not exists industrial_floor integer,
  add column if not exists warehouse_goods text[] not null default '{}',
  add column if not exists distribution_goods text[] not null default '{}',
  add column if not exists distribution_services text[] not null default '{}',
  add column if not exists manufactured_products text[] not null default '{}',
  add column if not exists production_inputs text[] not null default '{}',
  add column if not exists research_focus text[] not null default '{}',
  add column if not exists research_inputs text[] not null default '{}';

alter table public.properties
  drop constraint if exists properties_rental_details_check,
  drop constraint if exists properties_industrial_details_check;

alter table public.properties
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
          'restaurant_hospitality',
          'warehouse',
          'distribution_center',
          'manufacturing_plant',
          'research_development_facility'
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
  add constraint properties_industrial_details_check
    check (
      (
        property_type = 'warehouse'
        and industrial_in_building is not null
        and (
          (industrial_in_building and industrial_floor is not null and industrial_floor >= 0)
          or (not industrial_in_building and industrial_floor is null)
        )
        and cardinality(warehouse_goods) > 0
        and cardinality(distribution_goods) = 0
        and cardinality(distribution_services) = 0
        and cardinality(manufactured_products) = 0
        and cardinality(production_inputs) = 0
        and cardinality(research_focus) = 0
        and cardinality(research_inputs) = 0
      )
      or
      (
        property_type = 'distribution_center'
        and industrial_in_building is not null
        and (
          (industrial_in_building and industrial_floor is not null and industrial_floor >= 0)
          or (not industrial_in_building and industrial_floor is null)
        )
        and cardinality(warehouse_goods) = 0
        and cardinality(distribution_goods) > 0
        and cardinality(manufactured_products) = 0
        and cardinality(production_inputs) = 0
        and cardinality(research_focus) = 0
        and cardinality(research_inputs) = 0
      )
      or
      (
        property_type = 'manufacturing_plant'
        and industrial_in_building is null
        and industrial_floor is null
        and cardinality(warehouse_goods) = 0
        and cardinality(distribution_goods) = 0
        and cardinality(distribution_services) = 0
        and cardinality(manufactured_products) > 0
        and cardinality(research_focus) = 0
        and cardinality(research_inputs) = 0
      )
      or
      (
        property_type = 'research_development_facility'
        and industrial_in_building is not null
        and (
          (industrial_in_building and industrial_floor is not null and industrial_floor >= 0)
          or (not industrial_in_building and industrial_floor is null)
        )
        and cardinality(warehouse_goods) = 0
        and cardinality(distribution_goods) = 0
        and cardinality(distribution_services) = 0
        and cardinality(manufactured_products) = 0
        and cardinality(production_inputs) = 0
        and cardinality(research_focus) > 0
      )
      or
      (
        property_type not in (
          'warehouse',
          'distribution_center',
          'manufacturing_plant',
          'research_development_facility'
        )
        and industrial_in_building is null
        and industrial_floor is null
        and cardinality(warehouse_goods) = 0
        and cardinality(distribution_goods) = 0
        and cardinality(distribution_services) = 0
        and cardinality(manufactured_products) = 0
        and cardinality(production_inputs) = 0
        and cardinality(research_focus) = 0
        and cardinality(research_inputs) = 0
      )
    ) not valid;

comment on column public.properties.industrial_in_building is
  'Whether an industrial warehouse, distribution center, or R&D facility occupies a floor in a building.';
comment on column public.properties.industrial_floor is
  'Zero-based floor number for an industrial subtype located inside a building.';

commit;
