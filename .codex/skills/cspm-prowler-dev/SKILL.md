---
name: cspm-prowler-dev
description: Prowler-backed CSPM monorepo development workflow for this repository. Use when working on scanner runtime behavior (API test vs worker scan), integrations/secrets handling, provider catalog/profile UI controls, or local dev-stack runtime issues (Next.js .next cache corruption, scanner preflight, health checks) in `cloud-security-posture-management`.
---

# CSPM Prowler Dev

Use this skill to make repo-specific changes safely and quickly when the task touches the Prowler/Kubescape execution path, integration configuration, or the local dev stack.

Prefer this workflow over generic debugging because this repo has important behavior differences:
- `Test AWS connection` uses AWS STS from the API (no Prowler invocation).
- `Queue scan` uses the worker and invokes Prowler/Kubescape.
- Integration secret values may be pasted in the UI and are encrypted at rest before DB storage.
- Next.js dev mode can fail with stale `.next` runtime chunks and show misleading UI 500s.

## Quick Start

Run these first when UI/runtime behavior is unclear:

```bash
npm run dev:status
npm run health
.codex/skills/cspm-prowler-dev/scripts/diagnose-stack.sh
```

If the web UI shows runtime 500s with `Cannot find module './NNN.js'` in `.runtime/logs/web.log`, clear the web cache and restart:

```bash
npm run clean:web
npm run dev:down
npm run dev:up
```

## Workflow: AWS Test vs Real Scan

Use this decision split before changing code:

1. If the user clicks `Test AWS connection`, debug API STS assume-role behavior.
2. If the user clicks `Queue scan`, debug worker/scanner runtime (Prowler/Kubescape).

Key repo behavior:
- UI test button calls `POST /tenants/:tenantId/integrations/test-aws` (API) and returns a short-lived verification token.
- API save/update of AWS integrations requires that verification token.
- Worker scan path decrypts integration config, then invokes scanner runtime (`docker` by default).

Do not claim Prowler runs during AWS connection test. It does not.

## Workflow: Integration Secrets

When working on integration setup forms or API validation:

1. Confirm transport expectations:
- Local dev (`http://127.0.0.1:3000`) is not TLS.
- Deployed environments must use HTTPS/TLS.

2. Confirm storage behavior:
- Sensitive integration config fields are encrypted before DB storage (`enc:v1:` ciphertext).
- API responses redact those values after save.
- Worker decrypts before scan execution.

3. UI expectations:
- Users may paste secret values directly.
- Users should not expect to view plaintext secrets after save.
- Rotation means re-entering the value and saving again.

When changing secret behavior, test all three paths:
- create integration
- update integration (tenant route / global patch)
- worker runtime scan execution

## Workflow: Provider Catalog and Scan Profile UI

Use this when users report missing providers or confusing scan profile controls:

1. Check `AWS_FIRST_MODE` first.
- If true, the API intentionally filters catalog/providers to AWS-only.
- If false, the repo exposes the supported provider list (not full upstream Prowler parity).

2. Scan profile UI behavior in this repo:
- Dropdowns/multi-select where authoritative values exist (`framework`, `compliance`, `severityThreshold`).
- CSV inputs remain for `checks`, `services`, `categories`, exclusions, and `regions` until a provider option catalog exists.

3. If adding dropdowns for more fields, implement a backend source of truth first (provider-specific option catalogs). Do not hardcode guessed check/service lists in the UI.

## Validation Checklist

Run the smallest relevant set, then full checks before commit:

```bash
# Runtime / local env
npm run scanners:preflight
npm run dev:up
npm run health

# Build / tests
npm run test -w @cspm/api
npm run typecheck -w @cspm/api
npm run build
```

When touching web-only UI, also run:

```bash
npm run build -w @cspm/web
```

## References

- Read `references/file-map.md` for key paths and route/worker flow mapping.
- Run `scripts/diagnose-stack.sh` before deep debugging local runtime issues.
