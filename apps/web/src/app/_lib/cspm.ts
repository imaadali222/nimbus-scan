"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type Provider =
  | "AWS"
  | "AZURE"
  | "GCP"
  | "KUBERNETES"
  | "M365"
  | "GITHUB"
  | "MONGODBATLAS"
  | "ORACLECLOUD"
  | "ALIBABACLOUD"
  | "CLOUDFLARE"
  | "OPENSTACK";
const ALL_PROVIDERS: Provider[] = [
  "AWS",
  "AZURE",
  "GCP",
  "KUBERNETES",
  "M365",
  "GITHUB",
  "MONGODBATLAS",
  "ORACLECLOUD",
  "ALIBABACLOUD",
  "CLOUDFLARE",
  "OPENSTACK"
];
export type Tenant = { id: string; name: string; slug: string; role: string; via?: string };
export type SubCustomer = { id: string; name: string; slug: string; role: string; via?: string };
export type TenantUser = { id: string; email: string; role: string; createdAt?: string };
export type TenantHierarchyNode = { id: string; name: string; slug: string };
export type TenantHierarchyLink = { parentTenantId: string; childTenantId: string };
export type Integration = { id: string; name: string; provider: string; isActive: boolean; config?: Record<string, unknown> };
export type ManagedIntegration = Integration & {
  tenant: { id: string; name: string; slug: string };
  access: { role: string | null; via: string | null };
  canManage: boolean;
};
export type AlertEndpointType = "amazon_s3" | "aws_security_hub" | "jira" | "slack";
export type AlertEndpoint = {
  id: string;
  tenantId: string;
  name: string;
  endpointType: AlertEndpointType;
  target: string;
  secretRef?: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AwsConnectionTestResult = {
  accountId: string;
  ok: boolean;
  roleArn: string;
  error?: string;
};

export type ScannerPreflightCheck = {
  name: string;
  ok: boolean;
  output: string;
};
export type Scan = {
  id: string;
  status: string;
  provider: string;
  framework?: string | null;
  createdAt: string;
  errorMessage?: string | null;
  metadataJson?: string | null;
};
export type ScanDispatchDelivery = {
  endpointId: string;
  endpointType: AlertEndpointType;
  target: string;
  status: "QUEUED" | "FAILED";
  attemptedAt: string;
  outboxPath: string | null;
  error: string | null;
};
export type ScanDispatchSummary = {
  configuredEndpoints: number;
  queued: number;
  failed: number;
  deliveries: ScanDispatchDelivery[];
  updatedAt: string;
};
export type WorkerEvent = {
  scanId: string;
  status: string;
  provider: string;
  framework?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  worker: {
    state?: string | null;
    attempt?: number | null;
    maxRetries?: number | null;
    failureCategory?: string | null;
    retryable?: boolean | null;
    lastError?: string | null;
    updatedAt?: string | null;
    claim?: { at?: string | null; by?: string | null; runtime?: string | null } | null;
  };
};
export type ScanWorkerMetadata = {
  scan: {
    id: string;
    tenantId: string;
    provider: string;
    framework?: string | null;
    status: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
  worker: Record<string, unknown> | null;
  dispatch: ScanDispatchSummary | null;
  dispatchError: string | null;
  runtime: string | null;
  failure: {
    error: string | null;
    failedAt: string | null;
  };
};
export type ScanDispatchState = {
  scanId: string;
  status: string;
  dispatch: ScanDispatchSummary | null;
  dispatchError: string | null;
  replayHistory: Array<{ at?: string; by?: string | null; replayed?: number; failed?: number }>;
};
export type ScanProfileInput = {
  compliance?: string[];
  checks?: string[];
  services?: string[];
  categories?: string[];
  excludedChecks?: string[];
  excludedServices?: string[];
  regions?: string[];
  severityThreshold?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
};
export type Finding = { id: string; title: string; severity: string; provider: string; framework: string; resourceId: string; riskScore?: number };
export type ComplianceFrame = { framework: string; total: number; open: number; critical: number };
export type Asset = { id: string; provider: string; externalId: string; assetType: string; criticality: number; lastSeenAt: string };
export type ExecutiveSummary = { summary: { findingsCount: number; scansCount: number; openCritical: number; assetsCount: number }; topRisks: Array<{ id: string; title: string; provider: string; riskScore: number; resourceId: string }> };
export type PostureDashboard = {
  summary: {
    findingsCount: number;
    openFindings: number;
    openCritical: number;
    assetsCount: number;
    scansCount: number;
    scanStatus: { QUEUED: number; RUNNING: number; COMPLETED: number; FAILED: number };
  };
  severity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number };
  openSeverity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; INFO: number };
  providerStats: Array<{
    provider: Provider;
    findings: number;
    openFindings: number;
    criticalOpen: number;
    assets: number;
    lastScanStatus: string | null;
    lastScanAt: string | null;
  }>;
  frameworkStats: Array<{ framework: string; total: number; open: number; critical: number }>;
  watchlists: {
    frameworks: Array<{ framework: string; total: number; open: number; critical: number }>;
    services: Array<{ service: string; total: number; open: number; criticalOpen: number }>;
  };
  recentScans: Array<{ date: string; total: number; queued: number; running: number; completed: number; failed: number }>;
  recentFindings: Array<{ date: string; total: number; critical: number; high: number; medium: number; low: number; info: number }>;
  riskPipeline: {
    criticalOpen: number;
    highOpen: number;
    mediumOpen: number;
    lowOpen: number;
    infoOpen: number;
    closedFindings: number;
  };
};
export type ProviderCapability = {
  provider: Provider;
  enabledByRuntimePolicy: boolean;
  integrationCount: number;
  canQueueScans: boolean;
  profileOptions: string[];
  frameworks: string[];
  optionValues?: Partial<Record<"checks" | "services" | "categories" | "excludedChecks" | "excludedServices" | "regions", string[]>>;
  lastScanStatus: string | null;
  lastScanAt: string | null;
};
export type ProviderCatalogEntry = {
  provider: Provider;
  fields?: string[];
  profileOptions?: string[];
  frameworks?: string[];
  optionValues?: Partial<Record<"checks" | "services" | "categories" | "excludedChecks" | "excludedServices" | "regions", string[]>>;
};
export type ProviderCapabilityPreview = {
  source: {
    filePath: string;
    exists: boolean;
    parseError: string | null;
  };
  providers: Array<{
    provider: Provider;
    profileOptions: string[];
    frameworks: string[];
    optionValues?: Partial<Record<"checks" | "services" | "categories" | "excludedChecks" | "excludedServices" | "regions", string[]>>;
    overrideApplied: boolean;
  }>;
};
export type TenantScanProfileDefault = {
  provider: Provider;
  framework?: string;
  profile?: ScanProfileInput;
  updatedAt?: string;
};

export type ProviderField = {
  name: string;
  label: string;
  placeholder: string;
  required?: boolean;
  help?: string;
  transform?: (value: string) => unknown;
};

export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const sessionApiPath = "/api/session";
const proxyApiPrefix = "/api/proxy";
const publicProxyApiPrefix = "/api/public";
const SLUG_REGEX = /^[a-z0-9-]+$/;

type ProvidersCatalog = {
  awsFirstMode: boolean;
  providers: ProviderCatalogEntry[];
};

export const providerFields: Record<Provider, ProviderField[]> = {
  AWS: [
    { name: "accountId", label: "AWS account ID (single-account)", placeholder: "123456789012" },
    {
      name: "accountIds",
      label: "AWS account IDs (multi-account CSV)",
      placeholder: "111111111111,222222222222",
      help: "Use this for multi-account onboarding. Leave single-account field empty if using this.",
      transform: (value) => value.split(",").map((part) => part.trim()).filter(Boolean)
    },
    {
      name: "roleArn",
      label: "Read-only IAM role ARN",
      placeholder: "arn:aws:iam::123456789012:role/CSPMReadOnly",
      required: true,
      help: "Role trusted by your CSPM scanner account/user."
    },
    { name: "externalId", label: "External ID (optional)", placeholder: "cspm-external-id" },
    {
      name: "regions",
      label: "Regions (optional CSV)",
      placeholder: "us-east-1,us-west-2",
      transform: (value) => value.split(",").map((part) => part.trim()).filter(Boolean)
    }
  ],
  AZURE: [
    { name: "tenantId", label: "Azure tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    { name: "subscriptionId", label: "Azure subscription ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    { name: "clientId", label: "App registration client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    {
      name: "clientSecretRef",
      label: "Client secret reference",
      placeholder: "secret://kv/cspm/azure-client-secret",
      required: true,
      help: "Use a secret manager reference. Do not paste raw secrets."
    }
  ],
  GCP: [
    { name: "projectId", label: "GCP project ID", placeholder: "my-project-id", required: true },
    {
      name: "serviceAccountJsonRef",
      label: "Service account JSON reference",
      placeholder: "secret://sm/cspm/gcp-service-account-json",
      required: true,
      help: "Use a secret manager reference to the service account credential."
    }
  ],
  KUBERNETES: [
    { name: "clusterName", label: "Cluster name", placeholder: "prod-cluster-us-east", required: true },
    { name: "kubeconfigPath", label: "kubeconfig path", placeholder: "/etc/cspm/kubeconfigs/prod.yaml", required: true },
    { name: "context", label: "kube context", placeholder: "prod-context", required: true }
  ],
  M365: [
    { name: "tenantId", label: "M365 tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    { name: "clientId", label: "App registration client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", required: true },
    {
      name: "clientSecretRef",
      label: "Client secret reference",
      placeholder: "secret://kv/cspm/m365-client-secret",
      required: true,
      help: "Use secret manager references only."
    }
  ],
  GITHUB: [
    { name: "organization", label: "GitHub organization (optional)", placeholder: "my-org" },
    {
      name: "tokenRef",
      label: "Personal access token reference",
      placeholder: "secret://sm/cspm/github-token",
      required: true
    }
  ],
  MONGODBATLAS: [
    { name: "organizationId", label: "MongoDB Atlas organization ID", placeholder: "5f43a9xxxxxxxxxxxxxxx", required: true },
    { name: "publicKeyRef", label: "Public key reference", placeholder: "secret://sm/cspm/mdb-public-key", required: true },
    { name: "privateKeyRef", label: "Private key reference", placeholder: "secret://sm/cspm/mdb-private-key", required: true }
  ],
  ORACLECLOUD: [
    { name: "tenancyId", label: "OCI tenancy OCID", placeholder: "ocid1.tenancy.oc1..xxxx", required: true },
    { name: "userId", label: "OCI user OCID", placeholder: "ocid1.user.oc1..xxxx", required: true },
    { name: "fingerprint", label: "API key fingerprint", placeholder: "12:34:56:78:90:ab:cd:ef", required: true },
    { name: "privateKeyRef", label: "Private key reference", placeholder: "secret://sm/cspm/oci-private-key", required: true },
    { name: "region", label: "Region (optional)", placeholder: "us-ashburn-1" }
  ],
  ALIBABACLOUD: [
    { name: "accountId", label: "Alibaba account ID (optional)", placeholder: "1234567890" },
    { name: "accessKeyIdRef", label: "Access key ID reference", placeholder: "secret://sm/cspm/ali-akid", required: true },
    { name: "accessKeySecretRef", label: "Access key secret reference", placeholder: "secret://sm/cspm/ali-secret", required: true },
    { name: "region", label: "Region (optional)", placeholder: "cn-hangzhou" }
  ],
  CLOUDFLARE: [
    { name: "accountId", label: "Cloudflare account ID", placeholder: "023e105f4ecef8ad9ca31a8372d0c353", required: true },
    { name: "apiTokenRef", label: "API token reference", placeholder: "secret://sm/cspm/cloudflare-token", required: true }
  ],
  OPENSTACK: [
    { name: "authUrl", label: "OpenStack auth URL", placeholder: "https://keystone.example.com/v3", required: true },
    { name: "username", label: "OpenStack username", placeholder: "cspm-user", required: true },
    { name: "passwordRef", label: "Password reference", placeholder: "secret://sm/cspm/openstack-password", required: true },
    { name: "projectName", label: "Project name", placeholder: "security", required: true },
    { name: "domainName", label: "Domain name (optional)", placeholder: "default" }
  ]
};

export const providerNotes: Record<Provider, string[]> = {
  AWS: [
    "Single account: provide one account ID + role ARN.",
    "Multi-account: provide account IDs CSV + role ARN pattern trusted in each account.",
    "Attach SecurityAudit (quick start) or equivalent least-privilege policy.",
    "Install and configure Prowler on the worker host."
  ],
  AZURE: [
    "Create Entra app registration and service principal.",
    "Grant Reader (or least-privilege equivalent) at subscription scope.",
    "Store secret in vault and pass secret reference only.",
    "Prowler runtime on worker must include Azure provider support."
  ],
  GCP: [
    "Create service account with security-viewer permissions.",
    "Store service account JSON in Secret Manager and reference it.",
    "Prowler runtime on worker must include GCP provider support."
  ],
  KUBERNETES: [
    "Provide read-only cluster credentials and context.",
    "Ensure kubeconfig path is readable by worker runtime.",
    "Install Kubescape on worker host (or container runtime image)."
  ],
  M365: [
    "Create Microsoft Entra app registration with required Graph read permissions.",
    "Grant admin consent where required by policy.",
    "Store client secret in secret manager and provide only reference."
  ],
  GITHUB: [
    "Create fine-grained token with read-only security scopes.",
    "Use organization-restricted token where possible.",
    "Store token in secret manager and provide only reference."
  ],
  MONGODBATLAS: [
    "Create Atlas API keys with read-only org/project permissions.",
    "Store public/private key refs in secret manager.",
    "Validate organization scope before scan scheduling."
  ],
  ORACLECLOUD: [
    "Create OCI user/API key with read-only audit/security permissions.",
    "Store private key in secret manager and provide fingerprint + key reference.",
    "Validate region and tenancy IDs before onboarding."
  ],
  ALIBABACLOUD: [
    "Create RAM user with read-only security permissions.",
    "Store access key refs in secret manager and avoid plaintext credentials.",
    "Use least-privilege policies and scoped account access."
  ],
  CLOUDFLARE: [
    "Create scoped API token with read-only security posture permissions.",
    "Bind token to account-level scope where possible.",
    "Store token in secret manager."
  ],
  OPENSTACK: [
    "Create read-only service user for security posture collection.",
    "Validate Keystone auth URL and project scope.",
    "Store password in secret manager and pass reference only."
  ]
};

function emptyProviderCatalog(): Record<Provider, ProviderCatalogEntry> {
  const out = {} as Record<Provider, ProviderCatalogEntry>;
  for (const provider of ALL_PROVIDERS) out[provider] = { provider };
  return out;
}

function appendRequestId(message: string, requestId?: string) {
  if (!requestId) return message;
  if (message.includes(requestId)) return message;
  return `${message} (requestId: ${requestId})`;
}

function formatRetryAfterSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.ceil(seconds / 60);
  return `${mins}m`;
}

export const PASSWORD_POLICY_HINT =
  "Use 10-128 chars with upper/lowercase, a number, and a symbol. Spaces are not allowed.";

export function validatePasswordPolicyInput(password: string) {
  if (password.length < 10) return "Password must be at least 10 characters long.";
  if (password.length > 128) return "Password must be at most 128 characters long.";
  if (/\s/.test(password)) return "Password must not contain spaces.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/\d/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol.";
  if (/password/i.test(password)) return "Password is too easy to guess.";
  return null;
}

export function parseApiError(payload: unknown, fallback: string, responseRequestId?: string) {
  const bodyRequestId =
    payload && typeof payload === "object" && typeof (payload as { requestId?: unknown }).requestId === "string"
      ? (payload as { requestId: string }).requestId
      : undefined;
  const requestId = bodyRequestId ?? responseRequestId;

  if (typeof payload === "string" && payload.trim()) return appendRequestId(payload, requestId);
  if (payload && typeof payload === "object") {
    const retryAfterRaw = (payload as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    const retryAfterSeconds = typeof retryAfterRaw === "number" ? retryAfterRaw : undefined;
    const retrySuffix = retryAfterSeconds ? ` Retry in about ${formatRetryAfterSeconds(retryAfterSeconds) ?? `${retryAfterSeconds}s`}.` : "";
    const candidate = (payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.trim()) return appendRequestId(`${candidate}${retrySuffix}`, requestId);
    if (candidate && typeof candidate === "object") return appendRequestId(JSON.stringify(candidate), requestId);
  }
  return appendRequestId(fallback, requestId);
}

export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (error) {
    throw new Error(`Network error: ${error instanceof Error ? error.message : "request failed"}`);
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const requestId = res.headers.get("x-request-id") ?? undefined;
    const errorDetail = parseApiError(payload, `HTTP ${res.status}`, requestId);
    throw new Error(errorDetail);
  }
  return payload as T;
}

function buildProxyPath(path: string) {
  if (path.startsWith("/")) return `${proxyApiPrefix}${path}`;
  return `${proxyApiPrefix}/${path}`;
}

function buildPublicProxyPath(path: string) {
  if (path.startsWith("/")) return `${publicProxyApiPrefix}${path}`;
  return `${publicProxyApiPrefix}/${path}`;
}

async function apiProxyRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(buildProxyPath(path), options);
}

async function apiPublicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(buildPublicProxyPath(path), options);
}

async function createSession(token: string) {
  await apiRequest<{ ok: boolean }>(sessionApiPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token })
  });
}

async function destroySession() {
  await apiRequest<{ ok: boolean }>(sessionApiPath, { method: "DELETE" });
}

export function buildProviderConfig(fd: FormData, provider: Provider) {
  const config: Record<string, unknown> = {};

  for (const field of providerFields[provider]) {
    const raw = String(fd.get(field.name) ?? "").trim();
    if (!raw && field.required) throw new Error(`${field.label} is required`);
    if (!raw) continue;
    config[field.name] = field.transform ? field.transform(raw) : raw;
  }

  return config;
}

export function remediationHint(errorMessage?: string | null): string {
  const value = (errorMessage ?? "").toLowerCase();
  if (!value) return "Check worker logs and scanner runtime configuration.";
  if (value.includes("aws-first mode")) return "Use an AWS integration while AWS-first mode is enabled.";
  if (value.includes("accessdenied") || value.includes("unauthorized")) return "Verify IAM role trust policy and attached read-only permissions.";
  if (value.includes("not found") || value.includes("no such file")) return "Install scanner binary on worker host and confirm PATH/binary env settings.";
  if (value.includes("credential") || value.includes("token")) return "Validate credential references and confirm worker can resolve them at runtime.";
  return "Open worker logs for this scan and validate integration config + scanner prerequisites.";
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function compactStringList(values?: string[]) {
  if (!values || values.length === 0) return undefined;
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (cleaned.length === 0) return undefined;
  return Array.from(new Set(cleaned));
}

function normalizeScanProfileInput(profile?: ScanProfileInput) {
  if (!profile) return undefined;
  const normalized: ScanProfileInput = {
    compliance: compactStringList(profile.compliance),
    checks: compactStringList(profile.checks),
    services: compactStringList(profile.services),
    categories: compactStringList(profile.categories),
    excludedChecks: compactStringList(profile.excludedChecks),
    excludedServices: compactStringList(profile.excludedServices),
    regions: compactStringList(profile.regions),
    severityThreshold: profile.severityThreshold
  };
  const hasValues = Object.values(normalized).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
  return hasValues ? normalized : undefined;
}

export function useCspmState() {
  const [token, setToken] = useState("");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [managedIntegrations, setManagedIntegrations] = useState<ManagedIntegration[]>([]);
  const [alertEndpoints, setAlertEndpoints] = useState<AlertEndpoint[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [workerEvents, setWorkerEvents] = useState<WorkerEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [compliance, setCompliance] = useState<ComplianceFrame[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [executive, setExecutive] = useState<ExecutiveSummary | null>(null);
  const [posture, setPosture] = useState<PostureDashboard | null>(null);
  const [subCustomers, setSubCustomers] = useState<SubCustomer[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [hierarchyNodes, setHierarchyNodes] = useState<TenantHierarchyNode[]>([]);
  const [hierarchyLinks, setHierarchyLinks] = useState<TenantHierarchyLink[]>([]);
  const [provider, setProvider] = useState<Provider>("AWS");
  const [awsFirstMode, setAwsFirstMode] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>(["AWS"]);
  const [providerCatalog, setProviderCatalog] = useState<Record<Provider, ProviderCatalogEntry>>(emptyProviderCatalog());
  const [providerCapabilities, setProviderCapabilities] = useState<ProviderCapability[]>([]);
  const [tenantScanProfiles, setTenantScanProfiles] = useState<Record<Provider, TenantScanProfileDefault | null>>({
    AWS: null,
    AZURE: null,
    GCP: null,
    KUBERNETES: null,
    M365: null,
    GITHUB: null,
    MONGODBATLAS: null,
    ORACLECLOUD: null,
    ALIBABACLOUD: null,
    CLOUDFLARE: null,
    OPENSTACK: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [awsVerificationToken, setAwsVerificationToken] = useState("");

  useEffect(() => {
    localStorage.removeItem("cspm.token");
    localStorage.removeItem("cspm.tenant");
    localStorage.removeItem("cspm.tenants");
    void (async () => {
      try {
        const session = await apiRequest<{ authenticated: boolean }>(sessionApiPath);
        if (session.authenticated) setToken("session");
      } catch {
        // ignore session bootstrap failures and keep user signed out
      }
    })();
  }, []);

  const counts = useMemo(() => {
    const by = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    findings.forEach((f) => {
      by[f.severity as keyof typeof by] = (by[f.severity as keyof typeof by] ?? 0) + 1;
    });
    return by;
  }, [findings]);

  const scanStatus = useMemo(() => {
    const summary = { QUEUED: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
    scans.forEach((scan) => {
      const key = (scan.status ?? "").toUpperCase() as keyof typeof summary;
      if (key in summary) summary[key] += 1;
    });
    return summary;
  }, [scans]);

  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      const fd = new FormData(e.currentTarget);
      const tenantSlug = normalizeSlug(String(fd.get("tenantSlug") ?? ""));
      if (tenantSlug && !SLUG_REGEX.test(tenantSlug)) {
        throw new Error("Tenant slug must use lowercase letters, numbers, and hyphens only when provided.");
      }
      const payload: { email: string; password: string; tenantName: string; tenantSlug?: string } = {
        email: String(fd.get("email") ?? "").trim(),
        password: String(fd.get("password") ?? ""),
        tenantName: String(fd.get("tenantName") ?? "").trim()
      };
      const passwordError = validatePasswordPolicyInput(payload.password);
      if (passwordError) throw new Error(passwordError);
      if (tenantSlug) payload.tenantSlug = tenantSlug;
      const data = await apiPublicRequest<{ token: string; tenant: Tenant }>("/auth/register", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      await createSession(data.token);
      setToken("session"); setTenant(data.tenant); setTenants([data.tenant]); setNotice("Account created. Add an integration to start scanning.");
      await loadProviderCatalog("session");
      await refreshAll("session", data.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally { setLoading(false); }
  }

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      const fd = new FormData(e.currentTarget);
      const payload = {
        email: String(fd.get("email") ?? "").trim(),
        password: String(fd.get("password") ?? "")
      };
      const data = await apiPublicRequest<{ token: string; tenants: Tenant[] }>("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const nextTenants = data.tenants ?? [];
      const selected = nextTenants[0] ?? null;
      await createSession(data.token);
      setToken("session");
      setTenants(nextTenants);
      setTenant(selected);
      setNotice(selected ? `Signed in. Active scope: ${selected.name}` : "Signed in.");
      await loadProviderCatalog("session");
      if (selected) await refreshAll("session", selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  }

  async function createIntegration(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tenant) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const form = e.currentTarget;
      const fd = new FormData(form);
      const selectedProvider = String(fd.get("provider") ?? provider) as Provider;
      if (!availableProviders.includes(selectedProvider)) {
        throw new Error(`Provider ${selectedProvider} is disabled by current runtime policy.`);
      }
      const config = buildProviderConfig(fd, selectedProvider);
      if (selectedProvider === "AWS") {
        const single = String(config.accountId ?? "").trim();
        const multi = Array.isArray(config.accountIds) ? (config.accountIds as unknown[]).filter(Boolean) : [];
        if (!single && multi.length === 0) {
          throw new Error("For AWS, provide either a single account ID or multi-account IDs CSV.");
        }
      }
      if (selectedProvider === "AWS" && !awsVerificationToken) {
        throw new Error("Run AWS connection test successfully before saving integration.");
      }

      const payload = {
        name: String(fd.get("name") ?? "AWS Integration"),
        provider: selectedProvider,
        isActive: true,
        config,
        awsTestVerificationToken: selectedProvider === "AWS" ? awsVerificationToken : undefined
      };
      await apiProxyRequest(`/tenants/${tenant.id}/integrations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      await refreshAll();
      setNotice("Integration saved.");
      form.reset();
      setProvider(availableProviders[0] ?? "AWS");
      setAwsVerificationToken("");
    } catch (err) {
      setError(err instanceof Error ? `Failed to create integration: ${err.message}` : "Failed to create integration");
    } finally { setLoading(false); }
  }

  async function queueScan(integrationId: string, input?: { framework?: string; profile?: ScanProfileInput }) {
    if (!tenant) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const payload: { integrationId: string; framework?: string; profile?: ScanProfileInput } = { integrationId };
      const framework = input?.framework?.trim();
      if (framework) payload.framework = framework;
      const normalizedProfile = normalizeScanProfileInput(input?.profile);
      if (normalizedProfile) payload.profile = normalizedProfile;

      await apiProxyRequest(`/tenants/${tenant.id}/scans`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      await refreshAll();
      setNotice("Scan queued.");
    } catch (err) {
      setError(err instanceof Error ? `Failed to queue scan: ${err.message}` : "Failed to queue scan");
    } finally { setLoading(false); }
  }

  async function testAwsConnection(input: {
    accountId?: string;
    accountIds?: string[];
    roleArn: string;
    externalId?: string;
    sessionDurationSeconds?: number;
  }) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await apiProxyRequest<{ ok: boolean; summary: string; results: AwsConnectionTestResult[]; verificationToken?: string }>(
        `/tenants/${tenant.id}/integrations/test-aws`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input)
        }
      );
      setNotice(result.summary);
      setAwsVerificationToken(result.ok ? (result.verificationToken ?? "") : "");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to test AWS connection";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function scannerPreflight() {
    if (!token) throw new Error("Not signed in");
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await apiProxyRequest<{ ok: boolean; runtime: string; checks: ScannerPreflightCheck[] }>(
        "/system/scanner-preflight"
      );
      setNotice(result.ok ? "Scanner preflight passed." : "Scanner preflight has failures.");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scanner preflight failed";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function previewProviderCapabilities() {
    if (!token) throw new Error("Not signed in");
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await apiProxyRequest<ProviderCapabilityPreview>("/system/provider-capabilities/preview");
      setNotice("Loaded provider capability preview.");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load provider capability preview";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function loadProviderCatalog(tokenOverride?: string) {
    const activeToken = tokenOverride ?? token;
    if (!activeToken) {
      setAwsFirstMode(true);
      setAvailableProviders(["AWS"]);
      setProviderCatalog(emptyProviderCatalog());
      setProvider("AWS");
      return { awsFirstMode: true, providers: ["AWS"] as Provider[] };
    }

    const data = await apiProxyRequest<ProvidersCatalog>("/providers/catalog");

    const listedProviders = (data.providers ?? [])
      .map((item) => item.provider)
      .filter((item): item is Provider => ALL_PROVIDERS.includes(item as Provider));
    const dedupedProviders: Provider[] = Array.from(new Set(listedProviders));
    const nextProviders: Provider[] = dedupedProviders.length > 0 ? dedupedProviders : data.awsFirstMode ? ["AWS"] : [...ALL_PROVIDERS];

    setAwsFirstMode(Boolean(data.awsFirstMode));
    setAvailableProviders(nextProviders);
    const nextCatalog: Record<Provider, ProviderCatalogEntry> = emptyProviderCatalog();
    for (const item of data.providers ?? []) {
      if (!ALL_PROVIDERS.includes(item.provider)) continue;
      nextCatalog[item.provider] = item;
    }
    setProviderCatalog(nextCatalog);
    setProvider((current) => (nextProviders.includes(current) ? current : nextProviders[0] ?? "AWS"));

    return { awsFirstMode: Boolean(data.awsFirstMode), providers: nextProviders };
  }

  async function loadTenants(tokenOverride?: string) {
    const activeToken = tokenOverride ?? token;
    if (!activeToken) return [] as Tenant[];
    const data = await apiProxyRequest<{ tenants: Tenant[] }>("/tenants");
    setTenants(data.tenants ?? []);
    return data.tenants ?? [];
  }

  async function loadManagedIntegrations(input?: {
    tenantId?: string;
    provider?: Provider;
    isActive?: boolean;
    query?: string;
    limit?: number;
  }) {
    if (!token) return [] as ManagedIntegration[];
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (input?.tenantId) params.set("tenantId", input.tenantId);
    if (input?.provider) params.set("provider", input.provider);
    if (input?.isActive !== undefined) params.set("isActive", String(input.isActive));
    if (input?.query) params.set("q", input.query);
    if (input?.limit) params.set("limit", String(input.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    try {
      const data = await apiProxyRequest<{ integrations: ManagedIntegration[] }>(`/integrations${suffix}`);
      const items = data.integrations ?? [];
      setManagedIntegrations(items);
      return items;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load integration inventory";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function patchManagedIntegration(integrationId: string, input: {
    name?: string;
    isActive?: boolean;
  }) {
    if (!token) throw new Error("Not signed in");
    setLoading(true); setError("");
    try {
      const updated = await apiProxyRequest<ManagedIntegration>(`/integrations/${integrationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });

      setManagedIntegrations((current) =>
        current.map((item) => (item.id === integrationId ? updated : item))
      );
      setNotice("Integration updated.");
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update integration";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function loadAlertEndpoints(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeToken || !activeTenant) {
      setAlertEndpoints([]);
      return [] as AlertEndpoint[];
    }

    setLoading(true); setError("");
    try {
      const data = await apiProxyRequest<{ endpoints: AlertEndpoint[] }>(`/tenants/${activeTenant.id}/alert-endpoints`);
      const endpoints = data.endpoints ?? [];
      setAlertEndpoints(endpoints);
      return endpoints;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load downstream endpoints";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function createAlertEndpoint(input: {
    name: string;
    endpointType: AlertEndpointType;
    target: string;
    secretRef?: string;
  }) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      const endpoint = await apiProxyRequest<AlertEndpoint>(`/tenants/${tenant.id}/alert-endpoints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      setAlertEndpoints((current) => [endpoint, ...current.filter((item) => item.id !== endpoint.id)]);
      setNotice("Downstream endpoint created.");
      return endpoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create downstream endpoint";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function patchAlertEndpoint(endpointId: string, input: {
    name?: string;
    endpointType?: AlertEndpointType;
    target?: string;
    secretRef?: string;
    isEnabled?: boolean;
  }) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      const endpoint = await apiProxyRequest<AlertEndpoint>(`/tenants/${tenant.id}/alert-endpoints/${endpointId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      setAlertEndpoints((current) => current.map((item) => (item.id === endpointId ? endpoint : item)));
      setNotice("Downstream endpoint updated.");
      return endpoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update downstream endpoint";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function deleteAlertEndpoint(endpointId: string) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      await apiProxyRequest(`/tenants/${tenant.id}/alert-endpoints/${endpointId}`, { method: "DELETE" });
      setAlertEndpoints((current) => current.filter((item) => item.id !== endpointId));
      setNotice("Downstream endpoint deleted.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete downstream endpoint";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  function switchTenant(nextTenantId: string) {
    const next = tenants.find((t) => t.id === nextTenantId) ?? null;
    setTenant(next);
    if (next) {
      setNotice(`Switched scope to ${next.name}`);
    }
  }

  async function loadSubCustomers(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeTenant || !activeToken) return [] as SubCustomer[];

    const [allTenants, hierarchy] = await Promise.all([
      loadTenants(activeToken),
      loadTenantHierarchy(activeToken)
    ]);
    const childIds = new Set(
      hierarchy.links
        .filter((link) => link.parentTenantId === activeTenant.id)
        .map((link) => link.childTenantId)
    );
    const children = allTenants
      .filter((item) => childIds.has(item.id))
      .map((item) => ({ ...item, via: item.via ?? "msp_parent" }));
    setSubCustomers(children);
    return children;
  }

  async function createSubCustomer(name: string, slug?: string) {
    if (!tenant) throw new Error("No tenant selected");
    const normalizedSlug = normalizeSlug(slug ?? "");
    if (normalizedSlug && !SLUG_REGEX.test(normalizedSlug)) {
      throw new Error("Sub-customer slug must use lowercase letters, numbers, and hyphens only when provided.");
    }
    const payload: { name: string; slug?: string } = { name: name.trim() };
    if (normalizedSlug) payload.slug = normalizedSlug;
    await apiProxyRequest<{ tenant: SubCustomer }>(`/tenants/${tenant.id}/subcustomers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    setNotice("Sub-customer created.");
    await loadTenants();
    await loadSubCustomers();
  }

  async function createMspAccount(input: { tenantName: string; tenantSlug?: string; ownerEmail: string; ownerPassword: string }) {
    const tenantSlug = normalizeSlug(input.tenantSlug ?? "");
    if (tenantSlug && !SLUG_REGEX.test(tenantSlug)) {
      throw new Error("MSP tenant slug must use lowercase letters, numbers, and hyphens only when provided.");
    }
    const payload: { tenantName: string; tenantSlug?: string; ownerEmail: string; ownerPassword: string } = {
      tenantName: input.tenantName.trim(),
      ownerEmail: input.ownerEmail.trim(),
      ownerPassword: input.ownerPassword
    };
    if (tenantSlug) payload.tenantSlug = tenantSlug;
    await apiProxyRequest("/admin/msps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    setNotice("MSP account created.");
    await loadTenants();
    await loadSubCustomers();
  }

  async function loadTenantHierarchy(tokenOverride?: string) {
    const activeToken = tokenOverride ?? token;
    if (!activeToken) return { tenants: [] as TenantHierarchyNode[], links: [] as TenantHierarchyLink[] };

    const data = await apiProxyRequest<{ isSuperAdmin: boolean; tenants: TenantHierarchyNode[]; links: TenantHierarchyLink[] }>(
      "/tenants/hierarchy"
    );
    setHierarchyNodes(data.tenants ?? []);
    setHierarchyLinks(data.links ?? []);
    return { tenants: data.tenants ?? [], links: data.links ?? [] };
  }

  async function loadTenantUsers(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeTenant || !activeToken) return [] as TenantUser[];
    const data = await apiProxyRequest<{ users: TenantUser[] }>(`/tenants/${activeTenant.id}/users`);
    setTenantUsers(data.users ?? []);
    return data.users ?? [];
  }

  async function loadProviderCapabilities(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeTenant || !activeToken) {
      setProviderCapabilities([]);
      return [] as ProviderCapability[];
    }
    const data = await apiProxyRequest<{ tenantId: string; awsFirstMode: boolean; providers: ProviderCapability[] }>(
      `/tenants/${activeTenant.id}/providers/capabilities`
    );
    const providers = data.providers ?? [];
    setProviderCapabilities(providers);
    return providers;
  }

  async function loadTenantScanProfiles(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeTenant || !activeToken) {
      setTenantScanProfiles({
        AWS: null,
        AZURE: null,
        GCP: null,
        KUBERNETES: null,
        M365: null,
        GITHUB: null,
        MONGODBATLAS: null,
        ORACLECLOUD: null,
        ALIBABACLOUD: null,
        CLOUDFLARE: null,
        OPENSTACK: null
      });
      return [] as TenantScanProfileDefault[];
    }
    const data = await apiProxyRequest<{ tenantId: string; profiles: TenantScanProfileDefault[] }>(
      `/tenants/${activeTenant.id}/scan-profiles`
    );
    const next = {
      AWS: null,
      AZURE: null,
      GCP: null,
      KUBERNETES: null,
      M365: null,
      GITHUB: null,
      MONGODBATLAS: null,
      ORACLECLOUD: null,
      ALIBABACLOUD: null,
      CLOUDFLARE: null,
      OPENSTACK: null
    } as Record<Provider, TenantScanProfileDefault | null>;
    for (const entry of data.profiles ?? []) {
      if (entry?.provider && entry.provider in next) next[entry.provider] = entry;
    }
    setTenantScanProfiles(next);
    return data.profiles ?? [];
  }

  async function saveTenantScanProfileDefault(input: { provider: Provider; framework?: string; profile?: ScanProfileInput }) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      const payload: { framework?: string | null; profile?: ScanProfileInput | null } = {};
      const framework = input.framework?.trim();
      if (framework) payload.framework = framework;
      const normalizedProfile = normalizeScanProfileInput(input.profile);
      if (normalizedProfile) payload.profile = normalizedProfile;
      if (!framework && !normalizedProfile) {
        throw new Error("Provide a framework or at least one scan profile filter.");
      }
      const saved = await apiProxyRequest<TenantScanProfileDefault>(
        `/tenants/${tenant.id}/scan-profiles/${input.provider}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      setTenantScanProfiles((current) => ({ ...current, [input.provider]: saved }));
      setNotice(`Saved default scan profile for ${input.provider}.`);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save default scan profile";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function deleteTenantScanProfileDefault(providerToDelete: Provider) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      await apiProxyRequest(`/tenants/${tenant.id}/scan-profiles/${providerToDelete}`, { method: "DELETE" });
      setTenantScanProfiles((current) => ({ ...current, [providerToDelete]: null }));
      setNotice(`Deleted default scan profile for ${providerToDelete}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete default scan profile";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function upsertTenantUser(input: { email: string; password?: string; role: string }) {
    if (!tenant) throw new Error("No tenant selected");
    await apiProxyRequest(`/tenants/${tenant.id}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    setNotice("Tenant user updated.");
    await loadTenantUsers();
  }

  async function refreshAll(tokenOverride?: string, tenantOverride?: Tenant) {
    const activeToken = tokenOverride ?? token;
    const activeTenant = tenantOverride ?? tenant;
    if (!activeTenant || !activeToken) return;
    try {
      const [i, s, f, c, a, e, p, capabilityData, workerEventsData, alertEndpointData, scanProfileDefaults] = await Promise.all([
        apiProxyRequest<{ integrations: Integration[] }>(`/tenants/${activeTenant.id}/integrations`),
        apiProxyRequest<{ scans: Scan[] }>(`/tenants/${activeTenant.id}/scans`),
        apiProxyRequest<{ findings: Finding[] }>(`/tenants/${activeTenant.id}/findings/prioritized`),
        apiProxyRequest<{ frameworks: ComplianceFrame[] }>(`/tenants/${activeTenant.id}/compliance`),
        apiProxyRequest<{ assets: Asset[] }>(`/tenants/${activeTenant.id}/assets`),
        apiProxyRequest<ExecutiveSummary>(`/tenants/${activeTenant.id}/dashboard/executive`),
        apiProxyRequest<PostureDashboard>(`/tenants/${activeTenant.id}/dashboard/posture`),
        apiProxyRequest<{ tenantId: string; awsFirstMode: boolean; providers: ProviderCapability[] }>(`/tenants/${activeTenant.id}/providers/capabilities`),
        apiProxyRequest<{ events: WorkerEvent[] }>(`/tenants/${activeTenant.id}/scans/worker-events?limit=25`),
        apiProxyRequest<{ endpoints: AlertEndpoint[] }>(`/tenants/${activeTenant.id}/alert-endpoints`),
        apiProxyRequest<{ tenantId: string; profiles: TenantScanProfileDefault[] }>(`/tenants/${activeTenant.id}/scan-profiles`)
      ]);
      setIntegrations(i.integrations ?? []); setScans(s.scans ?? []); setFindings(f.findings ?? []);
      setCompliance(c.frameworks ?? []); setAssets(a.assets ?? []); setExecutive(e);
      setPosture(p);
      setProviderCapabilities(capabilityData.providers ?? []);
      setWorkerEvents(workerEventsData.events ?? []);
      setAlertEndpoints(alertEndpointData.endpoints ?? []);
      const nextProfiles = {
        AWS: null,
        AZURE: null,
        GCP: null,
        KUBERNETES: null,
        M365: null,
        GITHUB: null,
        MONGODBATLAS: null,
        ORACLECLOUD: null,
        ALIBABACLOUD: null,
        CLOUDFLARE: null,
        OPENSTACK: null
      } as Record<Provider, TenantScanProfileDefault | null>;
      for (const entry of scanProfileDefaults.profiles ?? []) {
        if (entry?.provider && entry.provider in nextProfiles) nextProfiles[entry.provider] = entry;
      }
      setTenantScanProfiles(nextProfiles);
    } catch (err) {
      setError(err instanceof Error ? `Failed to refresh dashboard: ${err.message}` : "Failed to refresh dashboard");
    }
  }

  useEffect(() => {
    if (!token) {
      setAwsFirstMode(true);
      setAvailableProviders(["AWS"]);
      setProviderCatalog(emptyProviderCatalog());
      setProviderCapabilities([]);
      setTenantScanProfiles({
        AWS: null,
        AZURE: null,
        GCP: null,
        KUBERNETES: null,
        M365: null,
        GITHUB: null,
        MONGODBATLAS: null,
        ORACLECLOUD: null,
        ALIBABACLOUD: null,
        CLOUDFLARE: null,
        OPENSTACK: null
      });
      setWorkerEvents([]);
      setAlertEndpoints([]);
      setProvider("AWS");
      setPosture(null);
      return;
    }
    (async () => {
      try {
        await loadProviderCatalog(token);
        const t = await loadTenants(token);
        await loadTenantHierarchy(token);
        if (!tenant && t.length > 0) {
          const firstTenant = t[0] ?? null;
          setTenant(firstTenant);
          if (firstTenant) {
            await refreshAll(token, firstTenant);
            await loadSubCustomers(token, firstTenant);
            await loadTenantUsers(token, firstTenant);
          }
          return;
        }
        if (tenant) {
          await refreshAll(token, tenant);
          await loadSubCustomers(token, tenant);
          await loadTenantUsers(token, tenant);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session state");
      }
    })();
  }, [token, tenant?.id]);

  async function downloadArtifact(scanId: string) {
    if (!tenant) return;
    try {
      const res = await fetch(buildProxyPath(`/tenants/${tenant.id}/scans/${scanId}/artifact`));
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `scan-${scanId}-artifact.json`;
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? `Failed to download artifact: ${err.message}` : "Failed to download artifact");
    }
  }

  async function getScanWorkerMetadata(scanId: string) {
    if (!tenant) throw new Error("No tenant selected");
    return await apiProxyRequest<ScanWorkerMetadata>(`/tenants/${tenant.id}/scans/${scanId}/worker-metadata`);
  }

  async function getScanDispatch(scanId: string) {
    if (!tenant) throw new Error("No tenant selected");
    return await apiProxyRequest<ScanDispatchState>(`/tenants/${tenant.id}/scans/${scanId}/dispatch`);
  }

  async function replayScanDispatch(scanId: string) {
    if (!tenant) throw new Error("No tenant selected");
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await apiProxyRequest<{ scanId: string; dispatch: ScanDispatchSummary; replay: { replayed: number; failed: number } }>(
        `/tenants/${tenant.id}/scans/${scanId}/dispatch/replay`,
        { method: "POST" }
      );
      setNotice(`Dispatch replay complete: ${result.replay.replayed} queued, ${result.replay.failed} failed.`);
      await refreshAll();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to replay dispatch";
      setError(message);
      throw err;
    } finally { setLoading(false); }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!token) throw new Error("Not signed in");
    const passwordError = validatePasswordPolicyInput(newPassword);
    if (passwordError) throw new Error(passwordError);
    await apiProxyRequest("/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    setNotice("Password updated successfully.");
  }

  async function logout() {
    try {
      await destroySession();
    } catch {
      // clear local view state even if backend/session endpoint is unavailable
    }
    setToken("");
    setTenant(null);
    setTenants([]);
    setIntegrations([]);
    setManagedIntegrations([]);
    setAlertEndpoints([]);
    setScans([]);
    setWorkerEvents([]);
    setFindings([]);
    setCompliance([]);
    setAssets([]);
    setExecutive(null);
    setPosture(null);
    setSubCustomers([]);
    setTenantUsers([]);
    setHierarchyNodes([]);
    setHierarchyLinks([]);
    setProvider("AWS");
    setAwsFirstMode(true);
    setAvailableProviders(["AWS"]);
    setProviderCatalog(emptyProviderCatalog());
    setProviderCapabilities([]);
    setTenantScanProfiles({
      AWS: null,
      AZURE: null,
      GCP: null,
      KUBERNETES: null,
      M365: null,
      GITHUB: null,
      MONGODBATLAS: null,
      ORACLECLOUD: null,
      ALIBABACLOUD: null,
      CLOUDFLARE: null,
      OPENSTACK: null
    });
    setError("");
    setNotice("Logged out.");
  }

  const canManageTenant = tenant?.role === "OWNER" || tenant?.role === "ADMIN" || tenant?.role === "SUPER_ADMIN";
  const canCreateMsp = tenant?.role === "SUPER_ADMIN";

  return {
    token, tenant, tenants, subCustomers, tenantUsers, hierarchyNodes, hierarchyLinks, integrations, managedIntegrations, alertEndpoints, scans, workerEvents, findings, compliance, assets, executive, posture, provider,
    providerCatalog, providerCapabilities, tenantScanProfiles,
    loading, error, notice, counts, scanStatus, awsFirstMode, availableProviders, awsVerificationToken, canManageTenant, canCreateMsp, setProvider, register, login, createIntegration, queueScan, refreshAll, downloadArtifact,
    changePassword, logout, testAwsConnection, scannerPreflight, previewProviderCapabilities, switchTenant, createSubCustomer, loadSubCustomers, loadTenantUsers, loadTenantHierarchy, upsertTenantUser, createMspAccount,
    loadManagedIntegrations, patchManagedIntegration, loadProviderCapabilities, getScanWorkerMetadata,
    loadAlertEndpoints, createAlertEndpoint, patchAlertEndpoint, deleteAlertEndpoint, getScanDispatch, replayScanDispatch,
    loadTenantScanProfiles, saveTenantScanProfileDefault, deleteTenantScanProfileDefault
  };
}
