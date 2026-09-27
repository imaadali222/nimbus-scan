"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function AlibabaCloudGuidePage() {
  const [accountId, setAccountId] = useState("");
  const [accessKeyIdRef, setAccessKeyIdRef] = useState("secret://sm/cspm/ali-akid");
  const [accessKeySecretRef, setAccessKeySecretRef] = useState("secret://sm/cspm/ali-secret");
  const [region, setRegion] = useState("");
  const payload = useMemo(
    () => ({
      name: "Prod Alibaba Cloud",
      provider: "ALIBABACLOUD",
      isActive: true,
      config: { accountId: accountId || undefined, accessKeyIdRef, accessKeySecretRef, region: region || undefined }
    }),
    [accountId, accessKeyIdRef, accessKeySecretRef, region]
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
          <div><p className="eyebrow">Public guide</p><h1>Alibaba Cloud integration setup</h1><p className="muted">RAM access-key onboarding with secret references.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create RAM user with read-only security permissions.</p>
        <p className="checkItem">2. Store AccessKey ID and AccessKey Secret in secret manager.</p>
        <p className="checkItem">3. Use secret references in SaaS integration payload.</p>
      </section>

      <section className="panel">
        <h2>Generate Alibaba Cloud config</h2>
        <div className="grid">
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Account ID (optional)" />
          <input value={accessKeyIdRef} onChange={(e) => setAccessKeyIdRef(e.target.value)} placeholder="AccessKey ID reference" />
          <input value={accessKeySecretRef} onChange={(e) => setAccessKeySecretRef(e.target.value)} placeholder="AccessKey Secret reference" />
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional)" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
