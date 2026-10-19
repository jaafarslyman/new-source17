-- FlowPoint AI: Services source of truth and relationships
--
-- Additive migration. It preserves existing records and does not drop tables
-- or delete data. Run it in the Supabase SQL Editor after the current property
-- schema (supabase/property-rebuild.sql) and contacts-team-migration.sql.
--
-- The current FlowPoint account boundary uses company_id = auth.uid(). The
-- dynamic blocks below match the existing contacts/staff id types before
-- creating their service junction tables.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Other' check (length(trim(category)) > 0),
  short_description text,
  description text,
  customer_facing_description text,
  requirements text,
  included_details text,
  excluded_details text,
  pricing_information text,
  availability_information text,
  typical_response_time text,
  internal_instructions text,
  escalation_instructions text,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

alter table if exists public.services
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists name text,
  add column if not exists category text default 'Other',
  add column if not exists short_description text,
  add column if not exists description text,
  add column if not exists customer_facing_description text,
  add column if not exists requirements text,
  add column if not exists included_details text,
  add column if not exists excluded_details text,
  add column if not exists pricing_information text,
  add column if not exists availability_information text,
  add column if not exists typical_response_time text,
  add column if not exists internal_instructions text,
  add column if not exists escalation_instructions text,
  add column if not exists status text default 'active';

update public.services
set category = 'Other'
where category is null or length(trim(category)) = 0;

update public.services
set status = 'active'
where status is null or status not in ('active', 'inactive');

create index if not exists services_company_id_idx
  on public.services (company_id);

create index if not exists services_company_category_idx
  on public.services (company_id, category);

create index if not exists services_company_status_idx
  on public.services (company_id, status);

create or replace function public.set_services_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
before insert or update on public.services
for each row
execute function public.set_services_updated_at();

-- ---------------------------------------------------------------------------
-- Shared service relationship table setup
-- ---------------------------------------------------------------------------

create or replace function public.set_service_relationship_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Contact ↔ Service. The existing contact id may be integer, bigint, or uuid.
do $$
declare
  contact_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into contact_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'contacts'
    and a.attname = 'id'
    and not a.attisdropped;

  if contact_id_type is null then
    raise exception 'public.contacts.id was not found';
  end if;

  execute format($sql$
    create table if not exists public.contact_services (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      contact_id %s not null references public.contacts(id) on delete cascade,
      service_id uuid not null references public.services(id) on delete cascade,
      relationship_status text not null default 'active',
      notes text
    )
  $sql$, contact_id_type);
end;
$$;

alter table public.contact_services
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists relationship_status text default 'active',
  add column if not exists notes text;

create index if not exists contact_services_company_contact_idx
  on public.contact_services (company_id, contact_id);

create index if not exists contact_services_company_service_idx
  on public.contact_services (company_id, service_id);

create unique index if not exists contact_services_unique_idx
  on public.contact_services (company_id, contact_id, service_id);

-- Staff ↔ Service. The existing staff id may be integer, bigint, or uuid.
do $$
declare
  staff_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into staff_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'staff'
    and a.attname = 'id'
    and not a.attisdropped;

  if staff_id_type is null then
    raise exception 'public.staff.id was not found';
  end if;

  execute format($sql$
    create table if not exists public.service_staff (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      staff_id %s not null references public.staff(id) on delete cascade,
      service_id uuid not null references public.services(id) on delete cascade,
      assignment_role text,
      notes text
    )
  $sql$, staff_id_type);
end;
$$;

alter table public.service_staff
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists assignment_role text,
  add column if not exists notes text;

create index if not exists service_staff_company_staff_idx
  on public.service_staff (company_id, staff_id);

create index if not exists service_staff_company_service_idx
  on public.service_staff (company_id, service_id);

create unique index if not exists service_staff_unique_idx
  on public.service_staff (company_id, staff_id, service_id);

-- Service ↔ Property.
create table if not exists public.service_properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_id uuid not null references public.services(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  notes text
);

alter table public.service_properties
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists notes text;

create index if not exists service_properties_company_service_idx
  on public.service_properties (company_id, service_id);

create index if not exists service_properties_company_property_idx
  on public.service_properties (company_id, property_id);

create unique index if not exists service_properties_unique_idx
  on public.service_properties (company_id, service_id, property_id);

-- Service ↔ Unit.
create table if not exists public.service_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_id uuid not null references public.services(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  notes text
);

alter table public.service_units
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists notes text;

create index if not exists service_units_company_service_idx
  on public.service_units (company_id, service_id);

create index if not exists service_units_company_unit_idx
  on public.service_units (company_id, unit_id);

create unique index if not exists service_units_unique_idx
  on public.service_units (company_id, service_id, unit_id);

-- ---------------------------------------------------------------------------
-- Cross-company validation and updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.validate_contact_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.company_id = new.company_id) then
    raise exception 'Service does not belong to the current company';
  end if;
  if not exists (select 1 from public.contacts c where c.id = new.contact_id and (c.company_id = new.company_id or c.company_id is null)) then
    raise exception 'Contact does not belong to the current company';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_staff_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.company_id = new.company_id) then
    raise exception 'Service does not belong to the current company';
  end if;
  if not exists (select 1 from public.staff s where s.id = new.staff_id and (s.company_id = new.company_id or s.company_id is null)) then
    raise exception 'Staff member does not belong to the current company';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_property_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.company_id = new.company_id) then
    raise exception 'Service does not belong to the current company';
  end if;
  if not exists (select 1 from public.properties p where p.id = new.property_id and p.company_id = new.company_id) then
    raise exception 'Property does not belong to the current company';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_unit_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.company_id = new.company_id) then
    raise exception 'Service does not belong to the current company';
  end if;
  if not exists (select 1 from public.units u where u.id = new.unit_id and u.company_id = new.company_id) then
    raise exception 'Unit does not belong to the current company';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contact_services_validate on public.contact_services;
create trigger contact_services_validate
before insert or update on public.contact_services
for each row execute function public.validate_contact_service();

drop trigger if exists service_staff_validate on public.service_staff;
create trigger service_staff_validate
before insert or update on public.service_staff
for each row execute function public.validate_staff_service();

drop trigger if exists service_properties_validate on public.service_properties;
create trigger service_properties_validate
before insert or update on public.service_properties
for each row execute function public.validate_property_service();

drop trigger if exists service_units_validate on public.service_units;
create trigger service_units_validate
before insert or update on public.service_units
for each row execute function public.validate_unit_service();

drop trigger if exists contact_services_set_updated_at on public.contact_services;
create trigger contact_services_set_updated_at
before update on public.contact_services
for each row execute function public.set_service_relationship_updated_at();

drop trigger if exists service_staff_set_updated_at on public.service_staff;
create trigger service_staff_set_updated_at
before update on public.service_staff
for each row execute function public.set_service_relationship_updated_at();

drop trigger if exists service_properties_set_updated_at on public.service_properties;
create trigger service_properties_set_updated_at
before update on public.service_properties
for each row execute function public.set_service_relationship_updated_at();

drop trigger if exists service_units_set_updated_at on public.service_units;
create trigger service_units_set_updated_at
before update on public.service_units
for each row execute function public.set_service_relationship_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
grant select, insert, update, delete on table public.services to authenticated;
revoke all on table public.services from anon;

drop policy if exists "Services are visible to their company" on public.services;
create policy "Services are visible to their company"
on public.services for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Services can be created for their company" on public.services;
create policy "Services can be created for their company"
on public.services for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Services can be updated within their company" on public.services;
create policy "Services can be updated within their company"
on public.services for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Services can be deleted within their company" on public.services;
create policy "Services can be deleted within their company"
on public.services for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

do $$
declare
  table_name text;
begin
  foreach table_name in array array['contact_services', 'service_staff', 'service_properties', 'service_units']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('revoke all on table public.%I from anon', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || ' are visible to their company', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() is not null and company_id = auth.uid())', table_name || ' are visible to their company', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || ' can be created for their company', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() is not null and company_id = auth.uid())', table_name || ' can be created for their company', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || ' can be updated within their company', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (auth.uid() is not null and company_id = auth.uid()) with check (auth.uid() is not null and company_id = auth.uid())', table_name || ' can be updated within their company', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || ' can be deleted within their company', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() is not null and company_id = auth.uid())', table_name || ' can be deleted within their company', table_name);
  end loop;
end;
$$;

commit;