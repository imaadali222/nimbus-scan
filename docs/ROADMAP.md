# Delivery Roadmap

Status note: checkmarks indicate MVP baseline implementation in this repo; production hardening may still be pending.

## Phase 0 - Product + architecture baseline (Done)
- [x] Product direction and provider scope
- [x] Open-source engine strategy (Prowler + Kubescape)
- [x] Production architecture + security model

## Phase 1 - Production platform baseline
- [x] Monorepo bootstrap (web/api/worker/shared)
- [x] PostgreSQL schema + tenant isolation (baseline complete: Postgres-first env, tenant-scoped API guards, expanded tenant-isolation data model)
- [x] Auth + organizations + RBAC (baseline: local JWT + tenant memberships + role checks)
- [x] Integration wizard (AWS/Azure/GCP/K8s) (baseline: provider onboarding forms + integration CRUD)
- [x] Queue + worker execution pipeline (baseline: DB queue + worker polling lifecycle)
- [x] Raw artifact storage (complete: worker writes raw scanner payloads, API gated artifact download)

## Phase 2 - Findings and dashboard
- [x] Findings normalization pipeline (baseline: normalized findings persistence + API filters)
- [x] Severity/risk scoring and prioritization (baseline: riskScore persisted + prioritized findings endpoint)
- [x] Compliance mapping views (baseline API + web table)
- [x] Executive dashboard + drilldowns (baseline summary + top risks)
- [x] Asset inventory views (baseline asset model + inventory view)

## Phase 3 - Enterprise hardening
- [ ] SSO/SAML + SCIM
- [x] Audit logs and immutable events (baseline append-only tenant-scoped audit log entries)
- [x] Alerting (email/webhook/Slack) (baseline alert endpoint hooks registry)
- [x] Scheduling policies + SLAs (baseline schedule policy CRUD/list)
- [x] Backup/restore + DR docs (docs baseline complete)

## Phase 4 - GTM readiness
- [ ] Billing hooks (plans/seats)
- [x] MSP multi-org management (groundwork: tenant/org-safe model foundations + docs)
- [x] Public docs + onboarding playbooks (baseline docs/playbooks delivered)
- [x] Deployment guides for SMB and enterprise (baseline guides delivered)

## Immediate next sprint
1. Migrate data layer from SQLite baseline to PostgreSQL and tighten tenant isolation tests
2. Add raw scan artifact storage and retrieval
3. Replace polling queue baseline with retries/backoff/dead-letter semantics
4. Expand findings UX (risk scoring, compliance mapping, richer drilldowns)
