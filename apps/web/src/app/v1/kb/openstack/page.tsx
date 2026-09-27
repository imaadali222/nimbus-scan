"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function OpenStackGuidePage() {
  const [authUrl, setAuthUrl] = useState("https://keystone.example.com/v3");
  const [username, setUsername] = useState("");
  const [passwordRef, setPasswordRef] = useState("secret://sm/cspm/openstack-password");
  const [projectName, setProjectName] = useState("");
  const [domainName, setDomainName] = useState("default");
  const payload = useMemo(
    () => ({
      name: "Prod OpenStack",
      provider: "OPENSTACK",
      isActive: true,
      config: { authUrl, username, passwordRef, projectName, domainName: domainName || undefined }
    }),
    [authUrl, username, passwordRef, projectName, domainName]
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
          <div><p className="eyebrow">Public guide</p><h1>OpenStack integration setup</h1><p className="muted">Keystone auth onboarding for OpenStack posture collection.</p></div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>
        <p className="checkItem">1. Create read-only service user in OpenStack/Keystone.</p>
        <p className="checkItem">2. Capture auth URL, username, project name, and domain mapping.</p>
        <p className="checkItem">3. Store password in secret manager and pass password reference only.</p>
      </section>

      <section className="panel">
        <h2>Generate OpenStack config</h2>
        <div className="grid">
          <input value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} placeholder="Auth URL" />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <input value={passwordRef} onChange={(e) => setPasswordRef(e.target.value)} placeholder="Password reference" />
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
          <input value={domainName} onChange={(e) => setDomainName(e.target.value)} placeholder="Domain name (optional)" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
