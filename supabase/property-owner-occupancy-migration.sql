-- Adds an explicit owner-occupied state for properties and individual units.
-- Existing rental values are retained; existing occupied units are treated as rented.

begin;

alter table public.properties
  add column if not exists occupancy_status text;

update public.properties
set occupancy_status = case
  when is_rented then 'rented'
  when occupancy_status = 'owner_occupied' then 'owner_occupied'
  else 'vacant'
end
where occupancy_status is null
   or occupancy_status not in ('rented', 'owner_occupied', 'vacant')
   or (occupancy_status = 'rented') is distinct from is_rented;

alter table public.properties
  alter column occupancy_status set default 'vacant',
  alter column occupancy_status set not null,
  drop constraint if exists properties_occupancy_status_check,
  add constraint properties_occupancy_status_check
    check (
      occupancy_status in ('rented', 'owner_occupied', 'vacant')
      and (
        (occupancy_status = 'rented' and is_rented)
        or (occupancy_status in ('owner_occupied', 'vacant') and not is_rented)
      )
    );

alter table public.units
  add column if not exists occupancy_status text;

update public.units
set occupancy_status = case
  when status = 'occupied' then 'rented'
  else 'vacant'
end
where occupancy_status is null;

alter table public.units
  alter column occupancy_status set default 'vacant',
  alter column occupancy_status set not null,
  drop constraint if exists units_occupancy_status_check,
  add constraint units_occupancy_status_check
    check (occupancy_status in ('rented', 'owner_occupied', 'vacant'));

alter table public.units
  drop constraint if exists units_rental_details_check,
  add constraint units_rental_details_check
    check (
      (
        occupancy_status = 'rented'
        and status = 'occupied'
        and monthly_rent is not null and monthly_rent > 0
        and lease_start_date is not null
        and (
          (lease_term_type = 'fixed' and lease_end_date is not null and lease_end_date >= lease_start_date)
          or
          (lease_term_type = 'until_termination' and lease_end_date is null)
        )
      )
      or
      (
        occupancy_status = 'owner_occupied'
        and status = 'occupied'
        and monthly_rent is null
        and lease_term_type is null
        and lease_start_date is null
        and lease_end_date is null
      )
      or
      (
        occupancy_status = 'vacant'
        and status in ('vacant', 'maintenance', 'unavailable')
        and monthly_rent is null
        and lease_term_type is null
        and lease_start_date is null
        and lease_end_date is null
      )
    );

commit;
