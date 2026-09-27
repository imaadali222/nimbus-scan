import { env } from "./env.js";
import { PrismaClient, ScanStatus, Severity, type Provider } from "@prisma/client";
import { spawn } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildRetryPlan } from "./retry.js";

void env;
const prisma = new PrismaClient();
let workerStartedAt = new Date().toISOString();
let lastLoopAt: string | null = null;
let lastWorkAt: string | null = null;
let lastError: string | null = null;
let isProcessing = false;
const workerIdentity = `${os.hostname()}:${process.pid}`;
const encryptedConfigPrefix = "enc:v1:";
const integrationConfigEncryptionKey = createHash("sha256").update(env.INTEGRATION_CONFIG_ENCRYPTION_KEY).digest();

type NormalizedFinding = {
  provider: Provider;
  framework: string;
  severity: Severity;
  riskScore: number;
  complianceTags: string[];
  resourceId: string;
  title: string;
  description: string;
  category?: string;
  externalId?: string;
  raw?: unknown;
};

type ScanContext = {
  provider: Provider;
  framework?: string | null;
  config: Record<string, unknown>;
  scanMetadata?: Record<string, unknown>;
};

type ScanProfile = {
  compliance?: string[];
  checks?: string[];
  services?: string[];
  categories?: string[];
  excludedChecks?: string[];
  excludedServices?: string[];
  regions?: string[];
  severityThreshold?: Severity;
};

type AdapterResult = {
  findings: NormalizedFinding[];
  engine: "PROWLER" | "KUBESCAPE";
  runtime: "docker" | "local";
  invocation: {
    command: string;
    args: string[];
  };
  image?: string;
  rawOutput: string;
  profileArgs?: string[];
  profileWarning?: string;
  severityFilter?: { threshold: Severity; before: number; after: number };
};

type TestAdapterSpec = {
  errorMessage?: string;
  findings?: Array<{
    provider?: Provider;
    framework?: string;
    severity?: Severity;
    riskScore?: number;
    complianceTags?: string[];
    resourceId?: string;
    title?: string;
    description?: string;
    category?: string;
    externalId?: string;
    raw?: unknown;
  }>;
};

function isEncryptedConfigValue(value: string) {
  return value.startsWith(encryptedConfigPrefix);
}

function decryptConfigValue(value: string) {
  if (!isEncryptedConfigValue(value)) return value;
  const payload = value.slice(encryptedConfigPrefix.length);
  const [ivB64, tagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) return value;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", integrationConfigEncryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function decryptSensitiveConfigFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => decryptSensitiveConfigFields(item));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && isEncryptedConfigValue(value)) {
      try {
        return decryptConfigValue(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = decryptSensitiveConfigFields(child);
  }
  return out;
}

type DownstreamEndpointType = "amazon_s3" | "aws_security_hub" | "jira" | "slack";

type DispatchDelivery = {
  endpointId: string;
  endpointType: DownstreamEndpointType;
  target: string;
  status: "QUEUED" | "FAILED";
  attemptedAt: string;
  outboxPath: string | null;
  error: string | null;
};

type DispatchSummary = {
  configuredEndpoints: number;
  queued: number;
  failed: number;
  deliveries: DispatchDelivery[];
  updatedAt: string;
};

function findingDedupeKey(finding: NormalizedFinding) {
  return [
    finding.provider,
    finding.framework,
    finding.resourceId,
    finding.externalId ?? "",
    finding.title,
    finding.category ?? "",
    finding.severity
  ].join("::");
}

async function runCommand(command: string, args: string[], timeoutMs = 120000): Promise<string> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const succeed = (output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(output);
    };

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      fail(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => {
      fail(new Error(`${command} failed to start: ${error.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) succeed(stdout);
      else fail(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function runDockerCommand(image: string, imageArgs: string[], runtimeArgs: string[] = []) {
  const args = ["run", "--rm", ...runtimeArgs, image, ...imageArgs];
  const output = await runCommand("docker", args);
  return {
    output,
    invocation: { command: "docker", args },
    image
  };
}

function parseVersionFromImage(image: string) {
  const parts = image.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : "latest";
}

async function persistRawArtifact(scanId: string, engine: string, rawOutput: string) {
  const artifactDir = path.resolve(env.SCANNER_ARTIFACTS_DIR, scanId);
  const filename = `${engine.toLowerCase()}-raw.json`;
  await fs.mkdir(artifactDir, { recursive: true });
  const absolutePath = path.resolve(artifactDir, filename);
  await fs.writeFile(absolutePath, rawOutput, "utf8");
  const relativePath = path.relative(process.cwd(), absolutePath);
  return { absolutePath, relativePath };
}

function parseDownstreamEndpointType(value: string): DownstreamEndpointType | null {
  if (value === "amazon_s3") return "amazon_s3";
  if (value === "aws_security_hub") return "aws_security_hub";
  if (value === "jira") return "jira";
  if (value === "slack") return "slack";
  return null;
}

function parseS3Target(target: string) {
  const matched = target.match(/^s3:\/\/([^/]+)(?:\/(.*))?$/);
  if (!matched) return null;
  const bucket = matched[1] ?? "";
  if (!bucket) return null;
  const prefix = (matched[2] ?? "").replace(/^\/+|\/+$/g, "");
  return { bucket, prefix };
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function persistDispatchOutboxItem(
  endpointType: DownstreamEndpointType,
  tenantId: string,
  endpointId: string,
  scanId: string,
  payload: Record<string, unknown>
) {
  const outboxDir = path.resolve(env.WORKER_EXPORT_OUTBOX_DIR, endpointType, sanitizePathSegment(tenantId));
  await fs.mkdir(outboxDir, { recursive: true });
  const fileName = `${sanitizePathSegment(scanId)}-${sanitizePathSegment(endpointId)}.json`;
  const filePath = path.resolve(outboxDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return path.relative(process.cwd(), filePath);
}

function severityToRiskScore(severity: Severity) {
  const map: Record<Severity, number> = {
    CRITICAL: 95,
    HIGH: 80,
    MEDIUM: 55,
    LOW: 30,
    INFO: 10
  };
  return map[severity] ?? 20;
}

function frameworkToComplianceTags(framework: string, provider: Provider) {
  const upper = framework.toUpperCase();
  if (upper.includes("CIS")) return ["CIS", `${provider}_FOUNDATIONS`];
  if (upper.includes("NIST")) return ["NIST-800-53"];
  if (upper.includes("NSA")) return ["NSA", "K8S_HARDENING"];
  return [framework.toUpperCase()];
}

function compactStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  if (cleaned.length === 0) return undefined;
  return Array.from(new Set(cleaned));
}

function parseSeverityThreshold(value: unknown): Severity | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  if (upper === "CRITICAL") return Severity.CRITICAL;
  if (upper === "HIGH") return Severity.HIGH;
  if (upper === "MEDIUM") return Severity.MEDIUM;
  if (upper === "LOW") return Severity.LOW;
  if (upper === "INFO") return Severity.INFO;
  return undefined;
}

function parseScanProfile(scanMetadata?: Record<string, unknown>): ScanProfile | undefined {
  const profileRaw = scanMetadata?.profile;
  if (!profileRaw || typeof profileRaw !== "object") return undefined;
  const profileObject = profileRaw as Record<string, unknown>;

  const profile: ScanProfile = {
    compliance: compactStringArray(profileObject.compliance),
    checks: compactStringArray(profileObject.checks),
    services: compactStringArray(profileObject.services),
    categories: compactStringArray(profileObject.categories),
    excludedChecks: compactStringArray(profileObject.excludedChecks),
    excludedServices: compactStringArray(profileObject.excludedServices),
    regions: compactStringArray(profileObject.regions),
    severityThreshold: parseSeverityThreshold(profileObject.severityThreshold)
  };

  const hasValue = Object.values(profile).some((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item)));
  return hasValue ? profile : undefined;
}

function buildProwlerProfileArgs(profile: ScanProfile | undefined, provider: Provider) {
  if (!profile) return [] as string[];

  const args: string[] = [];
  if (profile.compliance?.length) args.push("--compliance", profile.compliance.join(","));
  if (profile.checks?.length) args.push("--checks", profile.checks.join(","));
  if (profile.services?.length) args.push("--services", profile.services.join(","));
  if (profile.categories?.length) args.push("--categories", profile.categories.join(","));
  if (profile.excludedChecks?.length) args.push("--excluded-checks", profile.excludedChecks.join(","));
  if (profile.excludedServices?.length) args.push("--excluded-services", profile.excludedServices.join(","));
  if ((provider === "AWS" || provider === "ORACLECLOUD" || provider === "ALIBABACLOUD") && profile.regions?.length) {
    args.push("--region", profile.regions.join(","));
  }

  return args;
}

function shouldRetryWithoutProfile(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /(unrecognized|unknown option|no such option|invalid choice|unexpected argument)/i.test(error.message);
}

function applySeverityThreshold(findings: NormalizedFinding[], threshold?: Severity) {
  if (!threshold) return { findings, filter: undefined as { threshold: Severity; before: number; after: number } | undefined };
  const rank: Record<Severity, number> = {
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    INFO: 1
  };
  const before = findings.length;
  const filtered = findings.filter((finding) => rank[finding.severity] >= rank[threshold]);
  return { findings: filtered, filter: { threshold, before, after: filtered.length } };
}

function parseMetadataJson(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function buildTestAdapterResult(ctx: ScanContext, profile: ScanProfile | undefined): AdapterResult | null {
  if (env.NODE_ENV !== "test") return null;
  const specRaw = ctx.scanMetadata?.testAdapter;
  if (!specRaw || typeof specRaw !== "object" || Array.isArray(specRaw)) return null;
  const spec = specRaw as TestAdapterSpec;
  if (typeof spec.errorMessage === "string" && spec.errorMessage.trim().length > 0) {
    throw new Error(spec.errorMessage);
  }

  const findings = (spec.findings ?? []).map<NormalizedFinding>((item, index) => {
    const severity = item.severity ?? Severity.MEDIUM;
    return {
      provider: item.provider ?? ctx.provider,
      framework: item.framework ?? ctx.framework ?? profile?.compliance?.[0] ?? "CIS",
      severity,
      riskScore: item.riskScore ?? severityToRiskScore(severity),
      complianceTags: item.complianceTags ?? frameworkToComplianceTags(item.framework ?? "CIS", item.provider ?? ctx.provider),
      resourceId: item.resourceId ?? `test-resource-${index + 1}`,
      title: item.title ?? "Test finding",
      description: item.description ?? "Generated by test adapter",
      category: item.category ?? "test",
      externalId: item.externalId ?? undefined,
      raw: item.raw ?? item
    };
  });

  const severityFiltered = applySeverityThreshold(findings, profile?.severityThreshold);
  return {
    findings: severityFiltered.findings,
    engine: "PROWLER",
    runtime: "local",
    invocation: { command: "test-adapter", args: [] },
    rawOutput: JSON.stringify(spec),
    profileArgs: [],
    profileWarning: undefined,
    severityFilter: severityFiltered.filter
  };
}

function parseProwlerJson(jsonRaw: string, provider: Provider): NormalizedFinding[] {
  const parsed = JSON.parse(jsonRaw) as Array<Record<string, unknown>>;
  return parsed.slice(0, 200).map((item) => {
    const severity =
      String(item.Severity ?? "LOW").toUpperCase() in Severity
        ? (String(item.Severity).toUpperCase() as Severity)
        : Severity.LOW;
    const framework = String(item.Compliance ?? "CIS");
    return {
      provider,
      framework,
      severity,
      riskScore: severityToRiskScore(severity),
      complianceTags: frameworkToComplianceTags(framework, provider),
      resourceId: String(item.ResourceId ?? item.AccountNumber ?? "unknown"),
      title: String(item.CheckTitle ?? "Prowler finding"),
      description: String(item.StatusExtended ?? item.Description ?? "No details"),
      category: String(item.ServiceName ?? "General"),
      externalId: String(item.CheckID ?? ""),
      raw: item
    };
  });
}

function parseKubescapeJson(jsonRaw: string): NormalizedFinding[] {
  const parsed = JSON.parse(jsonRaw) as { results?: Array<Record<string, unknown>> };
  return (parsed.results ?? []).slice(0, 200).map((item) => {
    const severity = Severity.MEDIUM;
    const framework = String(item.frameworkName ?? "NSA");
    return {
      provider: "KUBERNETES",
      framework,
      severity,
      riskScore: severityToRiskScore(severity),
      complianceTags: frameworkToComplianceTags(framework, "KUBERNETES"),
      resourceId: String(item.resourceID ?? item.resourceName ?? "unknown"),
      title: String(item.controlName ?? "Kubescape finding"),
      description: String(item.message ?? "No details"),
      category: String(item.controlID ?? "General"),
      externalId: String(item.controlID ?? ""),
      raw: item
    };
  });
}

async function runAdapter(ctx: ScanContext): Promise<AdapterResult> {
  if (env.AWS_FIRST_MODE && ctx.provider !== "AWS") {
    throw new Error("AWS-first mode is enabled. Only AWS scans are permitted in this environment.");
  }
  const profile = parseScanProfile(ctx.scanMetadata);
  const testAdapter = buildTestAdapterResult(ctx, profile);
  if (testAdapter) return testAdapter;

  if (ctx.provider === "KUBERNETES") {
    const kubeconfigPath = typeof ctx.config.kubeconfigPath === "string" ? ctx.config.kubeconfigPath : undefined;
    const context = typeof ctx.config.context === "string" ? ctx.config.context : undefined;
    const framework = (ctx.framework ?? profile?.compliance?.[0] ?? "nsa").toLowerCase();
    const scannerArgs = ["scan", "framework", framework, "--format", "json"];
    const profileWarning =
      profile && ((profile.checks?.length ?? 0) > 0 || (profile.categories?.length ?? 0) > 0 || (profile.services?.length ?? 0) > 0)
        ? "Kubescape runtime does not support all requested profile controls; unsupported filters were ignored."
        : undefined;

    if (kubeconfigPath) {
      scannerArgs.push("--kubeconfig", kubeconfigPath);
    }
    if (context) {
      scannerArgs.push("--context", context);
    }

    if (env.SCANNER_RUNTIME === "docker") {
      const runtimeArgs: string[] = [];
      const dockerScannerArgs = ["scan", "framework", framework, "--format", "json"];
      if (kubeconfigPath) {
        const absoluteKubeconfig = path.resolve(kubeconfigPath);
        const hostDir = path.dirname(absoluteKubeconfig);
        const fileName = path.basename(absoluteKubeconfig);
        const containerPath = `/kube/${fileName}`;
        runtimeArgs.push("-v", `${hostDir}:/kube:ro`);
        dockerScannerArgs.push("--kubeconfig", containerPath);
      }
      if (context) {
        dockerScannerArgs.push("--context", context);
      }

      const dockerRun = await runDockerCommand(env.KUBESCAPE_IMAGE, dockerScannerArgs, runtimeArgs);
      const parsedFindings = parseKubescapeJson(dockerRun.output);
      const severityFiltered = applySeverityThreshold(parsedFindings, profile?.severityThreshold);
      return {
        findings: severityFiltered.findings,
        engine: "KUBESCAPE",
        runtime: "docker",
        invocation: dockerRun.invocation,
        image: env.KUBESCAPE_IMAGE,
        rawOutput: dockerRun.output,
        profileArgs: [],
        profileWarning,
        severityFilter: severityFiltered.filter
      };
    }

    const localOutput = await runCommand(env.KUBESCAPE_BINARY, scannerArgs);
    const parsedFindings = parseKubescapeJson(localOutput);
    const severityFiltered = applySeverityThreshold(parsedFindings, profile?.severityThreshold);
    return {
      findings: severityFiltered.findings,
      engine: "KUBESCAPE",
      runtime: "local",
      invocation: { command: env.KUBESCAPE_BINARY, args: scannerArgs },
      rawOutput: localOutput,
      profileArgs: [],
      profileWarning,
      severityFilter: severityFiltered.filter
    };
  }

  const prowlerProviderMap: Record<Exclude<Provider, "KUBERNETES">, string> = {
    AWS: "aws",
    AZURE: "azure",
    GCP: "gcp",
    M365: "m365",
    GITHUB: "github",
    MONGODBATLAS: "mongodbatlas",
    ORACLECLOUD: "oraclecloud",
    ALIBABACLOUD: "alibabacloud",
    CLOUDFLARE: "cloudflare",
    OPENSTACK: "openstack"
  };

  const providerArg = prowlerProviderMap[ctx.provider as Exclude<Provider, "KUBERNETES">];
  if (!providerArg) {
    throw new Error(`Unsupported provider for real scan: ${ctx.provider}`);
  }

  const scannerBaseArgs = [providerArg, "--output-formats", "json-ocsf", "--output-filename", "-"];

  if (ctx.provider === "AWS") {
    const targetRoleArn =
      (typeof ctx.scanMetadata?.targetRoleArn === "string" && ctx.scanMetadata.targetRoleArn) ||
      (typeof ctx.config.roleArn === "string" ? ctx.config.roleArn : undefined);
    const externalId = typeof ctx.config.externalId === "string" ? ctx.config.externalId : undefined;

    if (targetRoleArn) {
      scannerBaseArgs.push("--role", targetRoleArn);
      if (externalId) scannerBaseArgs.push("--external-id", externalId);
    }
  }

  const profileArgs = buildProwlerProfileArgs(profile, ctx.provider);
  let profileWarning: string | undefined;
  let appliedProfileArgs = [...profileArgs];
  let finalArgs = [...scannerBaseArgs, ...profileArgs];
  let outputText = "";
  let invocation:
    | {
        command: string;
        args: string[];
      }
    | undefined;
  let image: string | undefined;

  if (env.SCANNER_RUNTIME === "docker") {
    try {
      const dockerRun = await runDockerCommand(env.PROWLER_IMAGE, finalArgs);
      outputText = dockerRun.output;
      invocation = dockerRun.invocation;
      image = env.PROWLER_IMAGE;
    } catch (error) {
      if (profileArgs.length > 0 && shouldRetryWithoutProfile(error)) {
        const fallbackRun = await runDockerCommand(env.PROWLER_IMAGE, scannerBaseArgs);
        outputText = fallbackRun.output;
        invocation = fallbackRun.invocation;
        image = env.PROWLER_IMAGE;
        finalArgs = [...scannerBaseArgs];
        appliedProfileArgs = [];
        profileWarning = `Profile options were ignored by scanner runtime: ${error instanceof Error ? error.message : "unknown error"}`;
      } else {
        throw error;
      }
    };
  } else {
    try {
      outputText = await runCommand(env.PROWLER_BINARY, finalArgs);
      invocation = { command: env.PROWLER_BINARY, args: finalArgs };
    } catch (error) {
      if (profileArgs.length > 0 && shouldRetryWithoutProfile(error)) {
        outputText = await runCommand(env.PROWLER_BINARY, scannerBaseArgs);
        invocation = { command: env.PROWLER_BINARY, args: scannerBaseArgs };
        finalArgs = [...scannerBaseArgs];
        appliedProfileArgs = [];
        profileWarning = `Profile options were ignored by scanner runtime: ${error instanceof Error ? error.message : "unknown error"}`;
      } else {
        throw error;
      }
    }
  }

  const parsedFindings = parseProwlerJson(outputText, ctx.provider);
  const severityFiltered = applySeverityThreshold(parsedFindings, profile?.severityThreshold);

  return {
    findings: severityFiltered.findings,
    engine: "PROWLER",
    runtime: env.SCANNER_RUNTIME,
    invocation: invocation ?? { command: env.PROWLER_BINARY, args: finalArgs },
    image,
    rawOutput: outputText,
    profileArgs: appliedProfileArgs,
    profileWarning,
    severityFilter: severityFiltered.filter
  };
}

async function dispatchScanOutputs(params: {
  tenantId: string;
  scanId: string;
  provider: Provider;
  framework: string | null;
  findingsCountStored: number;
  findingsCountSource: number;
  artifactRelativePath: string;
}) {
  const configuredEndpoints = await prisma.alertEndpoint.findMany({
    where: { tenantId: params.tenantId, isEnabled: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      endpointType: true,
      target: true
    }
  });

  const deliveries: DispatchDelivery[] = [];
  for (const endpoint of configuredEndpoints) {
    const endpointType = parseDownstreamEndpointType(endpoint.endpointType);
    if (!endpointType) continue;
    const attemptedAt = new Date().toISOString();

    const deliveryBase = {
      version: 1,
      createdAt: attemptedAt,
      endpoint: {
        id: endpoint.id,
        type: endpointType,
        target: endpoint.target
      },
      scan: {
        id: params.scanId,
        tenantId: params.tenantId,
        provider: params.provider,
        framework: params.framework,
        findingsCountStored: params.findingsCountStored,
        findingsCountSource: params.findingsCountSource,
        artifactRelativePath: params.artifactRelativePath
      }
    };

    if (endpointType === "amazon_s3") {
      const parsedTarget = parseS3Target(endpoint.target);
      if (!parsedTarget) {
        deliveries.push({
          endpointId: endpoint.id,
          endpointType,
          target: endpoint.target,
          status: "FAILED",
          attemptedAt,
          outboxPath: null,
          error: "Invalid S3 target format (expected s3://bucket[/prefix])"
        });
        continue;
      }

      try {
        const outboxPath = await persistDispatchOutboxItem(endpointType, params.tenantId, endpoint.id, params.scanId, {
          ...deliveryBase,
          destination: {
            bucket: parsedTarget.bucket,
            prefix: parsedTarget.prefix,
            objectKey: `${parsedTarget.prefix ? `${parsedTarget.prefix}/` : ""}${params.scanId}.json`
          }
        });
        deliveries.push({
          endpointId: endpoint.id,
          endpointType,
          target: endpoint.target,
          status: "QUEUED",
          attemptedAt,
          outboxPath,
          error: null
        });
      } catch (error) {
        deliveries.push({
          endpointId: endpoint.id,
          endpointType,
          target: endpoint.target,
          status: "FAILED",
          attemptedAt,
          outboxPath: null,
          error: error instanceof Error ? error.message : "Failed to persist dispatch outbox item"
        });
      }
      continue;
    }

    try {
      const outboxPath = await persistDispatchOutboxItem(endpointType, params.tenantId, endpoint.id, params.scanId, deliveryBase);
      deliveries.push({
        endpointId: endpoint.id,
        endpointType,
        target: endpoint.target,
        status: "QUEUED",
        attemptedAt,
        outboxPath,
        error: null
      });
    } catch (error) {
      deliveries.push({
        endpointId: endpoint.id,
        endpointType,
        target: endpoint.target,
        status: "FAILED",
        attemptedAt,
        outboxPath: null,
        error: error instanceof Error ? error.message : "Failed to persist dispatch outbox item"
      });
    }
  }

  const queued = deliveries.filter((item) => item.status === "QUEUED").length;
  const failed = deliveries.filter((item) => item.status === "FAILED").length;
  const summary: DispatchSummary = {
    configuredEndpoints: configuredEndpoints.length,
    queued,
    failed,
    deliveries,
    updatedAt: new Date().toISOString()
  };

  if (summary.deliveries.length > 0 || summary.configuredEndpoints > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        action: "scan.dispatch",
        entityType: "scan",
        entityId: params.scanId,
        detailsJson: JSON.stringify({
          configuredEndpoints: summary.configuredEndpoints,
          queued: summary.queued,
          failed: summary.failed,
          deliveries: summary.deliveries.map((item) => ({
            endpointId: item.endpointId,
            endpointType: item.endpointType,
            status: item.status,
            outboxPath: item.outboxPath,
            error: item.error
          }))
        })
      }
    });
  }

  return summary;
}

async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

async function claimNextQueuedScan() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.scanJob.findFirst({
      where: { status: ScanStatus.QUEUED },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    if (!candidate) return null;

    const claimed = await prisma.scanJob.updateMany({
      where: { id: candidate.id, status: ScanStatus.QUEUED },
      data: { status: ScanStatus.RUNNING, startedAt: new Date() }
    });
    if (claimed.count === 0) continue;

    const queued = await prisma.scanJob.findUnique({
      where: { id: candidate.id },
      include: { integration: true }
    });
    if (queued) return queued;
  }

  return null;
}

export async function processOneQueuedScan() {
  isProcessing = true;
  lastLoopAt = new Date().toISOString();
  let queued: Awaited<ReturnType<typeof claimNextQueuedScan>> = null;
  try {
    queued = await claimNextQueuedScan();
    if (!queued) return false;
    const claimedQueued = queued;
    const existingMetadata = parseMetadataJson(claimedQueued.metadataJson) ?? {};
    const existingWorkerMetadataRaw = existingMetadata.worker;
    const existingWorkerMetadata =
      existingWorkerMetadataRaw && typeof existingWorkerMetadataRaw === "object" && !Array.isArray(existingWorkerMetadataRaw)
        ? (existingWorkerMetadataRaw as Record<string, unknown>)
        : {};
    const claimedAt = new Date().toISOString();
    const queuedMetadata: Record<string, unknown> = {
      ...existingMetadata,
      worker: {
        ...existingWorkerMetadata,
        state: "RUNNING",
        claim: {
          at: claimedAt,
          by: workerIdentity,
          runtime: env.SCANNER_RUNTIME
        },
        updatedAt: claimedAt
      }
    };
    await prisma.scanJob.update({
      where: { id: claimedQueued.id },
      data: { metadataJson: JSON.stringify(queuedMetadata) }
    });
    claimedQueued.metadataJson = JSON.stringify(queuedMetadata);

    const config = decryptSensitiveConfigFields(JSON.parse(claimedQueued.integration.configJson)) as Record<string, unknown>;
    const adapterResult = await runAdapter({
      provider: claimedQueued.provider,
      framework: claimedQueued.framework,
      config,
      scanMetadata: queuedMetadata
    });
    const seenKeys = new Set<string>();
    const dedupedFindings: NormalizedFinding[] = [];
    for (const finding of adapterResult.findings) {
      const key = findingDedupeKey(finding);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      dedupedFindings.push(finding);
    }

    const artifact = await persistRawArtifact(claimedQueued.id, adapterResult.engine, adapterResult.rawOutput);
    const baseScanMetadata = {
      runtime: adapterResult.runtime,
      engine: adapterResult.engine,
      engineVersion: adapterResult.image ? parseVersionFromImage(adapterResult.image) : "binary",
      image: adapterResult.image,
      framework: claimedQueued.framework ?? "CIS",
      invocation: adapterResult.invocation,
      targetAccountId: queuedMetadata["targetAccountId"],
      targetRoleArn: queuedMetadata["targetRoleArn"],
      profile: queuedMetadata["profile"],
      profileArgsApplied: adapterResult.profileArgs ?? [],
      profileWarning: adapterResult.profileWarning ?? null,
      severityFilter: adapterResult.severityFilter ?? null,
      findingsCountSource: adapterResult.findings.length,
      findingsCountStored: dedupedFindings.length,
      artifactRelativePath: artifact.relativePath,
      outputBytes: Buffer.byteLength(adapterResult.rawOutput, "utf8"),
      completedAt: new Date().toISOString()
    };

    await prisma.$transaction(async (tx) => {
      // Idempotency guard: if a scan job is re-processed, replace prior rows for this scan.
      await tx.finding.deleteMany({ where: { scanJobId: claimedQueued.id } });

      for (const f of dedupedFindings) {
        const asset = await tx.asset.upsert({
          where: {
            tenantId_provider_externalId: {
              tenantId: claimedQueued.tenantId,
              provider: f.provider,
              externalId: f.resourceId
            }
          },
          create: {
            tenantId: claimedQueued.tenantId,
            provider: f.provider,
            externalId: f.resourceId,
            name: f.title,
            assetType: f.category ?? "general",
            criticality: f.riskScore,
            metadataJson: JSON.stringify({ framework: f.framework })
          },
          update: {
            name: f.title,
            assetType: f.category ?? "general",
            criticality: f.riskScore,
            lastSeenAt: new Date()
          }
        });

        await tx.finding.create({
          data: {
            tenantId: claimedQueued.tenantId,
            integrationId: claimedQueued.integrationId,
            scanJobId: claimedQueued.id,
            assetId: asset.id,
            provider: f.provider,
            framework: f.framework,
            severity: f.severity,
            riskScore: f.riskScore,
            complianceTags: JSON.stringify(f.complianceTags),
            resourceId: f.resourceId,
            title: f.title,
            description: f.description,
            category: f.category,
            externalId: f.externalId,
            rawJson: JSON.stringify(f.raw ?? {})
          }
        });
      }

      await tx.scanJob.update({
        where: { id: claimedQueued.id },
        data: {
          status: ScanStatus.COMPLETED,
          completedAt: new Date(),
          metadataJson: JSON.stringify(baseScanMetadata)
        }
      });
    });

    let dispatch: DispatchSummary = {
      configuredEndpoints: 0,
      queued: 0,
      failed: 0,
      deliveries: [],
      updatedAt: new Date().toISOString()
    };
    let dispatchError: string | null = null;
    try {
      dispatch = await dispatchScanOutputs({
        tenantId: claimedQueued.tenantId,
        scanId: claimedQueued.id,
        provider: claimedQueued.provider,
        framework: claimedQueued.framework,
        findingsCountStored: dedupedFindings.length,
        findingsCountSource: adapterResult.findings.length,
        artifactRelativePath: artifact.relativePath
      });
    } catch (error) {
      dispatchError = error instanceof Error ? error.message : "Failed to dispatch scan outputs";
    }

    await prisma.scanJob.update({
      where: { id: claimedQueued.id },
      data: {
        metadataJson: JSON.stringify({
          ...baseScanMetadata,
          dispatch,
          dispatchError
        })
      }
    });
    lastWorkAt = new Date().toISOString();
    lastError = null;
  } catch (error) {
    const retryPlan = buildRetryPlan({
      existingMetadata: parseMetadataJson(queued?.metadataJson),
      error,
      maxRetries: env.WORKER_MAX_RETRIES,
      runtime: env.SCANNER_RUNTIME
    });

    if (queued) {
      if (retryPlan.canRetry) {
        await prisma.scanJob.update({
          where: { id: queued.id },
          data: {
            status: ScanStatus.QUEUED,
            startedAt: null,
            errorMessage: null,
            metadataJson: JSON.stringify(retryPlan.metadata)
          }
        });
      } else {
        await prisma.scanJob.update({
          where: { id: queued.id },
          data: {
            status: ScanStatus.FAILED,
            completedAt: new Date(),
            errorMessage: retryPlan.errorMessage,
            metadataJson: JSON.stringify(retryPlan.metadata)
          }
        });
      }
    }
    lastError = retryPlan.canRetry
      ? `${retryPlan.errorMessage} (retry ${retryPlan.attempt}/${env.WORKER_MAX_RETRIES})`
      : retryPlan.errorMessage;
  }
  finally {
    isProcessing = false;
  }

  return true;
}

function startHealthServer() {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ service: "worker", status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    if (url === "/ready") {
      try {
        await checkDatabaseConnection();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            service: "worker",
            status: "ready",
            db: "ok",
            startedAt: workerStartedAt,
            lastLoopAt,
            lastWorkAt,
            isProcessing,
            lastError,
            timestamp: new Date().toISOString()
          })
        );
      } catch (error) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            service: "worker",
            status: "not_ready",
            db: "error",
            error: error instanceof Error ? error.message : "Database unavailable",
            timestamp: new Date().toISOString()
          })
        );
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(env.WORKER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Worker health endpoint listening on http://localhost:${env.WORKER_PORT}`);
  });
}

async function loop() {
  // eslint-disable-next-line no-console
  console.log("Worker online: polling queued scans");
  while (true) {
    const didWork = await processOneQueuedScan();
    await new Promise((r) => setTimeout(r, didWork ? 200 : env.WORKER_POLL_MS));
  }
}

if (process.env.WORKER_ONCE === "1") {
  if (process.env.NODE_ENV !== "test") {
    processOneQueuedScan().finally(() => prisma.$disconnect());
  }
} else if (process.env.NODE_ENV !== "test") {
  startHealthServer();
  checkDatabaseConnection()
    .then(() => loop())
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error("Worker startup validation failed:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export async function disconnectWorkerPrisma() {
  await prisma.$disconnect();
}
