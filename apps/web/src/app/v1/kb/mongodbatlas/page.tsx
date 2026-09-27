"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function MongoAtlasGuidePage() {
  const [organizationId, setOrganizationId] = useState("");
  const [publicKeyRef, setPublicKeyRef] = useState("secret://sm/cspm/mdb-public-key");
  const [privateKeyRef, setPrivateKeyRef] = useState("secret://sm/cspm/mdb-private-key");
  const payload = useMemo(
    () => ({ name: "Prod MongoDB Atlas", provider: "MONGODBATLAS", isActive: true, config: { organizationId, publicKeyRef, privateKeyRef } }),
    [organizationId, publicKeyRef, privateKeyRef]
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
          <div><p className="eyebrow">Public guide</p><h1>MongoDB Atlas integration setup</h1><p className="muted">Organization API key onboarding with secret references.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create Atlas API key with read-only org/project permissions.</p>
        <p className="checkItem">2. Store public/private keys in your secret manager.</p>
        <p className="checkItem">3. Use organization ID + key references in SaaS integration payload.</p>
      </section>

      <section className="panel">
        <h2>Generate MongoDB Atlas config</h2>
        <div className="grid">
          <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="Organization ID" />
          <input value={publicKeyRef} onChange={(e) => setPublicKeyRef(e.target.value)} placeholder="Public key reference" />
          <input value={privateKeyRef} onChange={(e) => setPrivateKeyRef(e.target.value)} placeholder="Private key reference" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
