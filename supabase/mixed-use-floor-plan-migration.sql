-- Add a per-floor mixed-use space plan and enforce it when recording spaces.
-- Run after commercial-properties-migration.sql. This migration preserves data.

begin;

alter table public.properties
  add column if not exists mixed_use_floor_plan jsonb not null default '[]'::jsonb;

update public.properties
set mixed_use_floor_plan = '[]'::jsonb
where mixed_use_floor_plan is null;

alter table public.properties
  alter column mixed_use_floor_plan set default '[]'::jsonb,
  alter column mixed_use_floor_plan set not null;

create or replace function public.validate_mixed_use_floor_plan()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  floor_index integer;
  component text;
  floor_plan_entry jsonb;
  component_value jsonb;
  component_count integer;
  entry_key_count integer;
  numeric_count numeric;
  component_total numeric;
begin
  if new.property_type is distinct from 'mixed_use_development' then
    new.mixed_use_floor_plan := '[]'::jsonb;
    return new;
  end if;

  -- Keep existing mixed-use records editable for unrelated fields. They must
  -- provide a plan when their type, selected uses, floors, or plan changes.
  if tg_op = 'UPDATE' then
    if new.property_type is not distinct from old.property_type
       and new.floor_count is not distinct from old.floor_count
       and new.mixed_use_components is not distinct from old.mixed_use_components
       and new.mixed_use_floor_plan is not distinct from old.mixed_use_floor_plan then
      return new;
    end if;
  end if;

  if new.floor_count is null or new.floor_count < 1 or new.floor_count > 100 then
    raise exception 'Mixed-use properties need between 1 and 100 floors';
  end if;
  if coalesce(cardinality(new.mixed_use_components), 0) = 0 then
    raise exception 'Select at least one use for the mixed-use property';
  end if;

  select count(distinct selected_component)
  into component_count
  from unnest(new.mixed_use_components) as uses(selected_component);
  if component_count <> cardinality(new.mixed_use_components) then
    raise exception 'Mixed-use selections cannot contain duplicate uses';
  end if;
  if exists (
    select 1
    from unnest(new.mixed_use_components) as uses(selected_component)
    where selected_component not in (
      'apartment', 'office', 'retail_store', 'restaurant_hospitality', 'warehouse'
    )
  ) then
    raise exception 'The mixed-use property contains an unsupported use';
  end if;

  if new.mixed_use_floor_plan is null
     or jsonb_typeof(new.mixed_use_floor_plan) is distinct from 'array' then
    raise exception 'Add a mixed-use count for every selected use on every floor';
  end if;
  if jsonb_array_length(new.mixed_use_floor_plan) <> new.floor_count then
    raise exception 'Add a mixed-use count for every selected use on every floor';
  end if;

  for floor_index in 0..new.floor_count - 1 loop
    floor_plan_entry := new.mixed_use_floor_plan -> floor_index;
    if jsonb_typeof(floor_plan_entry) is distinct from 'object' then
      raise exception 'Every mixed-use floor plan entry must be an object of use counts';
    end if;

    select count(*) into entry_key_count
    from jsonb_object_keys(floor_plan_entry);
    if entry_key_count <> cardinality(new.mixed_use_components) then
      raise exception 'Every floor must have exactly one count for each selected use';
    end if;

    foreach component in array new.mixed_use_components loop
      component_value := floor_plan_entry -> component;
      if component_value is null or jsonb_typeof(component_value) is distinct from 'number' then
        raise exception 'Enter a numeric count for every selected use on every floor';
      end if;
      numeric_count := (component_value #>> '{}')::numeric;
      if numeric_count < 0 or numeric_count <> trunc(numeric_count) or numeric_count > 2147483647 then
        raise exception 'Mixed-use floor counts must be whole numbers of 0 or more';
      end if;
    end loop;
  end loop;

  foreach component in array new.mixed_use_components loop
    component_total := 0;
    for floor_index in 0..new.floor_count - 1 loop
      component_value := new.mixed_use_floor_plan -> floor_index -> component;
      component_total := component_total + ((component_value #>> '{}')::numeric);
    end loop;
    if component_total < 1 then
      raise exception 'Every selected use needs at least one space in the building';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists properties_normalize_mixed_use_floor_plan on public.properties;
create trigger properties_normalize_mixed_use_floor_plan
before insert or update on public.properties
for each row execute function public.validate_mixed_use_floor_plan();

create or replace function public.validate_property_unit_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent public.properties%rowtype;
  current_total integer;
  current_floor_total integer;
  floor_capacity integer;
begin
  select * into parent
  from public.properties
  where id = new.property_id
  for update;

  if not found or parent.company_id is distinct from new.company_id then
    raise exception 'The unit must belong to a property in the same account';
  end if;

  if parent.property_type = 'mixed_use_development' then
    if not (new.unit_type = any(parent.mixed_use_components)) then
      raise exception 'The space type must be selected in the mixed-use property plan';
    end if;
    if new.floor_count is not null then
      raise exception 'Mixed-use spaces use a building-floor assignment, not interior floors';
    end if;
    if new.floor is null or new.floor < 0 or new.floor >= parent.floor_count then
      raise exception 'Choose an existing mixed-use building floor, using 0 for the ground floor';
    end if;
    if new.unit_type = 'apartment' then
      if new.room_count is null or new.room_count < 1 then
        raise exception 'Apartment spaces need a room count greater than 0';
      end if;
    elsif new.room_count is not null then
      raise exception 'Only apartment spaces can have a room count';
    end if;

    floor_capacity := (parent.mixed_use_floor_plan -> new.floor ->> new.unit_type)::integer;
    if floor_capacity is null then
      raise exception 'The selected floor has no configured capacity for this space type';
    end if;
    select count(*) into current_floor_total
    from public.units
    where property_id = new.property_id
      and floor = new.floor
      and unit_type = new.unit_type
      and (tg_op = 'INSERT' or id <> new.id);
    if current_floor_total >= floor_capacity then
      raise exception 'This floor has reached its planned count for this space type';
    end if;

    return new;
  end if;

  if parent.property_type not in ('multifamily_units', 'apartment_building') then
    raise exception 'Units can only be added to multifamily properties, apartment buildings, or configured mixed-use developments';
  end if;
  if new.room_count is null then
    raise exception 'A room count is required for every residential unit';
  end if;

  select count(*) into current_total
  from public.units
  where property_id = new.property_id
    and (tg_op = 'INSERT' or id <> new.id);

  if current_total >= parent.units_count then
    raise exception 'This property has reached its configured unit limit';
  end if;

  if parent.property_type = 'multifamily_units' then
    if new.floor is not null or new.floor_count is null or new.floor_count < 1 then
      raise exception 'Multifamily home units need an interior floor count and no building-floor assignment';
    end if;
  else
    if new.floor_count is not null then
      raise exception 'Apartment units cannot have interior floors';
    end if;
    if new.floor is null or new.floor < 0 or new.floor >= parent.floor_count then
      raise exception 'Choose an existing building floor, using 0 for the ground floor';
    end if;
    floor_capacity := parent.floor_unit_counts[new.floor + 1];
    if floor_capacity is null then
      raise exception 'The selected floor has no configured unit capacity';
    end if;
    select count(*) into current_floor_total
    from public.units
    where property_id = new.property_id
      and floor = new.floor
      and (tg_op = 'INSERT' or id <> new.id);
    if current_floor_total >= floor_capacity then
      raise exception 'This floor has reached its configured unit limit';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists units_validate_property_capacity on public.units;
create trigger units_validate_property_capacity
before insert or update of company_id, property_id, unit_number, unit_type, floor, floor_count, room_count
on public.units
for each row execute function public.validate_property_unit_capacity();

create or replace function public.prevent_invalid_property_capacity_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  total_units integer;
  invalid_floor_units integer;
  over_capacity_floors integer;
begin
  if new.units_count is distinct from old.units_count
     or new.floor_count is distinct from old.floor_count
     or new.floor_unit_counts is distinct from old.floor_unit_counts
     or new.property_type is distinct from old.property_type
     or new.mixed_use_components is distinct from old.mixed_use_components
     or new.mixed_use_floor_plan is distinct from old.mixed_use_floor_plan then
    select count(*) into total_units
    from public.units
    where property_id = old.id;

    if new.units_count is not null and total_units > new.units_count then
      raise exception 'The new unit limit is below the number of existing units';
    end if;
    if total_units > 0
       and new.property_type not in ('multifamily_units', 'apartment_building', 'mixed_use_development') then
      raise exception 'Delete existing units before changing this property to a non-unit type';
    end if;

    if new.property_type = 'apartment_building' and total_units > 0 then
      select count(*) into invalid_floor_units
      from public.units
      where property_id = old.id
        and (floor is null or floor < 0 or floor >= new.floor_count);
      if invalid_floor_units > 0 then
        raise exception 'The new floor count excludes existing apartment units';
      end if;
      select count(*) into over_capacity_floors
      from (
        select floor, count(*) as unit_total
        from public.units
        where property_id = old.id
        group by floor
      ) counts
      where counts.unit_total > new.floor_unit_counts[counts.floor + 1];
      if over_capacity_floors > 0 then
        raise exception 'The new per-floor capacity is below the current unit count';
      end if;
    end if;

    if new.property_type = 'mixed_use_development' and total_units > 0 then
      select count(*) into invalid_floor_units
      from public.units
      where property_id = old.id
        and (
          unit_type is null
          or not (unit_type = any(new.mixed_use_components))
          or floor is null
          or floor < 0
          or floor >= new.floor_count
          or floor_count is not null
          or (unit_type = 'apartment' and (room_count is null or room_count < 1))
          or (unit_type <> 'apartment' and room_count is not null)
        );
      if invalid_floor_units > 0 then
        raise exception 'The new mixed-use plan excludes or invalidates existing spaces';
      end if;

      select count(*) into over_capacity_floors
      from (
        select unit_type, floor, count(*) as unit_total
        from public.units
        where property_id = old.id
        group by unit_type, floor
      ) counts
      where counts.unit_total > coalesce(
        (new.mixed_use_floor_plan -> counts.floor ->> counts.unit_type)::integer,
        0
      );
      if over_capacity_floors > 0 then
        raise exception 'The new mixed-use plan is below the number of existing spaces on a floor';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_prevent_invalid_capacity_change on public.properties;
create trigger properties_prevent_invalid_capacity_change
before update of units_count, floor_count, floor_unit_counts, property_type, mixed_use_components, mixed_use_floor_plan
on public.properties
for each row execute function public.prevent_invalid_property_capacity_change();

commit;
