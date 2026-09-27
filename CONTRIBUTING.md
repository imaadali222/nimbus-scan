# Contributing

Thanks for contributing to this project.

This repository is a Prowler-powered CSPM platform layer (web app + API + worker), so contributions often touch multiple parts of the system. This guide is intended to make local setup and review expectations clear.

## Before You Start

- Read the project `README.md` for architecture and quick start
- Check `docs/TODO.md` and related docs in `docs/` for planned work and current priorities
- Search existing issues before opening a new one

## Development Setup

### Prerequisites

- Node.js `>=20.11`
- `npm`
- Docker / Colima (default scanner runtime path)

### Local setup

```bash
git clone https://github.com/macminitm/cloud-security-posture-management.git
cd cloud-security-posture-management
npm install
cp .env.example .env
```

Recommended for local UI testing of all providers:

```bash
echo "AWS_FIRST_MODE=false" >> .env
```

Prepare DB + scanner runtime:

```bash
npm run db:generate
npm run prisma:push -w @cspm/api
npm run scanners:preflight
```

Run the stack:

```bash
npm run dev:up
npm run health
```

## Project Layout (Short Version)

- `apps/web` - Next.js UI
- `apps/api` - Express API + Prisma
- `apps/worker` - queue/scan worker (Prowler/Kubescape runtime execution)
- `docs/` - implementation status, parity backlog, pilot hardening docs

## Contribution Types That Help Most

- Provider onboarding UX and validation improvements
- Scan profile UX and option catalog improvements
- Findings normalization/triage workflows
- Worker reliability and observability
- MSP multi-tenant operations and admin workflows
- Test coverage and regression fixes
- Docs and setup improvements

## Pull Request Guidelines

### Keep PRs scoped

Prefer focused PRs over broad mixed changes. Examples of good scope:

- one bug fix + tests
- one feature + docs + tests
- one docs/README improvement pass

### Include context

In your PR description include:

- problem being solved
- what changed
- any behavior changes / migration impact
- screenshots or short recordings for UI changes
- test/build commands you ran

### Add or update tests

If behavior changed, add or update tests where practical:

- API route behavior -> `apps/api/src/app.test.ts`
- worker logic -> `apps/worker/src/*.test.ts`
- UI behavior -> `apps/web` tests / e2e where appropriate

## Required Checks Before PR

Run these locally before opening a PR:

```bash
npm run test
npm run typecheck
npm run build
```

If you changed scanner/runtime behavior or dev-stack startup:

```bash
npm run scanners:preflight
npm run health
```

## Database / Prisma Changes

If you change `apps/api/prisma/schema.prisma`:

1. Add a migration under `apps/api/prisma/migrations/`
2. Regenerate Prisma client:

```bash
npm run db:generate
```

3. Verify locally:

```bash
cd apps/api && npx prisma migrate status --schema prisma/schema.prisma
```

## Security Expectations

Do not commit:

- real cloud credentials
- API keys/tokens
- customer data
- screenshots containing secrets

This repo intentionally supports secret paste in the UI for integrations, but values are expected to be test/demo-only in local development.

If you find a security issue, open an issue with minimal reproduction details and avoid posting sensitive exploit material or secrets.

## Attribution / Licensing

By contributing, you agree your contribution is licensed under the repository license (`Apache-2.0`), unless explicitly stated otherwise.

This project integrates with Prowler and other upstream OSS tools. Contributions should preserve clear attribution where relevant.
