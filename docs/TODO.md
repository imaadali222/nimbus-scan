# CSPM Platform — Master TODO List

Last updated: 2026-02-21
Powered by: [Prowler Open Source](https://github.com/prowler-cloud/prowler) (v4.6.0) + Kubescape (v3.0.26)

This document consolidates all completed work, in-progress items, and planned work across the project. It is the single source of truth for tracking what is built, what is next, and what remains on the backlog.

Sources: `IMPLEMENTATION_TRACKER.md`, `PROWLER_PARITY_BACKLOG.md`, `ROADMAP.md`, `SPRINT_PILOT_HARDENING.md`

---

## Table of Contents

1. [Completed Work](#completed-work)
2. [Current Sprint — Pilot Hardening](#current-sprint--pilot-hardening)
3. [Near-Term Backlog (P0/P1)](#near-term-backlog-p0p1)
4. [Mid-Term Backlog (P1/P2)](#mid-term-backlog-p1p2)
5. [Long-Term Backlog (P2/P3)](#long-term-backlog-p2p3)
6. [Prowler Parity Scorecard](#prowler-parity-scorecard)
7. [Roadmap Phase Status](#roadmap-phase-status)

---

## Completed Work

### Roadmap Phases

- [x] **Phase 0** — Product + architecture baseline
- [x] **Phase 1** — Production platform baseline (monorepo, schema, auth, integrations, queue, artifacts)
- [x] **Phase 2** — Findings and dashboard (normalization, scoring, compliance, executive dashboard, assets)

### Core Platform (Iterations 1–23)

#### Authentication & Session (Iterations 1–2)
- [x] Request correlation ID (`x-request-id`) preserved across proxy boundaries and surfaced in UI errors
- [x] Dynamic runtime enforcement for all proxy/session/health routes (no false static-generation)

#### Scan Reliability (Iterations 3, 6, 8–9)
- [x] Deterministic finding deduplication keys for idempotent persistence under retries
- [x] Bounded worker retries with explicit failure taxonomy (`TRANSIENT_INFRA`, `AUTHORIZATION`, `CONFIGURATION`, `UNSUPPORTED`, `UNKNOWN`)
- [x] Worker identity stamping (`hostname:pid`) and claim metadata on scan-job transitions
- [x] Centralized `buildRetryPlan()` helper with unit tests for retry/exhaustion paths

#### Operator Tooling (Iterations 4–5, 7)
- [x] `npm run dev:logs` — stream service logs
- [x] `npm run dev:doctor` — diagnose port conflicts with kill-command suggestions
- [x] Documentation for diagnostics and live-log workflows

#### Runtime Capabilities (Iteration 10, 13, 20)
- [x] File-based provider capability overrides (`PROVIDER_CAPABILITIES_FILE`)
- [x] Capability validation/preview endpoint (`GET /system/provider-capabilities/preview`)
- [x] Settings UI for previewing provider capability overrides

#### Scan Observability APIs (Iterations 11–12, 14–16)
- [x] `GET /tenants/:tenantId/scans/:scanId/worker-metadata` — per-scan worker metadata drilldown
- [x] `GET /tenants/:tenantId/scans/worker-events` — recent retry/failure/claim transitions
- [x] Worker events panel + per-scan worker metadata drilldown in Scans UI
- [x] README updated with new scan-ops API endpoints

#### Provider Expansion (Iterations 17–18)
- [x] Provider enum expanded: AWS, Azure, GCP, Kubernetes, M365, GitHub, MongoDBAtlas, OracleCloud, AlibabaCloud, Cloudflare, OpenStack (11 providers)
- [x] Provider-specific integration config validation schemas for all providers
- [x] Worker Prowler command routing for all supported providers
- [x] Public Knowledge Base guides for all 11 providers + access requirements matrix
- [x] Provider-wide smoke tests in worker integration suite

#### Worker Integration Tests (Iteration 19)
- [x] Test-only worker adapter fixture (guarded by `NODE_ENV=test`)
- [x] Scan reprocessing idempotency test
- [x] Retry transition lifecycle test (budget exhaustion)

#### Downstream Dispatch (Iterations 21–22)
- [x] Alert endpoint CRUD with type validation (`amazon_s3`, `aws_security_hub`, `jira`, `slack`)
- [x] Worker dispatch outbox pipeline on scan completion
- [x] Dispatch status API (`GET /tenants/:tenantId/scans/:scanId/dispatch`)
- [x] Dispatch replay API (`POST /tenants/:tenantId/scans/:scanId/dispatch/replay`)
- [x] Security Settings UI for destination management (create/list/enable/disable/delete)
- [x] Scan-page dispatch visibility + replay controls

#### Dashboard & Watchlists (Iteration 23)
- [x] Service watchlist ranked by critical-open then open findings
- [x] Framework watchlist ranked by critical/open pressure
- [x] Dashboard watchlist UI blocks on home page

### Other Completed Items
- [x] HttpOnly cookie session proxy (no localStorage tokens)
- [x] 4-tier RBAC: OWNER, ADMIN, ANALYST, VIEWER
- [x] Super-admin mode for MSP platform control
- [x] Tenant hierarchy (parent/child MSP relationships)
- [x] Immutable append-only audit logs
- [x] Schedule policy CRUD/list
- [x] Password reset token lifecycle
- [x] Quick login/signup toggle on public pages
- [x] Dedicated login/signup pages with streamlined unauth flow
- [x] Integration config parsing hardening (super-admin 500 fix)

---

## Current Sprint — Pilot Hardening

**Sprint goal:** Pilot-ready CSPM for MSP/MSSP design partners
**Sprint length:** 2 weeks (ending ~2026-02-25)

### P0 — Must complete before pilot

| # | Item | Status | Owner | Target | Key Files |
|---|------|--------|-------|--------|-----------|
| 1 | **Auth hardening** — password policy, login rate limiting/lockout, session expiry/rotation, session revoke | In Progress | Mac Mini | 2026-02-19 | `apps/api/src/app.ts`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/settings/security/page.tsx` |
| 2 | **Secrets handling v2** — enforce secret reference-only patterns, redact all integration responses, tests for plaintext rejection | In Progress | Mac Mini | 2026-02-20 | `apps/api/src/app.ts`, `apps/api/src/app.test.ts` |
| 3 | **Pilot signoff execution** — run every item in security checklist, record pass/fail evidence | In Progress | TM | 2026-02-21 | `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md` |

### P1 — Should complete before pilot

| # | Item | Status | Owner | Target | Key Files |
|---|------|--------|-------|--------|-----------|
| 4 | **Queue/worker robustness** — explicit retry/backoff, DLQ-like state for exhausted retries, stuck/failed scan visibility | Not Started | Mac Mini | 2026-02-22 | `apps/worker/src/index.ts`, `apps/api/src/app.ts`, `apps/web/src/app/scans/page.tsx` |
| 5 | **Tenant isolation verification** — negative tests for cross-tenant access on all sensitive endpoints | Not Started | Mac Mini | 2026-02-23 | `apps/api/src/app.test.ts` |
| 6 | **Pilot observability minimum** — correlation ID consistency across services, baseline metrics/alert triggers | Not Started | Mac Mini | 2026-02-24 | `apps/api/src/app.ts`, `apps/worker/src/index.ts`, `scripts/healthcheck.mjs` |
| 7 | **Provider readiness truth labeling** — label providers as validated vs. catalog/experimental in UI + docs | Not Started | TM | 2026-02-24 | `apps/web/src/app/integrations/page.tsx`, `docs/INTEGRATIONS.md` |
| 8 | **Formal pilot dry run** — full MSP scenario walkthrough with screenshots/evidence | Not Started | TM + Mac Mini | 2026-02-25 | `docs/MSP_ONBOARDING_PLAYBOOK.md` |

### Pilot Release Gate Checklist

- [ ] All P0 items (1–3) marked Done
- [ ] No unresolved critical security findings
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Scanner preflight passes (`npm run scanners:preflight`)
- [ ] API readiness healthy (`/ready`)
- [ ] Pilot signoff document completed with evidence
- [ ] Formal pilot dry-run completed with no P0 blockers
- [ ] Docs aligned with implementation reality

---

## Near-Term Backlog (P0/P1)

### P0: Foundation Stabilization

- [ ] **Database migration** — migrate Prisma datasource from SQLite to PostgreSQL for production; document limits of SQLite for local-only use
- [ ] **Error contracts** — explicit API error shapes with structured codes for signup/login/onboarding failure modes

### P1: Scan Profile & Compliance Control Parity

- [ ] **Profile-to-CLI mapping** — map scan-profile fields to provider-specific Prowler CLI options with strict validation
- [ ] **Dynamic capability discovery** — ingest provider capabilities (frameworks, checks, services, categories) from Prowler runtime metadata instead of hardcoded arrays
- [ ] **Profile telemetry** — return per-scan feedback: requested options, applied options, rejected/unsupported options
- [ ] **Runtime capability discovery command path** — execute scanner-native checks/framework enumeration and cache results for UI/profile generation

### P1: Dashboard & Workflow Parity

- [ ] **Risk trend charts** — severity over time, open/closed trajectory
- [ ] **Compliance drilldown** — navigate by framework and requirement status
- [ ] **Dashboard drill-through** — clickable routes from watchlists/executive cards to filtered findings tables
- [ ] **Finding state transitions** — open/closed/muted lifecycle with basic mute rules
- [ ] **Muting workflows** — user-facing mute/unmute with deterministic application in finding summaries

### P1: Next Iteration Items (from Implementation Tracker)

- [ ] **Dispatch delivery lifecycle table** — persistent delivery IDs, replay attempts, and terminal states (replacing metadata-only snapshots)

---

## Mid-Term Backlog (P1/P2)

### Enterprise Orchestration & Operations (P2)

- [ ] **Queue backend migration** — move from DB polling to Redis/Valkey or managed queue with worker concurrency controls
- [ ] **Dead-letter queue (DLQ)** — persistent DLQ with replay tooling for permanently failed scans
- [ ] **Job-level rate limiting** — tenant fairness controls for scan scheduling
- [ ] **Structured observability** — correlation IDs end-to-end, queue lag/scan duration/fail-rate/retry metrics

### Integration & Export Parity (P2)

- [ ] **Per-delivery lifecycle tracking** — delivery IDs, retries, terminal states, acknowledgements for each downstream dispatch
- [ ] **Integration health checks** — tenant-scoped downstream integration health status dashboards
- [ ] **Secure credential storage abstraction** — pluggable secret backend (AWS Secrets Manager, Vault, etc.)

### Attack Paths & Graph Analytics (P2)

- [ ] **Graph backend** — introduce Neo4j or equivalent for attack path modeling
- [ ] **Attack-path scan pipeline** — AWS-first graph ingestion workflow
- [ ] **Attack-path UI** — query and node drilldown with tenant isolation
- [ ] **Attack-path RBAC** — policy controls for who can run/view attack path data

### Enterprise Auth & Billing (Phase 3–4)

- [ ] **SSO/SAML + SCIM** — enterprise identity provider integration
- [ ] **Billing hooks** — plans, seats, usage metering

---

## Long-Term Backlog (P2/P3)

### Advanced Findings & Compliance (P2)

- [ ] **Muting rules & suppression policies** — scheduled/permanent suppression with audit trail
- [ ] **Asset criticality-based risk prioritization** — weight findings by asset business impact
- [ ] **Compliance report generation** — exportable PDF/HTML compliance reports per framework
- [ ] **Trend analysis & SLA tracking** — historical trend data with configurable SLA targets
- [ ] **Finding delta/mute semantics** — match Prowler's requirement-level lifecycle tracking

### Dashboard Enhancements (P2)

- [ ] **Radar-style visualizations** — multi-dimensional security posture views
- [ ] **Trend drilldowns** — time-series detail views for severity/provider/framework
- [ ] **Enhanced executive dashboard** — provider/severity breakdowns with period comparisons

### Documentation & Onboarding Parity (P3)

- [ ] **Provider setup checklists** — copy-paste cloud policy templates per provider
- [ ] **Troubleshooting matrix** — per provider/runtime/auth mode diagnostic guide
- [ ] **KB versioning** — synchronize KB content with API integration schema changes automatically

### Test Strategy Parity (P3)

- [ ] **E2E suite expansion:**
  - [ ] MSP parent-child RBAC flows
  - [ ] Integration create/update/delete lifecycle
  - [ ] Queue scan and findings ingestion end-to-end
  - [ ] Dashboard data integrity checks
- [ ] **Negative & edge-case tests:**
  - [ ] Invalid credential references
  - [ ] Concurrent first-user registration
  - [ ] Duplicate queue claim race conditions
  - [ ] Unsupported provider/profile option handling
- [ ] **Export failure permutation coverage**
- [ ] **CI gate** — block merges on regression in auth, tenant access, or scan lifecycle

### CLI-Only Provider Modes (P3)

- [ ] **NHN provider** — expose in API/UI (Prowler CLI-supported)
- [ ] **IaC scanning** — infrastructure-as-code provider mode
- [ ] **Image scanning** — container image provider mode
- [ ] **LLM provider** — beta LLM scanning provider (Prowler experimental)

---

## Prowler Parity Scorecard

Current state vs. upstream Prowler (`04b43b20ae` / 2026-02-17):

| Area | Status | Notes |
|------|--------|-------|
| Scanner execution | **Partial** | Real Prowler/Kubescape execution; no SDK-direct integration |
| Provider breadth | **Partial** | 11/14 providers (missing NHN, IaC, Image, LLM) |
| Scan option fidelity | **Partial** | Basic profile forwarded; no dynamic check/compliance discovery |
| Findings model depth | **Low** | Normalized findings + risk score; no delta/mute semantics |
| Dashboards | **Partial** | Executive summaries + watchlists; no radar/trend/attack-path views |
| Attack paths | **Missing** | Not implemented (Prowler uses Neo4j) |
| Integrations (exports) | **Partial** | S3/SecurityHub/Jira/Slack outbox; no persistent delivery lifecycle |
| Multi-tenant MSP controls | **Good** | Hierarchy, parent visibility, global inventory |
| Auth/session security | **Good** | HttpOnly cookies, RBAC middleware |
| Enterprise reliability | **Low** | DB-polled queue, limited retries, no DLQ/queue backend |
| Test coverage | **Partial** | API + worker integration + e2e auth; dashboard/export under-covered |

---

## Roadmap Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Product + architecture baseline | Done |
| **Phase 1** | Production platform baseline | Done |
| **Phase 2** | Findings and dashboard | Done |
| **Phase 3** | Enterprise hardening | In Progress (SSO/SAML pending) |
| **Phase 4** | GTM readiness | In Progress (Billing pending) |

---

## Quick Reference — Key Commands

```bash
# Development
npm run dev                  # Start all services
npm run dev:logs             # Stream live logs
npm run dev:doctor           # Diagnose port conflicts

# Quality gates
npm run test                 # All tests
npm run typecheck            # Type checking
npm run build                # Production build
npm run test:e2e             # Playwright e2e tests

# Scanner operations
npm run scanners:prewarm     # Pull scanner images
npm run scanners:preflight   # Verify scanner readiness

# Database
npm run prisma:generate      # Regenerate Prisma client
npm run prisma:push          # Push schema to database
```

---

## Architecture Quick Reference

```
User (Browser)
  → Web UI (Next.js) [Port 3000]
    → API (Express.js) [Port 4000]
      → Prisma ORM → SQLite (dev) / PostgreSQL (prod)
      → Tenant-scoped RBAC enforcement
    ← Worker Service [Port 4010]
      → Prowler (AWS/Azure/GCP/M365/GitHub/etc.)
      → Kubescape (Kubernetes)
      → Normalized Findings → DB
      → Dispatch Outbox → S3/SecurityHub/Jira/Slack
```

---

*This TODO is maintained alongside `IMPLEMENTATION_TRACKER.md` (iteration detail), `PROWLER_PARITY_BACKLOG.md` (parity analysis), `ROADMAP.md` (phase overview), and `SPRINT_PILOT_HARDENING.md` (current sprint).*
