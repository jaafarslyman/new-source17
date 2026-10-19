-- FlowPoint AI
-- Properties / units relationship safeguards and former-contact history.
--
-- Run this migration in the Supabase SQL editor before using the combined
-- Properties page. It is intentionally not executed by the application.

-- Company contacts are a first-class contact type.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.contacts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%contact_type%'
  loop
    execute format('alter table public.contacts drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.contacts
  add constraint contacts_contact_type_check
  check (
    contact_type is null
    or contact_type in (
      'tenant',
      'property_owner',
      'company',
      'applicant',
      'prospect',
      'vendor',
      'contractor',
      'former_tenant',
      'former_owner',
      'other'
    )
  );

-- Relationship rows are intentionally deleted when a property or unit is
-- deleted in the existing schema. This table keeps the useful details first.
create table if not exists public.contact_property_relationship_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  contact_id text not null,
  property_id uuid,
  unit_id uuid,
  relationship_type text not null,
  start_date date,
  end_date date,
  notes text,
  ownership_percentage numeric,
  ownership_scope text,
  property_name text,
  property_address_line1 text,
  property_city text,
  property_state text,
  property_postal_code text,
  property_country text,
  unit_number text,
  archived_at timestamptz not null default now(),
  archive_reason text
);

create index if not exists contact_property_relationship_history_contact_idx
  on public.contact_property_relationship_history (contact_id, archived_at desc);

create index if not exists contact_property_relationship_history_property_idx
  on public.contact_property_relationship_history (property_id, archived_at desc);

create or replace function public.archive_contact_property_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contact_property_relationship_history (
    company_id,
    contact_id,
    property_id,
    unit_id,
    relationship_type,
    start_date,
    end_date,
    notes,
    ownership_percentage,
    ownership_scope,
    property_name,
    property_address_line1,
    property_city,
    property_state,
    property_postal_code,
    property_country,
    unit_number,
    archive_reason
  )
  select
    old.company_id,
    old.contact_id::text,
    old.property_id,
    old.unit_id,
    old.relationship_type,
    old.start_date,
    old.end_date,
    old.notes,
    old.ownership_percentage,
    old.ownership_scope,
    property_row.name,
    property_row.address_line1,
    property_row.city,
    property_row.state,
    property_row.postal_code,
    property_row.country,
    unit_row.unit_number,
    case
      when old.end_date is not null then 'relationship ended'
      when old.unit_id is not null then 'unit relationship removed'
      else 'property relationship removed'
    end
  from (select 1) as keep_row
  left join public.properties as property_row on property_row.id = old.property_id
  left join public.units as unit_row on unit_row.id = old.unit_id;

  return old;
end;
$$;

drop trigger if exists archive_contact_property_relationship_before_delete
  on public.contact_property_relationships;

create trigger archive_contact_property_relationship_before_delete
before delete on public.contact_property_relationships
for each row
execute function public.archive_contact_property_relationship();

-- Keep the contact type useful after the last active relationship is removed.
-- A company remains a company even when its owner relationship ends.
create or replace function public.sync_former_contact_type_after_relationship_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.relationship_type = 'owner'
     and not exists (
       select 1
       from public.contact_property_relationships current_row
       where current_row.contact_id = old.contact_id
         and current_row.relationship_type = 'owner'
         and current_row.end_date is null
     )
  then
    update public.contacts
    set contact_type = 'former_owner', updated_at = now()
    where id::text = old.contact_id::text
      and contact_type = 'property_owner';
  end if;

  if old.relationship_type = 'tenant'
     and not exists (
       select 1
       from public.contact_property_relationships current_row
       where current_row.contact_id = old.contact_id
         and current_row.relationship_type = 'tenant'
         and current_row.end_date is null
     )
  then
    update public.contacts
    set contact_type = 'former_tenant', updated_at = now()
    where id::text = old.contact_id::text
      and contact_type = 'tenant';
  end if;

  return old;
end;
$$;

drop trigger if exists sync_former_contact_type_after_relationship_delete
  on public.contact_property_relationships;

create trigger sync_former_contact_type_after_relationship_delete
after delete on public.contact_property_relationships
for each row
execute function public.sync_former_contact_type_after_relationship_delete();

-- Re-activate a former owner/renter when a new relationship is created.
create or replace function public.sync_active_contact_type_after_relationship_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.relationship_type = 'owner' then
    update public.contacts
    set contact_type = case
      when contact_type = 'company' then 'company'
      else 'property_owner'
    end,
    updated_at = now()
    where id::text = new.contact_id::text
      and contact_type in ('former_owner', 'property_owner', 'company', 'other');
  elsif new.relationship_type = 'tenant' then
    update public.contacts
    set contact_type = 'tenant', updated_at = now()
    where id::text = new.contact_id::text
      and contact_type in ('former_tenant', 'tenant', 'other');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_active_contact_type_after_relationship_insert
  on public.contact_property_relationships;

create trigger sync_active_contact_type_after_relationship_insert
after insert on public.contact_property_relationships
for each row
execute function public.sync_active_contact_type_after_relationship_insert();

-- Only apartment-building properties can have child units. Commercial units
-- are not allowed as children of an apartment building, while "other" is
-- available for spaces such as parking, gyms, storage, or common areas.
create or replace function public.validate_property_unit_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  property_row public.properties%rowtype;
  apartment_total integer;
begin
  select * into property_row
  from public.properties
  where id = new.property_id;

  if property_row.id is null then
    raise exception 'Unit must reference an existing property';
  end if;

  if property_row.property_type <> 'apartment_building' then
    raise exception 'Only apartment-building properties can have units';
  end if;

  if new.unit_type = 'commercial' then
    raise exception 'Commercial units cannot be added under an apartment building';
  end if;

  if new.unit_type = 'apartment'
     and property_row.units_count is not null
     and (
       tg_op = 'INSERT'
       or old.property_id is distinct from new.property_id
       or old.unit_type is distinct from new.unit_type
     )
  then
    select count(*) into apartment_total
    from public.units
    where property_id = new.property_id
      and unit_type = 'apartment'
      and id <> new.id;

    if apartment_total >= property_row.units_count then
      raise exception 'The property has reached its apartment limit of %', property_row.units_count;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_property_unit_rules_before_write on public.units;

create trigger validate_property_unit_rules_before_write
before insert or update on public.units
for each row
execute function public.validate_property_unit_rules();

-- Do not let a property be changed to a non-building type or have its limit
-- reduced below the number of apartments already recorded.
create or replace function public.validate_property_unit_count()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  apartment_total integer;
begin
  select count(*) into apartment_total
  from public.units
  where property_id = new.id
    and unit_type = 'apartment';

  if new.property_type <> 'apartment_building' and apartment_total > 0 then
    raise exception 'This property still has apartment units and cannot change to this property type';
  end if;

  if new.property_type = 'apartment_building'
     and new.units_count is not null
     and apartment_total > new.units_count
  then
    raise exception 'Apartment limit cannot be lower than the % apartments already recorded', apartment_total;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_property_unit_count_before_write on public.properties;

create trigger validate_property_unit_count_before_write
before insert or update on public.properties
for each row
execute function public.validate_property_unit_count();