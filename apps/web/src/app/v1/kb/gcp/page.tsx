"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function GcpGuidePage() {
  const [projectId, setProjectId] = useState("");
  const [serviceAccountJsonRef, setServiceAccountJsonRef] = useState("secret://sm/cspm/gcp-service-account-json");

  const payload = useMemo(() => ({
    name: "Prod GCP",
    provider: "GCP",
    isActive: true,
    config: { projectId, serviceAccountJsonRef }
  }), [projectId, serviceAccountJsonRef]);
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const [copied, setCopied] = useState(false);

  async function copyPayload() {
    await navigator.clipboard.writeText(payloadText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="shell">
      <section className="panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Public guide</p>
            <h1>GCP integration setup</h1>
            <p className="muted">Service account onboarding aligned with Prowler GCP authentication model.</p>
          </div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>

        <h2>Who does what</h2>
        <p className="checkItem">- End customer GCP admin: creates service account and role bindings.</p>
        <p className="checkItem">- MSP operator: stores credential reference only and verifies first scan.</p>
      </section>

      <section className="panel">
        <h2>GCP Console click path</h2>
        <p className="checkItem">1. Open <span className="mono">console.cloud.google.com</span> and select target project.</p>
        <p className="checkItem">2. Go to <span className="mono">IAM &amp; Admin &gt; Service Accounts &gt; Create service account</span>.</p>
        <p className="checkItem">3. Assign baseline roles: <span className="mono">roles/viewer</span> and <span className="mono">roles/serviceusage.serviceUsageConsumer</span>.</p>
        <p className="checkItem">4. Add custom <span className="mono">ProwlerRole</span> permissions if required (for example <span className="mono">storage.buckets.getIamPolicy</span>).</p>
        <p className="checkItem">5. Go to service account <span className="mono">Keys &gt; Add key &gt; Create new key (JSON)</span>.</p>
        <p className="checkItem">6. Store JSON credential in Secret Manager and keep only secret reference for SaaS config.</p>
        <p className="checkItem">7. Ensure required APIs are enabled (for example <span className="mono">iam.googleapis.com</span>) and quota project is configured.</p>
      </section>

      <section className="panel">
        <h2>Map GCP values to SaaS fields</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SaaS field</th><th>Where to get it</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>projectId</td><td>Project selector / project settings</td><td className="mono">my-prod-project</td></tr>
              <tr><td>serviceAccountJsonRef</td><td>Secret Manager reference path</td><td className="mono">secret://sm/cspm/gcp-service-account-json</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Prowler alignment references</h2>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/gcp/authentication/" target="_blank" rel="noreferrer">GCP authentication in Prowler</a></p>
      </section>

      <section className="panel">
        <h2>Generate GCP config</h2>
        <div className="grid">
          <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" />
          <input value={serviceAccountJsonRef} onChange={(e) => setServiceAccountJsonRef(e.target.value)} placeholder="Secret reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
