# Supabase Migration from Hosted Cloud to Self-Hosted Server

## 1. Goal

Move app hosting and Supabase off the current development laptop and onto the target server.

- Current development machine: `laptop`
- Source code location: `GitHub repository`
- Target server IP: `172.18.0.230`
- Constraint: use self-hosted Supabase instead of the free cloud Supabase plan
- Immediate priority: reduce hosted Supabase database usage before `2026-04-24`

Checklist:

- [ ] Confirm migration scope and success criteria
- [ ] Confirm production downtime tolerance
- [ ] Confirm migration owner(s)
- [ ] Confirm maintenance window

## Emergency Database-First Plan

Immediate objective: reduce hosted Supabase database usage before `2026-04-24` by moving the database workload onto the self-hosted target first. Broader app/server polish is explicitly secondary until database relief is achieved.

Urgent execution order:

1. Gather missing server facts
2. Prepare server for self-hosted Supabase
3. Install and run self-hosted Supabase
4. Export and restore the hosted database
5. Verify the migrated database
6. Defer broader app/server polish until after database relief

Emergency checklist:

- [x] Reprioritize this runbook around emergency database relief before `2026-04-24`
- [ ] Gather the remaining server facts that block self-hosted Supabase bring-up
- [ ] Prepare the target server only to the level needed to run self-hosted Supabase safely
- [ ] Install and start the self-hosted Supabase stack
- [ ] Export hosted database schema and data
- [ ] Restore hosted database into the self-hosted Postgres instance
- [ ] Verify database connectivity, row counts, critical functions, and key tables
- [ ] Shift hosted-database-dependent usage off the cloud project before `2026-04-24`
- [ ] Keep non-database migration work deferred unless it becomes mandatory for database relief

## Deferred Until After Database Relief

These items are not on the critical path for reducing hosted database usage before `2026-04-24` and should stay deferred unless they become immediately necessary for the database move:

- [ ] Reverse proxy polish
- [ ] Public DNS / TLS hardening details
- [ ] Full app deployment hardening
- [ ] Storage migration unless required immediately
- [ ] Edge function migration unless required immediately
- [ ] Broader observability improvements

## Database-First Viability Assessment

This assessment uses the current runbook as the source of truth and evaluates only whether the database can be moved first to reduce hosted Supabase database usage before `2026-04-24`.

What is already known that supports a database-first move:

- `warning`: The runbook already defines an emergency database-first execution order: gather missing server facts, prepare the server, install self-hosted Supabase, export and restore the hosted database, then verify the database.
- `warning`: The target server IP is confirmed as `172.18.0.230`, so the destination for the emergency move is known at a basic level.
- `warning`: Self-hosted Supabase is already the documented target state, so the direction of travel is settled even if some implementation details are still open.
- `warning`: The repository findings already confirm tracked SQL files exist in `supabase/`, which supports reconstructing database objects during restore and validation.
- `warning`: The runbook already documents confirmed hosted-project RLS policies and helper functions `is_member(...)` and `is_admin(...)`, so the database policy model is at least partially known rather than entirely hidden.
- `warning`: The runbook already captures that database usage is extensive and identifies key RPC/functions and tables to validate, which gives the database-first move a concrete verification target.
- `warning`: The runbook explicitly treats storage, edge functions, reverse proxy polish, DNS/TLS hardening details, broader observability improvements, and full deployment hardening as deferrable unless they become immediately necessary.

What known items could block a database-first move:

- `blocker now`: Some server facts still block self-hosted Supabase bring-up. OS, hostname, SSH user, and basic capacity are now known, but deployment directory, backup/export storage location, and the exact minimum validation access path still need to be finalized.
- `blocker now`: The self-hosted runtime is not yet defined. The runbook still marks target OS/runtime stack, container/orchestration approach, and database hosting target as `TODO`.
- `blocker now`: The actual server preparation and self-hosted Supabase installation work are still unchecked, including runtime install, deployment directory creation, persistent volumes, and minimum backup setup.
- `blocker now`: The exact database migration method is still unresolved. The runbook still asks for the source project reference, database connection details, and final database migration method.
- `blocker now`: Required database extensions are still unconfirmed, which can block restore success or leave the self-hosted database incomplete.
- `blocker now`: The self-hosted database URL / connection string is still unknown, which blocks cutover and verification.
- `warning`: Hosted-only auth settings may still exist outside the repo or runbook. That may not block raw database export/restore, but it can block immediate safe usage of the migrated database by the app if those settings turn out to be required.
- `warning`: Tracked SQL is incomplete relative to the hosted project because no tracked RLS policy SQL was found even though hosted-project inspection confirmed policies exist. That means export/restore must account for hosted-only database objects, not just tracked files.
- `warning`: Current database size and region are still `TODO`, which may affect export timing and the practicality of completing the emergency move before `2026-04-24`.

What items are not blockers and can be deferred:

- `defer until later`: Reverse proxy polish.
- `defer until later`: Public DNS / TLS hardening details.
- `defer until later`: Full app deployment hardening.
- `defer until later`: Storage migration unless it proves necessary for immediate database relief.
- `defer until later`: Edge function migration unless it proves necessary for immediate database relief.
- `defer until later`: Broader observability improvements.
- `defer until later`: Secret rotation after migration validation. The runbook already states this can wait until the migrated system is functioning and validated.
- `defer until later`: Cleanup or retirement decisions for `Copy`, `backup`, and experimental files, unless one of those files turns out to be operationally required for the database move.
- `defer until later`: Final public internet exposure decisions for the app and direct Supabase APIs, unless the chosen database-first cutover path requires them immediately.

Recommendation: database-first move is viable with these prerequisites. The current runbook already supports the strategy and identifies enough of the database shape and target direction to proceed, but the move is still gated by a short list of immediate prerequisites: gather the missing server facts, define the self-hosted runtime/container approach, complete minimum server preparation, confirm required database extensions and the final export/restore method, and establish the self-hosted database connection details needed for restore and verification.

## Missing Server Facts for Database-First Migration

This section lists only the minimum remaining unknowns needed before installing self-hosted Supabase on `172.18.0.230` for the immediate database-first move.

- OS and version
  Why it matters: determines the exact install steps, package commands, Docker setup path, and compatibility expectations for self-hosted Supabase.
  Who must provide it: `user` or `Codex` after server access is available.
  Status: `known`

- SSH user / access method
  Why it matters: Codex cannot inspect or prepare the server without the correct login user and connection method.
  Who must provide it: `user`
  Status: `known`

- Docker installed?
  Why it matters: self-hosted Supabase depends on Docker-based services, so install work cannot start until this is confirmed.
  Who must provide it: `Codex` after server access is available, or `user`
  Status: `known`

- Docker Compose available?
  Why it matters: bring-up steps depend on whether Compose is already available or must be installed/configured first.
  Who must provide it: `Codex` after server access is available, or `user`
  Status: `known`

- Free disk space
  Why it matters: the server needs enough space for container images, Postgres data, and hosted database export/restore files.
  Who must provide it: `Codex` after server access is available, or `user`
  Status: `known`

- Available memory
  Why it matters: self-hosted Supabase and Postgres need enough RAM to start reliably and complete the restore without immediate resource pressure.
  Who must provide it: `Codex` after server access is available, or `user`
  Status: `known`

- Intended deployment directory
  Why it matters: Codex needs a confirmed path for the self-hosted Supabase files, compose config, and persistent data mounts.
  Who must provide it: `user`
  Status: `known`

- Internal-only or externally reachable?
  Why it matters: this determines the minimum networking assumptions for the emergency DB move and whether external exposure must be handled now or can wait.
  Who must provide it: `user`
  Status: `known`

- Where backups/exports will be stored
  Why it matters: export and restore work needs a confirmed storage location with enough space so backups are not improvised during the cutover window.
  Who must provide it: `user`
  Status: `known`

### User Inputs Needed Next

- [ ] Provide the SSH user for `172.18.0.230` if Codex will perform server-side checks or installation steps.
- [ ] Decide whether to migrate hosted auth users now or keep using a temporary smoke-test user plus manual `profiles` / `memberships` linkage.
- [ ] Decide whether to move the main app runtime to the server now that the database-first path is validated.

## Minimum Viable Self-Hosted Supabase Install Plan

Purpose:

- Stand up self-hosted Supabase only far enough to restore the hosted database and validate that the migrated database is usable.

Assumptions:

- Target server IP remains `172.18.0.230`.
- Server hostname is `svr-ops-prod01`.
- Server OS is `Ubuntu 24.04.4 LTS`.
- The user already has SSH access to the server.
- Docker is not installed yet.
- Docker Compose should be treated as not available until installed with Docker or verified explicitly.
- Free disk space and available memory are expected to be sufficient for the database-first migration.
- The database can stay internal-only after the main files move to the server.
- Before that final move, local development needs temporary access for restore/validation testing.
- No new production data will be written during migration, so no ongoing write delta handling is required for cutover.

Prerequisites:

- Confirm the SSH user if Codex will run remote checks or commands.
- Choose the deployment directory for the self-hosted Supabase files and persistent data.
- Choose the storage location for hosted database exports and server-side backups.
- Install Docker and ensure Docker Compose support is available.
- Confirm the minimum network path needed so the local dev environment can reach the self-hosted database/API during validation, with no broader public exposure.

Required directories:

- Deployment root: `/opt/energy-app`
- Supabase config / compose working directory under the deployment root
- Persistent Postgres data directory under the deployment root
- Backup/export directory: `/opt/energy-app/backups`
- Hosted export artifact directory: `/opt/energy-app/backups/hosted-export`

Required secrets/placeholders:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`
- `TODO_HOSTED_DATABASE_EXPORT_PATH`
- `TODO_SELF_HOSTED_DB_CONNECTION`

Install/startup steps at a high level:

1. SSH to `172.18.0.230` and confirm the chosen deployment and backup/export paths.
2. Install Docker and Docker Compose support on the server.
3. Create the deployment root and backup/export directories.
4. Place the self-hosted Supabase config in the deployment directory with placeholder secrets replaced by real values supplied outside the repo.
5. Start the minimum required Supabase services for database restore and validation.
6. Confirm the Postgres service is accepting connections from the server itself.
7. Restore the hosted database schema and data into the self-hosted Postgres instance.
8. Run the minimum database validation checks: connectivity, required extensions, row counts, key tables, and required functions/policies.
9. Allow temporary local-dev access only as needed to validate restore results before the main files move to the server.
10. Keep the setup internal-only after validation unless a later step explicitly requires broader exposure.

Service validation steps:

- Confirm Docker is running.
- Confirm the Supabase containers required for Postgres-backed restore/validation are healthy.
- Confirm the self-hosted Postgres port accepts a local connection on the server.
- Confirm the restored database contains expected schemas, key tables, and row counts.
- Confirm required database extensions are present.
- Confirm known helper functions and policy-dependent database objects required by the app exist after restore.
- Confirm local-dev validation connectivity works before the main files move to the server, then remove any temporary exposure not needed afterward.

What is intentionally deferred:

- Reverse proxy setup or polish
- DNS configuration
- Public internet exposure
- TLS hardening for public access
- Full application deployment hardening
- Storage migration unless it becomes necessary for immediate validation
- Edge function migration unless it becomes necessary for immediate validation
- Broader monitoring and observability work

## 2. Current State

- Application hosting location: `TODO`
- Supabase hosting location: `Hosted Cloud Supabase` for current environment(s)
- Development machine: `laptop`
- Source code location: `GitHub repository`
- Current deployment workflow: `TODO`
- Current database size: `TODO`
- Current storage usage: `TODO`

Checklist:

- [ ] Document current app hosting arrangement
- [ ] Document current Supabase project(s)
- [ ] Document current database size and region
- [ ] Document current storage buckets and sizes
- [ ] Document current auth providers and settings

## 3. Target State

- Application hosting target: `172.18.0.230`
- Supabase hosting target: `self-hosted Supabase on 172.18.0.230`
- Database hosting target: `TODO`
- Storage hosting target: `TODO`
- Reverse proxy / TLS approach: `TODO`
- Backup approach: `TODO`

Checklist:

- [ ] Define target OS and runtime stack
- [ ] Define container/orchestration approach
- [ ] Define DNS / hostname plan
- [ ] Define TLS / certificate plan
- [ ] Define backup and restore plan

## 4. Known Infrastructure

- Current development machine: `laptop`
- Source code location: `GitHub repository`
- Target server IP: `172.18.0.230`
- Target server hostname: `svr-ops-prod01`
- Server OS: `Ubuntu 24.04.4 LTS`
- Network access method: `SSH`
- Domain / DNS: `TODO`

Checklist:

- [ ] Confirm server access method
- [ ] Confirm firewall rules
- [ ] Confirm open ports required for app and Supabase
- [ ] Confirm disk capacity
- [ ] Confirm memory / CPU capacity

## 5. Repository Findings

Confirmed repository findings:

- `supabase/` exists and contains SQL files, an edge function, and Supabase CLI temp state.
- No tracked `supabase/migrations/` directory was found.
- No tracked `supabase/seed.sql` file was found.
- Hosted Supabase URL is present in `.env.local`: `https://fyjqmfcewzkxblncojdl.supabase.co`
- Hosted project ref confirmed from URL and key payload ref: `fyjqmfcewzkxblncojdl`
- `.env.local` contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL`
- Active shared browser client initialization is in [src/lib/supabaseClient.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/lib/supabaseClient.ts:1)
- App-wide auth provider setup is in [src/pages/_app.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/_app.tsx:1)
- Auth middleware exists only as [middleware - Copy.ts](/abs/path/c:/Users/bjones/Projects/energy-app/middleware%20-%20Copy.ts:1)
- Server-side cookie/session Supabase clients are used in active routes including:
- [src/pages/uploads/index.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/uploads/index.tsx:1)
- [src/pages/api/ingest-bills.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/ingest-bills.ts:1)
- [src/pages/api/green-button/ingest.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/ingest.ts:1)
- [src/pages/api/green-button/refresh-analytics.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/refresh-analytics.ts:1)
- Server-side service-role Supabase clients are used in active routes including:
- [src/pages/api/green-button/ingest.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/ingest.ts:737)
- [src/pages/api/green-button/refresh-analytics.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/refresh-analytics.ts:49)
- [src/pages/api/pm/bulk-link.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/bulk-link.ts:1)
- [src/pages/api/pm/create-meter.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/create-meter.ts:1)
- [src/pages/api/pm/create-properties-for-org.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/create-properties-for-org.ts:157)
- [src/pages/api/pm/create-property.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/create-property.ts:27)
- [src/pages/api/pm/export-properties-template.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/export-properties-template.ts:138)
- [src/pages/api/pm/link.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/link.ts:8)
- [src/pages/api/pm/meter-sync.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/meter-sync.ts:93)
- [src/pages/api/pm/sync-meters.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/sync-meters.ts:158)
- [src/pages/api/pm/sync-property-metrics.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/sync-property-metrics.ts:7)
- [src/pages/api/pm/upload-usage.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/upload-usage.ts:1)
- [src/pages/api/pm/_getCreds.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/_getCreds.ts:1)
- Confirmed storage usage is in [src/pages/buildings/[id]/edit.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/buildings/[id]/edit.tsx:259) using bucket `mascots`
- Confirmed edge function source is [supabase/functions/eia_seds_prices/index.ts](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/functions/eia_seds_prices/index.ts:1)
- No repo-side invocation of `eia_seds_prices` was found in app code, scripts, docs, or README.
- Confirmed SQL files:
- [supabase/schema.sql](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/schema.sql:1)
- [supabase/green_button_schema_draft.sql](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/green_button_schema_draft.sql:1)
- [supabase/green_button_rewire_no_data.sql](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/green_button_rewire_no_data.sql:1)
- [supabase/fix_bill_months_view.sql](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/fix_bill_months_view.sql:1)
- [supabase/bills_demand_fields_migration.sql](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/bills_demand_fields_migration.sql:1)
- Active auth UI usage confirmed in:
- [src/pages/auth/sign-in.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/auth/sign-in.tsx:1)
- [src/pages/auth/sign-out.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/auth/sign-out.tsx:1)
- [src/components/AuthGate.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/components/AuthGate.tsx:1)
- [src/hooks/useAuthGate.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/hooks/useAuthGate.ts:1)
- [src/hooks/useOrgId.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/hooks/useOrgId.ts:1)
- Direct hosted URL references outside `.env.local` were not found; code generally reads Supabase URL from env vars
- `functions.invoke(...)` calls were not found
- Realtime channel usage (`channel`, `postgres_changes`, `broadcast`, `presence`) was not found
- Explicit RLS policy SQL (`create policy`, `enable row level security`) was not found in tracked SQL files.
- Numerous `Copy`, `backup`, and experimental files also contain Supabase code.
- Migration scope decision: migrate all Supabase-related repo assets and hosted-project items first, then clean up or retire unused pieces later if they prove unnecessary.
- Hosted-project inspection confirmed that RLS policies do exist in the hosted project for `bill_uploads`, `bills`, `building_alt_addresses`, `buildings`, `memberships`, `meters`, `organizations`, `profiles`, `usage_readings`, and `storage.objects` for the `mascots` bucket.
- Hosted-project inspection also confirmed helper functions `public.is_admin(...)` and `public.is_member(...)` exist and are used by policies. These must be accounted for during migration planning.

### Unsafe Configuration Findings

Confirmed unsafe or migration-sensitive patterns:

- [`.env.local`](/abs/path/c:/Users/bjones/Projects/energy-app/.env.local:1)
  Tracked local env file contains a hard-coded hosted Supabase URL.
- [`.env.local`](/abs/path/c:/Users/bjones/Projects/energy-app/.env.local:2)
  Tracked local env file contains a hard-coded anon key.
- [`.env.local`](/abs/path/c:/Users/bjones/Projects/energy-app/.env.local:3)
  Tracked local env file contains a hard-coded service-role key.
- [`.env.local`](/abs/path/c:/Users/bjones/Projects/energy-app/.env.local:4)
  `SUPABASE_URL` is derived from `NEXT_PUBLIC_SUPABASE_URL`, which ties privileged/server config to a public/browser config value.
- [src/pages/ocr-test.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/ocr-test.tsx:1155)
  Browser code builds raw REST URLs from `NEXT_PUBLIC_SUPABASE_URL` and manually sends anon-key headers instead of using the shared client abstraction.
- [src/pages/ocr-test - Copy (3).tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/ocr-test%20-%20Copy%20(3).tsx:912)
  Same raw REST URL + anon-key header pattern appears in a copy file.
- [src/pages/ocr-test - WORKING BEFORE EVERGY CHANGE.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/ocr-test%20-%20WORKING%20BEFORE%20EVERGY%20CHANGE.tsx:912)
  Same raw REST URL + anon-key header pattern appears in another backup/copy file.
- [src/pages/api/ingest-bills - 9-26.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/ingest-bills%20-%209-26.ts:20)
  Code derives an environment/project reference by splitting the Supabase host name, which assumes hosted-cloud domain structure.
- [src/pages/api/ingest-bills - Copy (3).ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/ingest-bills%20-%20Copy%20(3).ts:23)
  Same hosted-domain/project-ref assumption appears in a copy file.
- [src/pages/api/pm/link.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/link.ts:5)
  Privileged server code creates a service-role client using `NEXT_PUBLIC_SUPABASE_URL` instead of a dedicated server-only URL variable.
- [src/pages/api/pm/_getCreds.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/_getCreds.ts:4)
  Same public-URL-plus-service-role pattern appears in another server-only helper.
- [src/pages/api/pm/bulk-link.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/pm/bulk-link.ts:297)
  Server-side code falls back from `SUPABASE_URL` to `NEXT_PUBLIC_SUPABASE_URL`, which can hide misconfiguration and keep privileged code coupled to browser/public config.
- [scripts/reconcile-pm-sync.mjs](/abs/path/c:/Users/bjones/Projects/energy-app/scripts/reconcile-pm-sync.mjs:45)
  Script falls back from `SUPABASE_URL` to `NEXT_PUBLIC_SUPABASE_URL`.
- [scripts/sync-pm-metrics-targeted.mjs](/abs/path/c:/Users/bjones/Projects/energy-app/scripts/sync-pm-metrics-targeted.mjs:40)
  Same server/public fallback pattern appears in another script.

What was not found:

- No confirmed client-side use of `SUPABASE_SERVICE_ROLE_KEY` in active browser code was found.
- No additional active hard-coded hosted Supabase URLs were found in source files outside `.env.local`.

Checklist of code changes needed before cutover:

- [ ] Remove tracked hosted Supabase URL and keys from `.env.local`
- [ ] Stop privileged server code and scripts from falling back to `NEXT_PUBLIC_SUPABASE_URL` when `SUPABASE_URL` is missing
- [ ] Use server-only Supabase URL variables for service-role clients everywhere
- [ ] Remove code that assumes `.supabase.co` host splitting or hosted project-ref derivation
- [ ] Replace raw browser-side REST URL construction with safer shared client usage where practical
- [ ] Review all `Copy` / backup Supabase files for the same unsafe assumptions before cutover

Required migration work based on confirmed findings:

- [ ] Replace hosted URL/project ref `fyjqmfcewzkxblncojdl` with self-hosted endpoints in all runtime envs
- [ ] Recreate browser auth, SSR auth, and service-role client connectivity on the self-hosted stack
- [ ] Migrate the `mascots` storage bucket and validate public URL behavior
- [ ] Deploy or replace the `eia_seds_prices` edge function behavior in the target environment
- [ ] Keep `eia_seds_prices` in migration scope even though current invocation path is unclear
- [ ] Inventory and apply all tracked SQL files in a controlled order
- [ ] Verify whether missing tracked RLS policies/config exist only in hosted Supabase
- [ ] Capture hosted-only RLS policies and helper function definitions (`is_member`, `is_admin`) into tracked migration notes or SQL before cutover planning
- [ ] Include `Copy` / `backup` / test Supabase-related files in migration review scope unless they are explicitly retired later
- [ ] Rotate any checked-in Supabase secrets after migration validation is complete because `.env.local` currently contains active-looking keys

## 6. Supabase Features in Use

- Database: `Confirmed in active app code`
- Auth: `Confirmed in active app code`
- Storage: `Confirmed in active app code`
- Edge Functions: `Confirmed in repo`
- Realtime: `No repo usage found`
- Row Level Security: `Confirmed in hosted project; repo tracking incomplete`
- Cron / scheduled jobs: `No repo evidence found`
- Third-party integrations via Supabase-backed workflows: `Confirmed`

Confirmed details:

- Database usage is extensive through `.from(...)` queries and `.rpc(...)` calls in app pages, hooks, and API routes
- Confirmed RPC usage includes:
- `org_create` in [src/pages/orgs/new.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/orgs/new.tsx:24)
- `find_building_by_addr_any` in [src/pages/api/ingest-bills.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/ingest-bills.ts:153)
- `refresh_green_button_demand_facts_monthly_mv` in [src/pages/api/ingest-bills.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/ingest-bills.ts:441)
- Multiple Green Button refresh RPCs in [src/pages/api/green-button/refresh-analytics.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/refresh-analytics.ts:1) and [src/pages/api/green-button/ingest.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/api/green-button/ingest.ts:1132)
- Auth usage confirmed:
- Browser auth helpers via `createBrowserSupabaseClient`
- SSR/API auth helpers via `createPagesServerClient`
- Middleware auth helper via `createPagesMiddlewareClient` in a copy file
- `signInWithPassword`, `resetPasswordForEmail`, `signOut`, `getSession`, `getUser`, and `onAuthStateChange`
- Auth appears to rely on user metadata and/or membership lookups for `org_id`
- No OAuth sign-in calls were found
- Storage usage confirmed:
- Bucket name: `mascots`
- Operations found: `upload` and `getPublicUrl`
- File found: [src/pages/buildings/[id]/edit.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/buildings/[id]/edit.tsx:259)
- Additional tables that look storage-related but are database-backed, not confirmed Supabase Storage buckets:
- `bill_uploads` with `storage_path` columns in [src/pages/uploads/index.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/uploads/index.tsx:105) and related files
- Edge Functions confirmed:
- `supabase/functions/eia_seds_prices/index.ts`
- Function expects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Function also expects `EIA_API_KEY`
- No `supabase.functions.invoke(...)` calls were found in the app code
- No raw `/functions/v1/eia_seds_prices` HTTP calls were found in the app code, scripts, docs, or README
- Current invocation path is unclear, but include this function in migration scope
- Realtime usage:
- No `channel(...)`, `postgres_changes`, `broadcast`, or `presence` usage found
- SQL/schema findings:
- Tracked SQL files exist, but no tracked CLI migrations folder
- `schema.sql` includes `auth.users` references, `security definer` functions, and grants to `authenticated` and `service_role`
- No explicit tracked RLS policy definitions were found
- Hosted-project inspection confirmed that RLS is enabled on `bill_uploads`, `bills`, `building_alt_addresses`, `buildings`, `memberships`, `meters`, `organizations`, `profiles`, and `usage_readings`
- Hosted-project inspection confirmed storage policies exist for the `mascots` bucket on `storage.objects`
- Hosted-project inspection confirmed helper functions `is_member(...)` and `is_admin(...)` exist and are part of the current policy model

Migration checklist from confirmed feature usage:

- [ ] Preserve auth flows for browser, SSR, and API route access
- [ ] Preserve user/session-derived `org_id` behavior
- [ ] Recreate required RPC functions before cutover
- [ ] Recreate `security definer` functions and grants from tracked SQL
- [ ] Recreate the `mascots` bucket and verify public file URLs
- [ ] Rehome or replace the `eia_seds_prices` edge function workflow
- [ ] Preserve `EIA_API_KEY` handling for `eia_seds_prices`
- [ ] Determine later whether `eia_seds_prices` is manually run, externally triggered, or currently unused
- [ ] Default to migrating all confirmed and suspected Supabase-related assets first, then clean up later if safe
- [ ] At a later step, extract and preserve hosted-only RLS/storage policies and helper function definitions before cutover work begins
- [ ] Confirm whether any other untracked hosted-only features exist, especially auth settings

## Migration Decision Checklist

Decision items:

- [x] Do we use Auth? `Yes`
- [x] Do we use Storage? `Yes`
- [ ] Do we use Realtime? `No`
- [x] Do we use Edge Functions? `Yes`
- [ ] Do we use database extensions? `Needs confirmation`
- [ ] Do we need public internet access to the app? `Needs confirmation`
- [ ] Do we need public internet access to Supabase APIs directly? `Needs confirmation`
- [x] Will TLS be required? `Yes`
- [ ] Do we need background workers or cron jobs? `Needs confirmation`

Notes:

- `Auth`: confirmed from browser auth helpers, SSR/API auth checks, and sign-in/sign-out flows
- `Storage`: confirmed from `mascots` bucket usage
- `Realtime`: no repo usage found
- `Edge Functions`: confirmed from `supabase/functions/eia_seds_prices`
- `Database extensions`: not yet inventoried from the hosted project or final schema review
- `Public internet access to the app`: depends on deployment/network requirements and intended users
- `Public internet access to Supabase APIs directly`: depends on whether browser clients and external integrations must reach self-hosted Supabase endpoints from outside the local network
- `TLS`: treat as required for browser auth, secure cookies, and any public-facing deployment
- `Background workers or cron jobs`: repo evidence is incomplete; PM scripts and the unclear `eia_seds_prices` invocation may imply scheduled or manual background execution

## 7. Server Setup Tasks

Checklist:

- [ ] Confirm server OS and only the missing facts required for emergency database bring-up
- [ ] Update packages only as needed for the chosen Supabase runtime
- [ ] Install Docker / Docker Compose or chosen runtime
- [ ] Create the deployment directory needed for self-hosted Supabase
- [ ] Create persistent data volumes for Postgres and required Supabase services
- [ ] Configure only the firewall and allowed ports required for the database-first cutover path
- [ ] Configure server time sync
- [ ] Configure a minimum viable backup path for the migrated database
- [ ] Defer reverse proxy polish until after database relief
- [ ] Defer public DNS / TLS hardening details until after database relief
- [ ] Defer broader monitoring / observability improvements until after database relief

Notes:

- Server IP: `172.18.0.230`
- Remaining setup details should be limited to what blocks the database-first path: `TODO`

## 8. Database Migration Procedure

Checklist:

- [ ] Inventory only the hosted database facts still missing for export/restore execution
- [ ] Export schema
- [ ] Export data
- [ ] Verify extensions required by the app
- [ ] Recreate roles, grants, and RLS policies
- [ ] Import schema into self-hosted database
- [ ] Import data into self-hosted database
- [ ] Validate row counts and key tables
- [ ] Validate critical database queries, functions, and connectivity against the migrated database
- [ ] Schedule the final delta sync or freeze window required to reduce hosted database usage before `2026-04-24`

### 1. Pre-migration checks

- Confirm self-hosted Supabase is running far enough to accept a Postgres restore.
- Confirm the deployment root is `/opt/energy-app`.
- Confirm the backup/export storage path: `TODO_BACKUP_DIR`.
- Confirm no new production data will be written during migration, so no incremental delta sync is required.
- Confirm the minimum validation access path from the local dev environment to the self-hosted database/API.
- Confirm the hosted database size, region, and any export constraints that could affect timing.
- Confirm the list of required extensions that must exist on the self-hosted database before or immediately after restore.
- Confirm the restore target database and connection placeholder: `TODO_SELF_HOSTED_DB_CONNECTION`.

### 2. Hosted Supabase export inputs needed

- Hosted project reference: `fyjqmfcewzkxblncojdl`
- Hosted database export method: `npx supabase db dump` against the session pooler connection on port `5432`
- Hosted schema export command or workflow: `npx supabase db dump --db-url "$OLD_DB_URL" -f schema.sql`
- Hosted data export command or workflow: `npx supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only ...`
- Hosted database connection placeholder if direct Postgres export is used: `not used in the successful run; direct host hit IPv6 reachability issues`
- Export output directory or object location: `/opt/energy-app/backups/hosted-export`
- Any hosted credentials, access tokens, or one-time secrets required to perform the export: hosted session pooler connection string with embedded database password
- Decision on whether schema and data are exported as separate artifacts or as one dump artifact: separate artifacts for roles, schema, raw data, and cleaned public-only data

### 3. Self-hosted restore inputs needed

- Deployment root: `/opt/energy-app`
- Self-hosted Postgres restore connection placeholder: local in-container execution via `docker compose exec -T db psql ...`
- Self-hosted database name placeholder: `postgres`
- Self-hosted database user placeholder: `postgres`
- Self-hosted database password placeholder: local in-container restore path did not require exposing a separate restore connection string
- Restore artifact location on the server: `/opt/energy-app/backups/hosted-export`
- Ordered list of any tracked SQL files that must be applied outside the main dump restore: `roles.sql`, `schema.clean.sql`, `data.public.clean.sql`
- Required extensions list: `pg_graphql`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `pgjwt`, `supabase_vault`, `uuid-ossp`
- Placeholder for any restore flags/options required by the final chosen method: `psql -v ON_ERROR_STOP=1`

### 4. Ordered migration procedure

1. Verify the self-hosted Supabase stack is up on `172.18.0.230` and that the restore target is reachable from the server.
2. Create or confirm the required directories under `/opt/energy-app` and the chosen backup/export path.
3. Capture the hosted export artifacts into `/opt/energy-app/backups/hosted-export` using the Supavisor session pooler connection on port `5432`.
4. Validate the restore target using in-container `psql` against the self-hosted `db` service.
5. Restore `roles.sql`.
6. Restore `schema.sql` after removing `SET transaction_timeout` into `schema.clean.sql`.
7. Regenerate and clean data artifacts as needed to work around hosted-vs-self-hosted auth/storage mismatches.
8. Restore the working public-data artifact `data.public.clean.sql`.
9. Run the minimum post-restore verification checks listed below.
10. Run `add-new-auth-keys.sh`, then recreate the stack so `auth`, `rest`, and `kong` all use aligned JWT/JWK configuration.
11. Allow temporary local-dev validation against the self-hosted environment before the main files move to the server.
12. Keep the environment internal-only after validation, except for any strictly temporary access path required for local testing.

### 5. Post-restore verification

- Confirm the restore completed without fatal schema or data errors.
- Confirm expected schemas and key tables exist.
- Confirm row counts for the primary application tables match expectations.
- Confirm required extensions are installed.
- Confirm helper functions such as `is_member(...)` and `is_admin(...)` exist if they are required by current policies.
- Confirm roles, grants, and RLS policies required for current database behavior are present.
- Confirm critical RPC/functions needed by the app exist and are callable.
- Confirm critical database queries and connectivity succeed against the self-hosted database.
- Capture the exact artifacts and checks used to conclude the database is ready for validation.

Observed successful verification results from the current database-first run:

- `public.organizations = 1`
- `public.buildings = 22`
- `public.bills = 1436`
- `public.memberships = 2`
- `is_member(...)` and `is_admin(...)` exist in `public`
- `auth/v1/settings` responds successfully through Kong
- `rest/v1/` responds successfully through Kong after regenerating and aligning auth/JWK keys with `add-new-auth-keys.sh`

### 6. Failure handling

- If export fails, stop and record the failing step, error output, and the hosted export method being attempted.
- If restore fails before data import, reset only the self-hosted restore target using the final chosen restore workflow, then retry from a clean target.
- If restore fails during data import, preserve the failing logs and artifact names before retrying.
- If required extensions, roles, functions, or RLS objects are missing, stop and reconcile them before treating the database as valid.
- If row counts or critical validation queries do not match expectations, keep the hosted database as the source of truth and do not advance to broader validation.
- If temporary local-dev connectivity is required but unavailable, treat that as a validation blocker rather than widening public exposure by default.
- If PostgREST returns `invalid_token` while GoTrue succeeds, regenerate and align auth keys/JWK config, recreate `rest`, and retest before assuming database failure.
- If hosted auth/storage data tables fail on missing relations or duplicate rows, prefer excluding those tables for the emergency database-first validation path and continue with the `public` schema data restore.

### 7. Evidence to capture

- Export method used and the exact artifact names produced
- Timestamp of the export and restore runs
- Destination restore target identifier or connection placeholder used
- Restore logs or console output
- Row-count comparison notes for key tables
- Extension inventory used during validation
- Confirmation of helper functions, roles, grants, and RLS-related objects restored
- Notes on any manual SQL applied outside the main restore artifact
- Final pass/fail note for database validation

Current captured artifacts and evidence:

- `/opt/energy-app/backups/hosted-export/roles.sql`
- `/opt/energy-app/backups/hosted-export/schema.sql`
- `/opt/energy-app/backups/hosted-export/schema.clean.sql`
- `/opt/energy-app/backups/hosted-export/data.sql`
- `/opt/energy-app/backups/hosted-export/data.public.sql`
- `/opt/energy-app/backups/hosted-export/data.public.clean.sql`
- `/opt/energy-app/backups/restore-roles.log`
- `/opt/energy-app/backups/restore-schema.log`
- `/opt/energy-app/backups/restore-data-public.log`

Open items:

- See `Open Questions`

## 9. Storage Migration Tasks

Status: `Deferred until after database relief unless required immediately`

Checklist:

- [ ] Inventory all storage buckets
- [ ] Export object list and total sizes
- [ ] Migrate bucket contents
- [ ] Recreate bucket policies
- [ ] Recreate signed URL / public access behavior
- [ ] Validate uploads and downloads from the app
- [ ] Validate content types and metadata

Open items:

- See `Open Questions`

## 10. Application Deployment Tasks

Status: `Deferred except for the minimum config needed to point database-dependent workloads at self-hosted Supabase`

Checklist:

- [ ] Clone or pull the GitHub repository onto the server
- [ ] Install application dependencies
- [ ] Configure environment variables for self-hosted Supabase
- [ ] Populate server-only variables on the server from secure sources, not from tracked files
- [ ] Populate client-safe public variables separately from server-only secrets
- [ ] Provide `SUPABASE_URL` explicitly for server/API/scripts instead of relying on public URL fallback
- [ ] Provide `SUPABASE_SERVICE_ROLE_KEY` only to server/API/scripts/functions and never to browser-exposed config
- [ ] Provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser usage
- [ ] Add `EIA_API_KEY` if `eia_seds_prices` remains in scope
- [ ] Add Portfolio Manager / ENERGY STAR credentials where needed for PM-related routes and scripts
- [ ] Build the application
- [ ] Start the application services
- [ ] Configure process supervision / restart policy
- [ ] Validate health checks
- [ ] Confirm app is reachable from intended clients

Deferred focus:

- Full app deployment hardening belongs in `Deferred Until After Database Relief`

Open items:

- See `Open Questions`

## 11. Environment Variables

Known values:

- Target server IP: `172.18.0.230`
- Current hosted Supabase URL in `.env.local`: `https://fyjqmfcewzkxblncojdl.supabase.co`
- Current hosted project ref: `fyjqmfcewzkxblncojdl`

Confirmed Supabase-related env vars referenced in repo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`

Current code organization:

- Public/browser Supabase config is now centralized in [src/lib/supabaseEnv.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/lib/supabaseEnv.ts:1)
- Server-only service-role Supabase config is now centralized in [src/lib/supabaseAdmin.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/lib/supabaseAdmin.ts:1)
- Placeholder-only example env file exists at [.env.example](/abs/path/c:/Users/bjones/Projects/energy-app/.env.example:1)

Where they are used:

- `NEXT_PUBLIC_SUPABASE_URL`
- Browser client in [src/lib/supabaseClient.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/lib/supabaseClient.ts:15)
- Direct client creation in [src/pages/orgs/new.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/orgs/new.tsx:6), [src/pages/uploads/[id].tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/uploads/[id].tsx:5), and several API routes
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Browser client in [src/lib/supabaseClient.ts](/abs/path/c:/Users/bjones/Projects/energy-app/src/lib/supabaseClient.ts:16)
- Direct client creation in [src/pages/orgs/new.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/orgs/new.tsx:7) and [src/pages/uploads/[id].tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/uploads/[id].tsx:5)
- `SUPABASE_SERVICE_ROLE_KEY`
- Edge function env in [supabase/functions/eia_seds_prices/index.ts](/abs/path/c:/Users/bjones/Projects/energy-app/supabase/functions/eia_seds_prices/index.ts:115)
- Server-side API routes including PM and Green Button handlers
- `SUPABASE_URL`
- Defined in `.env.local` as `${NEXT_PUBLIC_SUPABASE_URL}`
- Used by the edge function and some server-side PM routes
- `SUPABASE_SERVICE_ROLE`
- Found only in older copy/backup files; active use is not confirmed

Hosted URLs / IDs found:

- `.env.local` contains the only confirmed hard-coded hosted Supabase URL in the repo
- No additional hard-coded hosted `.supabase.co` URLs were found in active source files
- Some code derives the project ref dynamically from `SUPABASE_URL`; this still depends on the hosted URL value

Migration checklist from env findings:

- [x] Replace hosted `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` with self-hosted values for local smoke testing
- [x] Replace hosted anon and service-role keys with self-hosted equivalents for local smoke testing
- [ ] Decide whether `SUPABASE_SERVICE_ROLE` should be removed or mapped for legacy copy files
- [ ] Remove or rotate checked-in Supabase secrets from `.env.local` after the migrated system is functioning and validated
- [ ] Confirm whether any additional Supabase env vars are supplied outside the repo
- [ ] `TODO`: Database URL / connection string for self-hosted deployment
- [ ] `TODO`: Auth-related secrets and mailer settings for self-hosted deployment
- [ ] `TODO`: Storage endpoint settings if they differ from base Supabase URL
- [ ] `TODO`: Any hosted-project settings not represented by env vars in the repo

### Required Secret Separation

Required separation rules before cutover:

- Public/browser code should use only public Supabase configuration such as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Privileged server/API/scripts/functions code should use only server-side Supabase configuration such as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Server code should not depend on `NEXT_PUBLIC_SUPABASE_URL` as a fallback when `SUPABASE_URL` is missing
- Service-role key usage should stay confined to Next.js API routes, server-only scripts, and edge/server functions
- Service-role key usage should not appear in browser pages, client components, or browser bundles
- Raw REST calls from browser code should not manually attach keys unless there is a deliberate public-safe reason

Pre-cutover secret-separation changes to make:

- [x] Update service-role client creation to use `SUPABASE_URL` instead of `NEXT_PUBLIC_SUPABASE_URL`
- [x] Remove server-side fallback from `SUPABASE_URL` to `NEXT_PUBLIC_SUPABASE_URL` in active scripts/routes that were refactored
- [x] Review browser pages that manually construct REST URLs from `NEXT_PUBLIC_SUPABASE_URL`
- [x] Confirm no active browser bundle path references `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Move all real secrets out of tracked local env files before final cutover
- [ ] Review remaining copy/backup files if they will stay in scope

## 12. Testing Plan

Priority: database verification first; broader app validation follows after hosted database relief is achieved.

Checklist based on confirmed repo usage:

- [x] Copy [.env.example](/abs/path/c:/Users/bjones/Projects/energy-app/.env.example:1) to a real local env file and fill in real values manually
- [ ] Verify missing env vars fail clearly for public and server-only Supabase config helpers
- [x] Verify browser client initialization works with self-hosted `NEXT_PUBLIC_SUPABASE_URL` and anon key
- [ ] Verify SSR/API session auth works in routes using `createPagesServerClient`
- [x] Verify sign-in with password works at [src/pages/auth/sign-in.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/auth/sign-in.tsx:1)
- [ ] Verify password reset email flow works, or mark as unsupported if not configured yet
- [ ] Verify sign-out works at [src/pages/auth/sign-out.tsx](/abs/path/c:/Users/bjones/Projects/energy-app/src/pages/auth/sign-out.tsx:1)
- [ ] Verify auth-gated redirects still work for dashboard, buildings, bills, uploads, and org routes
- [ ] Verify `org_id` resolution still works from user metadata and/or `memberships`
  Current blocker: the temporary smoke-test auth user exists in `auth.users` but still needs matching `profiles` / `memberships` linkage before organization-scoped pages will load
- [ ] Verify core table reads/writes used in active flows:
- `buildings`
- `meters`
- `bills`
- `usage_readings`
- `bill_uploads`
- `memberships`
- `pm_property_scores`
- `pm_property_metric_snapshots`
- Green Button analytics tables/views referenced by dashboard and API routes
- [ ] Verify RPC functions used by the app return expected results:
- `org_create`
- `find_building_by_addr_any`
- `refresh_green_button_demand_facts_monthly_mv`
- Green Button refresh RPCs referenced in API routes
- [ ] Verify `mascots` bucket upload and public URL retrieval
- [ ] Verify Green Button ingest API succeeds end-to-end with service-role access
- [ ] Verify Portfolio Manager API routes that use service-role clients still succeed
- [ ] Verify PM server scripts still work when only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided for Supabase access
- [ ] Verify edge function deployment and invocation path for `eia_seds_prices` or document replacement plan
- [ ] If no current invocation path is discovered, still deploy or otherwise preserve `eia_seds_prices` so the capability is not lost
- [ ] Verify there are no hidden dependencies on hosted-only settings not tracked in repo
- [ ] Perform smoke testing against active pages:
- `/auth/sign-in`
- `/dashboard`
- `/buildings`
- `/uploads`
- `/orgs/new`
- Green Button UI pages and API endpoints

Acceptance criteria:

- [ ] Hosted Supabase database usage is materially reduced before `2026-04-24`
- [ ] No code path still points to hosted project ref `fyjqmfcewzkxblncojdl`
- [ ] Browser auth, SSR auth, and service-role API routes all function on self-hosted Supabase
- [ ] Required SQL functions and grants exist and are callable
- [ ] Mascot uploads work and returned URLs are usable by the app
- [ ] No confirmed active feature depends on hosted cloud Supabase after cutover

## 13. Cutover Plan

Priority: execute the smallest safe cutover that relieves hosted database usage first. Storage, edge functions, and deployment hardening stay deferred unless they block database relief.

Checklist:

- [ ] Announce maintenance window
- [ ] Freeze writes or place app in maintenance mode
- [ ] Take final backup of cloud Supabase data
- [ ] Run final database sync
- [ ] Run final storage sync
- [ ] Update environment variables to self-hosted endpoints
- [ ] Deploy application on server
- [ ] Run smoke tests
- [ ] Open access to users
- [ ] Monitor for errors

Open items:

- See `Open Questions`

## 14. Rollback Plan

Checklist:

- [ ] Keep cloud Supabase project intact until cutover is stable
- [ ] Preserve pre-cutover environment variable values
- [ ] Define rollback trigger conditions
- [ ] Define rollback communication steps
- [ ] Re-point app back to previous Supabase environment if needed
- [ ] Restore previous application deployment if needed
- [ ] Validate app after rollback

Open items:

- See `Open Questions`

## Open Questions

Unresolved findings and decisions to settle before cutover:

- Is [middleware - Copy.ts](/abs/path/c:/Users/bjones/Projects/energy-app/middleware%20-%20Copy.ts:1) still intended to become the real middleware implementation, or can it be ignored?
- What is the current invocation path for `eia_seds_prices`?
  Is it manual, externally triggered, scheduled, or currently unused?
- Which database extensions are required by the hosted project and self-hosted target?
- Do `Copy`, `backup`, and experimental Supabase-related files remain in migration scope, or can any be retired safely before cutover?
- Are there any additional hosted-only auth settings not yet captured in the repo or runbook?
- What are the exact source project reference, database connection details, and final database migration method?
- Which missing server facts must be gathered immediately to bring up self-hosted Supabase before `2026-04-24`?
- What are the exact storage buckets in use, storage size, and final storage migration method?
- What are the application runtime, deployment method, and process manager/container setup for the target server?
- What is the self-hosted database URL / connection string?
- What auth-related secrets and mailer settings will be required on the self-hosted server?
- Will storage endpoint settings differ from the base self-hosted Supabase URL?
- Are there any hosted-project settings not represented by env vars in the repo?
- Does the deployed app need public internet access, or can it stay private to a LAN/VPN?
- Do self-hosted Supabase APIs need to be reachable directly from the public internet, or only by the app/server?
- Are background workers or cron jobs required?
  If yes, which tasks must be scheduled or run out-of-band?
- What is the server hostname, OS, network access method, and DNS plan?
- What maintenance window will be used for cutover?
- Who owns smoke testing and final cutover approval?
- What rollback time limit, owner, and validation checklist will be used?

## 15. Final Status

Status: `In progress`

Completion checklist:

- [x] Emergency database-first plan approved and in motion
- [x] Missing server facts gathered for self-hosted Supabase bring-up
- [x] Server prepared for emergency database relief
- [x] Self-hosted Supabase deployed
- [x] Database migrated
- [ ] Hosted database usage reduced before `2026-04-24`
- [x] Database verification completed
- [ ] Storage migrated
- [ ] Application deployed on server
- [ ] Cutover completed
- [ ] Rollback no longer needed
- [ ] Deferred items revisited after database relief
- [ ] Runbook updated with final outcomes

Current status note:

- Self-hosted Supabase is running on `172.18.0.230` under `/opt/energy-app/supabase`
- Hosted schema and `public` data are restored and validated for the emergency database-first objective
- Auth and PostgREST connectivity are working through `http://172.18.0.230:8000`
- UI login works with a temporary smoke-test user, but data-backed pages still require correct `profiles` / `memberships` linkage or migration of hosted auth users

## Progress Log

- 2026-04-22: Validated the emergency database-first path end-to-end: Docker and self-hosted Supabase are running on `172.18.0.230` under `/opt/energy-app`, hosted exports were captured to `/opt/energy-app/backups/hosted-export`, schema plus `public` data were restored successfully, key table counts were verified, and `auth` / `rest` smoke checks succeeded after regenerating and aligning auth/JWK keys with `add-new-auth-keys.sh`.
- 2026-04-22: Began UI smoke testing against the self-hosted stack from the local development app. Login works with a temporary test user, but data-backed pages still need correct `profiles` / `memberships` linkage or hosted auth-user migration before organization-scoped pages load successfully.
- 2026-04-21: Set the deployment root to `/opt/energy-app` and converted `Database Migration Tasks` into a concrete `Database Migration Procedure` runbook section with pre-checks, export/restore inputs, ordered procedure, post-restore verification, failure handling, and evidence capture placeholders.
- 2026-04-21: Corrected the target server IP to `172.18.0.230` and recorded confirmed server details from SSH output: hostname `svr-ops-prod01`, OS `Ubuntu 24.04.4 LTS`, kernel `6.8.0-110-generic`, and that the server is reachable via SSH.
- 2026-04-21: Added `Minimum Viable Self-Hosted Supabase Install Plan` for a database-first restore/validation target, and updated the missing server facts section with newly provided SSH, Docker, capacity, access-scope, and no-new-data migration assumptions.
- 2026-04-21: Added `Missing Server Facts for Database-First Migration` with only the minimum unknowns still needed before installing self-hosted Supabase on the target server, plus a compact `User Inputs Needed Next` checklist.
- 2026-04-21: Added `Database-First Viability Assessment` using the runbook as the source of truth, classifying known supports, blockers, warnings, and deferrable items for the emergency database-first path.
- 2026-04-21: Reprioritized the runbook around an emergency database-first migration path with the immediate objective of reducing hosted Supabase database usage before `2026-04-24`, reordered the urgent execution path, and explicitly deferred non-critical polish and broader migration items until after database relief.
- 2026-04-20: Created initial migration runbook at `docs/supabase-server-migration.md` with known facts filled in and all unknowns marked as `TODO`.
- 2026-04-20: Inspected the repository for Supabase usage and updated Repository Findings, Supabase Features in Use, Environment Variables, and Testing Plan with confirmed repo evidence and migration checklists.
- 2026-04-20: Confirmed from the hosted Supabase project that RLS is enabled on several app tables, storage policies exist for the `mascots` bucket, and helper functions `is_member(...)` / `is_admin(...)` exist; noted these as hosted-project items to capture later during migration planning.
- 2026-04-20: Investigated `eia_seds_prices` usage in the repo; confirmed the edge function source and required env vars, but found no repo-side invocation. Marked it as unclear-but-in-scope for migration.
- 2026-04-20: Noted that Supabase key rotation can be deferred until after the migrated system is working and validated.
- 2026-04-20: Set migration scope preference to migrate all Supabase-related items first for safety, with cleanup deferred until later if necessary.
- 2026-04-20: Refactored active app/API/script Supabase configuration to use shared public/server env helpers, removed active server fallback to public Supabase URL vars, added placeholder-only `.env.example`, and documented required manual env setup and validation steps.
- 2026-04-21: Added `Migration Decision Checklist`, created a consolidated `Open Questions` section, and moved unresolved findings there from scattered sections.
