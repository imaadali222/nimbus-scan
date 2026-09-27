# Implementation Tracker (Incremental)

Last updated: 2026-02-17

This file tracks small production-facing increments with evidence.

## Iteration 1

Goal:
- Improve debugging signal for signup/login/internal API errors by preserving request correlation IDs across web proxy boundaries and surfacing them in UI error text.

Changes:
1. Preserved `x-request-id` header in authenticated proxy responses.
   - File: `apps/web/src/app/api/proxy/[...path]/route.ts`
2. Preserved `x-request-id` header in public proxy responses.
   - File: `apps/web/src/app/api/public/[...path]/route.ts`
3. Enhanced UI API error parser to append request ID (from response header or body) to thrown error messages.
   - File: `apps/web/src/app/_lib/cspm.ts`
4. Added e2e assertions that both `/api/proxy/*` and `/api/public/*` error responses include `x-request-id`.
   - File: `e2e/auth-and-navigation.spec.ts`

Verification:
- `npm run test -w @cspm/api`
- `npm run test -w @cspm/web`
- `npm run test -w @cspm/worker`
- `npm run test:e2e`

Status:
- Completed

## Iteration 2

Goal:
- Reduce local/prod runtime instability for web API endpoints and eliminate false static-generation behavior for proxy/session handlers.

Changes:
1. Forced authenticated proxy route to dynamic runtime.
   - File: `apps/web/src/app/api/proxy/[...path]/route.ts`
2. Forced public proxy route to dynamic runtime.
   - File: `apps/web/src/app/api/public/[...path]/route.ts`
3. Forced session route to dynamic runtime.
   - File: `apps/web/src/app/api/session/route.ts`
4. Forced health route to dynamic runtime.
   - File: `apps/web/src/app/api/health/route.ts`
5. Updated e2e auth proxy assertion to accept structured error payload with request ID.
   - File: `e2e/auth-and-navigation.spec.ts`

Verification:
- `npm run test -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 3

Goal:
- Make finding persistence safer under retries/reprocessing by enforcing per-scan idempotent writes.

Changes:
1. Added deterministic finding dedupe key logic in worker ingestion path.
   - File: `apps/worker/src/index.ts`
2. Deduplicated adapter output before persistence and recorded source vs stored counts in scan metadata.
   - File: `apps/worker/src/index.ts`
3. Added idempotency guard to replace existing findings for the same `scanJobId` before insert.
   - File: `apps/worker/src/index.ts`

Verification:
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`

Status:
- Completed

## Iteration 4

Goal:
- Improve local operability by adding a single command to stream service logs while validating UI flows.

Changes:
1. Added `logs` mode to dev stack orchestration script to tail api/worker/web logs.
   - File: `scripts/dev-stack.mjs`
2. Added `npm run dev:logs` script alias.
   - File: `package.json`

Verification:
- `node scripts/dev-stack.mjs logs | head -n 8`

Status:
- Completed

## Iteration 5

Goal:
- Prevent opaque local startup failures by diagnosing occupied dev ports and owning processes.

Changes:
1. Added `doctor` mode to dev stack script that checks api/worker/web ports and prints listening process details.
   - File: `scripts/dev-stack.mjs`
2. Added `npm run dev:doctor` script alias.
   - File: `package.json`

Verification:
- `npm run dev:doctor`

Status:
- Completed

## Iteration 6

Goal:
- Implement bounded worker retries with explicit failure taxonomy to reduce transient scan failures and avoid blind infinite retry behavior.

Changes:
1. Added worker failure classification utility with retryability decisions:
   - Categories: `TRANSIENT_INFRA`, `AUTHORIZATION`, `CONFIGURATION`, `UNSUPPORTED`, `UNKNOWN`
   - File: `apps/worker/src/retry.ts`
2. Added worker env setting `WORKER_MAX_RETRIES` (default `2`).
   - Files: `apps/worker/src/env.ts`, `apps/worker/.env.example`, `.env.example`
3. Updated worker failure path:
   - retryable failures are re-queued with attempt metadata
   - non-retryable/exhausted failures are marked `FAILED` with taxonomy metadata
   - File: `apps/worker/src/index.ts`
4. Added unit tests for failure classification.
   - File: `apps/worker/src/index.test.ts`

Verification:
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`

Status:
- Completed

## Iteration 7

Goal:
- Improve operator recovery speed for local startup/network errors caused by occupied service ports.

Changes:
1. Extended `dev:doctor` output with safe kill command suggestions per occupied service port.
   - File: `scripts/dev-stack.mjs`
2. Updated docs with diagnostics + live-log guidance (`dev:doctor`, `dev:logs`).
   - Files: `README.md`, `docs/LOCAL_DEPLOYMENT.md`

Verification:
- `npm run dev:doctor`

Status:
- Completed

## Iteration 8

Goal:
- Improve worker observability by stamping queue-claim metadata with worker identity and runtime context.

Changes:
1. Added worker identity (`hostname:pid`) and claim metadata on scan-job transition to running.
2. Persisted claim metadata into `scanJob.metadataJson` before adapter execution.
3. Ensured local `queued` state is updated so retry/failure paths keep consistent metadata context.
   - File: `apps/worker/src/index.ts`

Verification:
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`

Status:
- Completed

## Iteration 9

Goal:
- Make retry/fail transition logic deterministic and unit-testable (including retry exhaustion edge cases).

Changes:
1. Added `buildRetryPlan(...)` helper to centralize retry decision + metadata mutation.
   - File: `apps/worker/src/retry.ts`
2. Refactored worker failure path to consume retry plan helper.
   - File: `apps/worker/src/index.ts`
3. Added unit tests for:
   - retryable transient error path
   - non-retryable auth path
   - retry-exhaustion path with prior attempts in metadata
   - File: `apps/worker/src/index.test.ts`

Verification:
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`

Status:
- Completed

## Iteration 10

Goal:
- Reduce provider-capability hardcoding by supporting runtime capability overrides from a file source.

Changes:
1. Added API env variable `PROVIDER_CAPABILITIES_FILE` with default path `./.runtime/provider-capabilities.json`.
   - Files: `apps/api/src/env.ts`, `.env.example`, `apps/api/.env.example`
2. Added provider capability file loader with mtime-based cache and safe fallback behavior.
   - File: `apps/api/src/app.ts`
3. Updated provider capability resolution to merge file-based overrides over defaults.
   - File: `apps/api/src/app.ts`
4. Documented runtime capability override behavior in local docs.
   - Files: `README.md`, `docs/LOCAL_DEPLOYMENT.md`

Verification:
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`

Status:
- Completed

## Iteration 11

Goal:
- Provide tenant operators a direct API view into scan worker/retry metadata for debugging and support workflows.

Changes:
1. Added endpoint:
   - `GET /tenants/:tenantId/scans/:scanId/worker-metadata`
   - returns scan identity/status + parsed worker metadata + failure metadata
   - enforces tenant RBAC (`OWNER/ADMIN/ANALYST/VIEWER`)
   - File: `apps/api/src/app.ts`
2. Added API test coverage for new endpoint on queued scans.
   - File: `apps/api/src/app.test.ts`

Verification:
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`

Status:
- Completed

## Iteration 12

Goal:
- Add a tenant-facing list API for recent worker retry/failure/claim transitions to support operational dashboards.

Changes:
1. Added endpoint:
   - `GET /tenants/:tenantId/scans/worker-events?limit=25`
   - returns recent scan entries that include `metadata.worker`, with claim/retry/failure summary fields
   - enforces tenant RBAC (`OWNER/ADMIN/ANALYST/VIEWER`)
   - File: `apps/api/src/app.ts`
2. Extended API flow test to validate endpoint availability and shape.
   - File: `apps/api/src/app.test.ts`

Verification:
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`

Status:
- Completed

## Iteration 13

Goal:
- Add a runtime capability validation/preview endpoint so operators can verify provider capability overrides and effective metadata.

Changes:
1. Added endpoint:
   - `GET /system/provider-capabilities/preview`
   - access: owner/admin/super-admin (same gate as scanner preflight)
   - returns capability file source status + parse errors + effective provider capabilities with override flags
   - File: `apps/api/src/app.ts`
2. Added API test coverage for endpoint availability and response shape.
   - File: `apps/api/src/app.test.ts`

Verification:
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`

Status:
- Completed

## Iteration 14

Goal:
- Keep operator-facing docs aligned with newly shipped scan-ops and capability-preview APIs.

Changes:
1. Updated README API highlights with:
   - `GET /tenants/:tenantId/scans/worker-events`
   - `GET /tenants/:tenantId/scans/:scanId/worker-metadata`
   - `GET /system/provider-capabilities/preview`
   - File: `README.md`

Verification:
- Documentation-only update; no runtime behavior change.

Status:
- Completed

## Iteration 15

Goal:
- Surface worker retry/failure telemetry in the scans UI for faster operator troubleshooting.

Changes:
1. Added `WorkerEvent` client type and state in CSPM data layer.
2. Extended refresh flow to load:
   - `GET /tenants/:tenantId/scans/worker-events?limit=25`
3. Added scans page “Worker events (latest)” panel showing state/attempt/failure-category summaries.
   - Files: `apps/web/src/app/_lib/cspm.ts`, `apps/web/src/app/scans/page.tsx`

Verification:
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`

Status:
- Completed

## Iteration 16

Goal:
- Add per-scan worker metadata drilldown in UI for deeper retry/claim troubleshooting.

Changes:
1. Added `getScanWorkerMetadata(scanId)` client function and `ScanWorkerMetadata` type.
2. Added “Worker” action button on each scan row.
3. Added inline drilldown panel rendering full worker metadata JSON for selected scan.
   - Files: `apps/web/src/app/_lib/cspm.ts`, `apps/web/src/app/scans/page.tsx`

Verification:
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`

Status:
- Completed

## Iteration 17

Goal:
- Expand provider parity across data model, API catalog/validation, worker routing, and integration UI fields.

Changes:
1. Expanded `Provider` enum to include:
   - `M365`, `GITHUB`, `MONGODBATLAS`, `ORACLECLOUD`, `ALIBABACLOUD`, `CLOUDFLARE`, `OPENSTACK`
   - File: `apps/api/prisma/schema.prisma`
2. Regenerated Prisma client after enum expansion.
   - Command: `npm run prisma:generate -w @cspm/api`
3. Added provider-specific integration config validation schemas for all newly added providers.
   - File: `apps/api/src/app.ts`
4. Expanded API provider capability defaults and provider field catalog map.
   - File: `apps/api/src/app.ts`
5. Updated `/providers/catalog` to derive providers dynamically from enum instead of hardcoded list.
   - File: `apps/api/src/app.ts`
6. Expanded worker Prowler provider command routing for newly supported providers.
   - File: `apps/worker/src/index.ts`
7. Expanded web provider union, field definitions, onboarding notes, and catalog fallback logic.
   - File: `apps/web/src/app/_lib/cspm.ts`
8. Expanded integrations page provider parsing and default profile option mapping for new providers.
   - File: `apps/web/src/app/integrations/page.tsx`
9. Added API test assertion to verify expanded provider catalog output.
   - File: `apps/api/src/app.test.ts`

Verification:
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`
- `npm run clean:web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 18

Goal:
- Increase public onboarding parity by documenting setup/config payloads for newly supported providers.

Changes:
1. Extended KB index with links/cards for new provider guides.
   - File: `apps/web/src/app/v1/kb/page.tsx`
2. Expanded access requirements matrix for new providers.
   - File: `apps/web/src/app/v1/kb/access-requirements/page.tsx`
3. Added new public guide pages:
   - `apps/web/src/app/v1/kb/m365/page.tsx`
   - `apps/web/src/app/v1/kb/github/page.tsx`
   - `apps/web/src/app/v1/kb/mongodbatlas/page.tsx`
   - `apps/web/src/app/v1/kb/oraclecloud/page.tsx`
   - `apps/web/src/app/v1/kb/alibabacloud/page.tsx`
   - `apps/web/src/app/v1/kb/cloudflare/page.tsx`
   - `apps/web/src/app/v1/kb/openstack/page.tsx`

Verification:
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 19

Goal:
- Add non-smoke worker integration tests for two critical production behaviors:
  - scan reprocessing idempotency
  - retry transition lifecycle until retry budget exhaustion

Changes:
1. Added test-only worker adapter fixture path (guarded by `NODE_ENV=test`) to exercise worker logic without external scanner binaries.
   - File: `apps/worker/src/index.ts`
2. Added exported worker prisma disconnect helper for clean integration-test teardown.
   - File: `apps/worker/src/index.ts`
3. Added worker integration test suite:
   - verifies repeated processing of same scan job does not increase finding count
   - verifies retryable failure transitions `QUEUED_FOR_RETRY -> FAILED` when `WORKER_MAX_RETRIES` is exceeded
   - File: `apps/worker/src/worker.integration.test.ts`

Verification:
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 20

Goal:
- Complete operator UX loop for runtime provider capability overrides by exposing preview/parse status directly in Settings.

Changes:
1. Added client type and action for:
   - `GET /system/provider-capabilities/preview`
   - File: `apps/web/src/app/_lib/cspm.ts`
2. Added Settings UI controls and result table:
   - “Preview provider capabilities” action
   - source file existence + parse status
   - per-provider override/framework/profile-option view
   - File: `apps/web/src/app/settings/page.tsx`

Verification:
- `npm run test -w @cspm/web`
- `npm run lint -w @cspm/web`
- `npm run test -w @cspm/api`
- `npm run lint -w @cspm/api`
- `npm run test -w @cspm/worker`
- `npm run lint -w @cspm/worker`
- `npm run test:e2e`

Status:
- Completed

## Iteration 21

Goal:
- Add downstream integration baseline parity for post-scan dispatch (`amazon_s3`, `aws_security_hub`, `jira`, `slack`) with operational UI + worker outbox workflow.

Changes:
1. Hardened downstream endpoint API contracts:
   - added endpoint type validation (`amazon_s3`, `aws_security_hub`, `jira`, `slack`)
   - added target validation per type (S3 URI / AWS region / URL)
   - added update + delete endpoints for destination lifecycle management
   - Files:
     - `apps/api/src/app.ts`
     - `apps/api/src/app.test.ts`
2. Added worker dispatch outbox pipeline on scan completion:
   - for enabled tenant endpoints, writes structured outbox records to `WORKER_EXPORT_OUTBOX_DIR`
   - records dispatch summary in scan metadata and tenant audit log
   - keeps scan completion non-blocking if dispatch step fails
   - Files:
     - `apps/worker/src/index.ts`
     - `apps/worker/src/env.ts`
     - `apps/worker/.env.example`
     - `.env.example`
3. Added worker integration coverage for dispatch behavior:
   - verifies configured endpoint generates queued outbox delivery and metadata summary
   - File: `apps/worker/src/worker.integration.test.ts`
4. Added Security settings UI for downstream destination operations:
   - create/list/enable-disable/delete destinations
   - destination-specific target hints/placeholders
   - Files:
     - `apps/web/src/app/_lib/cspm.ts`
     - `apps/web/src/app/settings/security/page.tsx`
5. Added scan-list dispatch visibility:
   - shows per-scan dispatch queued/failed summary parsed from metadata
   - File: `apps/web/src/app/scans/page.tsx`
6. Expanded API regression test coverage for non-AWS queueing path:
   - creates `CLOUDFLARE` and `OPENSTACK` integrations and verifies scan queue acceptance
   - File: `apps/api/src/app.test.ts`

Verification:
- `npm run lint -w @cspm/api`
- `npm run lint -w @cspm/worker`
- `npm run lint -w @cspm/web`
- `npm run test -w @cspm/api`
- `npm run test -w @cspm/worker`
- `npm run test -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 22

Goal:
- Close dispatch operations loop and strengthen non-AWS execution confidence.

Changes:
1. Added scan dispatch status and replay API:
   - `GET /tenants/:tenantId/scans/:scanId/dispatch`
   - `POST /tenants/:tenantId/scans/:scanId/dispatch/replay` (OWNER/ADMIN)
   - replay writes new outbox payloads under `WORKER_EXPORT_OUTBOX_DIR` and appends replay history in scan metadata
   - Files:
     - `apps/api/src/app.ts`
     - `apps/api/src/env.ts`
     - `apps/api/.env.example`
2. Extended worker metadata API output to include dispatch summary/error fields for richer scan drilldowns.
   - File: `apps/api/src/app.ts`
3. Added API regression coverage for dispatch replay:
   - seeds failed dispatch metadata on completed scan
   - validates read + replay transitions failed -> queued
   - File: `apps/api/src/app.test.ts`
4. Expanded worker integration parity tests with provider-wide smoke coverage:
   - validates queue->worker->finding completion path for all currently supported providers
   - File: `apps/worker/src/worker.integration.test.ts`
5. Added scan-page dispatch drilldown and replay control in UI:
   - fetch dispatch delivery state
   - replay failed deliveries from scan details panel
   - Files:
     - `apps/web/src/app/_lib/cspm.ts`
     - `apps/web/src/app/scans/page.tsx`

Verification:
- `npm run lint -w @cspm/api`
- `npm run lint -w @cspm/worker`
- `npm run lint -w @cspm/web`
- `npm run test -w @cspm/api`
- `npm run test -w @cspm/worker`
- `npm run test -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

## Iteration 23

Goal:
- Improve dashboard workflow parity with Prowler-style watchlists for faster risk triage.

Changes:
1. Extended posture API aggregation with service and framework watchlists:
   - service watchlist ranked by critical-open then open findings
   - framework watchlist ranked by critical/open pressure
   - Files:
     - `apps/api/src/app.ts`
     - `apps/api/src/app.test.ts`
2. Extended web posture model to include watchlist payloads.
   - File: `apps/web/src/app/_lib/cspm.ts`
3. Added dashboard watchlist UI blocks on home page:
   - top risky services
   - top risky frameworks
   - File: `apps/web/src/app/page.tsx`

Verification:
- `npm run lint -w @cspm/api`
- `npm run lint -w @cspm/worker`
- `npm run lint -w @cspm/web`
- `npm run test -w @cspm/api`
- `npm run test -w @cspm/worker`
- `npm run test -w @cspm/web`
- `npm run test:e2e`

Status:
- Completed

Next iteration (proposed):
1. Add runtime capability discovery command path (scanner-native checks/framework enumeration) and persist/cache results for UI/profile generation.
2. Add dashboard drill-through routes from watchlists/executive cards to filtered findings tables.
3. Add dispatch delivery lifecycle table (delivery IDs + replay attempts + terminal states) instead of metadata-only snapshots.
