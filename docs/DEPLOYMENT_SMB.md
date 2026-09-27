# Deployment Guide (SMB)

## Stack
- SQLite database file (`apps/api/prisma/dev.db`) on persistent disk
- API + Worker + Web on one VM or small K8s cluster
- Scanner runtime Docker mode (Prowler + Kubescape)

## Steps
1. Set `.env` with SQLite `DATABASE_URL` (or update Prisma provider before using PostgreSQL), strong `JWT_SECRET`, scanner image pins.
2. Run `npm install`.
3. Run DB setup:
   - `npm run prisma:generate -w @cspm/api`
   - `npm run db:migrate:deploy`
4. Pre-warm scanner runtime:
   - `npm run scanners:prewarm`
5. Preflight scanner runtime gate:
   - `npm run scanners:preflight`
6. Build: `npm run build`.
7. Start API, Worker, Web via process manager (systemd/pm2/container compose).
8. Validate readiness: `/ready` on API and worker, and run `/system/scanner-preflight` as an authenticated user.

## Ops baseline
- Daily SQLite file backup, 14-day retention.
- Rotate JWT and scanner creds quarterly.
- Monitor failed scans and alert endpoint delivery.
