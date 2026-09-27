# Security Pilot Signoff Checklist

Use this checklist before onboarding pilot MSP/MSSP customers.

## A) Network and transport security
- [ ] Domain is served over HTTPS only (TLS cert valid, auto-renew enabled).
- [ ] HTTP redirects to HTTPS.
- [ ] Reverse proxy only exposes required public ports (80/443).
- [ ] App internal ports (3000/4000/4010/4011) are not publicly exposed.
- [ ] SSH is restricted to admin IP allowlist.

## B) Host and runtime security
- [ ] OS is updated (`apt upgrade` / patch baseline current).
- [ ] Firewall policy is configured (deny by default, allow only needed ports).
- [ ] Docker daemon available only to trusted users.
- [ ] Services run under non-root app user.
- [ ] systemd restart policies enabled for API/Worker/Web.

## C) App security controls
- [ ] `NODE_ENV=production` set in `.env`.
- [ ] Strong `JWT_SECRET` configured (>=32 chars random).
- [ ] AWS-first mode and scanner policy match desired production posture.
- [ ] Tenant scope switching works and is visibly confirmed in scope banner.
- [ ] Role-gated actions verified (viewer cannot mutate integrations/users).

## D) Secrets and credential handling
- [ ] Raw secrets are blocked in integration API inputs.
- [ ] Integration responses redact sensitive fields.
- [ ] Provider credentials use references wherever possible (not plaintext values).
- [ ] `.env` is file-permission hardened and excluded from git.

## E) Scanner integrity and readiness
- [ ] `npm run scanners:prewarm` succeeds on host.
- [ ] `npm run scanners:preflight` succeeds on host.
- [ ] Settings -> scanner preflight UI shows PASS checks.
- [ ] AWS test-connection before save is enforced and verified.

## F) Database and data-at-rest protections
- [ ] DB file path access restricted to app user/group only.
- [ ] Underlying disk/volume encryption enabled (EBS encryption or equivalent).
- [ ] Daily backups configured.
- [ ] Backup restore test has been performed at least once.
- [ ] Migration process follows `docs/DB_MIGRATIONS.md`.

## G) Auth lifecycle checks
- [ ] First user bootstrap behavior verified (super admin expected).
- [ ] Forgot/reset password endpoints validated.
- [ ] Password reset tokens expire and cannot be reused.
- [ ] Account/user-role assignment flows verified per tenant.

## H) Logging, monitoring, and incident basics
- [ ] Service logs available (`journalctl`) for API/Worker/Web.
- [ ] Health checks monitored for API/Worker.
- [ ] Failed scan alerts/procedures documented.
- [ ] Incident response owner/contact identified for pilot period.

## I) Pilot-go decision
- [ ] At least one full MSP flow validated end-to-end:
  - super admin creates MSP
  - MSP creates sub-customer
  - switch scope
  - add/test integration
  - run scan
  - view findings/compliance/assets
- [ ] Security checklist reviewed and approved by owner.

---

## Recommended pilot launch policy
- Pilot only (limited users/tenants)
- No broad marketing until operational and security baselines are stable
- Weekly review of scan failures, auth issues, and access-control events
