"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function M365GuidePage() {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecretRef, setClientSecretRef] = useState("secret://kv/cspm/m365-client-secret");
  const payload = useMemo(
    () => ({ name: "Prod M365", provider: "M365", isActive: true, config: { tenantId, clientId, clientSecretRef } }),
    [tenantId, clientId, clientSecretRef]
  );
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
          <div><p className="eyebrow">Public guide</p><h1>M365 integration setup</h1><p className="muted">Entra app registration and Graph permission onboarding.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create Entra app registration for CSPM scanning.</p>
        <p className="checkItem">2. Add required Microsoft Graph application permissions and grant admin consent.</p>
        <p className="checkItem">3. Create client secret, store externally, and pass only a secret reference to SaaS.</p>
      </section>

      <section className="panel">
        <h2>Generate M365 config</h2>
        <div className="grid">
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID" />
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" />
          <input value={clientSecretRef} onChange={(e) => setClientSecretRef(e.target.value)} placeholder="Client secret reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
