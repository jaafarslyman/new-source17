-- FlowPoint AI property and residential-unit schema.
--
-- Run this once in the Supabase SQL Editor. Do not manually drop public.properties
-- first: this script resets property records in place, preserves request/service
-- records, and restores their links to the recreated unit table.
--
-- Data impact:
--   * Deletes properties, units, property/unit contact links, staff assignments,
--     and service-to-property/unit assignments.
--   * Keeps contacts, service definitions, and requests. Existing request
--     property/unit links are cleared.
--   * Existing relationship-history triggers can retain an archived copy of
--     deleted owner/renter links.
--
-- company_id is account-scoped to auth.uid(), matching the app's current RLS.

begin;

create extension if not exists pgcrypto;

-- Recreate the parent table before cleanup so existing relationship triggers
-- still have a properties relation to query if it was previously dropped.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null check (length(trim(name)) > 0),
  property_category text not null,
  property_type text not null,
  address_line1 text not null check (length(trim(address_line1)) > 0),
  address_line2 text,
  city text not null check (length(trim(city)) > 0),
  state text,
  postal_code text,
  country text,
  description text,

  units_count integer,
  units_under_construction boolean not null default false,
  unit_ownership_map jsonb not null default '[]'::jsonb,
  floor_count integer,
  floor_unit_counts integer[] not null default '{}',
  room_count integer,
  facilities text[] not null default '{}',
  custom_facilities text[] not null default '{}',

  is_rented boolean not null default false,
  monthly_rent numeric(12, 2),
  lease_term_type text,
  lease_start_date date,
  lease_end_date date,

  amenities text,
  property_rules text,
  parking_information text,
  access_information text,
  utilities_information text,
  emergency_information text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

-- Company contacts are valid owners; preserve legacy values while enforcing
-- the allowed list for new and updated contacts.
do $$
begin
  if to_regclass('public.contacts') is not null then
    alter table public.contacts drop constraint if exists contacts_contact_type_check;
    alter table public.contacts
      add constraint contacts_contact_type_check
      check (contact_type in ('tenant', 'property_owner', 'company', 'applicant', 'prospect', 'vendor', 'contractor', 'former_tenant', 'former_owner', 'other'))
      not valid;
  end if;
end;
$$;

-- Remove property-scoped records explicitly so this works whether the old
-- properties table still exists or was already dropped with CASCADE.
do $$
begin
  if to_regclass('public.requests') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'requests' and column_name = 'property_id'
    ) then
      execute 'update public.requests set property_id = null where property_id is not null';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'requests' and column_name = 'unit_id'
    ) then
      execute 'update public.requests set unit_id = null where unit_id is not null';
    end if;
  end if;

  if to_regclass('public.contact_property_relationships') is not null then
    execute 'delete from public.contact_property_relationships';
  end if;
  if to_regclass('public.staff_property_relationships') is not null then
    execute 'delete from public.staff_property_relationships';
  end if;
  if to_regclass('public.service_units') is not null then
    execute 'delete from public.service_units';
  end if;
  if to_regclass('public.service_properties') is not null then
    execute 'delete from public.service_properties';
  end if;
  if to_regclass('public.units') is not null then
    execute 'delete from public.units';
  end if;
  if to_regclass('public.properties') is not null then
    execute 'delete from public.properties';
  end if;
end;
$$;

-- Keep the properties table itself (and its other dependent table structures)
-- while replacing the unit table, whose old shape cannot represent the new flow.
drop table if exists public.units cascade;
-- The pre-rebuild migration attached this trigger to properties (which is
-- intentionally retained), so remove it before the new unit rules are used.
drop trigger if exists validate_property_unit_count_before_write on public.properties;

-- The legacy table already exists in most installations. These additions keep
-- its useful operational fields and align the address requirements with the UI.
alter table public.properties
  add column if not exists property_category text,
  add column if not exists units_under_construction boolean not null default false,
  add column if not exists unit_ownership_map jsonb not null default '[]'::jsonb,
  add column if not exists floor_count integer,
  add column if not exists floor_unit_counts integer[] not null default '{}',
  add column if not exists room_count integer,
  add column if not exists facilities text[] not null default '{}',
  add column if not exists custom_facilities text[] not null default '{}',
  add column if not exists is_rented boolean not null default false,
  add column if not exists monthly_rent numeric(12, 2),
  add column if not exists lease_term_type text,
  add column if not exists lease_start_date date,
  add column if not exists lease_end_date date;

alter table public.properties
  alter column property_category set default 'residential',
  alter column property_category set not null,
  alter column property_type set not null,
  alter column units_count drop not null,
  alter column units_count drop default,
  alter column country drop not null,
  alter column country drop default;

-- Replace legacy subtype/count checks with the residential/commercial/
-- industrial model. The property rows have already been cleared above.
alter table public.properties
  drop constraint if exists properties_property_type_check,
  drop constraint if exists properties_property_category_check,
  drop constraint if exists properties_category_type_check,
  drop constraint if exists properties_structure_check,
  drop constraint if exists properties_units_count_check,
  drop constraint if exists properties_rental_details_check;

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
  add constraint properties_property_category_check
    check (property_category in ('residential', 'commercial', 'industrial')),
  add constraint properties_property_type_check
    check (property_type in (
      'single_family_home',
      'multifamily_units',
      'apartment_building',
      'office_building',
      'retail_center',
      'restaurant_hospitality',
      'mixed_use_development',
      'warehouse',
      'distribution_center',
      'manufacturing_plant',
      'research_development_facility'
    )),
  add constraint properties_category_type_check
    check (
      (property_category = 'residential' and property_type in (
        'single_family_home', 'multifamily_units', 'apartment_building'
      ))
      or
      (property_category = 'commercial' and property_type in (
        'office_building', 'retail_center', 'restaurant_hospitality', 'mixed_use_development'
      ))
      or
      (property_category = 'industrial' and property_type in (
        'warehouse', 'distribution_center', 'manufacturing_plant', 'research_development_facility'
      ))
    ),
  add constraint properties_units_count_check
    check (units_count is null or units_count > 0),
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
        property_type not in ('single_family_home', 'multifamily_units', 'apartment_building')
        and units_count is null
        and floor_count is null
        and room_count is null
        and cardinality(floor_unit_counts) = 0
      )
    ),
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
        and property_type = 'single_family_home'
        and monthly_rent is not null and monthly_rent > 0
        and lease_start_date is not null
        and (
          (lease_term_type = 'fixed' and lease_end_date is not null and lease_end_date >= lease_start_date)
          or
          (lease_term_type = 'until_termination' and lease_end_date is null)
        )
      )
    );

create index if not exists properties_company_id_idx on public.properties (company_id);
create index if not exists properties_company_status_idx on public.properties (company_id, status);
create index if not exists properties_company_type_idx on public.properties (company_id, property_type);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unit_number text not null check (length(trim(unit_number)) > 0),
  unit_type text not null default 'apartment' check (
    unit_type in ('apartment', 'house', 'condo', 'townhouse', 'commercial', 'other')
  ),
  description text,
  floor integer check (floor is null or floor >= 0),
  floor_count integer check (floor_count is null or floor_count >= 1),
  room_count integer check (room_count is null or room_count >= 0),
  bedrooms numeric(5, 2) check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(5, 2) check (bathrooms is null or bathrooms >= 0),
  square_footage integer check (square_footage is null or square_footage >= 0),

  monthly_rent numeric(12, 2),
  security_deposit numeric(12, 2) check (security_deposit is null or security_deposit >= 0),
  rent_due_day integer check (rent_due_day is null or rent_due_day between 1 and 31),
  lease_start_date date,
  lease_end_date date,
  lease_term_type text,
  status text not null default 'vacant' check (
    status in ('occupied', 'vacant', 'maintenance', 'unavailable')
  ),

  amenities text,
  facilities text[] not null default '{}',
  custom_facilities text[] not null default '{}',
  utilities_information text,
  parking_information text,
  access_information text,
  rules text,
  notes text,

  constraint units_rental_details_check check (
    (
      status <> 'occupied'
      and monthly_rent is null
      and lease_term_type is null
      and lease_start_date is null
      and lease_end_date is null
    )
    or
    (
      status = 'occupied'
      and monthly_rent is not null and monthly_rent > 0
      and lease_start_date is not null
      and (
        (lease_term_type = 'fixed' and lease_end_date is not null and lease_end_date >= lease_start_date)
        or
        (lease_term_type = 'until_termination' and lease_end_date is null)
      )
    )
  )
);

create index if not exists units_company_id_idx on public.units (company_id);
create index if not exists units_property_id_idx on public.units (property_id);
create index if not exists units_company_status_idx on public.units (company_id, status);
create unique index if not exists units_property_number_idx
  on public.units (property_id, lower(trim(unit_number)));

create or replace function public.set_properties_rebuild_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_properties_rebuild_updated_at();

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at
before update on public.units
for each row execute function public.set_properties_rebuild_updated_at();

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
  if parent.property_type not in ('multifamily_units', 'apartment_building') then
    raise exception 'Units can only be added to multifamily properties or apartment buildings';
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
before insert or update of company_id, property_id, unit_number, floor, floor_count, room_count
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
     or new.property_type is distinct from old.property_type then
    select count(*) into total_units
    from public.units
    where property_id = old.id;
    if new.units_count is not null and total_units > new.units_count then
      raise exception 'The new unit limit is below the number of existing units';
    end if;
    if total_units > 0
       and new.property_type not in ('multifamily_units', 'apartment_building') then
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
  end if;
  return new;
end;
$$;

drop trigger if exists properties_prevent_invalid_capacity_change on public.properties;
create trigger properties_prevent_invalid_capacity_change
before update of units_count, floor_count, floor_unit_counts, property_type
on public.properties
for each row execute function public.prevent_invalid_property_capacity_change();

-- Preserve the existing contact table and relationship-history model. Property
-- links are cleared above; these relationships point to the rebuilt tables.
do $$
declare
  contact_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into contact_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'contacts'
    and a.attname = 'id' and not a.attisdropped;

  if contact_id_type is null then
    raise exception 'public.contacts.id is required before running this schema script';
  end if;

  execute format($sql$
    create table if not exists public.contact_property_relationships (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      contact_id %s not null references public.contacts(id) on delete cascade,
      property_id uuid not null references public.properties(id) on delete cascade,
      unit_id uuid references public.units(id) on delete cascade,
      relationship_type text not null default 'other',
      start_date date,
      end_date date,
      notes text,
      ownership_percentage numeric(5, 2),
      ownership_scope text
    )
  $sql$, contact_id_type);
end;
$$;

alter table public.contact_property_relationships
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists relationship_type text default 'other',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists notes text,
  add column if not exists ownership_percentage numeric(5, 2),
  add column if not exists ownership_scope text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_property_relationships'::regclass
      and conname = 'property_relationships_property_fk'
  ) then
    alter table public.contact_property_relationships
      add constraint property_relationships_property_fk
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_property_relationships'::regclass
      and conname = 'property_relationships_unit_fk'
  ) then
    alter table public.contact_property_relationships
      add constraint property_relationships_unit_fk
      foreign key (unit_id) references public.units(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_property_relationships'::regclass
      and conname = 'property_relationships_ownership_percentage_check'
  ) then
    alter table public.contact_property_relationships
      add constraint property_relationships_ownership_percentage_check
      check (ownership_percentage is null or ownership_percentage between 0 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contact_property_relationships'::regclass
      and conname = 'property_relationships_date_check'
  ) then
    alter table public.contact_property_relationships
      add constraint property_relationships_date_check
      check (end_date is null or start_date is null or end_date >= start_date);
  end if;
end;
$$;

-- A property or unit can have only one current renter relationship. Completed
-- lease history is archived separately by the relationship-history trigger.
drop index if exists public.contact_property_one_active_renter_idx;
create unique index contact_property_one_active_renter_idx
  on public.contact_property_relationships (
    property_id,
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where relationship_type = 'tenant';

create index if not exists units_company_id_idx on public.units (company_id);
create index if not exists units_property_id_idx on public.units (property_id);
create index if not exists units_company_status_idx on public.units (company_id, status);

-- Restore references from tables that survived a previous properties/units
-- drop. The cleanup above clears their old links before these constraints return.
do $$
begin
  if to_regclass('public.requests') is not null then
    if not exists (select 1 from pg_constraint where conname = 'requests_property_rebuild_fk') then
      alter table public.requests
        add constraint requests_property_rebuild_fk
        foreign key (property_id) references public.properties(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'requests_unit_rebuild_fk') then
      alter table public.requests
        add constraint requests_unit_rebuild_fk
        foreign key (unit_id) references public.units(id) on delete set null;
    end if;
  end if;
  if to_regclass('public.service_units') is not null
     and not exists (select 1 from pg_constraint where conname = 'service_units_unit_rebuild_fk') then
    alter table public.service_units
      add constraint service_units_unit_rebuild_fk
      foreign key (unit_id) references public.units(id) on delete cascade;
  end if;
  if to_regclass('public.service_properties') is not null
     and not exists (select 1 from pg_constraint where conname = 'service_properties_property_rebuild_fk') then
    alter table public.service_properties
      add constraint service_properties_property_rebuild_fk
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;
  if to_regclass('public.staff_property_relationships') is not null
     and not exists (select 1 from pg_constraint where conname = 'staff_property_rebuild_fk') then
    alter table public.staff_property_relationships
      add constraint staff_property_rebuild_fk
      foreign key (property_id) references public.properties(id) on delete cascade;
  end if;
end;
$$;

create or replace function public.validate_contact_property_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;
  if not exists (
    select 1 from public.properties p
    where p.id = new.property_id and p.company_id = new.company_id
  ) then
    raise exception 'Property does not belong to this account';
  end if;
  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id and u.property_id = new.property_id and u.company_id = new.company_id
  ) then
    raise exception 'Unit does not belong to the selected property and account';
  end if;
  if not exists (
    select 1 from public.contacts c
    where c.id = new.contact_id and (c.company_id = new.company_id or c.company_id is null)
  ) then
    raise exception 'Contact does not belong to this account';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contact_property_relationship_validate on public.contact_property_relationships;
create trigger contact_property_relationship_validate
before insert or update on public.contact_property_relationships
for each row execute function public.validate_contact_property_relationship();
drop trigger if exists contact_property_relationships_set_updated_at on public.contact_property_relationships;
create trigger contact_property_relationships_set_updated_at
before update on public.contact_property_relationships
for each row execute function public.set_properties_rebuild_updated_at();

-- Recreate account-scoped row security for the rebuilt property data.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('properties', 'units', 'contact_property_relationships')
  loop
    execute format('drop policy if exists %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.contact_property_relationships enable row level security;

grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.units to authenticated;
grant select, insert, update, delete on public.contact_property_relationships to authenticated;
revoke all on public.properties from anon;
revoke all on public.units from anon;
revoke all on public.contact_property_relationships from anon;

create policy "properties_account_select" on public.properties
  for select to authenticated using (auth.uid() is not null and company_id = auth.uid());
create policy "properties_account_insert" on public.properties
  for insert to authenticated with check (auth.uid() is not null and company_id = auth.uid());
create policy "properties_account_update" on public.properties
  for update to authenticated using (auth.uid() is not null and company_id = auth.uid())
  with check (auth.uid() is not null and company_id = auth.uid());
create policy "properties_account_delete" on public.properties
  for delete to authenticated using (auth.uid() is not null and company_id = auth.uid());

create policy "units_account_select" on public.units
  for select to authenticated using (auth.uid() is not null and company_id = auth.uid());
create policy "units_account_insert" on public.units
  for insert to authenticated with check (
    auth.uid() is not null and company_id = auth.uid()
    and exists (select 1 from public.properties p where p.id = property_id and p.company_id = auth.uid())
  );
create policy "units_account_update" on public.units
  for update to authenticated using (auth.uid() is not null and company_id = auth.uid())
  with check (
    auth.uid() is not null and company_id = auth.uid()
    and exists (select 1 from public.properties p where p.id = property_id and p.company_id = auth.uid())
  );
create policy "units_account_delete" on public.units
  for delete to authenticated using (auth.uid() is not null and company_id = auth.uid());

create policy "property_relationships_account_select" on public.contact_property_relationships
  for select to authenticated using (auth.uid() is not null and company_id = auth.uid());
create policy "property_relationships_account_insert" on public.contact_property_relationships
  for insert to authenticated with check (
    auth.uid() is not null and company_id = auth.uid()
    and exists (select 1 from public.properties p where p.id = property_id and p.company_id = auth.uid())
    and (unit_id is null or exists (
      select 1 from public.units u
      where u.id = unit_id and u.property_id = property_id and u.company_id = auth.uid()
    ))
  );
create policy "property_relationships_account_update" on public.contact_property_relationships
  for update to authenticated using (auth.uid() is not null and company_id = auth.uid())
  with check (
    auth.uid() is not null and company_id = auth.uid()
    and exists (select 1 from public.properties p where p.id = property_id and p.company_id = auth.uid())
    and (unit_id is null or exists (
      select 1 from public.units u
      where u.id = unit_id and u.property_id = property_id and u.company_id = auth.uid()
    ))
  );
create policy "property_relationships_account_delete" on public.contact_property_relationships
  for delete to authenticated using (auth.uid() is not null and company_id = auth.uid());

commit;
