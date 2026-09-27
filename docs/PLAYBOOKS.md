# CSPM Playbooks

## Onboard new tenant
1. Register tenant owner.
2. Add initial cloud integration.
3. Queue first scan.
4. Validate findings, assets, compliance mapping, executive summary.

## Respond to failed scan
1. Open scan error message and metadata.
2. Check scanner runtime prerequisites (binary/image/auth/certs/permissions).
3. Re-run scan after fix.
4. Record action in ticket and verify audit logs.

## High-risk finding triage
1. Open prioritized findings list.
2. Confirm affected asset criticality + exposure.
3. Assign remediation owner + SLA.
4. Track closure and verify in next scheduled scan.

## Backup/restore drill
1. Restore DB snapshot to isolated env.
2. Run API+web against restored DB.
3. Verify tenant isolation and latest artifacts.
4. Document RTO/RPO achieved and action items.
