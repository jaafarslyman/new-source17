-- Role-specific staff attributes and company-wide service assignment.
-- Existing staff assignments remain individual assignments because the
-- assignment_type column defaults to 'staff'.

alter table public.staff
  add column if not exists role_attributes jsonb not null default '{}'::jsonb;

alter table public.service_staff
  add column if not exists assignment_type text not null default 'staff';

alter table public.service_staff
  alter column staff_id drop not null;

alter table public.service_staff
  drop constraint if exists service_staff_assignment_type_check;

alter table public.service_staff
  add constraint service_staff_assignment_type_check
  check (
    assignment_type in ('staff', 'company')
    and (
      (assignment_type = 'staff' and staff_id is not null)
      or (assignment_type = 'company' and staff_id is null)
    )
  );

create unique index if not exists service_staff_company_assignment_unique_idx
  on public.service_staff (company_id, service_id)
  where assignment_type = 'company';

create or replace function public.validate_staff_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := auth.uid();
  end if;

  if new.assignment_type not in ('staff', 'company') then
    raise exception 'Assignment type must be staff or company';
  end if;

  if not exists (
    select 1
    from public.services s
    where s.id = new.service_id
      and s.company_id = new.company_id
  ) then
    raise exception 'Service does not belong to the current company';
  end if;

  if new.assignment_type = 'company' then
    if new.staff_id is not null then
      raise exception 'Company-wide assignment cannot reference an individual staff member';
    end if;
    if exists (
      select 1
      from public.service_staff ss
      where ss.company_id = new.company_id
        and ss.service_id = new.service_id
        and ss.assignment_type = 'staff'
        and ss.id is distinct from new.id
    ) then
      raise exception 'Remove individual staff assignments before assigning the service to the company';
    end if;
  else
    if new.staff_id is null then
      raise exception 'Individual staff assignment requires a staff member';
    end if;
    if exists (
      select 1
      from public.service_staff ss
      where ss.company_id = new.company_id
        and ss.service_id = new.service_id
        and ss.assignment_type = 'company'
        and ss.id is distinct from new.id
    ) then
      raise exception 'Remove the company-wide assignment before assigning individual staff';
    end if;
    if not exists (
      select 1
      from public.staff s
      where s.id = new.staff_id
        and (s.company_id = new.company_id or s.company_id is null)
    ) then
      raise exception 'Staff member does not belong to the current company';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_staff_validate on public.service_staff;
create trigger service_staff_validate
before insert or update on public.service_staff
for each row execute function public.validate_staff_service();
