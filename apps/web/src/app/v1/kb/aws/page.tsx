"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export default function AwsGuidePage() {
  const [accountId, setAccountId] = useState("");
  const [accountIdsCsv, setAccountIdsCsv] = useState("");
  const [roleName, setRoleName] = useState("CSPMReadOnly");
  const [externalId, setExternalId] = useState("cspm-external-id");
  const [regions, setRegions] = useState("us-east-1,us-west-2");

  const roleArn = useMemo(() => (accountId ? `arn:aws:iam::${accountId}:role/${roleName}` : "arn:aws:iam::<account-id>:role/CSPMReadOnly"), [accountId, roleName]);

  const payload = useMemo(() => ({
    name: "Prod AWS",
    provider: "AWS",
    isActive: true,
    config: {
      ...(accountId ? { accountId } : {}),
      ...(accountIdsCsv.trim()
        ? { accountIds: accountIdsCsv.split(",").map((v) => v.trim()).filter(Boolean) }
        : {}),
      roleArn,
      externalId,
      regions: regions.split(",").map((r) => r.trim()).filter(Boolean)
    }
  }), [accountId, accountIdsCsv, roleArn, externalId, regions]);
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const trustPolicyText = useMemo(
    () =>
      JSON.stringify(
        {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                AWS: "arn:aws:iam::<scanner-account-id>:role/<scanner-role>"
              },
              Action: "sts:AssumeRole",
              Condition: {
                StringEquals: {
                  "sts:ExternalId": externalId
                }
              }
            }
          ]
        },
        null,
        2
      ),
    [externalId]
  );
  const prowlerDockerCommands = useMemo(
    () =>
      [
        "docker pull ghcr.io/prowler-cloud/prowler:4.6.0",
        "docker run --rm -it ghcr.io/prowler-cloud/prowler:4.6.0 aws --help",
        "docker run --rm -it -e AWS_PROFILE=default ghcr.io/prowler-cloud/prowler:4.6.0 aws --list-profiles"
      ].join("\n"),
    []
  );
  const prowlerLocalCommands = useMemo(
    () =>
      [
        "pipx install prowler==4.6.0",
        "prowler aws --version",
        "prowler aws --list-profiles"
      ].join("\n"),
    []
  );
  const prowlerValidationCommand = useMemo(
    () =>
      "prowler aws --profile default --compliance cis_1.5_aws --output-formats json-asff --output-directory ./prowler-output",
    []
  );
  const [copied, setCopied] = useState(false);

  async function copyPayload() {
    await navigator.clipboard.writeText(payloadText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Public guide</p>
          <h1>AWS integration setup</h1>
          <p className="muted">Prowler-aligned onboarding runbook for MSP and end-customer teams (single-account and multi-account).</p>
        </div>
        <Link href="/v1/kb" className="tab">All guides</Link>
      </header>

      <section className="panel">
        <h2>Who does what</h2>
        <p className="checkItem">- End customer AWS admin: creates the cross-account role in AWS.</p>
        <p className="checkItem">- MSP operator: enters values in SaaS, runs connection test, and queues first scan.</p>
      </section>

      <section className="panel">
        <h2>AWS Console click path (AssumeRole recommended)</h2>
        <p className="checkItem">1. Login to AWS Console and confirm target account ID.</p>
        <p className="checkItem">2. Open <span className="mono">IAM &gt; Roles &gt; Create role</span>.</p>
        <p className="checkItem">3. Select trusted entity type that can assume the role (scanner account/principal).</p>
        <p className="checkItem">4. In trust policy, require External ID condition for cross-account security.</p>
        <p className="checkItem">5. Attach read-only baseline policy (quick start: SecurityAudit; then tune least privilege).</p>
        <p className="checkItem">6. Name role consistently (for example <span className="mono">CSPMReadOnly</span>) and create role.</p>
        <p className="checkItem">7. Copy Role ARN from role details page.</p>
      </section>

      <section className="panel">
        <h2>Multi-account pattern (Organizations)</h2>
        <p className="checkItem">- Use same role name across all onboarded accounts.</p>
        <p className="checkItem">- Provide account IDs as CSV in SaaS integration form.</p>
        <p className="checkItem">- Ensure trust policy and external ID pattern are consistent in each account.</p>
        <p className="checkItem">- SaaS worker fans out scans per target account and keeps per-account metadata.</p>
      </section>

      <section className="panel">
        <h2>Map AWS values to SaaS fields</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SaaS field</th><th>Where to get it</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>accountId</td><td>AWS account dropdown / billing console</td><td className="mono">123456789012</td></tr>
              <tr><td>accountIds (CSV)</td><td>AWS Organizations account list</td><td className="mono">111111111111,222222222222</td></tr>
              <tr><td>roleArn</td><td>IAM Role detail page</td><td className="mono">arn:aws:iam::123456789012:role/CSPMReadOnly</td></tr>
              <tr><td>externalId</td><td>Defined by MSP/platform policy</td><td className="mono">cspm-external-id</td></tr>
              <tr><td>regions</td><td>Customer-approved scan scope</td><td className="mono">us-east-1,us-west-2</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>IAM trust policy template</h2>
        <p className="muted">Replace scanner principal values and keep external ID consistent with integration config.</p>
        <pre className="codeBlock">{trustPolicyText}</pre>
      </section>

      <section className="panel">
        <h2>Prowler alignment references</h2>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/aws/getting-started-aws/" target="_blank" rel="noreferrer">Getting Started with AWS on Prowler</a></p>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/aws/role-assumption/" target="_blank" rel="noreferrer">AWS role assumption in Prowler</a></p>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/aws/multiaccount/" target="_blank" rel="noreferrer">AWS multi-account scanning pattern</a></p>
      </section>

      <section className="panel">
        <h2>Prowler runtime validation</h2>
        <p className="muted">Use one of the following depending on your scanner runtime strategy.</p>
        <p className="checkItem">- Docker runtime</p>
        <pre className="codeBlock">{prowlerDockerCommands}</pre>
        <p className="checkItem">- Local binary runtime</p>
        <pre className="codeBlock">{prowlerLocalCommands}</pre>
        <p className="checkItem">- One-shot compliance validation</p>
        <pre className="codeBlock">{prowlerValidationCommand}</pre>
      </section>

      <section className="panel">
        <h2>Generate AWS config</h2>
        <div className="grid">
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="AWS account ID (single-account)" />
          <input value={accountIdsCsv} onChange={(e) => setAccountIdsCsv(e.target.value)} placeholder="AWS account IDs CSV (multi-account)" />
          <input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Role name" />
          <input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="External ID" />
          <input value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="Regions CSV" />
        </div>
        <p className="muted">Role ARN preview: <span className="mono">{roleArn}</span></p>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
