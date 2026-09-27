# MSP Pilot Readiness Reconciliation (Docs + Code)

Last reviewed: 2026-02-21
Reviewer: Codex (workspace reconciliation + implementation pass)

## Purpose

This document reconciles overlapping planning/checklist docs into one MSP pilot readiness view and identifies where markdown status has drifted from the current codebase.

## Sources Reviewed

- `docs/TODO.md` (master TODO / release gate)
- `docs/SPRINT_PILOT_HARDENING.md` (current sprint execution plan)
- `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md` (pilot signoff evidence checklist)
- `docs/PROWLER_PARITY_BACKLOG.md` (Prowler parity and MSP suitability gaps)
- `docs/MSP_ONBOARDING_PLAYBOOK.md` (operator flow)
- `README.md` (implemented features and API surface)
- `apps/api/src/app.ts` and `apps/api/src/app.test.ts` (actual implementation/tests)

## Executive Summary (2026-02-21)

- MSP support foundation is real and usable for controlled pilot flows (hierarchy, parent-child visibility, global integration inventory/update).
- This is not a full Prowler replacement yet (parity remains partial/low in multiple areas, including findings depth and enterprise reliability).
- Pilot release status is `No-Go` today because P0 pilot items are not all complete and signoff evidence is not recorded yet.
- Two P0 items (`Auth hardening`, `Secrets handling v2`) were previously marked `Not Started` but have active implementation progress in code. Statuses are now updated to `In Progress`.

## Merged MSP Pilot Readiness Status

### P0 (Must complete before pilot)

| Item | Doc Status (before recon) | Observed State | Net Status |
|---|---|---|---|
| Auth hardening | Not Started | Password policy hardening, login throttling/lockout, and token revoke path implemented; still needs full validation/evidence and UI messaging review | In Progress |
| Secrets handling v2 | Not Started | API has raw-secret rejection + config redaction in integration endpoints; tests were missing, now added | In Progress |
| Pilot signoff execution | Not Started | Checklist exists, but no pass/fail evidence captured in repo | Not Started |

### P1 (Should complete before pilot)

| Item | Doc Status | Observed State | Net Status |
|---|---|---|---|
| Queue/worker robustness | Not Started | Retry taxonomy/bounded retries exist, but docs still note no DLQ / limited enterprise reliability | In Progress (partial implementation) |
| Tenant isolation verification | Not Started | MSP access flows are tested, but broad negative coverage for sensitive endpoints is not evident | Not Started |
| Pilot observability minimum | Not Started | Request ID propagation exists in API middleware, but baseline metrics/alerts evidence not captured | In Progress (partial implementation) |
| Provider readiness truth labeling | Not Started | Provider breadth exists; docs note readiness nuance, but UI labeling work still pending | Not Started |
| Formal pilot dry run | Not Started | Playbook exists, no evidence of completed dry run | Not Started |

## Confirmed Doc Drift / Conflicts

1. `Secrets handling v2` status drift
- `docs/TODO.md` and `docs/SPRINT_PILOT_HARDENING.md` previously said `Not Started`.
- `apps/api/src/app.ts` already contains `hasRawSecrets()` and `redactConfig()` plus enforcement/redaction in integration create/update/list endpoints.
- Reconciliation action: mark item `In Progress` and add evidence note in sprint doc.

2. Baseline auth security vs pilot auth hardening wording
- Parity scorecards say auth/session security is `Good` (baseline controls like HttpOnly cookie proxy + RBAC).
- Sprint P0 auth hardening was `Not Started`; now partially implemented and moved to `In Progress`.
- This is not a true contradiction: baseline auth exists, but pilot-grade controls (rate limiting/lockout/session lifecycle hardening) are a stricter requirement.

3. Reliability status wording across docs
- TODO/Parity docs rate enterprise reliability as low due to queue architecture limits.
- Implementation tracker/TODO also list meaningful retry and worker metadata improvements as completed.
- Net interpretation: reliability has improved materially, but is still below MSP production-grade requirements.

## Code Evidence (Relevant to MSP Pilot Readiness)

### MSP capabilities present

- Cross-tenant integration inventory and update endpoints are documented in `README.md`.
- API tests validate MSP parent can create sub-customer, inventory child integrations, and patch child integration state.

### Secrets handling v2 (partially documented, largely implemented)

- Raw secret detection helper: `hasRawSecrets()` in `apps/api/src/app.ts`
- Redaction helper: `redactConfig()` in `apps/api/src/app.ts`
- Enforcement/redaction applied in:
  - `POST /tenants/:tenantId/integrations`
  - `PUT /tenants/:tenantId/integrations/:integrationId`
  - `GET /tenants/:tenantId/integrations`
  - `GET /integrations`
  - `PATCH /integrations/:integrationId`
- Added API tests covering:
  - reject plaintext secret payloads
  - accept reference-based secret payloads
  - redact sensitive fields in create/list/update responses

### Auth hardening (now partially implemented)

- Stronger password policy checks added on:
  - `POST /auth/register`
  - `POST /auth/reset-password`
  - `POST /auth/change-password`
  - `POST /tenants/:tenantId/users` (when creating a new user with explicit password)
- Login throttling/temporary lockout added to `POST /auth/login`
- Token revoke endpoint added: `POST /auth/revoke`
- Auth middleware rejects revoked bearer tokens
- Web session delete route now attempts backend revoke before clearing the cookie (best effort)

## Pilot Go/No-Go (Merged)

Current status: `No-Go` (as of 2026-02-21)

Blocking reasons:

1. P0 auth hardening not complete.
2. Pilot signoff checklist execution/evidence not complete.
3. Release gate evidence is incomplete (even if build/test subsets pass locally).

## What Was Verified During This Reconciliation

- `npm run build` passes (monorepo)
- `npm run test -w @cspm/api` passes
- Added secrets-handling API tests and auth-hardening API tests
- Reconciled docs status for P0 items #1 and #2 to `In Progress`

## Priority Action List (Next Build Work)

1. Finish P0 auth hardening in `apps/api/src/app.ts` and related web settings/login pages:
   - password policy enforcement (register/reset/change)
   - login rate limiting and lockout behavior
   - session revoke/invalidation path
2. Complete `Secrets handling v2` exit criteria:
   - run `npm run typecheck -w @cspm/api`
   - run full `npm run test`
   - perform quick manual verification for all integration response shapes in UI/API
3. Execute `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md` and record pass/fail evidence in-repo.
4. Run formal MSP dry run using `docs/MSP_ONBOARDING_PLAYBOOK.md` and capture screenshots/evidence.
5. Add tenant-isolation negative tests for sensitive endpoints before pilot onboarding.
