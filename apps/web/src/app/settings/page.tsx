"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState, type ProviderCapabilityPreview, type ScannerPreflightCheck } from "../_lib/cspm";

export default function SettingsPage() {
  const {
    tenant, tenants, subCustomers, tenantUsers, managedIntegrations, loading, scannerPreflight, switchTenant,
    createSubCustomer, canManageTenant, canCreateMsp, upsertTenantUser, createMspAccount, awsFirstMode,
    loadManagedIntegrations, patchManagedIntegration, previewProviderCapabilities
  } = useCspmState();
  const [checks, setChecks] = useState<ScannerPreflightCheck[]>([]);
  const [providerPreview, setProviderPreview] = useState<ProviderCapabilityPreview | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState("");

  async function onCreateSubCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return;
    await createSubCustomer(name);
    form.reset();
  }

  async function onCreateMsp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await createMspAccount({
      tenantName: String(fd.get("tenantName") ?? "").trim(),
      ownerEmail: String(fd.get("ownerEmail") ?? "").trim(),
      ownerPassword: String(fd.get("ownerPassword") ?? "")
    });
    form.reset();
  }

  async function onUpsertTenantUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await upsertTenantUser({
      email: String(fd.get("email") ?? "").trim(),
      password: String(fd.get("password") ?? "") || undefined,
      role: String(fd.get("role") ?? "VIEWER")
    });
    form.reset();
  }

  async function runPreflight() {
    const result = await scannerPreflight();
    setChecks(result.checks ?? []);
  }

  async function runProviderPreview() {
    const result = await previewProviderCapabilities();
    setProviderPreview(result);
  }

  async function refreshManagedIntegrations() {
    await loadManagedIntegrations({
      query: integrationSearch.trim() || undefined,
      limit: 300
    });
  }

  async function toggleManagedIntegration(integrationId: string, currentActive: boolean) {
    await patchManagedIntegration(integrationId, { isActive: !currentActive });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Settings</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />

      <section className="panel">
        <h2>Runtime mode</h2>
        <p className="muted">AWS-first mode: <strong>{awsFirstMode ? "Enabled" : "Disabled"}</strong></p>
        <p className="muted">Scanner policy: real scanner execution only (no simulator).</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(220px, 1fr))" }}>
          <button disabled={loading} onClick={runPreflight}>{loading ? "Working..." : "Run scanner preflight"}</button>
          <button disabled={loading} onClick={runProviderPreview}>{loading ? "Working..." : "Preview provider capabilities"}</button>
        </div>
        {checks.length > 0 ? (
          <div className="list" style={{ marginTop: 10 }}>
            {checks.map((check) => (
              <div key={check.name} className="row">
                <span className="mono">{check.name}</span>
                <span className={`chip ${check.ok ? "sev-low" : "sev-critical"}`}>{check.ok ? "PASS" : "FAIL"}</span>
                <span className="muted">{check.output || "n/a"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {providerPreview ? (
          <div className="hintBox" style={{ marginTop: 10 }}>
            <p className="hintTitle">Provider capability source</p>
            <p className="checkItem">- File: <span className="mono">{providerPreview.source.filePath}</span></p>
            <p className="checkItem">- Exists: {providerPreview.source.exists ? "yes" : "no (using defaults)"}</p>
            <p className="checkItem">- Parse status: {providerPreview.source.parseError ? `error (${providerPreview.source.parseError})` : "ok"}</p>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Provider</th><th>Override</th><th>Frameworks</th><th>Profile options</th></tr></thead>
                <tbody>
                  {providerPreview.providers.map((provider) => (
                    <tr key={provider.provider}>
                      <td>{provider.provider}</td>
                      <td>{provider.overrideApplied ? "yes" : "no"}</td>
                      <td>{provider.frameworks.join(", ") || "n/a"}</td>
                      <td>{provider.profileOptions.join(", ") || "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>MSP / super admin integration governance</h2>
        <p className="muted">Read and update integrations across all accessible tenants from one place.</p>
        <div className="grid">
          <input
            placeholder="Search tenant slug, tenant name, or integration name"
            value={integrationSearch}
            onChange={(event) => setIntegrationSearch(event.target.value)}
          />
          <button disabled={loading} onClick={refreshManagedIntegrations}>
            {loading ? "Working..." : "Load integration inventory"}
          </button>
        </div>
        <div className="list">
          {managedIntegrations.map((integration) => (
            <div key={integration.id} className="row" style={{ gridTemplateColumns: "1fr auto auto auto auto" }}>
              <span>
                <strong>{integration.tenant.name}</strong> <span className="muted">({integration.tenant.slug})</span>
                <br />
                <span className="muted">{integration.name}</span>
              </span>
              <span className="chip">{integration.provider}</span>
              <span className={`chip ${integration.isActive ? "sev-low" : "sev-critical"}`}>
                {integration.isActive ? "ACTIVE" : "INACTIVE"}
              </span>
              <span className="muted">{integration.access.role ?? "-"} via {integration.access.via ?? "-"}</span>
              <button
                disabled={loading || !integration.canManage}
                onClick={() => toggleManagedIntegration(integration.id, integration.isActive)}
              >
                {integration.isActive ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
          {managedIntegrations.length === 0 ? <p className="muted">No integrations loaded yet.</p> : null}
        </div>
      </section>

      {canCreateMsp ? (
        <section className="panel">
          <h2>Super admin: create MSP account</h2>
          <form className="grid" onSubmit={onCreateMsp}>
            <input name="tenantName" required placeholder="MSP tenant name" />
            <input name="ownerEmail" required type="email" placeholder="owner@msp.com" />
            <input name="ownerPassword" required type="password" placeholder="Owner temporary password" />
            <button disabled={loading}>{loading ? "Working..." : "Create MSP"}</button>
          </form>
          <p className="muted">Tenant slug is generated automatically from tenant name.</p>
        </section>
      ) : null}

      <section className="panel">
        <h2>Tenant user access</h2>
        {canManageTenant ? (
          <>
            <form className="grid" onSubmit={onUpsertTenantUser}>
              <input name="email" required type="email" placeholder="user@customer.com" />
              <input name="password" type="password" placeholder="Password (for new user)" />
              <select name="role" defaultValue="VIEWER">
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="ANALYST">ANALYST</option>
                <option value="VIEWER">VIEWER</option>
              </select>
              <button disabled={loading}>{loading ? "Working..." : "Add / update user"}</button>
            </form>
            <div className="list">
              {tenantUsers.map((user) => (
                <div className="row" key={user.id}>
                  <span>{user.email}</span>
                  <span className="chip">{user.role}</span>
                  <span className="muted">{user.createdAt ? new Date(user.createdAt).toLocaleString() : ""}</span>
                </div>
              ))}
              {tenantUsers.length === 0 ? <p className="muted">No tenant users yet.</p> : null}
            </div>
          </>
        ) : (
          <p className="muted">Role does not permit user management.</p>
        )}
      </section>

      <section className="panel">
        <h2>MSP sub-customers</h2>
        {canManageTenant ? (
          <>
            <form className="grid" onSubmit={onCreateSubCustomer}>
              <input name="name" required placeholder="Customer name" />
              <button disabled={loading}>{loading ? "Working..." : "Create sub-customer"}</button>
            </form>
            <p className="muted">Sub-customer slug is generated automatically from customer name.</p>
            <div className="list">
              {subCustomers.map((customer) => (
                <div className="row" key={customer.id}>
                  <span>{customer.name} <span className="muted">({customer.slug})</span></span>
                  <span className="chip">{customer.role}</span>
                  <span className="muted">{customer.via ?? "-"}</span>
                </div>
              ))}
              {subCustomers.length === 0 ? <p className="muted">No sub-customers yet.</p> : null}
            </div>
          </>
        ) : (
          <p className="muted">Role does not permit sub-customer management.</p>
        )}
      </section>

      <section className="panel">
        <h2>Account</h2>
        <div className="list">
          <Link href="/settings/security" className="row" style={{ textDecoration: "none" }}>
            <span>Change password</span>
            <span className="chip">Open</span>
          </Link>
          <Link href="/logout" className="row" style={{ textDecoration: "none" }}>
            <span>Logout</span>
            <span className="chip">Open</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
