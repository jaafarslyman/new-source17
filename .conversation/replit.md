# FlowPoint AI

FlowPoint AI is a relationship and outreach workspace for contacts, inbox conversations, business policies, properties, notifications, and AI-assisted follow-up workflows.

## Run & Operate

- `pnpm --filter @workspace/flowpoint-ai run dev` — run the FlowPoint frontend
- `pnpm --filter @workspace/api-server run dev` — run the shared API health service
- `pnpm --filter @workspace/flowpoint-ai run typecheck` — typecheck the frontend
- `pnpm --filter @workspace/flowpoint-ai run build` — build the frontend for publishing
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck all packages and build the app/API packages; skips the unused component-preview package

Required frontend environment variables:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/publishable key (never use the service-role key)

Add these in Replit's environment variables before starting or publishing the app; Vite embeds `VITE_*` values into the browser build. The app displays a setup message until both Supabase values are present.

Optional browser-callable webhook URLs:

- `VITE_WEBHOOK_SEND_EMAIL` — email/task automation
- `VITE_WEBHOOK_AGENT` — agent workflow
- `VITE_WEBHOOK_POLICIES_CHAT` — business-policy assistant

Those three flows report a configuration error when their URL is missing. Any URL supplied as `VITE_*` is visible to users in the browser, so only use endpoints designed for client-side access. Variable names are also listed in `artifacts/flowpoint-ai/.env.example`; do not commit real values.

See `supabase/README.md` for database prerequisites, SQL setup order, and the destructive property-reset script warning. The login screen has no self-signup flow; create users through Supabase Auth.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React, Vite, Wouter, Tailwind CSS, Radix UI, Framer Motion
- Data/auth: Supabase client with realtime subscriptions
- API: Express 5 health service under `/api`
- Build: Vite and esbuild

## Where things live

- `artifacts/flowpoint-ai` — main web application served at `/`
- `artifacts/api-server` — small Express service served at `/api`
- `artifacts/mockup-sandbox` — optional component-preview service at `/__mockup`; it is not part of the main app and should not be started unless requested
- `supabase/` — Supabase schema setup and additive migrations
- `artifacts/flowpoint-ai/src/lib/supabase.ts` — browser Supabase client setup
- `artifacts/flowpoint-ai/src/components/SendMessageModal.tsx` — email/task webhook integration
- `artifacts/flowpoint-ai/src/pages/agent.tsx` — agent webhook integration
- `artifacts/flowpoint-ai/src/pages/business-policies.tsx` — policy assistant webhook integration
- `artifacts/flowpoint-ai/src/components/PropertyUnitManager.tsx` — Supabase-backed unit management within property details
- `artifacts/flowpoint-ai/src/components/FlowPointSelect.tsx` — shared custom dropdown menu
- `supabase/units.sql` — executable Units table, relationship, indexes, trigger, and RLS policies

## Architecture decisions

- Supabase remains the source of truth for authentication, application data, and realtime updates.
- Supabase and optional webhook values are client build-time variables, supplied through environment variables rather than committed files.
- The FlowPoint frontend is the main app at `/`; the API retains `/api`. Do not add or start a separate preview service unless requested.
- Units reference `properties.id` through `units.property_id`; property names and addresses are never copied into unit records.

## Product

Users sign in through Supabase, review dashboard activity, manage contacts and properties, work an inbox, maintain business policies, and configure AI follow-up behavior.

## User preferences

- The user will add Supabase credentials as environment variables manually.
- The user does not want a separate preview added.

## Gotchas

- The frontend intentionally fails fast with a clear configuration error when its two Supabase variables are absent.
- `VITE_*` values are bundled by Vite, so set them before starting the app or publishing.
- The SQL files are not a complete fresh-database bootstrap; see `supabase/README.md` for existing-table prerequisites.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
