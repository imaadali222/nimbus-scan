# MSP Onboarding Playbook

## 1) MSP account bootstrap
1. Register MSP owner account.
2. Confirm tenant scope in top banner.
3. Run scanner preflight in Settings.

## 2) Create sub-customer tenants
1. Open Settings -> MSP sub-customers.
2. Create sub-customer (name + slug).
3. Switch tenant scope to the new customer using tenant switcher.

## 2.1) User and role assignment
1. In tenant scope, open Settings -> Tenant user access.
2. Add/update users with roles: OWNER, ADMIN, ANALYST, VIEWER.
3. For super admins: use Settings -> Create MSP account to bootstrap new MSP tenant + owner.

## 3) Customer integration onboarding
1. In customer scope, open Integrations.
2. Populate AWS single-account or multi-account integration fields.
3. Run Test AWS connection and confirm pass.
4. Save integration.

## 4) Initial scan and validation
1. Queue scan from Integrations.
2. Validate scan statuses in Scans page.
3. Review findings/compliance/assets pages.

## 5) Operations model
- Super admin: global visibility + tenant switching.
- MSP owner/admin: manage sub-customers and integrations.
- Analyst/viewer: read-only operational review.

## 6) Readiness checklist
- Scanner preflight PASS
- Integration verification PASS
- Tenant scope banner confirms active customer before actions
- At least one successful scan for each onboarded customer
