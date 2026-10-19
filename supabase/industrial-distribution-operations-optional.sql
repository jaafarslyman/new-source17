-- Make distribution operations optional while keeping distribution goods required.
-- Run after industrial-properties-migration.sql. Existing property data is preserved.

begin;

alter table public.properties
  drop constraint if exists properties_industrial_details_check;

alter table public.properties
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

commit;
