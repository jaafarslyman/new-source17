-- FlowPoint AI: Contacts and Team / Staff foundation
--
-- This migration is additive. It does not recreate or delete contacts/staff,
-- and it does not create a Services or Issues schema before those source-of-
-- truth tables exist.
--
-- The existing FlowPoint properties/units schema scopes records with
-- company_id = auth.uid(). New relationship records use the same scope.
-- Existing contacts/staff policies are preserved; if those tables had no
-- policies, the guarded blocks below add account-scoped policies.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Contacts: preserve the existing table and add only missing foundations.
-- ---------------------------------------------------------------------------

alter table if exists public.contacts
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists customer_id text,
  add column if not exists contact_type text default 'other',
  add column if not exists status text default 'active',
  add column if not exists preferred_channel text default 'email',
  add column if not exists alternate_phone text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists country text,
  add column if not exists company_name text,
  add column if not exists ai_summary text,
  add column if not exists internal_notes text,
  add column if not exists last_contacted_at timestamptz;

-- Keep the old business_name data usable in the normalized company_name field.
update public.contacts
set company_name = business_name
where company_name is null
  and business_name is not null;

create sequence if not exists public.contacts_customer_id_seq
  start with 10000;

-- Existing rows receive a stable human-readable identifier. The sequence is
-- independent of the database UUID and is also used for future inserts.
do $$
declare
  contact_row record;
  next_customer_id text;
begin
  for contact_row in
    select id
    from public.contacts
    where customer_id is null or length(trim(customer_id)) = 0
    order by created_at nulls first, id
  loop
    loop
      next_customer_id := 'FP-' || lpad(nextval('public.contacts_customer_id_seq')::text, 5, '0');
      exit when not exists (
        select 1
        from public.contacts existing_contact
        where existing_contact.customer_id = next_customer_id
      );
    end loop;

    update public.contacts
    set customer_id = next_customer_id
    where id = contact_row.id;
  end loop;
end;
$$;

create unique index if not exists contacts_customer_id_uidx
  on public.contacts (
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    customer_id
  )
  where customer_id is not null;

create index if not exists contacts_company_status_idx
  on public.contacts (company_id, status);

create index if not exists contacts_company_type_idx
  on public.contacts (company_id, contact_type);

create index if not exists contacts_last_contacted_idx
  on public.contacts (company_id, last_contacted_at desc);

create or replace function public.set_contacts_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_customer_id text;
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;

  if new.contact_type is null or length(trim(new.contact_type)) = 0 then
    new.contact_type := 'other';
  end if;

  if new.status is null or length(trim(new.status)) = 0 then
    new.status := 'active';
  end if;

  if new.preferred_channel is null or length(trim(new.preferred_channel)) = 0 then
    new.preferred_channel := 'email';
  end if;

  if new.customer_id is null or length(trim(new.customer_id)) = 0 then
    loop
      next_customer_id := 'FP-' || lpad(nextval('public.contacts_customer_id_seq')::text, 5, '0');
      exit when not exists (
        select 1
        from public.contacts existing_contact
        where existing_contact.customer_id = next_customer_id
      );
    end loop;
    new.customer_id := next_customer_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_set_defaults on public.contacts;
create trigger contacts_set_defaults
before insert or update on public.contacts
for each row
execute function public.set_contacts_defaults();

-- Add new-value validation without rejecting legacy rows during migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_contact_type_check') then
    alter table public.contacts
      add constraint contacts_contact_type_check
      check (contact_type in ('tenant', 'property_owner', 'company', 'applicant', 'prospect', 'vendor', 'contractor', 'former_tenant', 'former_owner', 'other'))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_status_check') then
    alter table public.contacts
      add constraint contacts_status_check
      check (status in ('active', 'inactive', 'archived'))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_preferred_channel_check') then
    alter table public.contacts
      add constraint contacts_preferred_channel_check
      check (preferred_channel in ('email', 'phone', 'sms', 'whatsapp', 'other'))
      not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: preserve the existing table and add only missing foundations.
-- ---------------------------------------------------------------------------

alter table if exists public.staff
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists status text default 'active',
  add column if not exists preferred_internal_channel text default 'email',
  add column if not exists responsibilities text;

create index if not exists staff_company_status_idx
  on public.staff (company_id, status);

create index if not exists staff_company_department_idx
  on public.staff (company_id, department);

create or replace function public.set_staff_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;
  if new.status is null or length(trim(new.status)) = 0 then
    new.status := 'active';
  end if;
  if new.preferred_internal_channel is null or length(trim(new.preferred_internal_channel)) = 0 then
    new.preferred_internal_channel := 'email';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists staff_set_defaults on public.staff;
create trigger staff_set_defaults
before insert or update on public.staff
for each row
execute function public.set_staff_defaults();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_status_check') then
    alter table public.staff
      add constraint staff_status_check
      check (status in ('active', 'inactive'))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_preferred_internal_channel_check') then
    alter table public.staff
      add constraint staff_preferred_internal_channel_check
      check (preferred_internal_channel in ('email', 'phone', 'sms', 'slack', 'other'))
      not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared updated_at handling for relationship rows.
-- ---------------------------------------------------------------------------

create or replace function public.set_flowpoint_updated_at()
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

-- ---------------------------------------------------------------------------
-- Contact ↔ property/unit relationships.
--
-- The existing contact id type is detected so this works with the current
-- integer/bigint/uuid identity without recreating the contacts table.
-- ---------------------------------------------------------------------------

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
      notes text
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
  add column if not exists notes text;

create index if not exists contact_property_relationships_company_contact_idx
  on public.contact_property_relationships (company_id, contact_id);

create index if not exists contact_property_relationships_company_property_idx
  on public.contact_property_relationships (company_id, property_id);

create index if not exists contact_property_relationships_company_unit_idx
  on public.contact_property_relationships (company_id, unit_id);

create unique index if not exists contact_property_relationships_unique_idx
  on public.contact_property_relationships (
    company_id,
    contact_id,
    property_id,
    coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    relationship_type,
    coalesce(start_date, '0001-01-01'::date)
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contact_relationship_type_check') then
    alter table public.contact_property_relationships
      add constraint contact_relationship_type_check
      check (relationship_type in ('tenant', 'owner', 'applicant', 'vendor', 'contractor', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_relationship_dates_check') then
    alter table public.contact_property_relationships
      add constraint contact_relationship_dates_check
      check (end_date is null or start_date is null or end_date >= start_date);
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
    raise exception 'Property does not belong to the current company';
  end if;

  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id
      and u.property_id = new.property_id
      and u.company_id = new.company_id
  ) then
    raise exception 'Unit does not belong to the selected property and company';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.id = new.contact_id
      and (c.company_id = new.company_id or c.company_id is null)
  ) then
    raise exception 'Contact does not belong to the current company';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contact_property_relationship_validate on public.contact_property_relationships;
create trigger contact_property_relationship_validate
before insert or update on public.contact_property_relationships
for each row
execute function public.validate_contact_property_relationship();

drop trigger if exists contact_property_relationships_set_updated_at on public.contact_property_relationships;
create trigger contact_property_relationships_set_updated_at
before update on public.contact_property_relationships
for each row
execute function public.set_flowpoint_updated_at();

-- ---------------------------------------------------------------------------
-- Staff ↔ property relationships.
-- ---------------------------------------------------------------------------

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
    create table if not exists public.staff_property_relationships (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      staff_id %s not null references public.staff(id) on delete cascade,
      property_id uuid not null references public.properties(id) on delete cascade,
      notes text
    )
  $sql$, staff_id_type);
end;
$$;

alter table public.staff_property_relationships
  add column if not exists company_id uuid default auth.uid(),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists notes text;

create index if not exists staff_property_relationships_company_staff_idx
  on public.staff_property_relationships (company_id, staff_id);

create index if not exists staff_property_relationships_company_property_idx
  on public.staff_property_relationships (company_id, property_id);

create unique index if not exists staff_property_relationships_unique_idx
  on public.staff_property_relationships (company_id, staff_id, property_id);

create or replace function public.validate_staff_property_relationship()
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
    raise exception 'Property does not belong to the current company';
  end if;

  if not exists (
    select 1 from public.staff s
    where s.id = new.staff_id
      and (s.company_id = new.company_id or s.company_id is null)
  ) then
    raise exception 'Staff member does not belong to the current company';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists staff_property_relationship_validate on public.staff_property_relationships;
create trigger staff_property_relationship_validate
before insert or update on public.staff_property_relationships
for each row
execute function public.validate_staff_property_relationship();

drop trigger if exists staff_property_relationships_set_updated_at on public.staff_property_relationships;
create trigger staff_property_relationships_set_updated_at
before update on public.staff_property_relationships
for each row
execute function public.set_flowpoint_updated_at();

-- ---------------------------------------------------------------------------
-- RLS for the new relationship tables.
-- ---------------------------------------------------------------------------

alter table public.contact_property_relationships enable row level security;
alter table public.staff_property_relationships enable row level security;

grant select, insert, update, delete on table public.contact_property_relationships to authenticated;
grant select, insert, update, delete on table public.staff_property_relationships to authenticated;

drop policy if exists "Contact relationships are visible to their company" on public.contact_property_relationships;
create policy "Contact relationships are visible to their company"
on public.contact_property_relationships for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Contact relationships can be created for their company" on public.contact_property_relationships;
create policy "Contact relationships can be created for their company"
on public.contact_property_relationships for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Contact relationships can be updated within their company" on public.contact_property_relationships;
create policy "Contact relationships can be updated within their company"
on public.contact_property_relationships for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Contact relationships can be deleted within their company" on public.contact_property_relationships;
create policy "Contact relationships can be deleted within their company"
on public.contact_property_relationships for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Staff relationships are visible to their company" on public.staff_property_relationships;
create policy "Staff relationships are visible to their company"
on public.staff_property_relationships for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Staff relationships can be created for their company" on public.staff_property_relationships;
create policy "Staff relationships can be created for their company"
on public.staff_property_relationships for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Staff relationships can be updated within their company" on public.staff_property_relationships;
create policy "Staff relationships can be updated within their company"
on public.staff_property_relationships for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Staff relationships can be deleted within their company" on public.staff_property_relationships;
create policy "Staff relationships can be deleted within their company"
on public.staff_property_relationships for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

-- Add guarded account policies only when the legacy table had none. This
-- avoids overwriting an existing auth/company policy installed by the app.
do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.contacts'::regclass) then
    alter table public.contacts enable row level security;
    execute 'create policy "Contacts are visible to their company" on public.contacts for select to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null))';
    execute 'create policy "Contacts can be created for their company" on public.contacts for insert to authenticated with check (auth.uid() is not null and company_id = auth.uid())';
    execute 'create policy "Contacts can be updated within their company" on public.contacts for update to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null)) with check (auth.uid() is not null and company_id = auth.uid())';
    execute 'create policy "Contacts can be deleted within their company" on public.contacts for delete to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null))';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.staff'::regclass) then
    alter table public.staff enable row level security;
    execute 'create policy "Staff are visible to their company" on public.staff for select to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null))';
    execute 'create policy "Staff can be created for their company" on public.staff for insert to authenticated with check (auth.uid() is not null and company_id = auth.uid())';
    execute 'create policy "Staff can be updated within their company" on public.staff for update to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null)) with check (auth.uid() is not null and company_id = auth.uid())';
    execute 'create policy "Staff can be deleted within their company" on public.staff for delete to authenticated using (auth.uid() is not null and (company_id = auth.uid() or company_id is null))';
  end if;
end;
$$;

commit;