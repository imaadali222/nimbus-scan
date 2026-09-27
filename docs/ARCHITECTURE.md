# Architecture - CSPM/KSPM SaaS

## 1) Core requirements
- Multi-tenant SaaS (SMB + enterprise)
- Integration-based onboarding for cloud accounts/subscriptions/projects/clusters
- Hundreds of checks from open-source engines
- Unified findings model across providers
- Prioritized risk + remediation workflow
- Production reliability, observability, and security controls

## 2) Logical components

1. Web App (customer + admin)
- Tenant onboarding
- Cloud integration wizard
- Findings dashboard (risk, compliance, assets)
- Policy/compliance views (CIS/NIST/PCI/etc.)

2. API Service
- Auth (OIDC/SAML-ready), RBAC, tenant scoping
- Integrations CRUD
- Scan schedule and runs APIs
- Findings query APIs

3. Orchestrator + Queue
- Trigger scans (manual/scheduled/event-driven)
- Job state lifecycle
- Retry/backoff and dead-letter handling

4. Scanner Workers
- Prowler worker (AWS/Azure/GCP)
- Kubescape worker (Kubernetes)
- Containerized scanner runtime with pinned engine image versions
- Parse engine outputs, normalize findings, attach evidence

5. Data Layer
- SQLite (tenants, integrations, scan runs, findings, compliance mappings)
- Object storage for raw artifacts and logs
- DB-backed queue lifecycle in `ScanJob` table

## 3) Security model
- Strict tenant isolation (tenant_id in all records + RLS)
- Least-privilege cloud read-only integration policies
- Secrets encrypted at rest (KMS/managed secret store)
- Signed audit events for admin/security actions
- No long-lived plaintext credentials in app logs

## 4) Findings normalization model (high-level)
- provider: aws|azure|gcp|kubernetes
- engine: prowler|kubescape
- check_id
- resource_id/resource_type/region
- severity: critical/high/medium/low/info
- status: pass/fail/warn/not_applicable
- compliance_refs: [CIS-..., NIST-..., etc.]
- remediation: title + steps + links
- first_seen/last_seen

## 5) Scalability approach
- Horizontal worker scaling by queue depth
- Chunked scan execution per account/project/subscription
- Async UI patterns with live job status
- Caching for dashboard aggregates

## 6) Production deployment baseline
- Local: Node services + SQLite database + scanner runtime
- Cloud: VM/Kubernetes with persistent SQLite storage (or migrate datasource/provider before adopting Postgres/Redis)
- CI/CD: lint/test/build/security scan + image signing
