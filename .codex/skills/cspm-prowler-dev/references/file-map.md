# File Map (Prowler-Backed CSPM)

Use this reference when navigating repo behavior for integrations, scans, and local runtime debugging.

## UI

- `apps/web/src/app/integrations/page.tsx`
  Integration form, AWS test button, scan profile UI, provider selection.
- `apps/web/src/app/_lib/cspm.ts`
  Client state, proxy calls, integration create/save, queue scan, AWS test connection.
- `apps/web/src/app/api/session/route.ts`
  Session cookie handling and logout/revoke flow.
- `apps/web/src/app/api/proxy/[...path]/route.ts`
  Proxies UI requests to API using bearer token from HttpOnly cookie.
- `apps/web/src/app/globals.css`
  Integration form styles, warning banner, secret UI styles.

## API

- `apps/api/src/app.ts`
  Main routes and core logic:
  - `/tenants/:tenantId/integrations/test-aws` (STS assume-role connection test)
  - `/tenants/:tenantId/integrations` and `/integrations/:integrationId` (save/update)
  - `/system/scanner-preflight`
  - `/providers/catalog`
  - auth routes and middleware
- `apps/api/src/env.ts`
  Runtime env defaults (`AWS_FIRST_MODE`, scanner binaries/images, encryption key config).
- `apps/api/src/app.test.ts`
  Regression tests for auth hardening, secrets handling, and integration behavior.

## Worker

- `apps/worker/src/index.ts`
  Claims queued scans, decrypts integration config, selects adapter, runs Prowler/Kubescape.
- `apps/worker/src/env.ts`
  Worker runtime env (`SCANNER_RUNTIME`, scanner images/binaries, encryption key).

## Docs / Pilot Readiness

- `docs/TODO.md`
- `docs/SPRINT_PILOT_HARDENING.md`
- `docs/SECURITY_PILOT_SIGNOFF_EVIDENCE.md`
- `docs/MSP_PILOT_READINESS_RECONCILIATION.md`

## Local Runtime Logs

- `.runtime/logs/web.log`
- `.runtime/logs/api.log`
- `.runtime/logs/worker.log`

## Common Debugging Split

- AWS connection test problem -> inspect API route + AWS SDK/STS behavior.
- Queued scan problem -> inspect worker logs + scanner runtime (Docker/local) + Prowler args.
