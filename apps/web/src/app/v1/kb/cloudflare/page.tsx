"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function CloudflareGuidePage() {
  const [accountId, setAccountId] = useState("");
  const [apiTokenRef, setApiTokenRef] = useState("secret://sm/cspm/cloudflare-token");
  const payload = useMemo(
    () => ({ name: "Prod Cloudflare", provider: "CLOUDFLARE", isActive: true, config: { accountId, apiTokenRef } }),
    [accountId, apiTokenRef]
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
          <div><p className="eyebrow">Public guide</p><h1>Cloudflare integration setup</h1><p className="muted">Account-token onboarding for security posture checks.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create API token with read-only account/security scopes.</p>
        <p className="checkItem">2. Capture account ID from Cloudflare dashboard.</p>
        <p className="checkItem">3. Store token externally and pass only secret reference to SaaS.</p>
      </section>

      <section className="panel">
        <h2>Generate Cloudflare config</h2>
        <div className="grid">
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Account ID" />
          <input value={apiTokenRef} onChange={(e) => setApiTokenRef(e.target.value)} placeholder="API token reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
