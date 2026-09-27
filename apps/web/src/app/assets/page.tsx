"use client";

import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState } from "../_lib/cspm";

export default function AssetsPage() {
  const { token, tenant, tenants, assets, error, switchTenant } = useCspmState();

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Assets</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />
      {error ? <p className="errorText">{error}</p> : null}

      {!token ? <section className="panel"><p className="muted">Create an account on Overview first.</p></section> : null}
      {token && (
        <section className="panel">
          <div className="tableWrap">
            <table>
              <thead><tr><th>Provider</th><th>Asset ID</th><th>Type</th><th>Criticality</th><th>Last seen</th></tr></thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}><td>{asset.provider}</td><td className="mono">{asset.externalId}</td><td>{asset.assetType}</td><td>{asset.criticality}</td><td>{new Date(asset.lastSeenAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {assets.length === 0 ? <p className="muted">No assets indexed yet.</p> : null}
        </section>
      )}
    </main>
  );
}
