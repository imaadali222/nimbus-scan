"use client";

import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState } from "../_lib/cspm";

export default function CompliancePage() {
  const { token, tenant, tenants, compliance, error, switchTenant } = useCspmState();

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Compliance</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />
      {error ? <p className="errorText">{error}</p> : null}

      {!token ? <section className="panel"><p className="muted">Create an account on Overview first.</p></section> : null}
      {token && (
        <section className="panel">
          <div className="tableWrap">
            <table>
              <thead><tr><th>Framework</th><th>Total Findings</th><th>Open</th><th>Critical</th></tr></thead>
              <tbody>
                {compliance.map((row) => (
                  <tr key={row.framework}><td>{row.framework}</td><td>{row.total}</td><td>{row.open}</td><td>{row.critical}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {compliance.length === 0 ? <p className="muted">No compliance mapping yet.</p> : null}
        </section>
      )}
    </main>
  );
}
