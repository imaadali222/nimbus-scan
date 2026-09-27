# Deployment Guide (Enterprise)

## Recommended topology
- Dedicated persistent database volume for SQLite (current implementation)
- API/Worker/Web as separate autoscaled services
- Private scanner worker pool with egress controls
- Secret manager for cloud integration credential references
- If moving to managed PostgreSQL, migrate Prisma datasource/provider first.

## Security hardening baseline
- Enforce TLS everywhere and private networking between services.
- Use external IdP/SSO in front of JWT bootstrap auth.
- Restrict worker IAM/RBAC to read-only scanner permissions.
- Enable immutable log export from audit logs endpoint to SIEM.

## Release process
1. CI gates: lint, typecheck, test, build.
2. Apply schema updates in staging then production.
3. Roll API + worker + web with health probes.
4. Smoke test integration create -> scan queue -> finding ingest -> dashboard.

## DR baseline
- Multi-region backup copy for SQLite artifacts/volume snapshots.
- Restore drill monthly using latest backup snapshot.
