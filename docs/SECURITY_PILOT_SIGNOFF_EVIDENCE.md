# Security Pilot Signoff Evidence

Evidence date: 2026-02-22
Checklist source: `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md`
Environment: local workstation (`/Users/macmini/coding/cloud-security-posture-management`)

## Summary

- Status: `In Progress`
- Automated checks completed in local dev workspace are recorded below.
- Deployment, host hardening, TLS, and pilot dry-run evidence remain pending and require the target pilot environment.

## Automated Verification Runs (2026-02-22)

### 1) Test Suite
- Command: `npm run test`
- Result: `PASS`
- Evidence:
  - API tests passed (7/7)
  - Web tests passed (1/1)
  - Worker tests passed (12/12)
  - Shared tests passed (1/1)

### 2) Typecheck
- Command: `npm run typecheck`
- Result: `PASS`
- Evidence:
  - `@cspm/api`, `@cspm/web`, `@cspm/worker`, `@cspm/shared` typechecks passed

### 3) Build
- Command: `npm run build`
- Result: `PASS`
- Evidence:
  - API/worker/shared TypeScript builds passed
  - Next.js web production build passed

### 4) Scanner Preflight
- Command: `npm run scanners:preflight`
- Result: `PASS` (after starting Colima/Docker)
- Evidence (summary):
  - `docker.version` PASS
  - `docker.daemon` PASS
  - `image.prowler` PASS
  - `image.kubescape` PASS
- Note:
  - Initial local run failed because Docker daemon socket was unavailable.
  - Rerun passed after `colima start`.

### 5) Local Stack Health Checks
- Commands:
  - `npm run dev:up`
  - `npm run health`
  - `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login`
- Result: `PASS` (local dev stack)
- Evidence (summary):
  - dev stack running (`api`, `worker`, `web`)
  - `/health` checks PASS for `web`, `api`, `api-ready`, `worker`, `worker-ready`
  - `/login` returned `200`

## Checklist Mapping (Pass/Fail/Pending)

### A) Network and transport security
- Status: `Pending (manual)`
- Reason: requires deployed pilot environment / reverse proxy / TLS validation

### B) Host and runtime security
- Status: `Pending (manual)`
- Reason: requires host OS, firewall, systemd, Docker user permissions evidence

### C) App security controls
- Status: `In Progress`
- Evidence available:
  - Auth/session hardening in progress (password policy, login throttling, revoke path)
  - Tenant/RBAC behavior covered by tests
- Pending:
  - Production `.env` verification
  - AWS-first/scanner policy confirmation on target host
  - Scope-switch UX verification in deployed pilot

### D) Secrets and credential handling
- Status: `In Progress`
- Evidence available:
  - Integration APIs reject raw secret payloads
  - Integration responses redact sensitive fields
  - API tests cover accept/reject/redaction flows
- Pending:
  - Manual validation across all UI/API integration paths in pilot runtime
  - `.env` permission checks on pilot host

### E) Scanner integrity and readiness
- Status: `In Progress`
- Evidence available:
  - Preflight passes locally after Docker/Colima startup
- Pending:
  - `npm run scanners:prewarm` pass
  - UI scanner preflight PASS validation
  - AWS test-connection verification on pilot host

### F) Database and data-at-rest protections
- Status: `Pending (manual)`
- Reason: requires host filesystem permissions, disk encryption, backup config, restore test evidence

### G) Auth lifecycle checks
- Status: `In Progress`
- Evidence available:
  - Password reset token expiry/non-reuse logic exists
  - Password policy enforcement, login lockout, and token revoke path implemented with tests
- Pending:
  - Manual validation of forgot/reset/change-password flows via UI/proxy in pilot runtime
  - Tenant user-role flow verification evidence

### H) Logging, monitoring, and incident basics
- Status: `Pending (manual)`
- Reason: requires running services and operational procedures/evidence

### I) Pilot-go decision
- Status: `Pending`
- Blocking conditions:
  - Deployment/host/manual checklist sections not evidenced
  - Formal MSP dry-run evidence not captured

## Notes

- This document records local evidence only and is not sufficient for pilot go-live approval by itself.
- Use alongside:
  - `docs/SECURITY_PILOT_SIGNOFF_CHECKLIST.md`
  - `docs/MSP_ONBOARDING_PLAYBOOK.md`
  - `docs/MSP_PILOT_READINESS_RECONCILIATION.md`
