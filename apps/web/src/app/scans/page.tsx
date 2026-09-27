"use client";

import { useState } from "react";
import { ConsoleNav } from "../_components/ConsoleNav";
import { remediationHint, type ScanDispatchState, type ScanWorkerMetadata, useCspmState } from "../_lib/cspm";

function dispatchSummary(metadataJson?: string | null) {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { dispatch?: { queued?: unknown; failed?: unknown; configuredEndpoints?: unknown } };
    if (!parsed.dispatch) return null;
    const queued = typeof parsed.dispatch.queued === "number" ? parsed.dispatch.queued : 0;
    const failed = typeof parsed.dispatch.failed === "number" ? parsed.dispatch.failed : 0;
    const configuredEndpoints = typeof parsed.dispatch.configuredEndpoints === "number" ? parsed.dispatch.configuredEndpoints : 0;
    return { queued, failed, configuredEndpoints };
  } catch {
    return null;
  }
}

export default function ScansPage() {
  const {
    token, tenant, tenants, scans, workerEvents, scanStatus, downloadArtifact, getScanWorkerMetadata,
    getScanDispatch, replayScanDispatch, loading, error, switchTenant
  } = useCspmState();
  const [selectedWorkerDetails, setSelectedWorkerDetails] = useState<ScanWorkerMetadata | null>(null);
  const [selectedDispatch, setSelectedDispatch] = useState<ScanDispatchState | null>(null);
  const latestFailedScan = scans
    .filter((scan) => scan.status === "FAILED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const visibleWorkerEvents = workerEvents.slice(0, 5);

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Scans</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />
      {error ? <p className="errorText">{error}</p> : null}

      {!token ? <section className="panel"><p className="muted">Create an account on Overview first.</p></section> : null}
      {token && (
        <section className="panel">
          <div className="statusCards">
            <article className="statusCard status-queued"><p>Queued</p><strong>{scanStatus.QUEUED}</strong></article>
            <article className="statusCard status-running"><p>Running</p><strong>{scanStatus.RUNNING}</strong></article>
            <article className="statusCard status-completed"><p>Completed</p><strong>{scanStatus.COMPLETED}</strong></article>
            <article className="statusCard status-failed"><p>Failed</p><strong>{scanStatus.FAILED}</strong></article>
          </div>

          {latestFailedScan ? (
            <div className="hintBox">
              <p className="hintTitle">Latest failed scan remediation</p>
              <p className="checkItem">- Scan ID: <span className="mono">{latestFailedScan.id}</span></p>
              <p className="checkItem">- Cause: {latestFailedScan.errorMessage ?? "No error detail returned."}</p>
              <p className="checkItem">- Next step: {remediationHint(latestFailedScan.errorMessage)}</p>
            </div>
          ) : null}

          <div className="hintBox">
            <p className="hintTitle">Worker events (latest)</p>
            {visibleWorkerEvents.length === 0 ? (
              <p className="checkItem">- No worker retry/failure events yet.</p>
            ) : (
              visibleWorkerEvents.map((event) => (
                <p key={event.scanId} className="checkItem">
                  - {event.provider} {event.status} | {event.worker.state ?? "n/a"} | attempt{" "}
                  {event.worker.attempt ?? 0}/{event.worker.maxRetries ?? 0}
                  {event.worker.failureCategory ? ` | ${event.worker.failureCategory}` : ""}
                </p>
              ))
            )}
          </div>

          <div className="list">
            {scans.map((s) => {
              const dispatch = dispatchSummary(s.metadataJson);
              return (
                <div key={s.id} className="row scanRow">
                  <span>{new Date(s.createdAt).toLocaleString()}</span>
                  <span>{s.provider}</span>
                  <span className={`chip ${s.status === "COMPLETED" ? "sev-low" : s.status === "FAILED" ? "sev-critical" : "sev-medium"}`}>{s.status}</span>
                  {dispatch ? (
                    <span className="muted">
                      dispatch {dispatch.queued}/{dispatch.configuredEndpoints}
                      {dispatch.failed > 0 ? ` failed:${dispatch.failed}` : ""}
                    </span>
                  ) : (
                    <span className="muted">dispatch n/a</span>
                  )}
                  <button disabled={loading} onClick={() => downloadArtifact(s.id)}>Artifact</button>
                  <button
                    disabled={loading}
                    onClick={async () => {
                      const details = await getScanWorkerMetadata(s.id);
                      setSelectedWorkerDetails(details);
                    }}
                  >
                    Worker
                  </button>
                  <button
                    disabled={loading}
                    onClick={async () => {
                      const details = await getScanDispatch(s.id);
                      setSelectedDispatch(details);
                    }}
                  >
                    Dispatch
                  </button>
                </div>
              );
            })}
            {scans.length === 0 ? <p className="muted">No scans yet.</p> : null}
          </div>

          {selectedWorkerDetails ? (
            <div className="panel">
              <h3>Worker metadata drilldown</h3>
              <p className="muted">Scan: <span className="mono">{selectedWorkerDetails.scan.id}</span></p>
              <pre className="codeBlock">{JSON.stringify(selectedWorkerDetails, null, 2)}</pre>
            </div>
          ) : null}

          {selectedDispatch ? (
            <div className="panel">
              <h3>Dispatch delivery drilldown</h3>
              <p className="muted">Scan: <span className="mono">{selectedDispatch.scanId}</span></p>
              <p className="muted">
                configured: {selectedDispatch.dispatch?.configuredEndpoints ?? 0}, queued: {selectedDispatch.dispatch?.queued ?? 0}, failed: {selectedDispatch.dispatch?.failed ?? 0}
              </p>
              {selectedDispatch.dispatchError ? <p className="errorText">{selectedDispatch.dispatchError}</p> : null}
              <div className="list">
                {selectedDispatch.dispatch?.deliveries.map((delivery) => (
                  <div className="row" key={`${delivery.endpointId}-${delivery.attemptedAt}`}>
                    <span>{delivery.endpointType}</span>
                    <span className={`chip ${delivery.status === "QUEUED" ? "sev-low" : "sev-critical"}`}>{delivery.status}</span>
                    <span className="mono">{delivery.target}</span>
                    <span className="muted">{delivery.error ?? "-"}</span>
                  </div>
                )) ?? <p className="muted">No dispatch deliveries recorded.</p>}
              </div>
              <button
                disabled={loading || (selectedDispatch.dispatch?.failed ?? 0) === 0}
                onClick={async () => {
                  const replayed = await replayScanDispatch(selectedDispatch.scanId);
                  setSelectedDispatch({
                    ...selectedDispatch,
                    dispatch: replayed.dispatch
                  });
                }}
              >
                {loading ? "Working..." : "Replay failed deliveries"}
              </button>
              <pre className="codeBlock">{JSON.stringify(selectedDispatch.replayHistory ?? [], null, 2)}</pre>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
