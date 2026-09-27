"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function OracleCloudGuidePage() {
  const [tenancyId, setTenancyId] = useState("");
  const [userId, setUserId] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [privateKeyRef, setPrivateKeyRef] = useState("secret://sm/cspm/oci-private-key");
  const [region, setRegion] = useState("");
  const payload = useMemo(
    () => ({
      name: "Prod Oracle Cloud",
      provider: "ORACLECLOUD",
      isActive: true,
      config: { tenancyId, userId, fingerprint, privateKeyRef, region: region || undefined }
    }),
    [tenancyId, userId, fingerprint, privateKeyRef, region]
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
          <div><p className="eyebrow">Public guide</p><h1>Oracle Cloud integration setup</h1><p className="muted">OCI API key onboarding with tenancy/user OCID mapping.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create OCI user and API key with least-privilege read access.</p>
        <p className="checkItem">2. Record tenancy OCID, user OCID, and key fingerprint.</p>
        <p className="checkItem">3. Store private key in secret manager and provide only key reference.</p>
      </section>

      <section className="panel">
        <h2>Generate Oracle Cloud config</h2>
        <div className="grid">
          <input value={tenancyId} onChange={(e) => setTenancyId(e.target.value)} placeholder="Tenancy OCID" />
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User OCID" />
          <input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} placeholder="API key fingerprint" />
          <input value={privateKeyRef} onChange={(e) => setPrivateKeyRef(e.target.value)} placeholder="Private key reference" />
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional)" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
