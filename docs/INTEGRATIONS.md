# CSPM Integration Setup Guide

This guide explains what is used under the hood today, what each cloud provider requires, and how to complete a clean first onboarding (especially for a test AWS account).

## 1) What the platform uses under the hood (current baseline)

- API stores integration config as tenant-scoped JSON (`Integration.configJson`) with RBAC enforcement.
- Worker consumes queued scan jobs from DB (`ScanJob`) and writes normalized findings (`Finding`).
- Scanner adapters:
  - AWS/Azure/GCP path: `prowler` integration
  - Kubernetes path: `kubescape` integration
- Default runtime is containerized scanners with pinned images:
  - `ghcr.io/prowler-cloud/prowler:4.6.0`
  - `quay.io/kubescape/kubescape:v3.0.26`
- No simulator fallback. Scanner execution failure marks scan `FAILED`.

Current maturity notes:
- Real scanning is strongest today for AWS (Prowler) and Kubernetes (Kubescape).
- Azure/GCP provider records are supported, and use Prowler provider modes (`azure`, `gcp`) in worker runtime.
- Secret references are accepted in config payloads, but encrypted secret-store abstraction is still roadmap work.

## 2) Cloud-side prerequisites by provider

## AWS

You need (single-account):
- One AWS account ID
- Read-only IAM role ARN for scanning
- Optional external ID
- Optional explicit regions list

You need (multi-account):
- Account IDs list (CSV)
- Read-only IAM role pattern deployed/trusted in each in-scope account
- Optional external ID
- Optional explicit regions list

Recommended baseline for first test:
- Create a dedicated role (example: `CSPMReadOnlyRole`)
- Attach read-only/security audit permissions
- Trust only your scanner principal/user
- For multi-account, standardize role name + policy baseline across accounts

## Azure

You need:
- Tenant ID
- Subscription ID
- App registration (Client ID)
- Client secret reference (not plaintext)

Recommended baseline for first test:
- Service principal with Reader-level access on one non-production subscription

## GCP

You need:
- Project ID
- Service account JSON reference (not plaintext)

Recommended baseline for first test:
- Dedicated service account with viewer/security-reader style roles on one non-production project

## Kubernetes (KSPM)

You need:
- Cluster name
- kubeconfig path
- context name

Recommended baseline for first test:
- Read-only RBAC for inventory/security checks on one development cluster

## 3) First AWS test onboarding (step-by-step)

1. In AWS, create a read-only IAM role for CSPM scan access.
2. Grant read-only/security-audit permissions to that role.
3. Ensure trust policy allows your scanner principal to assume the role.
4. In CSPM UI, create integration:
   - Provider: `AWS`
   - Name: `Test AWS`
   - AWS account ID: your test account
   - Read-only role ARN: role from step 1
   - Optional: external ID and regions
   - Ensure `prowler` is installed on worker host
5. Queue scan from Integrations list.
6. Refresh dashboard and confirm findings populate.

## 4) Scanner runtime requirements

Default:
- Docker engine available to worker runtime
- Pinned scanner images configured via env

Alternative local-binary mode:
- `SCANNER_RUNTIME=local`
- Install Prowler: https://github.com/prowler-cloud/prowler
- Install Kubescape: https://github.com/kubescape/kubescape

If runtime is missing or misconfigured, scans fail and return an explicit error in scan status.

## 5) Setup UX expectations

Current UI onboarding includes:
- Provider-specific required fields
- Inline cloud-side prerequisite guidance
- Explicit real-scan-only expectation (no simulator mode)

Planned improvements:
- Test-connection before save
- Secret vault integration + encryption at rest
- Credential validation and richer policy checks
- Guided wizard with copy/paste cloud templates

## 6) Open-source attribution

This platform orchestrates open-source scanner engines and does not embed/fork their source code in-app runtime:
- Prowler (AGPL): https://github.com/prowler-cloud/prowler
- Kubescape (Apache-2.0): https://github.com/kubescape/kubescape
