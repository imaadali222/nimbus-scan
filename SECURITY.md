# Security Policy

## Supported Versions

This project is under active development. Security fixes are expected to land on:

- `main` (current development branch)

Older commits/tags may not receive backported fixes.

## Reporting a Vulnerability

Please do not post sensitive vulnerability details, credentials, or exploit code in public issues.

### Preferred (private)

- Use GitHub Private Vulnerability Reporting for this repository, if enabled.

### Fallback (if private reporting is unavailable)

Open a GitHub issue with:

- a minimal description of the affected area
- impact summary
- a request for a private follow-up

Avoid including:

- secrets / API keys / tokens
- customer data
- full exploit payloads
- screenshots with credentials or internal hostnames

## What to Include (Sanitized)

Helpful reports usually include:

- affected component (`apps/web`, `apps/api`, `apps/worker`, auth, integrations, scanner runtime)
- reproduction steps
- expected vs observed behavior
- version/commit SHA
- logs/stack traces with secrets removed
- impact assessment (tenant isolation, auth bypass, secret exposure, DoS, etc.)

## Response Expectations

Best effort (maintainer availability dependent):

- Acknowledge report
- Triage severity and scope
- Reproduce and patch
- Publish fix in a commit/PR with release notes or README/docs updates as needed

## Security Notes for Users

This repository is a public CSPM platform implementation and should be hardened before production use.

Minimum expectations before production:

- deploy behind HTTPS/TLS
- use managed secret storage / KMS
- validate tenant isolation and RBAC in your environment
- isolate scanner runtime execution
- monitor worker/API logs and enforce secure ops practices
