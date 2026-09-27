"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function AzureGuidePage() {
  const [tenantId, setTenantId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecretRef, setClientSecretRef] = useState("secret://kv/cspm/azure-client-secret");

  const payload = useMemo(() => ({
    name: "Prod Azure",
    provider: "AZURE",
    isActive: true,
    config: { tenantId, subscriptionId, clientId, clientSecretRef }
  }), [tenantId, subscriptionId, clientId, clientSecretRef]);
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
            <h1>Azure integration setup</h1>
            <p className="muted">Service principal onboarding flow aligned with Prowler Azure authentication guidance.</p>
          </div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>

        <h2>Who does what</h2>
        <p className="checkItem">- End customer Azure admin: creates app registration and role assignments.</p>
        <p className="checkItem">- MSP operator: stores only secret reference in SaaS and validates scan access.</p>
      </section>

      <section className="panel">
        <h2>Azure Portal click path</h2>
        <p className="checkItem">1. Open <span className="mono">portal.azure.com</span> and go to <span className="mono">Microsoft Entra ID</span>.</p>
        <p className="checkItem">2. Go to <span className="mono">App registrations &gt; New registration</span> and create app.</p>
        <p className="checkItem">3. Open <span className="mono">Certificates &amp; secrets &gt; New client secret</span>, copy the secret value once, and store in Key Vault.</p>
        <p className="checkItem">4. Open <span className="mono">API permissions</span> and add Graph application permissions used by Prowler (<span className="mono">AuditLog.Read.All</span>, <span className="mono">Directory.Read.All</span>, <span className="mono">Policy.Read.All</span>), then grant admin consent.</p>
        <p className="checkItem">5. Open Subscription <span className="mono">Access control (IAM)</span> and assign <span className="mono">Reader</span> plus custom <span className="mono">ProwlerRole</span> where required.</p>
      </section>

      <section className="panel">
        <h2>Map Azure values to SaaS fields</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SaaS field</th><th>Where to get it</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>tenantId</td><td>Entra ID Overview</td><td className="mono">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</td></tr>
              <tr><td>subscriptionId</td><td>Subscription Overview</td><td className="mono">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</td></tr>
              <tr><td>clientId</td><td>App registration Overview</td><td className="mono">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</td></tr>
              <tr><td>clientSecretRef</td><td>Your secret manager path</td><td className="mono">secret://kv/cspm/azure-client-secret</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Prowler alignment references</h2>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/azure/authentication/" target="_blank" rel="noreferrer">Azure authentication in Prowler</a></p>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/azure/create-prowler-service-principal/" target="_blank" rel="noreferrer">Create Prowler service principal</a></p>
      </section>

      <section className="panel">
        <h2>Generate Azure config</h2>
        <div className="grid">
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID" />
          <input value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} placeholder="Subscription ID" />
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" />
          <input value={clientSecretRef} onChange={(e) => setClientSecretRef(e.target.value)} placeholder="Secret reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
