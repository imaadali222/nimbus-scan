# Local Runbook

## Prereqs

- Node.js 20+
- npm 10+
- Docker (default scanner runtime) OR local `prowler` and `kubescape` binaries

## Bootstrap

```bash
npm install
cp .env.example .env
npm run prisma:generate -w @cspm/api
npm run prisma:push -w @cspm/api
```

## Run

```bash
npm run scanners:prewarm
npm run scanners:preflight
npm run dev
npm run health
```

Notes:
- `npm run dev` now runs scanner preflight automatically before starting services.
- If needed (debug only), bypass with `SKIP_SCANNER_PREFLIGHT=1 npm run dev`.

Scanner runtime defaults:
- `SCANNER_RUNTIME=docker`
- `PROWLER_IMAGE=ghcr.io/prowler-cloud/prowler:4.6.0`
- `KUBESCAPE_IMAGE=quay.io/kubescape/kubescape:v3.0.26`

## Stop

```bash
npm run dev:down
```

## Validate end-to-end via API only

For cloud-side setup prerequisites and onboarding guidance, see:
- `docs/INTEGRATIONS.md`

```bash
# register owner + tenant
curl -s http://localhost:4000/auth/register -H 'content-type: application/json' -d '{
  "email":"owner@example.com",
  "password":"password123",
  "tenantName":"Acme",
  "tenantSlug":"acme"
}'

# use token+tenantId from response

# create integration
curl -s http://localhost:4000/tenants/$TENANT_ID/integrations -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "name":"AWS Prod",
  "provider":"AWS",
  "config":{"accountId":"123456789012","roleArn":"arn:aws:iam::123456789012:role/CSPM"}
}'

# queue scan
curl -s http://localhost:4000/tenants/$TENANT_ID/scans -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"integrationId":"$INTEGRATION_ID","framework":"CIS"}'

# poll findings
curl -s http://localhost:4000/tenants/$TENANT_ID/findings -H "authorization: Bearer $TOKEN"

# download raw scan artifact
curl -s http://localhost:4000/tenants/$TENANT_ID/scans/$SCAN_ID/artifact -H "authorization: Bearer $TOKEN" -o scan-artifact.json
```

## Tests + build

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Backup / Restore baseline

Backup example:
```bash
pg_dump "$DATABASE_URL" > cspm-backup.sql
```

Restore example:
```bash
psql "$DATABASE_URL" < cspm-backup.sql
```

## Scheduling + alert hooks
- Schedule policies API: `POST/GET /tenants/:tenantId/schedules`
- Alert endpoint registry API: `POST/GET /tenants/:tenantId/alert-endpoints`
- Audit trail API: `GET /tenants/:tenantId/audit-logs`

## Production caveats checklist

- [ ] Replace local JWT auth with enterprise IdP
- [ ] Secret manager integration for provider credentials
- [ ] Worker retries/backoff/DLQ queue semantics
- [x] Multi-tenant access hardening & audit logs baseline
- [ ] Scanner sandboxing and resource limits
