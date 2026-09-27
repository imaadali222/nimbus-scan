# Database Migration Discipline

Use this process for every schema change.

## Dev flow
1. Update `apps/api/prisma/schema.prisma`.
2. Create migration:
```bash
npm run db:migrate:dev -- --name <change_name>
```
3. Regenerate Prisma client if needed:
```bash
npm run db:generate
```
4. Run tests and typechecks.

## Deploy flow
1. Ship committed migration files.
2. Apply migrations in deployment:
```bash
npm run db:migrate:deploy
```
3. Start services after migration success.

## Rules
- Do not edit old migration SQL after it has been applied to shared/prod environments.
- Every schema change must have a migration in git.
- Deploy pipeline should fail if migrations fail.
