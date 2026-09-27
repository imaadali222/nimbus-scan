# Prowler Parity Backlog (MSP SaaS)

Last updated: 2026-02-17

Upstream reference snapshot:
- Repo: `prowler-cloud/prowler`
- Commit: `04b43b20ae0ec2a706e48166e69de75d477b7533`
- Deep-dive reference: `docs/PROWLER_DEEP_DIVE.md`

Local platform baseline reviewed in this repo:
- API: `apps/api/src/app.ts`, `apps/api/prisma/schema.prisma`
- Worker: `apps/worker/src/index.ts`
- Web: `apps/web/src/app/*`, `apps/web/src/middleware.ts`, `apps/web/src/app/_lib/cspm.ts`
- Tests: `apps/api/src/app.test.ts`, `apps/worker/src/index.test.ts`, `apps/web/src/app/page.test.tsx`, `e2e/auth-and-navigation.spec.ts`

## Current parity scorecard

| Area | Current state in this repo | Prowler parity status |
|---|---|---|
| Scanner execution | Real Prowler/Kubescape command execution exists in worker | Partial |
| Provider breadth | API/UI/worker now cover AWS/Azure/GCP/Kubernetes/M365/GitHub/MongoDBAtlas/OracleCloud/AlibabaCloud/Cloudflare/OpenStack | Partial |
| Scan option fidelity | Basic profile options forwarded; no dynamic check/compliance discovery | Partial |
| Findings model depth | Basic normalized finding and risk score; no Prowler delta/mute semantics | Low |
| Dashboards | Executive/posture summaries plus service/framework watchlists exist | Partial |
| Attack paths | Not implemented | Missing |
| Integrations (exports) | Downstream destination lifecycle + worker dispatch outbox baseline (`amazon_s3`, `aws_security_hub`, `jira`, `slack`) | Partial |
| Multi-tenant MSP controls | Hierarchy, parent visibility, global integration inventory/update exist | Good |
| Auth/session security | HttpOnly cookie proxy and middleware gating exist | Good |
| Enterprise reliability | DB-polled queue, limited retries, no DLQ/queue backend | Low |
| Test coverage | API + worker integration tests + auth/navigation e2e; dashboard/provider/export paths still under-covered | Partial |

## What is already right

1. End-to-end flow exists and is usable: signup/login, add integration, queue scan, view findings.
2. MSP model is started correctly: parent-child tenant hierarchy, role scoping, global integration inventory/update.
3. Security posture is improved over pure localStorage token models: HttpOnly cookie session proxy and route middleware are in place.
4. Prowler is not simulated: real scanner invocation and artifact persistence are implemented.
5. Provider capability and scan-profile surfaces are present in API and UI, which is a good extension point.

## Biggest parity gaps vs Prowler today

1. Provider parity gap: CLI-only provider modes (for example NHN/Image/LLM) are not first-class in API/UI models.
2. Dashboard/workflow parity gap: baseline watchlists exist, but radar-style visuals, muting workflows, trend drilldowns, and attack-path workflows are missing.
3. Findings/compliance depth gap: missing Prowler-like requirement-level and lifecycle semantics.
4. Integration/export gap: replay controls exist, but persistent per-delivery lifecycle tracking (IDs, retries, terminal states, acknowledgements) is still missing.
5. Reliability gap: queue/worker architecture is not production-grade for multi-tenant scale and retries.
6. Testing gap: provider smoke coverage exists, but export failure permutations and dashboard integrity drilldowns remain under-tested.

## Prioritized backlog

## P0: Stabilize foundation for production onboarding

Priority: blocking

Deliverables:
1. Resolve signup/login/onboarding failure modes with explicit API error contracts and request IDs surfaced in UI.
2. Align data layer and deployment docs:
   - Either fully commit to SQLite for local only and document limits.
   - Or move Prisma datasource to PostgreSQL and remove mismatch.
3. Add deterministic scan-job idempotency:
   - Prevent duplicate finding inserts for repeated/retried scan outputs.
   - Upsert findings on stable keys (`tenantId + provider + resourceId + externalId + scan window` strategy).
4. Add robust worker retry policy with bounded retries and failure reason taxonomy.

Acceptance criteria:
1. New tenant owner can sign up and reach integrations page on clean environment in automated e2e.
2. Same flow passes with both local dev stack and containerized scanner runtime.
3. Repeat-processing a scan job does not duplicate findings.

## P1: Expand provider parity to practical MSP baseline

Priority: next cycle

Deliverables:
1. Extend Provider enum and validation in API + Prisma + UI for:
   - `M365`, `GitHub`, `MongoDBAtlas`, `OracleCloud`, `AlibabaCloud`, `Cloudflare`, `OpenStack`.
2. Add provider-specific integration schemas and UI field sets.
3. Add provider runtime gating/capability endpoint entries for all supported providers.
4. Add worker adapter routing for all newly exposed providers where Prowler already supports CLI mode.

Acceptance criteria:
1. Provider catalog and integration forms reflect expanded list consistently in API and UI.
2. Each newly enabled provider can queue and complete at least one smoke scan in non-production validation tenant.

## P1: Achieve scan profile and compliance control parity

Priority: next cycle

Deliverables:
1. Map scan-profile fields to provider-specific CLI options with strict validation.
2. Ingest dynamic provider capabilities (frameworks/checks/services/categories) from runtime metadata, not hardcoded arrays.
3. Return profile application telemetry per scan:
   - Requested options.
   - Applied options.
   - Rejected/unsupported options.

Acceptance criteria:
1. Profile options shown in UI are provider-accurate and runtime-accurate.
2. API returns deterministic feedback for unsupported options, no silent drops.

## P1: Deliver Prowler-like dashboard workflow parity (core subset)

Priority: next cycle

Deliverables:
1. Add risk trend charts (severity over time, open/closed trajectory).
2. Add compliance drilldown by framework and requirement status.
3. Add watchlist views:
   - services with highest open findings.
   - frameworks with highest critical open findings.
4. Add finding state transitions and basic mute rules.

Acceptance criteria:
1. Users can navigate from executive cards to drilldown tables/charts.
2. Mute rules apply deterministically and are visible in finding summaries.

## P2: Build enterprise orchestration and operations parity

Priority: planned

Deliverables:
1. Move from DB polling to queue-backed orchestration (Redis/Valkey or managed queue) with worker concurrency controls.
2. Add dead-letter queue and replay tooling.
3. Add job-level rate limiting and tenant fairness controls.
4. Add structured observability:
   - Correlation IDs across web/api/worker.
   - Queue lag, scan duration, fail-rate, retry metrics.

Acceptance criteria:
1. System sustains parallel scans across at least 10 tenants without duplicate execution.
2. Failed jobs are observable, classifiable, and replayable.

## P2: Integration and export parity

Priority: planned

Deliverables:
1. Add downstream integrations architecture:
   - Security Hub
   - S3 artifact export
   - Jira ticketing dispatch
2. Add tenant-scoped integration health checks, status dashboards, and retry controls.
3. Add secure credential storage abstraction for integration credentials.

Acceptance criteria:
1. Completed scans can publish to selected downstream integration with audit trail.
2. Integration failures are surfaced in UI and retriable.

## P2: Attack paths and graph analytics

Priority: planned

Deliverables:
1. Introduce graph backend and ingestion workflow for attack path modeling.
2. Add attack-path scan pipeline and UI workflows.
3. Add policy controls for who can run/view attack path data.

Acceptance criteria:
1. Attack-path data appears for supported providers with tenant isolation.
2. UI supports query and node drilldown workflow without cross-tenant leakage.

## P3: Documentation and onboarding parity

Priority: quality

Deliverables:
1. Keep public KB pages synchronized with actual integration schemas and required cloud steps.
2. Add provider-by-provider guided setup checklists with copy-paste cloud policy templates.
3. Add troubleshooting matrix by provider/runtime/auth mode.

Acceptance criteria:
1. New MSP operator can onboard one tenant per provider using only KB instructions.
2. KB content is versioned alongside API integration schema changes.

## P3: Test strategy parity

Priority: quality

Deliverables:
1. Replace smoke-only worker/web tests with meaningful unit and integration tests.
2. Expand e2e suite for:
   - signup/login/logout/error flows
   - MSP parent-child RBAC
   - integration create/update/delete
   - queue scan and findings ingestion
   - dashboard data integrity
3. Add negative and edge-case tests:
   - invalid credential refs
   - concurrent first-user registration
   - duplicate queue claim race
   - unsupported provider/profile option handling

Acceptance criteria:
1. CI blocks merges on regression in auth, tenant access, or scan lifecycle.
2. E2E suite covers at least one successful scan path and one controlled failure path per major provider class.

## Suggested execution order

1. P0 foundation and reliability.
2. P1 provider + profile parity.
3. P1 dashboard and workflow parity.
4. P2 orchestration and integrations.
5. P2 attack paths.
6. P3 documentation and hardening.

## Decision note for product direction

If the goal is "Prowler experience inside MSP SaaS" rather than "rebuild Prowler":
1. Keep scanner intelligence in upstream Prowler execution paths.
2. Focus this SaaS on tenancy, orchestration, presentation, and governance.
3. Pull dynamic capability metadata from Prowler runtime/hub instead of hardcoding.
