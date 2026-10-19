-- LEGACY unit schema bootstrap.
-- The current residential property flow creates its unit schema, validation,
-- and RLS policies through supabase/property-rebuild.sql.
--
-- Each unit stores only the property's UUID. Property names and addresses remain
-- in public.properties as the source of truth.

create extension if not exists pgcrypto;

create table if not exists public.units (
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
  bedrooms numeric(5, 2) check (bedrooms is null or bedrooms >= 0),
  bathrooms numeric(5, 2) check (bathrooms is null or bathrooms >= 0),
  square_footage integer check (square_footage is null or square_footage >= 0),

  monthly_rent numeric(12, 2) check (monthly_rent is null or monthly_rent >= 0),
  security_deposit numeric(12, 2) check (security_deposit is null or security_deposit >= 0),
  rent_due_day integer check (rent_due_day is null or rent_due_day between 1 and 31),
  lease_start_date date,
  lease_end_date date,
  status text not null default 'vacant' check (
    status in ('occupied', 'vacant', 'maintenance', 'unavailable')
  ),
  constraint units_lease_dates_valid check (
    lease_end_date is null or lease_start_date is null or lease_end_date >= lease_start_date
  ),

  amenities text,
  utilities_information text,
  parking_information text,
  access_information text,
  rules text,
  notes text
);

create index if not exists units_company_id_idx on public.units (company_id);
create index if not exists units_property_id_idx on public.units (property_id);
create index if not exists units_company_status_idx on public.units (company_id, status);
create index if not exists units_company_type_idx on public.units (company_id, unit_type);
create unique index if not exists units_property_number_idx
  on public.units (property_id, lower(trim(unit_number)));

create or replace function public.validate_unit_property_company()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  property_company_id uuid;
begin
  select p.company_id into property_company_id
  from public.properties p
  where p.id = new.property_id;

  if property_company_id is null or property_company_id <> new.company_id then
    raise exception 'A unit can only reference a property in the same company';
  end if;

  return new;
end;
$$;

drop trigger if exists units_validate_property_company on public.units;
create trigger units_validate_property_company
before insert or update of company_id, property_id on public.units
for each row execute function public.validate_unit_property_company();

create or replace function public.set_units_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at
before update on public.units
for each row execute function public.set_units_updated_at();

alter table public.units enable row level security;
grant select, insert, update, delete on table public.units to authenticated;
revoke all on table public.units from anon;

drop policy if exists "Units are visible to their account" on public.units;
create policy "Units are visible to their account"
on public.units for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Units can be created for their account" on public.units;
create policy "Units can be created for their account"
on public.units for insert to authenticated
with check (
  auth.uid() is not null
  and company_id = auth.uid()
  and exists (
    select 1 from public.properties p
    where p.id = property_id and p.company_id = auth.uid()
  )
);

drop policy if exists "Units can be updated within their account" on public.units;
create policy "Units can be updated within their account"
on public.units for update to authenticated
using (
  auth.uid() is not null
  and company_id = auth.uid()
)
with check (
  auth.uid() is not null
  and company_id = auth.uid()
  and exists (
    select 1 from public.properties p
    where p.id = property_id and p.company_id = auth.uid()
  )
);

drop policy if exists "Units can be deleted within their account" on public.units;
create policy "Units can be deleted within their account"
on public.units for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());