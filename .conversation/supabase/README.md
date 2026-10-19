# Supabase setup

FlowPoint uses Supabase directly from the browser for sign-in, application data, and realtime updates.

## Environment

Set these Replit environment variables before starting or publishing the app:

- `VITE_SUPABASE_URL` — the project URL from Supabase
- `VITE_SUPABASE_ANON_KEY` — the anon/publishable public key

Do not use or expose a Supabase service-role key. The browser app depends on Supabase Auth and row-level security (RLS) to restrict data access.

The app's login page supports signing in; it does not include account registration. Create the initial user in Supabase Auth.

## Database prerequisites and migrations

The SQL files in this repository are not a complete schema bootstrap for a new Supabase project. They add FlowPoint features to an existing database and assume some base tables already exist, including contacts, staff, inbox, chats, agent_chat, settings, categories, policies, and notifications. The requests/issues migration also extends an existing `requests` table. Confirm that the base schema and its RLS policies are in place before applying these files.

For the current property and residential-unit flow, use the rebuild script below instead of manually dropping `public.properties`. The script is the SQL to paste into Supabase SQL Editor; it recreates the current property columns and account-scoped RLS policies, and also rebuilds the dependent unit/contact-link schema the page uses.

Run `supabase/property-rebuild.sql` after confirming `public.contacts` exists with its `id`, `company_id`, `contact_type`, `name`, `email`, and `phone` fields. It supports a missing `public.properties` table, but avoid manually dropping the table first so the script can safely manage all dependent records and foreign keys.

**Data impact:** the rebuild clears properties, units, property/unit contact links, staff-property assignments, and service-to-property/unit assignments. It keeps contacts, service definitions, and requests, but clears property/unit links on requests. It can retain archived owner/renter relationship history if the history triggers are installed. Back up any records you need before running it.

The property RLS policies scope reads and writes to the signed-in Supabase user (`company_id = auth.uid()`). The rebuild script also permits `company` as a contact type for company owners. Other feature migrations are separate and are not run automatically by the app; review them against your current schema before applying.

After `services-migration.sql`, run `service-contracts-migration.sql` to add customer-specific agreements for catalog services. This additive migration creates `service_contracts` with the customer, service, agreed amount/currency, billing frequency, start/end dates, status, notes, and company-scoped RLS. It does not change or delete existing service or contact relationship rows. Service and contact records referenced by a contract cannot be deleted until the contract is removed.

Also run `service-category-details-migration.sql` after `services-migration.sql` to add structured category-specific service settings. It adds a JSONB object column with an empty-object default, preserving all existing service rows and keeping the current RLS policies in effect.

## Commercial property subtypes

After the existing property and unit tables are set up, run `commercial-properties-migration.sql` to add office, retail, hospitality, and mixed-use fields. This migration preserves existing records. Its updated check constraints are added `NOT VALID` so older rows do not block the migration; new and updated rows must satisfy them. Do not rerun `property-rebuild.sql` just to add commercial support because that script clears property and unit data.

After the commercial migration, run `mixed-use-floor-plan-migration.sql`. It adds a JSON floor plan to mixed-use properties and updates the capacity triggers so residential and commercial spaces can be recorded against their per-floor, per-use counts. For example, a ground-floor office and two apartments on each of two upper floors are stored as `[{"apartment":0,"office":1},{"apartment":2,"office":0},{"apartment":2,"office":0}]`. The migration preserves existing records; existing mixed-use properties need a floor plan entered before new spaces can be added.

After the commercial migration, run `industrial-properties-migration.sql` to add industrial subtype details, support industrial property rentals, and enforce subtype-specific data for warehouses, distribution centers, manufacturing plants, and R&D facilities. It is additive and preserves existing records. Its new checks are `NOT VALID` so existing rows do not block the migration; new and updated rows must satisfy them. Do not rerun `property-rebuild.sql` to add industrial support.

After `industrial-properties-migration.sql`, run `industrial-distribution-operations-optional.sql` to make distribution operations optional for distribution centers. Distribution goods remain required.

After `property-ownership-migration.sql`, run `property-owner-share-scope-migration.sql`. It allows an owner relationship to store both a percentage share and an apartment/use scope, without deleting relationship data.

After those ownership migrations, run `property-unit-ownership-migration.sql` to add the multi-unit construction flag and per-unit ownership map. It preserves existing data and backfills ownership already linked to units, plus sole-owner mappings for all planned units. Do not rerun `property-rebuild.sql` just to add these fields.

## Optional automation webhooks

These are only needed for their corresponding automation features:

- `VITE_WEBHOOK_SEND_EMAIL`
- `VITE_WEBHOOK_AGENT`
- `VITE_WEBHOOK_POLICIES_CHAT`

Because they are `VITE_*` variables, their values are exposed in the client bundle. Use only endpoints that are safe for direct browser access; do not put private service credentials in these values.
