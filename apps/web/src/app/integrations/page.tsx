"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { ConsoleNav } from "../_components/ConsoleNav";
import {
  providerFields,
  providerNotes,
  useCspmState,
  type AwsConnectionTestResult,
  type Integration,
  type Provider,
  type ScanProfileInput
} from "../_lib/cspm";

const SEVERITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
type SecretEntryMode = "reference" | "paste";
type ProfileOptionValueKey = "checks" | "services" | "categories" | "excludedChecks" | "excludedServices" | "regions";

type ScanProfileDraft = {
  framework: string;
  compliance: string;
  checks: string;
  services: string;
  categories: string;
  excludedChecks: string;
  excludedServices: string;
  regions: string;
  severityThreshold: "" | (typeof SEVERITY_OPTIONS)[number];
};

const emptyProfileDraft: ScanProfileDraft = {
  framework: "",
  compliance: "",
  checks: "",
  services: "",
  categories: "",
  excludedChecks: "",
  excludedServices: "",
  regions: "",
  severityThreshold: ""
};

const defaultProfileOptions: Record<Provider, string[]> = {
  AWS: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
  AZURE: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
  GCP: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
  KUBERNETES: ["framework", "severityThreshold", "checks", "categories"],
  M365: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "severityThreshold"],
  GITHUB: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
  MONGODBATLAS: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
  ORACLECLOUD: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
  ALIBABACLOUD: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
  CLOUDFLARE: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
  OPENSTACK: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"]
};

function integrationScopeSummary(integration: Integration): string {
  if (integration.provider !== "AWS") return "Scope: provider integration";
  const cfg = integration.config ?? {};
  const accountId = typeof cfg.accountId === "string" ? cfg.accountId : "";
  const accountIds = Array.isArray(cfg.accountIds) ? cfg.accountIds.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
  if (accountIds.length > 0) return `Scope: multi-account (${accountIds.length} accounts)`;
  if (accountId) return `Scope: single-account (${accountId})`;
  return "Scope: AWS (account not specified)";
}

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function handleMultiSelectCsvChange(
  event: ChangeEvent<HTMLSelectElement>,
  update: (nextCsv: string) => void
) {
  const values = Array.from(event.target.selectedOptions, (option) => option.value.trim()).filter(Boolean);
  update(values.join(","));
}

function providerOptionValuesForField(
  optionValues: Partial<Record<ProfileOptionValueKey, string[]>> | undefined,
  field: ProfileOptionValueKey
) {
  if (!optionValues) return [];
  if (field === "excludedChecks") return optionValues.excludedChecks ?? optionValues.checks ?? [];
  if (field === "excludedServices") return optionValues.excludedServices ?? optionValues.services ?? [];
  return optionValues[field] ?? [];
}

function toProvider(value: string): Provider | null {
  if (
    value === "AWS" ||
    value === "AZURE" ||
    value === "GCP" ||
    value === "KUBERNETES" ||
    value === "M365" ||
    value === "GITHUB" ||
    value === "MONGODBATLAS" ||
    value === "ORACLECLOUD" ||
    value === "ALIBABACLOUD" ||
    value === "CLOUDFLARE" ||
    value === "OPENSTACK"
  ) {
    return value;
  }
  return null;
}

function isSecretRefField(fieldName: string) {
  return /ref$/i.test(fieldName);
}

function secretModeStateKey(provider: Provider, fieldName: string) {
  return `${provider}:${fieldName}`;
}

function fieldInputType(fieldName: string, mode: SecretEntryMode) {
  if (mode === "paste" && /(secret|password|token)/i.test(fieldName) && !/json/i.test(fieldName)) return "password";
  return "text";
}

function profileFromDraft(draft: ScanProfileDraft, options: string[]): ScanProfileInput | undefined {
  const profile: ScanProfileInput = {};

  if (options.includes("compliance")) {
    const values = parseCsvList(draft.compliance);
    if (values.length > 0) profile.compliance = values;
  }
  if (options.includes("checks")) {
    const values = parseCsvList(draft.checks);
    if (values.length > 0) profile.checks = values;
  }
  if (options.includes("services")) {
    const values = parseCsvList(draft.services);
    if (values.length > 0) profile.services = values;
  }
  if (options.includes("categories")) {
    const values = parseCsvList(draft.categories);
    if (values.length > 0) profile.categories = values;
  }
  if (options.includes("excludedChecks")) {
    const values = parseCsvList(draft.excludedChecks);
    if (values.length > 0) profile.excludedChecks = values;
  }
  if (options.includes("excludedServices")) {
    const values = parseCsvList(draft.excludedServices);
    if (values.length > 0) profile.excludedServices = values;
  }
  if (options.includes("regions")) {
    const values = parseCsvList(draft.regions);
    if (values.length > 0) profile.regions = values;
  }
  if (options.includes("severityThreshold") && draft.severityThreshold) {
    profile.severityThreshold = draft.severityThreshold;
  }

  return Object.keys(profile).length > 0 ? profile : undefined;
}

function draftFromSavedProfile(saved: { framework?: string; profile?: ScanProfileInput } | null | undefined): ScanProfileDraft {
  const profile = saved?.profile;
  return {
    framework: saved?.framework ?? "",
    compliance: profile?.compliance?.join(",") ?? "",
    checks: profile?.checks?.join(",") ?? "",
    services: profile?.services?.join(",") ?? "",
    categories: profile?.categories?.join(",") ?? "",
    excludedChecks: profile?.excludedChecks?.join(",") ?? "",
    excludedServices: profile?.excludedServices?.join(",") ?? "",
    regions: profile?.regions?.join(",") ?? "",
    severityThreshold: profile?.severityThreshold ?? ""
  };
}

function isDraftEmpty(draft: ScanProfileDraft) {
  return (
    !draft.framework.trim() &&
    !draft.compliance.trim() &&
    !draft.checks.trim() &&
    !draft.services.trim() &&
    !draft.categories.trim() &&
    !draft.excludedChecks.trim() &&
    !draft.excludedServices.trim() &&
    !draft.regions.trim() &&
    !draft.severityThreshold
  );
}

function summarizeSavedProfile(saved: { framework?: string; profile?: ScanProfileInput } | null | undefined) {
  if (!saved) return "No saved default profile for this provider.";
  const parts: string[] = [];
  if (saved.framework) parts.push(`framework=${saved.framework}`);
  if (saved.profile?.compliance?.length) parts.push(`compliance=${saved.profile.compliance.join(",")}`);
  if (saved.profile?.severityThreshold) parts.push(`severity>=${saved.profile.severityThreshold}`);
  if (saved.profile?.regions?.length) parts.push(`regions=${saved.profile.regions.join(",")}`);
  if (saved.profile?.checks?.length) parts.push(`checks=${saved.profile.checks.length}`);
  if (saved.profile?.services?.length) parts.push(`services=${saved.profile.services.length}`);
  if (saved.profile?.categories?.length) parts.push(`categories=${saved.profile.categories.length}`);
  if (saved.profile?.excludedChecks?.length) parts.push(`excludedChecks=${saved.profile.excludedChecks.length}`);
  if (saved.profile?.excludedServices?.length) parts.push(`excludedServices=${saved.profile.excludedServices.length}`);
  return parts.length > 0 ? parts.join(" | ") : "Saved default exists (empty summary).";
}

export default function IntegrationsPage() {
  const {
    token, tenant, tenants, provider, setProvider, loading, error, notice,
    integrations, createIntegration, queueScan, testAwsConnection, awsVerificationToken, switchTenant, canManageTenant,
    awsFirstMode, availableProviders, providerCatalog, providerCapabilities, tenantScanProfiles,
    saveTenantScanProfileDefault, deleteTenantScanProfileDefault
  } = useCspmState();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [testResults, setTestResults] = useState<AwsConnectionTestResult[]>([]);
  const [scanProfile, setScanProfile] = useState<ScanProfileDraft>(emptyProfileDraft);
  const [secretEntryModes, setSecretEntryModes] = useState<Record<string, SecretEntryMode>>({});

  const selectedCatalog = providerCatalog[provider];
  const selectedCapability = providerCapabilities.find((entry) => entry.provider === provider);
  const selectedProfileOptions = selectedCapability?.profileOptions ?? selectedCatalog?.profileOptions ?? defaultProfileOptions[provider];
  const selectedFrameworks = selectedCapability?.frameworks ?? selectedCatalog?.frameworks ?? [];
  const selectedProfileValueOptions = selectedCapability?.optionValues ?? selectedCatalog?.optionValues ?? {};
  const savedScanProfile = tenantScanProfiles[provider];

  async function testConnection() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    const accountId = String(fd.get("accountId") ?? "").trim();
    const accountIdsRaw = String(fd.get("accountIds") ?? "").trim();
    const accountIds = accountIdsRaw ? accountIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : [];
    const roleArn = String(fd.get("roleArn") ?? "").trim();
    const externalId = String(fd.get("externalId") ?? "").trim();

    const result = await testAwsConnection({
      accountId: accountId || undefined,
      accountIds: accountIds.length ? accountIds : undefined,
      roleArn,
      externalId: externalId || undefined
    });

    setTestResults(result.results ?? []);
  }

  async function queueIntegrationScan(integration: Integration) {
    const integrationProvider = toProvider(integration.provider);
    if (!integrationProvider) {
      await queueScan(integration.id);
      return;
    }
    const capability = providerCapabilities.find((entry) => entry.provider === integrationProvider);
    const catalog = providerCatalog[integrationProvider];
    const options = capability?.profileOptions ?? catalog?.profileOptions ?? defaultProfileOptions[integrationProvider];
    const frameworks = capability?.frameworks ?? catalog?.frameworks ?? [];
    const framework = scanProfile.framework.trim() || frameworks[0];
    const profile = profileFromDraft(scanProfile, options);
    await queueScan(integration.id, { framework: framework || undefined, profile });
  }

  async function saveTenantDefaultProfile() {
    const profile = profileFromDraft(scanProfile, selectedProfileOptions);
    await saveTenantScanProfileDefault({
      provider,
      framework: scanProfile.framework.trim() || undefined,
      profile
    });
  }

  function loadTenantDefaultProfileIntoEditor() {
    setScanProfile(draftFromSavedProfile(savedScanProfile));
  }

  async function deleteTenantDefaultProfile() {
    await deleteTenantScanProfileDefault(provider);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Integrations</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />

      {error ? <p className="errorText">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {!token ? <section className="panel"><p className="muted">Create an account on Overview first.</p></section> : null}

      {token && (
        <>
          <section className="panel">
            <div className="sectionHead">
              <h2>Add integration</h2>
              <span className="muted">{awsFirstMode ? "AWS-first production workflow" : "Multi-cloud production workflow"}</span>
            </div>
            <div className="hintBox">
              <p className="hintTitle">Prerequisites</p>
              {providerNotes[provider].map((note) => <p key={note} className="checkItem">- {note}</p>)}
              {awsFirstMode && <p className="checkItem">- AWS-first mode active.</p>}
              <p className="checkItem">- Connection verification: {awsVerificationToken ? "Verified" : "Not verified"}</p>
              <p className="checkItem">- Role access: {canManageTenant ? "Can manage integrations" : "Read-only (switch to OWNER/ADMIN scope)"}</p>
              <p className="checkItem">- Secret fields support: paste secret values (stored encrypted at rest) or provide secret references.</p>
              <p className="checkItem">- Transport encryption requires HTTPS/TLS in deployed environments.</p>
            </div>

            <form ref={formRef} className="grid" onSubmit={createIntegration}>
              <input required name="name" placeholder="Production integration" />
              <select name="provider" value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                {availableProviders.map((providerOption) => (
                  <option key={providerOption} value={providerOption}>{providerOption}</option>
                ))}
              </select>
              {providerFields[provider].map((field) => {
                const secretField = isSecretRefField(field.name);
                const secretModeKey = secretModeStateKey(provider, field.name);
                const secretMode = secretEntryModes[secretModeKey] ?? "reference";
                const inputId = `integration-${field.name}`;
                const modeSelectId = `${inputId}-mode`;
                const isJsonSecretField = /jsonref$/i.test(field.name);
                const displayLabel = secretField
                  ? (secretMode === "paste" ? field.label.replace(/reference/i, "value") : field.label)
                  : field.label;
                const placeholder = secretField
                  ? (secretMode === "paste"
                    ? (isJsonSecretField ? "Paste secret JSON value (stored encrypted at rest)" : "Paste secret value (stored encrypted at rest)")
                    : field.placeholder)
                  : field.placeholder;

                return (
                  <div key={field.name} className="fieldGroup">
                    <label className="fieldLabel" htmlFor={inputId}>{displayLabel}</label>
                    {secretField ? (
                      <div className="secretModeRow">
                        <label className="fieldLabel muted" htmlFor={modeSelectId}>Entry mode</label>
                        <select
                          id={modeSelectId}
                          className="secretModeSelect"
                          value={secretMode}
                          onChange={(event) =>
                            setSecretEntryModes((current) => ({
                              ...current,
                              [secretModeKey]: event.target.value as SecretEntryMode
                            }))
                          }
                        >
                          <option value="reference">Use Reference</option>
                          <option value="paste">Paste Secret</option>
                        </select>
                      </div>
                    ) : null}

                    {secretField && isJsonSecretField && secretMode === "paste" ? (
                      <textarea
                        id={inputId}
                        name={field.name}
                        required={Boolean(field.required)}
                        placeholder={placeholder}
                        rows={5}
                        className="secretTextarea"
                        autoComplete="off"
                      />
                    ) : (
                      <input
                        id={inputId}
                        name={field.name}
                        required={Boolean(field.required)}
                        placeholder={placeholder}
                        type={secretField ? fieldInputType(field.name, secretMode) : "text"}
                        autoComplete={secretField ? "off" : undefined}
                      />
                    )}

                    {secretField ? (
                      <p className="fieldHelp muted">
                        {secretMode === "paste"
                          ? "Pasted values are encrypted before database storage, redacted in API/UI responses after save, and must be re-entered to rotate/update."
                          : "Reference mode stores a secret pointer/URI (for example secret manager path or cloud secret ARN/URI)."}
                      </p>
                    ) : field.help ? (
                      <p className="fieldHelp muted">{field.help}</p>
                    ) : null}
                  </div>
                );
              })}
              <button disabled={loading || !canManageTenant}>{loading ? "Working..." : "Add integration"}</button>
              {provider === "AWS" ? (
                <button type="button" disabled={loading || !canManageTenant} onClick={testConnection}>
                  {loading ? "Working..." : "Test AWS connection"}
                </button>
              ) : null}
            </form>

            {testResults.length > 0 ? (
              <div className="hintBox">
                <p className="hintTitle">AWS connection test results</p>
                {testResults.map((result) => (
                  <p key={`${result.accountId}-${result.roleArn}`} className="checkItem">
                    - {result.accountId}: {result.ok ? "OK" : `FAILED (${result.error ?? "unknown error"})`}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="sectionHead">
              <h2>Provider runtime capabilities</h2>
              <span className="muted">Tenant-level scan eligibility and supported profile controls.</span>
            </div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Provider</th><th>Runtime</th><th>Active integrations</th><th>Queue scans</th><th>Frameworks</th><th>Profile options</th><th>Last scan</th></tr></thead>
                <tbody>
                  {providerCapabilities.map((item) => (
                    <tr key={item.provider}>
                      <td>{item.provider}</td>
                      <td>{item.enabledByRuntimePolicy ? "enabled" : "disabled"}</td>
                      <td>{item.integrationCount}</td>
                      <td>{item.canQueueScans ? "yes" : "no"}</td>
                      <td>{item.frameworks.join(", ") || "n/a"}</td>
                      <td>{item.profileOptions.join(", ") || "n/a"}</td>
                      <td>
                        {item.lastScanStatus ?? "n/a"}
                        {item.lastScanAt ? ` (${new Date(item.lastScanAt).toLocaleDateString()})` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="sectionHead">
              <h2>Tenant scan profile</h2>
              <span className="muted">These controls are applied when you click Queue scan.</span>
            </div>
            <div className="hintBox">
              <p className="hintTitle">Current provider defaults</p>
              <p className="checkItem">- Selected provider: {provider}</p>
              <p className="checkItem">- Framework choices: {selectedFrameworks.join(", ") || "scanner defaults"}</p>
              <p className="checkItem">- Supported profile options: {selectedProfileOptions.join(", ")}</p>
              <p className="checkItem">- Saved tenant default: {summarizeSavedProfile(savedScanProfile)}</p>
              <p className="checkItem">- Queue scan uses saved tenant default automatically when local editor values are left blank.</p>
            </div>
            <form className="grid" onSubmit={(event) => event.preventDefault()}>
              <div className="fieldGroup">
                <label className="fieldLabel" htmlFor="scan-framework">Framework override (optional)</label>
                {selectedFrameworks.length > 0 ? (
                  <select
                    id="scan-framework"
                    name="scan-framework"
                    value={scanProfile.framework}
                    onChange={(event) => setScanProfile((current) => ({ ...current, framework: event.target.value }))}
                  >
                    <option value="">Scanner default ({selectedFrameworks[0]})</option>
                    {selectedFrameworks.map((framework) => (
                      <option key={framework} value={framework}>{framework}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="scan-framework"
                    name="scan-framework"
                    placeholder="CIS"
                    value={scanProfile.framework}
                    onChange={(event) => setScanProfile((current) => ({ ...current, framework: event.target.value }))}
                  />
                )}
              </div>

              {selectedProfileOptions.includes("compliance") ? (
                <div className="fieldGroup">
                  <label className="fieldLabel" htmlFor="scan-compliance">
                    Compliance frameworks {selectedFrameworks.length > 0 ? "(multi-select)" : "(CSV)"}
                  </label>
                  {selectedFrameworks.length > 0 ? (
                    <>
                      <select
                        id="scan-compliance"
                        name="scan-compliance"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.compliance)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, compliance: nextCsv }))
                          )
                        }
                      >
                        {selectedFrameworks.map((framework) => (
                          <option key={framework} value={framework}>{framework}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Use Cmd/Ctrl-click to select multiple frameworks.</p>
                    </>
                  ) : (
                    <input
                      id="scan-compliance"
                      name="scan-compliance"
                      placeholder="cis_1.5_aws,nist_800_53"
                      value={scanProfile.compliance}
                      onChange={(event) => setScanProfile((current) => ({ ...current, compliance: event.target.value }))}
                    />
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("checks") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "checks").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-checks">Checks (multi-select)</label>
                      <select
                        id="scan-checks"
                        name="scan-checks"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.checks)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, checks: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "checks").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider options. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-checks">Checks (CSV)</label>
                      <input
                        id="scan-checks"
                        name="scan-checks"
                        placeholder="check1,check2"
                        value={scanProfile.checks}
                        onChange={(event) => setScanProfile((current) => ({ ...current, checks: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("services") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "services").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-services">Services (multi-select)</label>
                      <select
                        id="scan-services"
                        name="scan-services"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.services)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, services: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "services").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider options. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-services">Services (CSV)</label>
                      <input
                        id="scan-services"
                        name="scan-services"
                        placeholder="ec2,iam,s3"
                        value={scanProfile.services}
                        onChange={(event) => setScanProfile((current) => ({ ...current, services: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("categories") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "categories").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-categories">Categories (multi-select)</label>
                      <select
                        id="scan-categories"
                        name="scan-categories"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.categories)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, categories: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "categories").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider options. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-categories">Categories (CSV)</label>
                      <input
                        id="scan-categories"
                        name="scan-categories"
                        placeholder="identity,encryption,networking"
                        value={scanProfile.categories}
                        onChange={(event) => setScanProfile((current) => ({ ...current, categories: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("excludedChecks") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "excludedChecks").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-excluded-checks">Excluded checks (multi-select)</label>
                      <select
                        id="scan-excluded-checks"
                        name="scan-excluded-checks"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.excludedChecks)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, excludedChecks: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "excludedChecks").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider options. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-excluded-checks">Excluded checks (CSV)</label>
                      <input
                        id="scan-excluded-checks"
                        name="scan-excluded-checks"
                        placeholder="check_to_skip"
                        value={scanProfile.excludedChecks}
                        onChange={(event) => setScanProfile((current) => ({ ...current, excludedChecks: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("excludedServices") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "excludedServices").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-excluded-services">Excluded services (multi-select)</label>
                      <select
                        id="scan-excluded-services"
                        name="scan-excluded-services"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.excludedServices)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, excludedServices: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "excludedServices").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider options. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-excluded-services">Excluded services (CSV)</label>
                      <input
                        id="scan-excluded-services"
                        name="scan-excluded-services"
                        placeholder="service_to_skip"
                        value={scanProfile.excludedServices}
                        onChange={(event) => setScanProfile((current) => ({ ...current, excludedServices: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("regions") ? (
                <div className="fieldGroup">
                  {providerOptionValuesForField(selectedProfileValueOptions, "regions").length > 0 ? (
                    <>
                      <label className="fieldLabel" htmlFor="scan-regions">Regions (multi-select)</label>
                      <select
                        id="scan-regions"
                        name="scan-regions"
                        multiple
                        className="multiSelect"
                        value={parseCsvList(scanProfile.regions)}
                        onChange={(event) =>
                          handleMultiSelectCsvChange(event, (nextCsv) =>
                            setScanProfile((current) => ({ ...current, regions: nextCsv }))
                          )
                        }
                      >
                        {providerOptionValuesForField(selectedProfileValueOptions, "regions").map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <p className="fieldHelp muted">Curated provider region list. Use Cmd/Ctrl-click for multiple selections.</p>
                    </>
                  ) : (
                    <>
                      <label className="fieldLabel" htmlFor="scan-regions">Regions (CSV)</label>
                      <input
                        id="scan-regions"
                        name="scan-regions"
                        placeholder="us-east-1,us-west-2"
                        value={scanProfile.regions}
                        onChange={(event) => setScanProfile((current) => ({ ...current, regions: event.target.value }))}
                      />
                    </>
                  )}
                </div>
              ) : null}

              {selectedProfileOptions.includes("severityThreshold") ? (
                <div className="fieldGroup">
                  <label className="fieldLabel" htmlFor="scan-severity-threshold">Severity threshold</label>
                  <select
                    id="scan-severity-threshold"
                    name="scan-severity-threshold"
                    value={scanProfile.severityThreshold}
                    onChange={(event) => setScanProfile((current) => ({
                      ...current,
                      severityThreshold: event.target.value as ScanProfileDraft["severityThreshold"]
                    }))}
                  >
                    <option value="">None</option>
                    {SEVERITY_OPTIONS.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="fieldGroup">
                <p className="fieldHelp muted">
                  Advanced filters use curated provider option lists when available and fall back to CSV when no catalog is available yet.
                </p>
              </div>

              <button type="button" disabled={loading || !canManageTenant} onClick={saveTenantDefaultProfile}>
                {loading ? "Working..." : `Save ${provider} default profile`}
              </button>
              <button type="button" disabled={loading || !savedScanProfile} onClick={loadTenantDefaultProfileIntoEditor}>
                Load saved default into editor
              </button>
              <button type="button" disabled={loading} onClick={() => setScanProfile(emptyProfileDraft)}>
                Clear profile
              </button>
              <button type="button" disabled={loading || !canManageTenant || !savedScanProfile} onClick={deleteTenantDefaultProfile}>
                Delete saved default
              </button>
            </form>
            {!isDraftEmpty(scanProfile) ? (
              <p className="muted">Local editor values will override saved defaults for this queue action.</p>
            ) : null}
          </section>

          <section className="panel">
            <h2>Saved integrations</h2>
            <div className="list">
              {integrations.map((i) => (
                <div key={i.id} className="row">
                  <span>
                    <span className="mono">{i.name}</span>
                    <br />
                    <span className="muted">{integrationScopeSummary(i)}</span>
                  </span>
                  <span className="chip">{i.provider}</span>
                  <button disabled={loading || !canManageTenant} onClick={() => queueIntegrationScan(i)}>Queue scan</button>
                </div>
              ))}
              {integrations.length === 0 ? <p className="muted">No integrations yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
