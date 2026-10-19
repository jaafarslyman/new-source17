-- FlowPoint AI: customer agreements for catalog services
--
-- Additive migration. Run after services-migration.sql. It creates a separate
-- contract table so the service catalog remains independent of its customers.
-- Existing services and contact_services rows are preserved.

begin;

create extension if not exists pgcrypto;

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
    create table if not exists public.service_contracts (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      contact_id %s not null references public.contacts(id) on delete restrict,
      service_id uuid not null references public.services(id) on delete restrict,
      price_amount numeric(14, 2) not null check (price_amount >= 0),
      currency_code text not null default 'USD'
        check (currency_code ~ '^[A-Z]{3}$'),
      billing_period text not null default 'monthly'
        check (billing_period in ('one_time', 'weekly', 'monthly', 'quarterly', 'annually')),
      start_date date not null default current_date,
      end_date date,
      status text not null default 'active'
        check (status in ('active', 'pending', 'completed', 'cancelled')),
      notes text,
      check (end_date is null or end_date >= start_date)
    )
  $sql$, contact_id_type);
end;
$$;

create index if not exists service_contracts_company_created_idx
  on public.service_contracts (company_id, created_at desc);

create index if not exists service_contracts_company_contact_idx
  on public.service_contracts (company_id, contact_id);

create index if not exists service_contracts_company_service_idx
  on public.service_contracts (company_id, service_id);

create index if not exists service_contracts_company_status_idx
  on public.service_contracts (company_id, status);

create or replace function public.validate_service_contract()
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
    select 1 from public.services s
    where s.id = new.service_id and s.company_id = new.company_id
  ) then
    raise exception 'Service does not belong to the current company';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.id = new.contact_id
      and (c.company_id = new.company_id or c.company_id is null)
  ) then
    raise exception 'Contact does not belong to the current company';
  end if;

  new.currency_code := upper(trim(new.currency_code));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_contracts_validate on public.service_contracts;
create trigger service_contracts_validate
before insert or update on public.service_contracts
for each row execute function public.validate_service_contract();

alter table public.service_contracts enable row level security;
grant select, insert, update, delete on table public.service_contracts to authenticated;
revoke all on table public.service_contracts from anon;

drop policy if exists "Service contracts are visible to their company" on public.service_contracts;
create policy "Service contracts are visible to their company"
on public.service_contracts for select to authenticated
using (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Service contracts can be created for their company" on public.service_contracts;
create policy "Service contracts can be created for their company"
on public.service_contracts for insert to authenticated
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Service contracts can be updated within their company" on public.service_contracts;
create policy "Service contracts can be updated within their company"
on public.service_contracts for update to authenticated
using (auth.uid() is not null and company_id = auth.uid())
with check (auth.uid() is not null and company_id = auth.uid());

drop policy if exists "Service contracts can be deleted within their company" on public.service_contracts;
create policy "Service contracts can be deleted within their company"
on public.service_contracts for delete to authenticated
using (auth.uid() is not null and company_id = auth.uid());

commit;
