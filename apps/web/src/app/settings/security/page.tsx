"use client";

import { FormEvent, useMemo, useState } from "react";
import { ConsoleNav } from "../../_components/ConsoleNav";
import { PASSWORD_POLICY_HINT, type AlertEndpointType, useCspmState, validatePasswordPolicyInput } from "../../_lib/cspm";

const endpointTypeOptions: Array<{
  value: AlertEndpointType;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    value: "amazon_s3",
    label: "Amazon S3 Export",
    placeholder: "s3://bucket-name/optional-prefix",
    hint: "Stores scan export delivery tasks for S3 upload."
  },
  {
    value: "aws_security_hub",
    label: "AWS Security Hub",
    placeholder: "us-east-1",
    hint: "Region where Security Hub ingestion should run."
  },
  {
    value: "jira",
    label: "Jira",
    placeholder: "https://company.atlassian.net/rest/api/3/issue",
    hint: "Webhook/API URL for ticket dispatch."
  },
  {
    value: "slack",
    label: "Slack",
    placeholder: "https://hooks.slack.com/services/XXX/YYY/ZZZ",
    hint: "Incoming webhook URL for alert delivery."
  }
];

export default function SecuritySettingsPage() {
  const {
    tenant, tenants, token, changePassword, loading, error, notice, switchTenant,
    alertEndpoints, loadAlertEndpoints, createAlertEndpoint, patchAlertEndpoint, deleteAlertEndpoint
  } = useCspmState();
  const [localError, setLocalError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [endpointType, setEndpointType] = useState<AlertEndpointType>("amazon_s3");
  const targetPlaceholder = useMemo(
    () => endpointTypeOptions.find((item) => item.value === endpointType)?.placeholder ?? "Target",
    [endpointType]
  );
  const targetHint = useMemo(
    () => endpointTypeOptions.find((item) => item.value === endpointType)?.hint ?? "",
    [endpointType]
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLocalError("");
    setLocalNotice("");
    try {
      const fd = new FormData(form);
      const currentPassword = String(fd.get("currentPassword") ?? "");
      const newPassword = String(fd.get("newPassword") ?? "");
      const confirmPassword = String(fd.get("confirmPassword") ?? "");
      if (newPassword !== confirmPassword) throw new Error("New password and confirm password do not match.");
      const passwordError = validatePasswordPolicyInput(newPassword);
      if (passwordError) throw new Error(passwordError);
      await changePassword(currentPassword, newPassword);
      setLocalNotice("Password changed.");
      form.reset();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to change password");
    }
  }

  async function onCreateEndpoint(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLocalError("");
    setLocalNotice("");
    try {
      const fd = new FormData(form);
      await createAlertEndpoint({
        name: String(fd.get("name") ?? "").trim(),
        endpointType: String(fd.get("endpointType") ?? "amazon_s3") as AlertEndpointType,
        target: String(fd.get("target") ?? "").trim(),
        secretRef: String(fd.get("secretRef") ?? "").trim() || undefined
      });
      setLocalNotice("Downstream endpoint created.");
      form.reset();
      setEndpointType("amazon_s3");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create downstream endpoint");
    }
  }

  async function refreshEndpoints() {
    setLocalError("");
    setLocalNotice("");
    try {
      await loadAlertEndpoints();
      setLocalNotice("Downstream endpoints refreshed.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to load downstream endpoints");
    }
  }

  async function toggleEndpoint(endpointId: string, isEnabled: boolean) {
    setLocalError("");
    setLocalNotice("");
    try {
      await patchAlertEndpoint(endpointId, { isEnabled: !isEnabled });
      setLocalNotice("Downstream endpoint updated.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to update downstream endpoint");
    }
  }

  async function removeEndpoint(endpointId: string) {
    setLocalError("");
    setLocalNotice("");
    try {
      await deleteAlertEndpoint(endpointId);
      setLocalNotice("Downstream endpoint deleted.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to delete downstream endpoint");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Security settings</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />

      {error ? <p className="errorText">{error}</p> : null}
      {localError ? <p className="errorText">{localError}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {localNotice ? <p className="muted">{localNotice}</p> : null}

      {!token ? <section className="panel"><p className="muted">Sign in required to change password.</p></section> : null}
      {token && (
        <section className="panel">
          <h2>Change password</h2>
          <form className="grid" onSubmit={onSubmit}>
            <input required type="password" name="currentPassword" placeholder="Current password" />
            <input required type="password" name="newPassword" placeholder="New password" minLength={10} maxLength={128} autoComplete="new-password" />
            <input required type="password" name="confirmPassword" placeholder="Confirm new password" minLength={10} maxLength={128} autoComplete="new-password" />
            <button disabled={loading}>{loading ? "Working..." : "Update password"}</button>
          </form>
          <p className="muted">{PASSWORD_POLICY_HINT}</p>
        </section>
      )}

      {token && tenant ? (
        <section className="panel">
          <h2>Downstream destinations</h2>
          <p className="muted">Configure post-scan dispatch endpoints (S3, Security Hub, Jira, Slack).</p>
          <form className="grid" onSubmit={onCreateEndpoint}>
            <input required name="name" placeholder="Endpoint name" />
            <select name="endpointType" value={endpointType} onChange={(event) => setEndpointType(event.target.value as AlertEndpointType)}>
              {endpointTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input required name="target" placeholder={targetPlaceholder} />
            <input name="secretRef" placeholder="secret://vault/path (optional)" />
            <button disabled={loading}>{loading ? "Working..." : "Add destination"}</button>
          </form>
          <p className="muted">{targetHint}</p>
          <button disabled={loading} onClick={refreshEndpoints}>{loading ? "Working..." : "Refresh destinations"}</button>

          <div className="list" style={{ marginTop: 12 }}>
            {alertEndpoints.map((endpoint) => (
              <div key={endpoint.id} className="row" style={{ gridTemplateColumns: "1.2fr auto auto 1fr auto auto" }}>
                <span>{endpoint.name}</span>
                <span className="chip">{endpoint.endpointType}</span>
                <span className={`chip ${endpoint.isEnabled ? "sev-low" : "sev-critical"}`}>
                  {endpoint.isEnabled ? "ENABLED" : "DISABLED"}
                </span>
                <span className="mono">{endpoint.target}</span>
                <button disabled={loading} onClick={() => toggleEndpoint(endpoint.id, endpoint.isEnabled)}>
                  {endpoint.isEnabled ? "Disable" : "Enable"}
                </button>
                <button disabled={loading} onClick={() => removeEndpoint(endpoint.id)}>Delete</button>
              </div>
            ))}
            {alertEndpoints.length === 0 ? <p className="muted">No downstream destinations configured yet.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
