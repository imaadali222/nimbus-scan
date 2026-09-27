"use client";

import Link from "next/link";
import { ConsoleNav } from "./_components/ConsoleNav";
import { useCspmState } from "./_lib/cspm";

export default function HomePage() {
  const { token, tenant, tenants, executive, posture, error, notice, switchTenant, awsFirstMode } = useCspmState();

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandWrap">
          <div className="brandMark">NSCA</div>
          <div>
            <p className="eyebrow">Network Security Cloud Analytics</p>
            <h1>Nimbus Scan</h1>
            <p className="muted">Production-oriented cloud posture management.</p>
          </div>
        </div>
        {tenant ? (
          <span className="badge">Tenant: {tenant.name}</span>
        ) : (
          <div className="authQuickLinks">
            <Link className="chip" href="/login">Login</Link>
            <Link className="chip" href="/signup">Sign up</Link>
          </div>
        )}
      </header>

      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />
      <p className="muted">Need setup help? Open the public KB: <a className="chip" href="/v1/kb">/v1/kb</a></p>

      {error ? <p className="errorText">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      <p className="muted">
        {awsFirstMode ? "AWS-first mode is active: non-AWS providers are disabled." : "Multi-cloud mode is active."}
      </p>

      {!token && (
        <section className="panel">
          <h2>Get started</h2>
          <p className="muted">Choose the flow that fits you.</p>
          <div className="list">
            <Link href="/login" className="row" style={{ textDecoration: "none" }}>
              <span>Login to existing account</span>
              <span className="chip">Open</span>
            </Link>
            <Link href="/signup" className="row" style={{ textDecoration: "none" }}>
              <span>Create new tenant owner account</span>
              <span className="chip">Open</span>
            </Link>
          </div>
        </section>
      )}

      {token && (
        <>
          <section className="panel">
            <div className="sectionHead">
              <h2>Executive snapshot</h2>
              <span className="muted">Prowler-style posture summary by severity, provider, and scan flow.</span>
            </div>
            {(executive || posture) ? (
              <div className="cards">
                <article className="metric"><p>Total findings</p><strong>{posture?.summary.findingsCount ?? executive?.summary.findingsCount ?? 0}</strong></article>
                <article className="metric"><p>Open findings</p><strong>{posture?.summary.openFindings ?? 0}</strong></article>
                <article className="metric"><p>Critical open</p><strong>{posture?.summary.openCritical ?? executive?.summary.openCritical ?? 0}</strong></article>
                <article className="metric"><p>Total assets</p><strong>{posture?.summary.assetsCount ?? executive?.summary.assetsCount ?? 0}</strong></article>
                <article className="metric"><p>Scans run</p><strong>{posture?.summary.scansCount ?? executive?.summary.scansCount ?? 0}</strong></article>
              </div>
            ) : (
              <p className="muted">No data yet. Start in Integrations then run your first scan.</p>
            )}
            {posture ? (
              <div className="cards">
                {Object.entries(posture.severity).map(([level, count]) => (
                  <article key={level} className={`metric sev-${level.toLowerCase()}`}>
                    <p>{level} total</p>
                    <strong>{count}</strong>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Risk pipeline</h2>
                <span className="muted">Open risk by severity and closed findings volume.</span>
              </div>
              <div className="cards">
                <article className="metric sev-critical"><p>Critical open</p><strong>{posture.riskPipeline.criticalOpen}</strong></article>
                <article className="metric sev-high"><p>High open</p><strong>{posture.riskPipeline.highOpen}</strong></article>
                <article className="metric sev-medium"><p>Medium open</p><strong>{posture.riskPipeline.mediumOpen}</strong></article>
                <article className="metric sev-low"><p>Low open</p><strong>{posture.riskPipeline.lowOpen}</strong></article>
                <article className="metric sev-info"><p>Info open</p><strong>{posture.riskPipeline.infoOpen}</strong></article>
                <article className="metric"><p>Closed findings</p><strong>{posture.riskPipeline.closedFindings}</strong></article>
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Open severity mix</h2>
                <span className="muted">Active backlog by severity level.</span>
              </div>
              <div className="cards">
                {Object.entries(posture.openSeverity).map(([level, count]) => (
                  <article key={level} className={`metric sev-${level.toLowerCase()}`}>
                    <p>{level} open</p>
                    <strong>{count}</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Provider posture</h2>
                <span className="muted">Scope and scanner outcome per cloud integration surface.</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Provider</th><th>Findings</th><th>Open</th><th>Critical open</th><th>Assets</th><th>Last scan</th></tr></thead>
                  <tbody>
                    {posture.providerStats.map((provider) => (
                      <tr key={provider.provider}>
                        <td>{provider.provider}</td>
                        <td>{provider.findings}</td>
                        <td>{provider.openFindings}</td>
                        <td>{provider.criticalOpen}</td>
                        <td>{provider.assets}</td>
                        <td>
                          {provider.lastScanStatus ?? "n/a"}
                          {provider.lastScanAt ? ` (${new Date(provider.lastScanAt).toLocaleDateString()})` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Framework pressure points</h2>
                <span className="muted">Top frameworks ranked by critical and open findings.</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Framework</th><th>Total</th><th>Open</th><th>Critical</th></tr></thead>
                  <tbody>
                    {posture.frameworkStats.map((row) => (
                      <tr key={row.framework}>
                        <td>{row.framework}</td>
                        <td>{row.total}</td>
                        <td>{row.open}</td>
                        <td>{row.critical}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Risk watchlists</h2>
                <span className="muted">Fast triage lanes for highest-pressure services and frameworks.</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Service</th><th>Total</th><th>Open</th><th>Critical open</th></tr></thead>
                  <tbody>
                    {posture.watchlists.services.map((service) => (
                      <tr key={service.service}>
                        <td>{service.service}</td>
                        <td>{service.total}</td>
                        <td>{service.open}</td>
                        <td>{service.criticalOpen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tableWrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Framework</th><th>Total</th><th>Open</th><th>Critical</th></tr></thead>
                  <tbody>
                    {posture.watchlists.frameworks.map((framework) => (
                      <tr key={framework.framework}>
                        <td>{framework.framework}</td>
                        <td>{framework.total}</td>
                        <td>{framework.open}</td>
                        <td>{framework.critical}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Recent finding intake (14 days)</h2>
                <span className="muted">Daily finding volume to spot spikes after scans or config changes.</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Date</th><th>Total</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Info</th></tr></thead>
                  <tbody>
                    {posture.recentFindings.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.total}</td>
                        <td>{row.critical}</td>
                        <td>{row.high}</td>
                        <td>{row.medium}</td>
                        <td>{row.low}</td>
                        <td>{row.info}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {posture ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Recent scan throughput (14 days)</h2>
                <span className="muted">Queue and worker behavior snapshot.</span>
              </div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th>Date</th><th>Total</th><th>Completed</th><th>Failed</th><th>Running</th><th>Queued</th></tr></thead>
                  <tbody>
                    {posture.recentScans.map((scan) => (
                      <tr key={scan.date}>
                        <td>{scan.date}</td>
                        <td>{scan.total}</td>
                        <td>{scan.completed}</td>
                        <td>{scan.failed}</td>
                        <td>{scan.running}</td>
                        <td>{scan.queued}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {executive ? (
            <section className="panel">
              <div className="sectionHead">
                <h2>Top risks</h2>
                <span className="muted">Highest risk open findings.</span>
              </div>
              <div className="list">
                {executive.topRisks.map((risk) => (
                  <div key={risk.id} className="row">
                    <span>
                      <strong>{risk.title}</strong>
                      <br />
                      <span className="muted mono">{risk.resourceId}</span>
                    </span>
                    <span className="chip">{risk.provider}</span>
                    <span className="chip">{risk.riskScore}</span>
                  </div>
                ))}
                {executive.topRisks.length === 0 ? <p className="muted">No open risks yet.</p> : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
