"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function GitHubGuidePage() {
  const [organization, setOrganization] = useState("");
  const [tokenRef, setTokenRef] = useState("secret://sm/cspm/github-token");
  const payload = useMemo(
    () => ({ name: "Prod GitHub", provider: "GITHUB", isActive: true, config: { organization: organization || undefined, tokenRef } }),
    [organization, tokenRef]
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
          <div><p className="eyebrow">Public guide</p><h1>GitHub integration setup</h1><p className="muted">Token onboarding for organization or enterprise security posture checks.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create a read-only token with required security scopes.</p>
        <p className="checkItem">2. Restrict token to your target organization where possible.</p>
        <p className="checkItem">3. Store token in secret manager and pass only token reference in SaaS.</p>
      </section>

      <section className="panel">
        <h2>Generate GitHub config</h2>
        <div className="grid">
          <input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organization (optional)" />
          <input value={tokenRef} onChange={(e) => setTokenRef(e.target.value)} placeholder="Token reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
