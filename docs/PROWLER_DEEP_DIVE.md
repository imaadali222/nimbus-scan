# Prowler Deep Dive (Full Upstream Reference for MSP SaaS)

Last upstream snapshot reviewed:
- Repository: `https://github.com/prowler-cloud/prowler`
- Branch: `master`
- Commit: `04b43b20ae0ec2a706e48166e69de75d477b7533`
- Commit date: `2026-02-17 13:30:27 +0100`
- Local analysis clone path: `/tmp/prowler-upstream-1771339266`
- Review date: `2026-02-17`

## Scope and method
This document is a source-based reference for architecture and capability mapping (CLI, SDK, API, UI, integrations, and multi-tenant behavior).

Method used:
1. Full repository machine pass over all files to build metrics and indexes.
2. Deep manual code read for core runtime files in CLI, SDK, API, UI, dashboard, and MCP server.
3. Cross-surface parity analysis for provider and integration support.

Full-source machine pass results:
- Total files processed: `8862`
- Text files processed: `8015`
- Binary files processed: `847`
- Total text lines processed: `1369521`

## Repository size and composition

Top-level area scale:

| Area | Files | Approx LOC |
|---|---:|---:|
| `prowler/` | 4622 | 669888 |
| `api/` | 260 | 124213 |
| `ui/` | 906 | 141917 |
| `dashboard/` | 119 | 12967 |
| `tests/` | 1590 | 338511 |
| `docs/` | 962 | 619611 |
| `mcp_server/` | 40 | 7316 |

Top source file types:
- `.py`: 5286 files
- `.json`: 1330 files
- `.tsx`: 510 files
- `.ts`: 334 files
- `.mdx`: 140 files

## End-to-end architecture (how components fit together)

```text
User Browser
  -> UI (Next.js app)
      -> API (Django REST Framework, JSON:API)
          -> Postgres (tenant-scoped data + RLS)
          -> Celery + Valkey queues (async scan jobs)
              -> Prowler SDK/scan engine (Python modules under prowler/)
                  -> Cloud provider APIs (AWS/Azure/GCP/etc.)
          -> Neo4j (Attack Paths graph pipeline)
  -> UI renders findings/compliance/dashboards from API data
```

In upstream `docker-compose.yml`, production services are:
- `ui`
- `api`
- `worker`
- `worker-beat`
- `postgres`
- `valkey`
- `neo4j`
- `mcp-server`

## CLI and SDK deep dive

### CLI entry and orchestration
- `prowler-cli.py` dispatches to `prowler.__main__.prowler()`.
- `prowler/__main__.py` handles argument parsing, provider initialization, check loading, execution, output generation, compliance exports, and integration dispatch.
- Parser class: `prowler/lib/cli/parser.py` (`ProwlerArgumentParser`).

### Provider commands and defaults
- If no provider is passed, CLI defaults to `aws`.
- CLI usage supports providers/components including:
  - `aws`, `azure`, `gcp`, `kubernetes`, `m365`, `github`, `nhn`, `mongodbatlas`, `oraclecloud`, `alibabacloud`, `cloudflare`, `openstack`, `iac`, `image`
  - `dashboard` component
  - `llm` appears in parser epilog/provider block (beta path)

### Output and scan model
- Output formats from `prowler/config/config.py`: `csv`, `json-asff`, `json-ocsf`, `html`
- External tool providers bypass standard check/service loading:
  - `iac`, `llm`, `image` (`EXTERNAL_TOOL_PROVIDERS`)
- Core execution class: `prowler/lib/scan/scan.py`
- Check selection/filtering logic: `prowler/lib/check/checks_loader.py`

### What "SDK" means in this repo
Prowler does not keep a separate external SDK codebase; the SDK surface is the same Python package (`prowler/*`) used by both CLI and API.

Evidence:
- API depends directly on upstream SDK in `api/pyproject.toml`:
  - `prowler @ git+https://github.com/prowler-cloud/prowler.git@master`
- SDK usage example notebook: `examples/sdk/aws_scan.ipynb`
  - imports providers, `Scan`, metadata listing, output writers, and integrations (S3/Security Hub).

## Provider support breadth (source-derived)

The table below is generated from source files (`services/*/*.metadata.json` + compliance JSON files).  
Counts can differ from README because README is updated periodically.

| Provider | Checks | Services | Compliance Frameworks | Category Count |
|---|---:|---:|---:|---:|
| aws | 580 | 84 | 41 | 49 |
| azure | 166 | 22 | 18 | 15 |
| gcp | 100 | 17 | 15 | 11 |
| kubernetes | 83 | 7 | 7 | 9 |
| m365 | 75 | 7 | 4 | 4 |
| oraclecloud | 51 | 14 | 3 | 9 |
| alibabacloud | 63 | 9 | 3 | 12 |
| cloudflare | 29 | 3 | 0 | 5 |
| github | 21 | 2 | 1 | 2 |
| mongodbatlas | 10 | 3 | 0 | 3 |
| openstack | 8 | 1 | 0 | 6 |
| nhn | 6 | 2 | 1 | 0 |
| iac | 0 | 0 | 0 | 0 |
| image | 0 | 0 | 0 | 0 |
| llm | 0 | 0 | 0 | 0 |

## API deep dive (Django + DRF + Celery)

### Stack and responsibilities
- API component: Django 5.1 + DRF + JSON:API (`api/pyproject.toml`)
- Async worker: Celery with Valkey/Redis protocol (`config/settings/celery.py`)
- Data store: PostgreSQL
- Attack paths graph pipeline: Neo4j

### Route surface
Root routing:
- `api/src/backend/config/urls.py` -> mounts `api/v1/`

V1 routing (`api/src/backend/api/v1/urls.py`):
- Primary viewsets registered: 21
- Nested routes: memberships and integration Jira mapping
- Custom/auth/docs paths: 23 (`tokens`, SAML flows, social token endpoints, schema/docs, relationships, etc.)

Key domain resources exposed:
- users, tenants, memberships, roles
- providers, provider secrets, provider groups
- scans, tasks, findings, resources
- compliance overviews, overviews, schedules
- integrations
- lighthouse configs/models/provider configs
- API keys, mute rules

### Multi-tenant isolation (MSP-critical)
Tenant isolation is explicit and first-class:
- Database context variable: `api.tenant_id` (`api/db_utils.py`)
- `rls_transaction(...)` sets tenant context per query/transaction.
- Models use `RowLevelSecurityConstraint` broadly across entities.
- Celery task base (`RLSTask` in `config/celery.py`) persists tasks with tenant-aware context.

This is a strong foundation for MSP-style tenant separation.

### Scan execution in API
Core flow:
1. API creates scan/task records.
2. Celery task `perform_scan_task` (`tasks/tasks.py`) dispatches scan.
3. Job logic (`tasks/jobs/scan.py`) runs Prowler scan, stores findings/resources/summaries/compliance rollups.
4. Follow-up chains trigger integrations, reports, and attack paths ingestion.

Queues used include:
- `scans`, `overview`, `compliance`, `integrations`, `scan-reports`, `attack-paths-scans`, `deletion`, `backfill`

### Provider and secret model at API level
API provider enum supports:
- `aws`, `azure`, `gcp`, `kubernetes`, `m365`, `github`, `mongodbatlas`, `iac`, `oraclecloud`, `alibabacloud`, `cloudflare`, `openstack`

Provider secret types:
- `static`
- `role` (AWS and Alibaba Cloud)
- `service_account` (GCP)

## Integration support (API vs UI)

API enum values (`IntegrationChoices`):
- `amazon_s3`
- `aws_security_hub`
- `jira`
- `slack`

Serializer-validated integration paths currently implemented:
- `amazon_s3`
- `aws_security_hub`
- `jira`
- `slack` is present in enum but not fully implemented in validation/flow.

UI integration type union (`ui/types/integrations.ts`):
- `amazon_s3`
- `aws_security_hub`
- `jira`

## UI deep dive (Next.js app)

### Stack
From `ui/package.json`:
- Next.js: `16.1.6`
- React: `19.2.4`
- NextAuth: `5.0.0-beta.30`
- Tailwind CSS: `4.1.18`
- Playwright test suite included

### Route and auth model
- `ui/app` contains 37 page routes.
- Public routes are only `sign-in` and `sign-up` via auth proxy logic in `ui/proxy.ts`.
- Non-public routes are redirected to sign-in if not authenticated.
- Additional permission checks exist for sensitive routes (for example billing/integrations handling).

### Functional route coverage (examples)
- Core: `/`, `/providers`, `/scans`, `/findings`, `/compliance`, `/resources`
- Ops: `/integrations`, `/roles`, `/users`, `/invitations`, `/mutelist`
- Advanced: `/attack-paths`, `/lighthouse/*`

### UI provider parity
UI provider list in `ui/types/providers.ts` includes:
- aws, azure, gcp, kubernetes, m365, mongodbatlas, github, iac, oraclecloud, alibabacloud

UI provider union now includes cloudflare and openstack in this repo baseline.

## Interface parity matrix (CLI vs API vs UI)

| Provider | CLI | API | UI |
|---|---|---|---|
| aws | yes | yes | yes |
| azure | yes | yes | yes |
| gcp | yes | yes | yes |
| kubernetes | yes | yes | yes |
| m365 | yes | yes | yes |
| github | yes | yes | yes |
| mongodbatlas | yes | yes | yes |
| iac | yes | yes | yes |
| oraclecloud | yes | yes | yes |
| alibabacloud | yes | yes | yes |
| cloudflare | yes | yes | yes |
| openstack | yes | yes | yes |
| nhn | yes | no | no |
| image | yes | no | no |
| llm | CLI beta path | no (provider enum) | lighthouse features only, not as standard cloud provider type |

## Dashboard component (separate from Next.js UI)

There is also a legacy/local dashboard component:
- Command: `prowler dashboard`
- Code path: `dashboard/*` (Dash app)
- Data source model: local CSV output ingestion

This is separate from the modern Next.js UI stack and useful mainly for local/report-driven workflows.

## Test surface

Observed test footprint:
- Core Python tests under `tests/`: 1559 files
- API/backend tests:
  - `api/src/backend/api/tests`: 23 files
  - `api/src/backend/tasks/tests`: 18 files
- UI Playwright specs: 8 files (`ui/tests/**/*.spec.ts`)

## MSP-focused conclusions for our platform

What is already strong for MSP use:
1. Multi-tenant data isolation model is real (RLS + tenant-context transactions).
2. Provider model is broad and already beyond AWS-only.
3. Worker-based scan orchestration with post-scan aggregation and reporting is production-pattern aligned.
4. UI/API already expose security workflow primitives (providers, scans, findings, compliance, muting, roles, invites).

What still needs parity work if we want strict 1:1 operator experience:
1. Providers currently CLI-only (NHN/Image/LLM provider mode) are not first-class in API/UI provider model.
2. Attack Paths currently AWS-first by design.
3. Dashboard workflows still need parity depth for muting/watchlists/trend drilldowns.
4. README/provider stats and source stats can drift; product UX should rely on source/runtime metadata or Prowler Hub APIs instead of static copy.

## High-signal files reviewed

Architecture and runtime:
- `README.md`
- `docker-compose.yml`
- `pyproject.toml`
- `prowler-cli.py`
- `prowler/__main__.py`
- `prowler/config/config.py`
- `prowler/lib/cli/parser.py`
- `prowler/lib/scan/scan.py`
- `prowler/lib/check/checks_loader.py`
- `examples/sdk/aws_scan.ipynb`

API and worker:
- `api/README.md`
- `api/pyproject.toml`
- `api/src/backend/config/urls.py`
- `api/src/backend/api/v1/urls.py`
- `api/src/backend/api/models.py`
- `api/src/backend/api/utils.py`
- `api/src/backend/api/db_utils.py`
- `api/src/backend/tasks/tasks.py`
- `api/src/backend/tasks/jobs/scan.py`
- `api/src/backend/tasks/jobs/integrations.py`
- `api/src/backend/config/celery.py`

UI and auth/routing:
- `ui/README.md`
- `ui/package.json`
- `ui/app/**/*`
- `ui/proxy.ts`
- `ui/auth.config.ts`
- `ui/types/providers.ts`
- `ui/types/integrations.ts`

Other surfaces:
- `dashboard/__main__.py`
- `dashboard/pages/*`
- `mcp_server/README.md`
- `mcp_server/prowler_mcp_server/server.py`
