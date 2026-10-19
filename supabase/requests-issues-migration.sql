-- FlowPoint AI: Requests / Issues
--
-- Additive migration. It preserves existing records and does not drop tables or
-- delete data. Run after the current property schema
-- (supabase/property-rebuild.sql) and the contacts/team and services migrations.
--
-- The existing FlowPoint schema uses UUID ids for properties, units, services,
-- and numeric ids for contacts and staff. The dynamic blocks below preserve
-- those real key types while adding company-scoped foreign-key validation.

begin;

create extension if not exists pgcrypto;

create table if not exists public.request_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists request_types_company_name_idx
  on public.request_types (company_id, lower(name));

create index if not exists request_types_company_active_idx
  on public.request_types (company_id, active, sort_order);

create or replace function public.set_request_types_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists request_types_set_updated_at on public.request_types;
create trigger request_types_set_updated_at
before insert or update on public.request_types
for each row execute function public.set_request_types_updated_at();

do $$
declare
  contact_id_type text;
  staff_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into contact_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'contacts'
    and a.attname = 'id' and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
    into staff_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'staff'
    and a.attname = 'id' and not a.attisdropped;

  if contact_id_type is null or staff_id_type is null then
    raise exception 'The existing contacts and staff tables with primary keys are required';
  end if;

  execute format($sql$
    create table if not exists public.requests (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      title text not null check (length(trim(title)) > 0),
      description text,
      request_type_id uuid references public.request_types(id) on delete set null,
      status text not null default 'open'
        check (status in ('open','in_progress','waiting_on_customer','waiting_on_staff','resolved','closed','cancelled')),
      priority text not null default 'normal'
        check (priority in ('low','normal','high','urgent')),
      contact_id %s references public.contacts(id) on delete set null,
      property_id uuid references public.properties(id) on delete set null,
      unit_id uuid references public.units(id) on delete set null,
      service_id uuid references public.services(id) on delete set null,
      assigned_staff_id %s references public.staff(id) on delete set null,
      due_date date,
      internal_notes text,
      customer_notes text,
      resolution_notes text,
      resolved_at timestamptz,
      closed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $sql$, contact_id_type, staff_id_type);
end;
$$;

create index if not exists requests_company_status_idx
  on public.requests (company_id, status);
create index if not exists requests_company_priority_idx
  on public.requests (company_id, priority);
create index if not exists requests_company_type_idx
  on public.requests (company_id, request_type_id);
create index if not exists requests_company_property_idx
  on public.requests (company_id, property_id);
create index if not exists requests_company_unit_idx
  on public.requests (company_id, unit_id);
create index if not exists requests_company_service_idx
  on public.requests (company_id, service_id);
create index if not exists requests_company_assignee_idx
  on public.requests (company_id, assigned_staff_id);
create index if not exists requests_company_contact_idx
  on public.requests (company_id, contact_id);
create index if not exists requests_company_updated_idx
  on public.requests (company_id, updated_at desc);

create table if not exists public.issue_activity (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.requests(id) on delete cascade,
  company_id uuid not null default auth.uid(),
  activity_type text not null
    check (activity_type in ('created','status_changed','priority_changed','assigned','reassigned','note_added','resolved','closed','updated')),
  description text not null,
  actor_type text not null default 'user',
  actor_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists issue_activity_issue_created_idx
  on public.issue_activity (issue_id, created_at desc);
create index if not exists issue_activity_company_created_idx
  on public.issue_activity (company_id, created_at desc);

create or replace function public.validate_request_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then new.company_id := auth.uid(); end if;
  if new.company_id <> auth.uid() then
    raise exception 'Requests must belong to the authenticated company';
  end if;

  if new.request_type_id is not null and not exists (
    select 1 from public.request_types t
    where t.id = new.request_type_id and t.company_id = new.company_id
  ) then
    raise exception 'Request type does not belong to the current company';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts c
    where c.id = new.contact_id and (c.company_id = new.company_id or c.company_id is null)
  ) then
    raise exception 'Contact does not belong to the current company';
  end if;
  if new.property_id is not null and not exists (
    select 1 from public.properties p
    where p.id = new.property_id and p.company_id = new.company_id
  ) then
    raise exception 'Property does not belong to the current company';
  end if;
  if new.unit_id is not null and not exists (
    select 1 from public.units u
    where u.id = new.unit_id and u.company_id = new.company_id
      and (new.property_id is null or u.property_id = new.property_id)
  ) then
    raise exception 'Unit does not belong to the selected property and company';
  end if;
  if new.service_id is not null and not exists (
    select 1 from public.services s
    where s.id = new.service_id and s.company_id = new.company_id
  ) then
    raise exception 'Service does not belong to the current company';
  end if;
  if new.assigned_staff_id is not null and not exists (
    select 1 from public.staff s
    where s.id = new.assigned_staff_id and (s.company_id = new.company_id or s.company_id is null)
  ) then
    raise exception 'Staff member does not belong to the current company';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'resolved' and new.resolved_at is null then
      new.resolved_at := now();
    end if;
    if new.status = 'closed' and new.closed_at is null then
      new.closed_at := now();
    end if;
  else
    if new.status = 'resolved' and old.status is distinct from 'resolved' and new.resolved_at is null then
      new.resolved_at := now();
    elsif new.status <> 'resolved' and old.status = 'resolved' then
      new.resolved_at := null;
    end if;
    if new.status = 'closed' and old.status is distinct from 'closed' and new.closed_at is null then
      new.closed_at := now();
    elsif new.status <> 'closed' and old.status = 'closed' then
      new.closed_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requests_validate_relationships on public.requests;
create trigger requests_validate_relationships
before insert or update on public.requests
for each row execute function public.validate_request_relationships();

create or replace function public.record_request_created_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.issue_activity (issue_id, company_id, activity_type, description, actor_type)
  values (new.id, new.company_id, 'created', 'Request created', 'user');
  return new;
end;
$$;

drop trigger if exists requests_record_created_activity on public.requests;
create trigger requests_record_created_activity
after insert on public.requests
for each row execute function public.record_request_created_activity();

create or replace function public.validate_issue_activity_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_company uuid;
begin
  select company_id into request_company from public.requests where id = new.issue_id;
  if request_company is null or request_company <> new.company_id or new.company_id <> auth.uid() then
    raise exception 'Activity must belong to the request company';
  end if;
  return new;
end;
$$;

drop trigger if exists issue_activity_validate_company on public.issue_activity;
create trigger issue_activity_validate_company
before insert or update on public.issue_activity
for each row execute function public.validate_issue_activity_company();

alter table public.request_types enable row level security;
alter table public.requests enable row level security;
alter table public.issue_activity enable row level security;

grant select, insert, update, delete on table public.request_types to authenticated;
grant select, insert, update, delete on table public.requests to authenticated;
grant select, insert, update, delete on table public.issue_activity to authenticated;
revoke all on table public.request_types from anon;
revoke all on table public.requests from anon;
revoke all on table public.issue_activity from anon;

drop policy if exists request_types_select on public.request_types;
create policy request_types_select on public.request_types for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());
drop policy if exists request_types_insert on public.request_types;
create policy request_types_insert on public.request_types for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());
drop policy if exists request_types_update on public.request_types;
create policy request_types_update on public.request_types for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());
drop policy if exists request_types_delete on public.request_types;
create policy request_types_delete on public.request_types for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());
drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists issue_activity_select on public.issue_activity;
create policy issue_activity_select on public.issue_activity for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());
drop policy if exists issue_activity_insert on public.issue_activity;
create policy issue_activity_insert on public.issue_activity for insert to authenticated
with check (
  auth.uid() is not null and company_id = auth.uid()
  and exists (select 1 from public.requests r where r.id = issue_id and r.company_id = auth.uid())
);
drop policy if exists issue_activity_update on public.issue_activity;
create policy issue_activity_update on public.issue_activity for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());
drop policy if exists issue_activity_delete on public.issue_activity;
create policy issue_activity_delete on public.issue_activity for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

commit;