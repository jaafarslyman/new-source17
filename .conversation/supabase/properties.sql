-- LEGACY property schema bootstrap.
-- The current residential property flow uses supabase/property-rebuild.sql,
-- which defines the current fields, validation rules, units, and RLS policies.
-- Do not use this older property_type model for the current app.
--
-- Until FlowPoint has a shared organization/company claim, company_id is
-- scoped to auth.uid(). This keeps each account isolated today while leaving
-- an explicit ownership key ready for a future organization relationship.

create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null check (length(trim(name)) > 0),
  property_type text not null check (
    property_type in (
      'apartment_building',
      'single_family',
      'condo',
      'townhouse',
      'commercial',
      'mixed_use',
      'other'
    )
  ),
  address_line1 text not null check (length(trim(address_line1)) > 0),
  address_line2 text,
  city text not null check (length(trim(city)) > 0),
  state text,
  postal_code text,
  country text not null default 'US' check (length(trim(country)) > 0),
  description text,

  units_count integer not null default 0 check (units_count >= 0),
  amenities text,
  property_rules text,
  parking_information text,
  access_information text,
  utilities_information text,
  emergency_information text,
  notes text,

  status text not null default 'active' check (status in ('active', 'inactive'))
);

create index if not exists properties_company_id_idx
  on public.properties (company_id);

create index if not exists properties_company_status_idx
  on public.properties (company_id, status);

create index if not exists properties_company_type_idx
  on public.properties (company_id, property_type);

create or replace function public.set_properties_updated_at()
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

drop trigger if exists properties_set_updated_at on public.properties;

create trigger properties_set_updated_at
before update on public.properties
for each row
execute function public.set_properties_updated_at();

alter table public.properties enable row level security;

grant select, insert, update, delete on table public.properties to authenticated;
revoke all on table public.properties from anon;

drop policy if exists "Properties are visible to their account" on public.properties;
create policy "Properties are visible to their account"
on public.properties
for select
to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Properties can be created for their account" on public.properties;
create policy "Properties can be created for their account"
on public.properties
for insert
to authenticated
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Properties can be updated within their account" on public.properties;
create policy "Properties can be updated within their account"
on public.properties
for update
to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Properties can be deleted within their account" on public.properties;
create policy "Properties can be deleted within their account"
on public.properties
for delete
to authenticated
using (auth.uid() is not null and company_id = auth.uid());