"use client";

import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState } from "../_lib/cspm";

export default function FindingsPage() {
  const { token, tenant, tenants, findings, counts, error, switchTenant } = useCspmState();

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Findings</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />
      {error ? <p className="errorText">{error}</p> : null}

      {!token ? <section className="panel"><p className="muted">Create an account on Overview first.</p></section> : null}
      {token && (
        <section className="panel">
          <div className="cards">
            {Object.entries(counts).map(([k, v]) => (
              <article key={k} className={`metric sev-${k.toLowerCase()}`}><p>{k}</p><strong>{v}</strong></article>
            ))}
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Severity</th><th>Provider</th><th>Framework</th><th>Title</th><th>Risk</th><th>Resource</th></tr></thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td><span className={`chip sev-${f.severity.toLowerCase()}`}>{f.severity}</span></td>
                    <td>{f.provider}</td>
                    <td>{f.framework}</td>
                    <td>{f.title}</td>
                    <td>{f.riskScore ?? 0}</td>
                    <td className="mono">{f.resourceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {findings.length === 0 ? <p className="muted">No findings yet.</p> : null}
        </section>
      )}
    </main>
  );
}
