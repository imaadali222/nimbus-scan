# Local Deployment Guide (Mac mini)

## Goal
Run the full CSPM stack locally with real scanner readiness checks before onboarding tenants.

## Prerequisites
- Node.js 20+
- npm 10+
- Docker Desktop (recommended runtime)
- Project checked out at:
  - `/Users/macmini/coding/cloud-security-posture-management`

## 1) Bootstrap
```bash
cd /Users/macmini/coding/cloud-security-posture-management
npm install
npm run db:generate
npm run db:migrate:deploy
```

## 2) Prepare scanner runtime
```bash
npm run scanners:prewarm
npm run scanners:preflight
```

Optional: if you want provider framework/profile metadata to come from a runtime file instead of API defaults, set:
- `PROVIDER_CAPABILITIES_FILE=./.runtime/provider-capabilities.json`

If preflight fails due to missing Docker, install/start Docker Desktop first.

## 3) Start stack
```bash
npm run dev
```

If port conflicts exist, stop stale processes or run:
```bash
npm run dev:doctor
npm run dev:down
npm run dev:up
```

To live-monitor API/Web/Worker logs while clicking through UI:
```bash
npm run dev:logs
```

## 4) Verify health
- Web: `http://localhost:3000`
- API: `http://localhost:4000/health`
- Worker: `http://localhost:<WORKER_PORT>/health` (default `4010`)

## 5) First super admin account
- Open `http://localhost:3000`
- Create first account from signup form
- First registered user becomes `Super Admin` automatically

## 6) Recommended first actions
1. Go to **Settings** and run scanner preflight.
2. Create MSP account (super admin section).
3. Switch scope to MSP tenant.
4. Create sub-customer tenant.
5. Switch scope to sub-customer and add AWS integration.

## Troubleshooting
### Docker missing
Preflight error like `docker: command not found`:
- install Docker Desktop
- restart terminal session
- rerun prewarm/preflight

### API port already in use
If `port 4000 is in use`:
- run `npm run dev:doctor` to list owning PIDs
- stop conflicting process(es), then `npm run dev:up`

### Reset local DB (destructive)
```bash
cd apps/api
npx prisma migrate reset --force --skip-seed
cd ../..
npm run dev
```
