# Sprint Board — Pilot Hardening

**Sprint length:** 2 weeks  
**Sprint goal:** Pilot-ready CSPM for MSP/MSSP design partners with secure auth/secret handling, reliable scan operations, and clear provider readiness messaging.  
**Sprint owner:** TM + Mac Mini assistant

---

## Legend
- **Status:** `Not Started` | `In Progress` | `Blocked` | `Done`
- **Owner:** primary accountable person
- **Target date:** planned completion date

---

## Work Items

## 1) Auth hardening (P0)
- **Owner:** Mac Mini
- **Status:** In Progress
- **Target date:** 2026-02-19
- **Touchpoints (files/endpoints):**
  - `apps/api/src/app.ts`
  - `apps/web/src/app/login/page.tsx`
  - `apps/web/src/app/settings/security/page.tsx`
  - Endpoints: `/auth/login`, `/auth/register`, `/auth/change-password`, `/auth/reset-password`
- **Scope:**
  - stronger password policy
  - login rate limiting/lockout
  - session expiry/rotation checks + basic session revoke path
- **Done criteria:**
  - repeated failed logins are throttled/blocked
  - password policy enforced on register/reset/change
  - session invalidation path documented and tested
- **Verification command(s):**
  - `npm run test -w @cspm/api`
  - `npm run typecheck -w @cspm/api`

**2026-02-21 update**
- Added stronger password policy enforcement on register/reset/change-password and tenant-user creation (when password supplied).
- Added login failed-attempt throttling/temporary lockout and token revoke endpoint in API.
- Session cookie logout path now attempts backend token revoke before clearing cookie (best effort).

---

## 2) Secrets handling hardening v2 (P0)
- **Owner:** Mac Mini
- **Status:** In Progress
- **Target date:** 2026-02-20
- **Touchpoints (files/endpoints):**
  - `apps/api/src/app.ts`
  - integration validation helpers
  - `apps/api/src/app.test.ts`
  - Endpoints: `/tenants/:tenantId/integrations` (POST/PUT/GET)
- **Scope:**
  - enforce secret reference-only patterns where required
  - ensure redaction on all integration responses
  - add tests for plaintext-secret rejection
- **Done criteria:**
  - raw secret payloads rejected consistently
  - sensitive fields never echoed in API responses
  - tests cover accept (ref) and reject (raw) paths
- **Verification command(s):**
  - `npm run test -w @cspm/api`
  - `npm run typecheck -w @cspm/api`

**2026-02-21 update**
- API integration endpoints already enforce raw-secret rejection and return redacted configs.
- Added API tests covering accept (reference) and reject (plaintext) paths plus redaction across create/list/update responses.

---

## 3) Pilot signoff gate execution (P0)
- **Owner:** TM
- **Status:** In Progress
- **Target date:** 2026-02-21
- **Touchpoints (files/endpoints):**
  - `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md`
  - create `docs/PILOT_SIGNOFF_2026-02-21.md`
  - live checks: `/health`, `/ready`, `/system/scanner-preflight`
- **Scope:**
  - run every item in pilot signoff checklist
  - record pass/fail + evidence + owner/date
- **Done criteria:**
  - all checklist rows marked with evidence
  - any failed row has remediation owner and ETA
- **Verification command(s):**
  - `npm run scanners:preflight`
  - `curl -sS http://127.0.0.1:4000/ready`

**2026-02-22 update**
- Started evidence capture in `docs/SECURITY_PILOT_SIGNOFF_EVIDENCE.md`.
- Local automated checks recorded:
  - `npm run test` PASS
  - `npm run typecheck` PASS
  - `npm run scanners:preflight` FAIL (Docker daemon unavailable on local host)
- Remaining checklist rows require deployment/runtime/manual evidence capture.

---

## 4) Queue/worker robustness (P1)
- **Owner:** Mac Mini
- **Status:** Not Started
- **Target date:** 2026-02-22
- **Touchpoints (files/endpoints):**
  - `apps/worker/src/index.ts`
  - `apps/api/src/app.ts`
  - `apps/web/src/app/scans/page.tsx`
  - Endpoints: `/tenants/:tenantId/scans`, `/tenants/:tenantId/scans/*`
- **Scope:**
  - explicit retry/backoff behavior
  - visibility for retry exhausted failures (DLQ-like state if applicable)
  - operator-facing stuck/failed scan visibility
- **Done criteria:**
  - no silent scan failures
  - exhausted retries clearly visible in UI/API
  - runbook has operational recovery steps
- **Verification command(s):**
  - `npm run test -w @cspm/worker`
  - `npm run typecheck -w @cspm/worker`

---

## 5) Tenant isolation verification (P1)
- **Owner:** Mac Mini
- **Status:** Not Started
- **Target date:** 2026-02-23
- **Touchpoints (files/endpoints):**
  - `apps/api/src/app.test.ts` (or split test files)
  - Endpoints: scans, artifacts, users, hierarchy, settings-sensitive routes
- **Scope:**
  - add negative tests for cross-tenant access attempts
  - verify forbidden/not-found behavior is consistent
- **Done criteria:**
  - cross-tenant access tests pass for all sensitive endpoints
  - no endpoint leaks tenant data across boundaries
- **Verification command(s):**
  - `npm run test -w @cspm/api`

---

## 6) Pilot observability minimum (P1)
- **Owner:** Mac Mini
- **Status:** Not Started
- **Target date:** 2026-02-24
- **Touchpoints (files/endpoints):**
  - `apps/api/src/app.ts`
  - `apps/worker/src/index.ts`
  - `scripts/healthcheck.mjs`
  - `docs/RUNBOOK.md`
- **Scope:**
  - correlation ID consistency across web/api/worker
  - baseline metrics and alert triggers (scan success rate, queue lag, error rate)
- **Done criteria:**
  - single scan can be traced across services using IDs
  - basic failure alerting is defined and tested
- **Verification command(s):**
  - `npm run health`
  - inspect logs for consistent request/scan IDs

---

## 7) Provider readiness truth labeling (P1)
- **Owner:** TM
- **Status:** Not Started
- **Target date:** 2026-02-24
- **Touchpoints (files/endpoints):**
  - `apps/web/src/app/integrations/page.tsx`
  - `apps/web/src/app/guides/*`
  - `docs/INTEGRATIONS.md`
- **Scope:**
  - label providers as validated vs catalog/experimental
  - ensure UI/docs match actual scanner validation state
- **Done criteria:**
  - provider support labels visible in onboarding and docs
  - no ambiguous “supported” claims
- **Verification command(s):**
  - `npm run build -w @cspm/web`
  - manual UI verification in `/integrations` and `/guides`

---

## 8) Formal pilot dry run (P1)
- **Owner:** TM + Mac Mini
- **Status:** Not Started
- **Target date:** 2026-02-25
- **Touchpoints (files/endpoints):**
  - `docs/MSP_ONBOARDING_PLAYBOOK.md`
  - create `docs/PILOT_DRY_RUN_2026-02-25.md`
- **Scope:**
  - full scenario:
    - super admin creates MSP
    - MSP creates sub-customer
    - switch scope
    - add/test integration
    - run scan
    - review findings/compliance/assets
- **Done criteria:**
  - dry-run report completed with screenshots/evidence
  - all blockers triaged with owner + ETA
- **Verification command(s):**
  - `npm run test && npm run typecheck && npm run build`
  - functional walkthrough in UI

---

## Pilot Release Gate Checklist (must all pass)

- [ ] All P0 items (1–3) marked **Done**
- [ ] No unresolved critical security findings
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Scanner preflight passes on target host (`npm run scanners:preflight`)
- [ ] API readiness healthy (`/ready`)
- [ ] Pilot signoff document completed with evidence
- [ ] Formal pilot dry-run completed with no P0 blockers
- [ ] Docs are aligned with implementation reality (especially DB posture)

---

## Notes / Risks
- Keep database posture messaging consistent (pilot SQLite vs future PostgreSQL).
- Ensure `test-results/` and other local artifacts remain uncommitted.
- Avoid broad launch until pilot gate above is fully green.
