import { env } from "./env.js";
import express, { type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Prisma, PrismaClient, Provider, Role, ScanStatus, Severity } from "@prisma/client";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { z } from "zod";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

void env;
const prisma = new PrismaClient();
export const app = express();

app.use((req, res, next) => {
  const requestId = req.header("x-request-id") ?? randomUUID();
  (req as AuthedRequest).requestId = requestId;
  res.header("x-request-id", requestId);
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send();
    return;
  }
  next();
});

app.use(express.json());

type AuthClaims = {
  sub: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
};

type AuthedRequest = Request & {
  auth?: AuthClaims;
  requestId?: string;
};

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] ?? "" : value ?? "");
const slugPattern = /^[a-z0-9-]+$/;
const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 8;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const revokedTokenHashes = new Map<string, number>();
const loginFailuresByIdentity = new Map<string, { count: number; windowStartedAt: number; lockoutUntil: number }>();
const authStateFilePath = env.AUTH_STATE_FILE;
const encryptedConfigPrefix = "enc:v1:";
const integrationConfigEncryptionKey = createHash("sha256").update(env.INTEGRATION_CONFIG_ENCRYPTION_KEY).digest();

type PersistedLoginFailure = {
  count: number;
  windowStartedAt: number;
  lockoutUntil: number;
};

type PersistedAuthState = {
  version: 1;
  revokedTokens: Record<string, number>;
  loginFailures: Record<string, PersistedLoginFailure>;
};

function persistAuthStateToDisk() {
  try {
    fsSync.mkdirSync(path.dirname(authStateFilePath), { recursive: true });
    const payload: PersistedAuthState = {
      version: 1,
      revokedTokens: Object.fromEntries(revokedTokenHashes.entries()),
      loginFailures: Object.fromEntries(loginFailuresByIdentity.entries())
    };
    const tmpPath = `${authStateFilePath}.tmp`;
    fsSync.writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
    fsSync.renameSync(tmpPath, authStateFilePath);
  } catch {
    // Best effort persistence for pilot baseline; runtime auth continues even if disk sync fails.
  }
}

function loadAuthStateFromDisk() {
  try {
    if (!fsSync.existsSync(authStateFilePath)) return;
    const raw = fsSync.readFileSync(authStateFilePath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as Partial<PersistedAuthState>;
    if (parsed.revokedTokens && typeof parsed.revokedTokens === "object") {
      for (const [tokenHash, expiresAt] of Object.entries(parsed.revokedTokens)) {
        if (typeof expiresAt === "number") revokedTokenHashes.set(tokenHash, expiresAt);
      }
    }
    if (parsed.loginFailures && typeof parsed.loginFailures === "object") {
      for (const [identity, state] of Object.entries(parsed.loginFailures)) {
        if (
          state &&
          typeof state === "object" &&
          typeof (state as PersistedLoginFailure).count === "number" &&
          typeof (state as PersistedLoginFailure).windowStartedAt === "number" &&
          typeof (state as PersistedLoginFailure).lockoutUntil === "number"
        ) {
          loginFailuresByIdentity.set(identity, {
            count: (state as PersistedLoginFailure).count,
            windowStartedAt: (state as PersistedLoginFailure).windowStartedAt,
            lockoutUntil: (state as PersistedLoginFailure).lockoutUntil
          });
        }
      }
    }
  } catch {
    // Ignore malformed or unreadable auth state file; in-memory state starts empty.
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isEncryptedConfigValue(value: string) {
  return value.startsWith(encryptedConfigPrefix);
}

function encryptConfigValue(value: string) {
  if (isEncryptedConfigValue(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationConfigEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptedConfigPrefix}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptConfigValue(value: string) {
  if (!isEncryptedConfigValue(value)) return value;
  const payload = value.slice(encryptedConfigPrefix.length);
  const [ivB64, tagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) return value;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", integrationConfigEncryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}

function pruneRevokedTokens(now = Date.now()) {
  let changed = false;
  for (const [key, expiresAt] of revokedTokenHashes.entries()) {
    if (expiresAt <= now) {
      revokedTokenHashes.delete(key);
      changed = true;
    }
  }
  if (changed) persistAuthStateToDisk();
}

function getTokenExpiryMs(token: string) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string") return null;
  if (typeof decoded.exp !== "number") return null;
  return decoded.exp * 1000;
}

function revokeBearerToken(token: string) {
  const now = Date.now();
  pruneRevokedTokens(now);
  const expiresAt = getTokenExpiryMs(token) ?? now + AUTH_TOKEN_TTL_SECONDS * 1000;
  revokedTokenHashes.set(hashToken(token), expiresAt);
  persistAuthStateToDisk();
}

function isRevokedBearerToken(token: string) {
  pruneRevokedTokens();
  return revokedTokenHashes.has(hashToken(token));
}

function normalizeLoginIdentity(email: string) {
  return email.trim().toLowerCase();
}

function getLoginLockoutRemainingMs(email: string, now = Date.now()) {
  const key = normalizeLoginIdentity(email);
  const state = loginFailuresByIdentity.get(key);
  if (!state) return 0;
  if (state.lockoutUntil <= now) {
    if (state.windowStartedAt + LOGIN_FAILURE_WINDOW_MS <= now) {
      loginFailuresByIdentity.delete(key);
      persistAuthStateToDisk();
    }
    return 0;
  }
  return state.lockoutUntil - now;
}

function recordFailedLoginAttempt(email: string, now = Date.now()) {
  const key = normalizeLoginIdentity(email);
  const current = loginFailuresByIdentity.get(key);
  const resetWindow = !current || current.windowStartedAt + LOGIN_FAILURE_WINDOW_MS <= now;
  const next = resetWindow
    ? { count: 1, windowStartedAt: now, lockoutUntil: 0 }
    : { ...current, count: current.count + 1 };

  if (next.count >= LOGIN_MAX_FAILURES) {
    next.lockoutUntil = now + LOGIN_LOCKOUT_MS;
  }
  loginFailuresByIdentity.set(key, next);
  persistAuthStateToDisk();
  return next;
}

function clearFailedLoginAttempts(email: string) {
  if (loginFailuresByIdentity.delete(normalizeLoginIdentity(email))) {
    persistAuthStateToDisk();
  }
}

function validatePasswordPolicy(password: string) {
  if (password.length < 10) return "Password must be at least 10 characters long";
  if (password.length > 128) return "Password must be at most 128 characters long";
  if (/\s/.test(password)) return "Password must not contain spaces";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/\d/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol";
  if (/password/i.test(password)) return "Password is too easy to guess";
  return null;
}

loadAuthStateFromDisk();

function normalizeSlug(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function slugifyTenantName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || `tenant-${randomBytes(3).toString("hex")}`;
}

function shortenSlug(value: string, maxLength = 63) {
  const shortened = value.slice(0, maxLength).replace(/-+$/g, "");
  return shortened || `tenant-${randomBytes(3).toString("hex")}`;
}

async function resolveTenantSlug(tx: Prisma.TransactionClient, tenantName: string, preferredSlug?: string) {
  const normalizedPreferred = normalizeSlug(preferredSlug);
  const base = normalizedPreferred && slugPattern.test(normalizedPreferred) ? normalizedPreferred : slugifyTenantName(tenantName);
  const clippedBase = shortenSlug(base);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${randomBytes(2).toString("hex")}`;
    const candidate = shortenSlug(`${clippedBase}${suffix}`);
    const existing = await tx.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }

  return shortenSlug(`${clippedBase}-${randomBytes(4).toString("hex")}`);
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantName: z.string().trim().min(2),
  tenantSlug: z.string().trim().toLowerCase().regex(slugPattern).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8),
    newPassword: z.string().min(8)
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"]
  });

const integrationSchema = z.object({
  name: z.string().min(2),
  provider: z.enum(Provider),
  isActive: z.boolean().optional().default(true),
  config: z.record(z.string(), z.any()),
  awsTestVerificationToken: z.string().optional()
});

const integrationInventoryQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  provider: z.enum(Provider).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const integrationGlobalPatchSchema = z
  .object({
    name: z.string().min(2).optional(),
    isActive: z.boolean().optional(),
    provider: z.enum(Provider).optional(),
    config: z.record(z.string(), z.any()).optional(),
    awsTestVerificationToken: z.string().optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.isActive !== undefined ||
      value.provider !== undefined ||
      value.config !== undefined,
    { message: "At least one integration field must be provided" }
  );

const awsIntegrationConfigSchema = z
  .object({
    accountId: z.string().regex(/^\d{12}$/).optional(),
    accountIds: z.array(z.string().regex(/^\d{12}$/)).optional(),
    roleArn: z.string().regex(/^arn:aws:iam::\d{12}:role\/.+/),
    externalId: z.string().optional(),
    regions: z.array(z.string()).optional()
  })
  .strict()
  .refine((v) => Boolean(v.accountId) || Boolean(v.accountIds?.length), {
    message: "AWS config requires accountId or accountIds"
  });

const azureIntegrationConfigSchema = z
  .object({
    tenantId: z.string().min(8),
    subscriptionId: z.string().min(8),
    clientId: z.string().min(8),
    clientSecretRef: z.string().min(4)
  })
  .strict();

const gcpIntegrationConfigSchema = z
  .object({
    projectId: z.string().min(2),
    serviceAccountJsonRef: z.string().min(4)
  })
  .strict();

const kubernetesIntegrationConfigSchema = z
  .object({
    clusterName: z.string().min(2),
    kubeconfigPath: z.string().min(2),
    context: z.string().min(1)
  })
  .strict();

const m365IntegrationConfigSchema = z
  .object({
    tenantId: z.string().min(8),
    clientId: z.string().min(8),
    clientSecretRef: z.string().min(4)
  })
  .strict();

const githubIntegrationConfigSchema = z
  .object({
    organization: z.string().min(1).optional(),
    tokenRef: z.string().min(4)
  })
  .strict();

const mongodbAtlasIntegrationConfigSchema = z
  .object({
    organizationId: z.string().min(2),
    publicKeyRef: z.string().min(4),
    privateKeyRef: z.string().min(4)
  })
  .strict();

const oracleCloudIntegrationConfigSchema = z
  .object({
    tenancyId: z.string().min(8),
    userId: z.string().min(8),
    fingerprint: z.string().min(8),
    privateKeyRef: z.string().min(4),
    region: z.string().min(2).optional()
  })
  .strict();

const alibabaCloudIntegrationConfigSchema = z
  .object({
    accountId: z.string().min(6).optional(),
    accessKeyIdRef: z.string().min(4),
    accessKeySecretRef: z.string().min(4),
    region: z.string().min(2).optional()
  })
  .strict();

const cloudflareIntegrationConfigSchema = z
  .object({
    accountId: z.string().min(6),
    apiTokenRef: z.string().min(4)
  })
  .strict();

const openstackIntegrationConfigSchema = z
  .object({
    authUrl: z.string().url(),
    username: z.string().min(1),
    passwordRef: z.string().min(4),
    projectName: z.string().min(1),
    domainName: z.string().min(1).optional()
  })
  .strict();

const scanProfileSchema = z
  .object({
    compliance: z.array(z.string().trim().min(1)).max(40).optional(),
    checks: z.array(z.string().trim().min(1)).max(250).optional(),
    services: z.array(z.string().trim().min(1)).max(120).optional(),
    categories: z.array(z.string().trim().min(1)).max(120).optional(),
    excludedChecks: z.array(z.string().trim().min(1)).max(250).optional(),
    excludedServices: z.array(z.string().trim().min(1)).max(120).optional(),
    regions: z.array(z.string().trim().min(1)).max(80).optional(),
    severityThreshold: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]).optional()
  })
  .strict()
  .optional();

const queueScanSchema = z.object({
  integrationId: z.string().min(3),
  framework: z.string().trim().min(2).max(120).optional(),
  profile: scanProfileSchema
});

const tenantScanProfileUpsertSchema = z
  .object({
    framework: z.string().trim().min(2).max(120).nullable().optional(),
    profile: scanProfileSchema.nullable().optional()
  })
  .refine((value) => value.framework !== undefined || value.profile !== undefined, {
    message: "Provide framework and/or profile"
  });

const createMspSchema = z.object({
  tenantName: z.string().trim().min(2),
  tenantSlug: z.string().trim().toLowerCase().regex(slugPattern).optional(),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8)
});

const alertEndpointTypeSchema = z.enum(["amazon_s3", "aws_security_hub", "jira", "slack"]);
type AlertEndpointType = z.infer<typeof alertEndpointTypeSchema>;

function isValidAlertEndpointTarget(endpointType: AlertEndpointType, target: string) {
  const value = target.trim();
  if (!value) return false;
  if (endpointType === "amazon_s3") {
    return /^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9](\/.*)?$/.test(value);
  }
  if (endpointType === "aws_security_hub") {
    return /^[a-z]{2}(-gov)?-[a-z-]+-\d$/.test(value);
  }
  if (endpointType === "jira" || endpointType === "slack") {
    return z.string().url().safeParse(value).success;
  }
  return false;
}

const createAlertEndpointSchema = z.object({
  name: z.string().trim().min(2),
  endpointType: alertEndpointTypeSchema,
  target: z.string().trim().min(2).max(500),
  secretRef: z.string().trim().min(3).max(255).optional()
});

const patchAlertEndpointSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    endpointType: alertEndpointTypeSchema.optional(),
    target: z.string().trim().min(2).max(500).optional(),
    secretRef: z.string().trim().min(3).max(255).optional(),
    isEnabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one alert endpoint field must be provided"
  });

type DispatchDeliveryStatus = "QUEUED" | "FAILED";
type DispatchDelivery = {
  endpointId: string;
  endpointType: AlertEndpointType;
  target: string;
  status: DispatchDeliveryStatus;
  attemptedAt: string;
  outboxPath: string | null;
  error: string | null;
};

type ScanDispatchSummary = {
  configuredEndpoints: number;
  queued: number;
  failed: number;
  deliveries: DispatchDelivery[];
  updatedAt: string;
};

type ScanMetadataRecord = Record<string, unknown>;

function parseObjectJson(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseDispatchSummary(value: unknown): ScanDispatchSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.deliveries)) return null;
  const deliveries: DispatchDelivery[] = input.deliveries
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const endpointType = typeof row.endpointType === "string" ? row.endpointType : "";
      if (!alertEndpointTypeSchema.safeParse(endpointType).success) return null;
      const status = row.status === "QUEUED" || row.status === "FAILED" ? row.status : null;
      if (!status) return null;
      if (
        typeof row.endpointId !== "string" ||
        typeof row.target !== "string" ||
        typeof row.attemptedAt !== "string"
      ) {
        return null;
      }
      return {
        endpointId: row.endpointId,
        endpointType: endpointType as AlertEndpointType,
        target: row.target,
        status,
        attemptedAt: row.attemptedAt,
        outboxPath: typeof row.outboxPath === "string" ? row.outboxPath : null,
        error: typeof row.error === "string" ? row.error : null
      } satisfies DispatchDelivery;
    })
    .filter((item): item is DispatchDelivery => Boolean(item));

  return {
    configuredEndpoints: typeof input.configuredEndpoints === "number" ? input.configuredEndpoints : deliveries.length,
    queued: typeof input.queued === "number" ? input.queued : deliveries.filter((item) => item.status === "QUEUED").length,
    failed: typeof input.failed === "number" ? input.failed : deliveries.filter((item) => item.status === "FAILED").length,
    deliveries,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString()
  };
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

async function persistReplayOutboxItem(
  endpointType: AlertEndpointType,
  tenantId: string,
  endpointId: string,
  scanId: string,
  payload: Record<string, unknown>
) {
  const outboxDir = path.resolve(env.WORKER_EXPORT_OUTBOX_DIR, endpointType, sanitizePathSegment(tenantId));
  await fs.mkdir(outboxDir, { recursive: true });
  const fileName = `${sanitizePathSegment(scanId)}-${sanitizePathSegment(endpointId)}-replay-${Date.now()}.json`;
  const filePath = path.resolve(outboxDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return path.relative(process.cwd(), filePath);
}

const addTenantUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(Role)
});

const awsAssumeRoleTestSchema = z.object({
  accountId: z.string().regex(/^\d{12}$/).optional(),
  accountIds: z.array(z.string().regex(/^\d{12}$/)).optional(),
  roleArn: z.string().startsWith("arn:aws:iam::").min(20),
  externalId: z.string().optional(),
  sessionDurationSeconds: z.number().int().min(900).max(43200).optional().default(3600)
});

type ScanProfileInput = z.infer<typeof scanProfileSchema>;
type TenantScanProfilePayload = {
  provider: Provider;
  framework?: string;
  profile?: ScanProfileInput;
  updatedAt?: string;
};

function signToken(payload: AuthClaims) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: AUTH_TOKEN_TTL_SECONDS, jwtid: randomUUID() });
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = authHeader.replace("Bearer ", "");
  if (isRevokedBearerToken(token)) {
    res.status(401).json({ error: "Token revoked" });
    return;
  }
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET) as AuthClaims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function isSuperAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return Boolean(user?.isSuperAdmin);
}

async function hasScannerPreflightAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true }
  });
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      role: { in: [Role.OWNER, Role.ADMIN] }
    },
    select: { id: true }
  });
  return Boolean(membership);
}

async function getUserAccessContext(userId: string, tenantId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, role: null as Role | null, via: null as string | null, isSuperAdmin: false };
  if (user.isSuperAdmin) return { allowed: true, role: Role.OWNER, via: "super_admin", isSuperAdmin: true };

  const direct = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } }
  });
  if (direct) return { allowed: true, role: direct.role, via: "direct", isSuperAdmin: false };

  const parentMemberships = await prisma.membership.findMany({
    where: {
      userId,
      role: { in: [Role.OWNER, Role.ADMIN] },
      tenant: {
        parentLinks: {
          some: {
            childTenantId: tenantId
          }
        }
      }
    }
  });

  if (parentMemberships.length > 0) {
    return { allowed: true, role: parentMemberships[0]!.role, via: "msp_parent", isSuperAdmin: false };
  }

  return { allowed: false, role: null as Role | null, via: null as string | null, isSuperAdmin: false };
}

async function requireTenantRole(req: AuthedRequest, res: Response, allowed: Role[]) {
  const tenantId = first(req.params.tenantId);
  const userId = req.auth?.sub;

  if (!tenantId || !userId) {
    res.status(400).json({ error: "tenantId and auth required" });
    return null;
  }

  const access = await getUserAccessContext(userId, tenantId);
  if (!access.allowed || !access.role || !allowed.includes(access.role)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return access;
}

async function requireIntegrationRole(req: AuthedRequest, res: Response, integrationId: string, allowed: Role[]) {
  const userId = req.auth?.sub;
  if (!integrationId || !userId) {
    res.status(400).json({ error: "integrationId and auth required" });
    return null;
  }

  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
    include: {
      tenant: {
        select: { id: true, slug: true, name: true }
      }
    }
  });
  if (!integration) {
    res.status(404).json({ error: "Integration not found" });
    return null;
  }

  const access = await getUserAccessContext(userId, integration.tenantId);
  if (!access.allowed || !access.role || !allowed.includes(access.role)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return { integration, access };
}

async function writeAuditLog(req: AuthedRequest, tenantId: string, action: string, entityType: string, entityId?: string, details?: object) {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: req.auth?.sub,
      action,
      entityType,
      entityId,
      ipAddress: req.ip,
      userAgent: req.header("user-agent") ?? null,
      detailsJson: details ? JSON.stringify(details) : null
    }
  });
}

function parseComplianceTags(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function listAccessibleTenants(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [] as Array<{ id: string; slug: string; name: string; role: Role | "SUPER_ADMIN"; via: string }>;

  if (user.isSuperAdmin) {
    const allTenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
    return allTenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      role: "SUPER_ADMIN" as const,
      via: "super_admin"
    }));
  }

  const directMemberships = await prisma.membership.findMany({
    where: { userId },
    include: { tenant: true }
  });

  const parentTenantIds = directMemberships
    .filter((m) => m.role === Role.OWNER || m.role === Role.ADMIN)
    .map((m) => m.tenantId);

  const childLinks = parentTenantIds.length
    ? await prisma.tenantHierarchy.findMany({
        where: { parentTenantId: { in: parentTenantIds } },
        include: { childTenant: true }
      })
    : [];

  const out = new Map<string, { id: string; slug: string; name: string; role: Role | "SUPER_ADMIN"; via: string }>();

  for (const membership of directMemberships) {
    out.set(membership.tenant.id, {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      role: membership.role,
      via: "direct"
    });
  }

  for (const link of childLinks) {
    if (!out.has(link.childTenant.id)) {
      out.set(link.childTenant.id, {
        id: link.childTenant.id,
        slug: link.childTenant.slug,
        name: link.childTenant.name,
        role: Role.ADMIN,
        via: "msp_parent"
      });
    }
  }

  return Array.from(out.values());
}

function buildRoleArnForAccount(roleArn: string, accountId: string) {
  const match = roleArn.match(/^arn:aws:iam::\d{12}:role\/.+$/);
  if (!match) return null;
  return roleArn.replace(/^arn:aws:iam::\d{12}:role\//, `arn:aws:iam::${accountId}:role/`);
}

function normalizeAwsConfigForVerification(config: Record<string, unknown>) {
  const accountId = typeof config.accountId === "string" ? config.accountId : undefined;
  const accountIds = Array.isArray(config.accountIds)
    ? config.accountIds.filter((v): v is string => typeof v === "string" && /^\d{12}$/.test(v)).sort()
    : [];
  const roleArn = typeof config.roleArn === "string" ? config.roleArn : "";
  const externalId = typeof config.externalId === "string" ? config.externalId : "";
  return { accountId, accountIds, roleArn, externalId };
}

function configFingerprint(value: unknown) {
  return JSON.stringify(value);
}

function compactStringArray(values?: string[]) {
  if (!values?.length) return undefined;
  const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (normalized.length === 0) return undefined;
  return Array.from(new Set(normalized));
}

function normalizeScanProfile(profile?: ScanProfileInput) {
  if (!profile) return undefined;
  const normalized = {
    compliance: compactStringArray(profile.compliance),
    checks: compactStringArray(profile.checks),
    services: compactStringArray(profile.services),
    categories: compactStringArray(profile.categories),
    excludedChecks: compactStringArray(profile.excludedChecks),
    excludedServices: compactStringArray(profile.excludedServices),
    regions: compactStringArray(profile.regions),
    severityThreshold: profile.severityThreshold
  };

  const hasValues = Object.values(normalized).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  );
  return hasValues ? normalized : undefined;
}

function normalizeOptionalFramework(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mergeScanProfiles(base?: ScanProfileInput, override?: ScanProfileInput) {
  if (!base && !override) return undefined;
  const merged: ScanProfileInput = { ...(base ?? {}) };
  if (override) {
    for (const [key, value] of Object.entries(override) as Array<[keyof ScanProfileInput, ScanProfileInput[keyof ScanProfileInput]]>) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return normalizeScanProfile(merged);
}

function parseTenantScanProfileRow(row: { provider: Provider; framework: string | null; profileJson: string | null; updatedAt: Date }) {
  const parsedProfile = row.profileJson ? scanProfileSchema.safeParse(JSON.parse(row.profileJson)) : { success: true, data: undefined as ScanProfileInput | undefined };
  const normalizedProfile = parsedProfile.success ? normalizeScanProfile(parsedProfile.data) : undefined;
  return {
    provider: row.provider,
    ...(row.framework ? { framework: row.framework } : {}),
    ...(normalizedProfile ? { profile: normalizedProfile } : {}),
    updatedAt: row.updatedAt.toISOString()
  } satisfies TenantScanProfilePayload;
}

type ProviderCapabilityEntry = {
  profileOptions: string[];
  frameworks: string[];
  optionValues?: Partial<Record<"checks" | "services" | "categories" | "excludedChecks" | "excludedServices" | "regions", string[]>>;
};

type ProviderCapabilityOverrides = Partial<Record<Provider, Partial<ProviderCapabilityEntry>>>;

const commonSecurityCategories = [
  "identity",
  "access",
  "networking",
  "encryption",
  "logging",
  "monitoring",
  "compute",
  "storage",
  "database",
  "kubernetes"
];

const commonAwsRegions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-north-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1"
];

const commonAzureRegions = [
  "eastus",
  "eastus2",
  "westus2",
  "centralus",
  "canadacentral",
  "westeurope",
  "northeurope",
  "uksouth",
  "francecentral",
  "southeastasia",
  "eastasia",
  "australiaeast"
];

const commonGcpRegions = [
  "us-central1",
  "us-east1",
  "us-west1",
  "us-west2",
  "northamerica-northeast1",
  "europe-west1",
  "europe-west2",
  "europe-west4",
  "europe-west9",
  "asia-east1",
  "asia-southeast1",
  "australia-southeast1"
];

const defaultProviderCapabilities: Record<Provider, ProviderCapabilityEntry> = {
  AWS: {
    profileOptions: [
      "framework",
      "compliance",
      "checks",
      "services",
      "categories",
      "excludedChecks",
      "excludedServices",
      "regions",
      "severityThreshold"
    ],
    frameworks: ["CIS", "NIST-800-53", "PCI-DSS", "SOC2", "ISO27001"],
    optionValues: {
      services: ["iam", "s3", "ec2", "vpc", "kms", "cloudtrail", "config", "rds", "eks", "lambda", "guardduty", "securityhub"],
      excludedServices: ["iam", "s3", "ec2", "vpc", "kms", "cloudtrail", "config", "rds", "eks", "lambda", "guardduty", "securityhub"],
      categories: commonSecurityCategories,
      regions: commonAwsRegions
    }
  },
  AZURE: {
    profileOptions: [
      "framework",
      "compliance",
      "checks",
      "services",
      "categories",
      "excludedChecks",
      "excludedServices",
      "regions",
      "severityThreshold"
    ],
    frameworks: ["CIS", "NIST-800-53", "ISO27001", "MITRE"],
    optionValues: {
      services: ["entra-id", "compute", "storage", "network", "key-vault", "monitor", "defender", "sql", "aks"],
      excludedServices: ["entra-id", "compute", "storage", "network", "key-vault", "monitor", "defender", "sql", "aks"],
      categories: commonSecurityCategories,
      regions: commonAzureRegions
    }
  },
  GCP: {
    profileOptions: [
      "framework",
      "compliance",
      "checks",
      "services",
      "categories",
      "excludedChecks",
      "excludedServices",
      "regions",
      "severityThreshold"
    ],
    frameworks: ["CIS", "NIST-800-53", "ISO27001"],
    optionValues: {
      services: ["iam", "compute", "storage", "networking", "kms", "logging", "monitoring", "gke", "sql"],
      excludedServices: ["iam", "compute", "storage", "networking", "kms", "logging", "monitoring", "gke", "sql"],
      categories: commonSecurityCategories,
      regions: commonGcpRegions
    }
  },
  KUBERNETES: {
    profileOptions: ["framework", "severityThreshold", "checks", "categories"],
    frameworks: ["NSA", "CIS"],
    optionValues: {
      categories: ["rbac", "network", "secrets", "pod-security", "workloads", "admission", "supply-chain", "runtime"]
    }
  },
  M365: {
    profileOptions: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53", "ISO27001", "MITRE"],
    optionValues: {
      services: ["entra-id", "exchange", "sharepoint", "teams", "defender", "purview"],
      excludedServices: ["entra-id", "exchange", "sharepoint", "teams", "defender", "purview"],
      categories: commonSecurityCategories.filter((v) => v !== "kubernetes")
    }
  },
  GITHUB: {
    profileOptions: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53"],
    optionValues: {
      categories: ["identity", "permissions", "branch-protection", "actions", "secrets", "supply-chain", "repositories"],
      services: ["organization", "repositories", "actions", "code-scanning"],
      excludedServices: ["organization", "repositories", "actions", "code-scanning"]
    }
  },
  MONGODBATLAS: {
    profileOptions: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53", "ISO27001"],
    optionValues: {
      categories: ["identity", "network", "encryption", "backup", "logging", "database"]
    }
  },
  ORACLECLOUD: {
    profileOptions: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53", "ISO27001"],
    optionValues: {
      services: ["iam", "compute", "object-storage", "network", "vault", "logging", "monitoring", "database"],
      excludedServices: ["iam", "compute", "object-storage", "network", "vault", "logging", "monitoring", "database"],
      categories: commonSecurityCategories,
      regions: ["us-phoenix-1", "us-ashburn-1", "eu-frankfurt-1", "eu-amsterdam-1", "uk-london-1", "ap-tokyo-1"]
    }
  },
  ALIBABACLOUD: {
    profileOptions: ["framework", "compliance", "checks", "services", "categories", "excludedChecks", "excludedServices", "regions", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53", "ISO27001"],
    optionValues: {
      services: ["ram", "ecs", "oss", "vpc", "kms", "actiontrail", "sls", "rds"],
      excludedServices: ["ram", "ecs", "oss", "vpc", "kms", "actiontrail", "sls", "rds"],
      categories: commonSecurityCategories,
      regions: ["cn-hangzhou", "cn-beijing", "ap-southeast-1", "ap-southeast-5", "eu-central-1", "us-west-1"]
    }
  },
  CLOUDFLARE: {
    profileOptions: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53"],
    optionValues: {
      services: ["account", "dns", "ssl-tls", "waf", "zero-trust", "workers", "r2"],
      excludedServices: ["account", "dns", "ssl-tls", "waf", "zero-trust", "workers", "r2"],
      categories: commonSecurityCategories.filter((v) => v !== "database").filter((v) => v !== "kubernetes")
    }
  },
  OPENSTACK: {
    profileOptions: ["framework", "checks", "categories", "excludedChecks", "severityThreshold"],
    frameworks: ["CIS", "NIST-800-53", "ISO27001"],
    optionValues: {
      services: ["keystone", "nova", "neutron", "cinder", "glance", "swift", "barbican"],
      excludedServices: ["keystone", "nova", "neutron", "cinder", "glance", "swift", "barbican"],
      categories: commonSecurityCategories
    }
  }
};

const providerCatalogFields: Record<Provider, string[]> = {
  AWS: ["accountId", "accountIds[]", "roleArn", "externalId?", "regions[]"],
  AZURE: ["tenantId", "subscriptionId", "clientId", "clientSecretRef"],
  GCP: ["projectId", "serviceAccountJsonRef"],
  KUBERNETES: ["clusterName", "kubeconfigPath", "context"],
  M365: ["tenantId", "clientId", "clientSecretRef"],
  GITHUB: ["organization?", "tokenRef"],
  MONGODBATLAS: ["organizationId", "publicKeyRef", "privateKeyRef"],
  ORACLECLOUD: ["tenancyId", "userId", "fingerprint", "privateKeyRef", "region?"],
  ALIBABACLOUD: ["accountId?", "accessKeyIdRef", "accessKeySecretRef", "region?"],
  CLOUDFLARE: ["accountId", "apiTokenRef"],
  OPENSTACK: ["authUrl", "username", "passwordRef", "projectName", "domainName?"]
};

let providerCapabilitiesCache: { mtimeMs: number; data: ProviderCapabilityOverrides } | null = null;

function parseCapabilityList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  if (list.length === 0) return undefined;
  return Array.from(new Set(list));
}

function parseCapabilityOptionValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const keys = ["checks", "services", "categories", "excludedChecks", "excludedServices", "regions"] as const;
  const out: Partial<Record<(typeof keys)[number], string[]>> = {};
  for (const key of keys) {
    const parsed = parseCapabilityList(source[key]);
    if (parsed?.length) out[key] = parsed;
  }
  return Object.keys(out).length ? out : undefined;
}

function loadProviderCapabilityOverrides(): ProviderCapabilityOverrides {
  const filePath = env.PROVIDER_CAPABILITIES_FILE;
  if (!filePath) return {};
  try {
    const stat = fsSync.statSync(filePath);
    if (providerCapabilitiesCache && providerCapabilitiesCache.mtimeMs === stat.mtimeMs) {
      return providerCapabilitiesCache.data;
    }

    const raw = fsSync.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      providerCapabilitiesCache = { mtimeMs: stat.mtimeMs, data: {} };
      return {};
    }

    const source = parsed as Record<string, unknown>;
    const out: ProviderCapabilityOverrides = {};

    for (const provider of Object.values(Provider)) {
      const rawEntry = source[provider];
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
      const entry = rawEntry as Record<string, unknown>;
      const frameworks = parseCapabilityList(entry.frameworks);
      const profileOptions = parseCapabilityList(entry.profileOptions);
      const optionValues = parseCapabilityOptionValues(entry.optionValues);
      if (!frameworks && !profileOptions && !optionValues) continue;
      out[provider] = {
        ...(frameworks ? { frameworks } : {}),
        ...(profileOptions ? { profileOptions } : {}),
        ...(optionValues ? { optionValues } : {})
      };
    }

    providerCapabilitiesCache = { mtimeMs: stat.mtimeMs, data: out };
    return out;
  } catch {
    return providerCapabilitiesCache?.data ?? {};
  }
}

function providerScanCapabilities(provider: Provider) {
  const defaults = defaultProviderCapabilities[provider];
  const override = loadProviderCapabilityOverrides()[provider];
  return {
    profileOptions: override?.profileOptions?.length ? override.profileOptions : defaults.profileOptions,
    frameworks: override?.frameworks?.length ? override.frameworks : defaults.frameworks,
    optionValues: {
      ...(defaults.optionValues ?? {}),
      ...(override?.optionValues ?? {})
    }
  };
}

function readProviderCapabilitiesSource() {
  const filePath = env.PROVIDER_CAPABILITIES_FILE;
  const exists = fsSync.existsSync(filePath);
  if (!exists) {
    return {
      filePath,
      exists,
      parsed: null as unknown,
      parseError: null as string | null
    };
  }

  try {
    const raw = fsSync.readFileSync(filePath, "utf8");
    return {
      filePath,
      exists,
      parsed: JSON.parse(raw),
      parseError: null as string | null
    };
  } catch (error) {
    return {
      filePath,
      exists,
      parsed: null as unknown,
      parseError: error instanceof Error ? error.message : "Failed to parse capability file"
    };
  }
}

function isSensitiveKey(key: string) {
  return /(secret|password|token|private.?key|access.?key)/i.test(key);
}

function isReferenceLike(value: string) {
  return /^(secret:\/\/|ref:\/\/|arn:aws:secretsmanager:|azurekeyvault:\/\/|gcpsecret:\/\/)/i.test(value);
}

function validateIntegrationConfig(provider: Provider, config: Record<string, unknown>) {
  if (provider === Provider.AWS) return awsIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.AZURE) return azureIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.GCP) return gcpIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.KUBERNETES) return kubernetesIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.M365) return m365IntegrationConfigSchema.safeParse(config);
  if (provider === Provider.GITHUB) return githubIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.MONGODBATLAS) return mongodbAtlasIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.ORACLECLOUD) return oracleCloudIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.ALIBABACLOUD) return alibabaCloudIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.CLOUDFLARE) return cloudflareIntegrationConfigSchema.safeParse(config);
  if (provider === Provider.OPENSTACK) return openstackIntegrationConfigSchema.safeParse(config);
  return { success: false as const, error: { flatten: () => ({ formErrors: ["Unsupported provider config"] }) } };
}

function hasRawSecrets(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasRawSecrets(item));

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === "string" && isSensitiveKey(key) && !/ref$/i.test(key) && !isReferenceLike(val)) {
      return true;
    }
    if (val && typeof val === "object" && hasRawSecrets(val)) return true;
  }
  return false;
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && isSensitiveKey(key) && !/externalid/i.test(key)) {
      redacted[key] = "***redacted***";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactConfig(value as Record<string, unknown>);
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

function encryptSensitiveConfigFields(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => encryptSensitiveConfigFields(item, parentKey));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && parentKey && isSensitiveKey(parentKey) && !/externalid/i.test(parentKey)) {
      return encryptConfigValue(value);
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = encryptSensitiveConfigFields(child, key);
  }
  return out;
}

function decryptSensitiveConfigFields(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => decryptSensitiveConfigFields(item, parentKey));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (isEncryptedConfigValue(value) || (parentKey && isSensitiveKey(parentKey)))) {
      return decryptConfigValue(value);
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = decryptSensitiveConfigFields(child, key);
  }
  return out;
}

function parseIntegrationConfig(configJson: string) {
  try {
    const parsed = JSON.parse(configJson) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, value: {} as Record<string, unknown> };
    }
    return { ok: true as const, value: decryptSensitiveConfigFields(parsed) as Record<string, unknown> };
  } catch {
    return { ok: false as const, value: {} as Record<string, unknown> };
  }
}

async function runPreflightCommand(command: string, args: string[], timeoutMs = 12000) {
  return await new Promise<{ ok: boolean; output: string }>((resolve) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const done = (ok: boolean, output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok, output });
    };

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      done(false, `timeout after ${timeoutMs}ms`);
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => done(false, err.message));
    proc.on("close", (code) => done(code === 0, (stdout || stderr).trim()));
  });
}

app.get("/health", (_req, res) => {
  res.status(200).json({ service: "api", status: "ok", timestamp: new Date().toISOString() });
});

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`;
}

app.get("/ready", async (_req, res) => {
  try {
    await checkDatabaseConnection();
    res.status(200).json({ service: "api", status: "ready", db: "ok", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({
      service: "api",
      status: "not_ready",
      db: "error",
      error: error instanceof Error ? error.message : "Database unavailable",
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/system/scanner-preflight", authMiddleware, async (req: AuthedRequest, res) => {
  const userId = req.auth?.sub;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasScannerPreflightAccess(userId))) {
    res.status(403).json({ error: "Owner/Admin or Super Admin access required" });
    return;
  }

  const checks: Array<{ name: string; ok: boolean; output: string }> = [];

  const dockerVersion = await runPreflightCommand("docker", ["--version"]);
  checks.push({ name: "docker.version", ok: dockerVersion.ok, output: dockerVersion.output || "n/a" });

  if (env.SCANNER_RUNTIME === "docker") {
    const prowlerImage = await runPreflightCommand("docker", ["image", "inspect", env.PROWLER_IMAGE]);
    checks.push({
      name: `docker.image.prowler(${env.PROWLER_IMAGE})`,
      ok: prowlerImage.ok,
      output: prowlerImage.ok ? "present" : prowlerImage.output || "missing"
    });

    const kubescapeImage = await runPreflightCommand("docker", ["image", "inspect", env.KUBESCAPE_IMAGE]);
    checks.push({
      name: `docker.image.kubescape(${env.KUBESCAPE_IMAGE})`,
      ok: kubescapeImage.ok,
      output: kubescapeImage.ok ? "present" : kubescapeImage.output || "missing"
    });
  } else {
    const prowlerBinary = await runPreflightCommand(env.PROWLER_BINARY ?? "prowler", ["--version"]);
    checks.push({ name: `binary.prowler(${env.PROWLER_BINARY ?? "prowler"})`, ok: prowlerBinary.ok, output: prowlerBinary.output || "n/a" });

    const kubescapeBinary = await runPreflightCommand(env.KUBESCAPE_BINARY ?? "kubescape", ["version"]);
    checks.push({ name: `binary.kubescape(${env.KUBESCAPE_BINARY ?? "kubescape"})`, ok: kubescapeBinary.ok, output: kubescapeBinary.output || "n/a" });
  }

  const ok = checks.every((c) => c.ok);

  res.status(200).json({
    ok,
    runtime: env.SCANNER_RUNTIME,
    checks
  });
});

app.get("/system/provider-capabilities/preview", authMiddleware, async (req: AuthedRequest, res) => {
  const userId = req.auth?.sub;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasScannerPreflightAccess(userId))) {
    res.status(403).json({ error: "Owner/Admin or Super Admin access required" });
    return;
  }

  const source = readProviderCapabilitiesSource();
  const overrides = loadProviderCapabilityOverrides();
  const providers = Object.values(Provider).map((provider) => ({
    provider,
    ...providerScanCapabilities(provider),
    overrideApplied: Boolean(overrides[provider])
  }));

  res.status(200).json({
    source: {
      filePath: source.filePath,
      exists: source.exists,
      parseError: source.parseError
    },
    providers
  });
});

app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password, tenantName, tenantSlug: requestedTenantSlug } = parsed.data;
  const passwordPolicyError = validatePasswordPolicy(password);
  if (passwordPolicyError) {
    res.status(400).json({ error: passwordPolicyError });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenantSlug = await resolveTenantSlug(tx, tenantName, requestedTenantSlug);
      const tenant = await tx.tenant.create({
        data: { name: tenantName, slug: tenantSlug }
      });
      const user = await tx.user.create({
        data: { email, passwordHash: hash, isSuperAdmin: false }
      });

      await tx.$executeRaw`
        UPDATE "User"
        SET "isSuperAdmin" = TRUE
        WHERE "id" = ${user.id}
          AND NOT EXISTS (
            SELECT 1 FROM "User"
            WHERE "isSuperAdmin" = TRUE
              AND "id" <> ${user.id}
          )
      `;

      const persistedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      await tx.membership.create({
        data: { userId: persistedUser.id, tenantId: tenant.id, role: Role.OWNER }
      });

      return { user: persistedUser, tenant, role: Role.OWNER };
    });

    const token = signToken({ sub: result.user.id, email: result.user.email });

    res.status(201).json({
      token,
      user: { id: result.user.id, email: result.user.email, isSuperAdmin: result.user.isSuperAdmin },
      tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name, role: result.role }
    });
  } catch {
    res.status(409).json({ error: "Tenant creation failed. Please retry." });
  }
});

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const lockoutRemainingMs = getLoginLockoutRemainingMs(email);
  if (lockoutRemainingMs > 0) {
    const retryAfterSeconds = Math.max(1, Math.ceil(lockoutRemainingMs / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Too many failed login attempts. Try again later.",
      retryAfterSeconds
    });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { tenant: true } } }
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    const throttled = recordFailedLoginAttempt(email);
    if (throttled.lockoutUntil > 0) {
      const retryAfterSeconds = Math.max(1, Math.ceil((throttled.lockoutUntil - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "Too many failed login attempts. Try again later.",
        retryAfterSeconds
      });
      return;
    }
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  clearFailedLoginAttempts(email);
  const token = signToken({ sub: user.id, email: user.email });
  const accessibleTenants = await listAccessibleTenants(user.id);
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin },
    tenants: accessibleTenants
  });
});

app.post("/auth/revoke", authMiddleware, async (req: AuthedRequest, res) => {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    res.status(400).json({ error: "Missing bearer token" });
    return;
  }
  revokeBearerToken(token);
  res.status(200).json({ ok: true });
});

app.post("/auth/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    res.status(200).json({ ok: true, message: "If that account exists, reset instructions were created." });
    return;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30)
    }
  });

  res.status(200).json({
    ok: true,
    message: "If that account exists, reset instructions were created.",
    ...(env.NODE_ENV !== "production" ? { resetToken: rawToken } : {})
  });
});

app.post("/auth/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const passwordPolicyError = validatePasswordPolicy(parsed.data.newPassword);
  if (passwordPolicyError) {
    res.status(400).json({ error: passwordPolicyError });
    return;
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    res.status(400).json({ error: "Reset token is invalid or expired" });
    return;
  }

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: nextHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } })
  ]);

  res.status(200).json({ ok: true, message: "Password reset successful" });
});

app.post("/auth/change-password", authMiddleware, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const passwordPolicyError = validatePasswordPolicy(parsed.data.newPassword);
  if (passwordPolicyError) {
    res.status(400).json({ error: passwordPolicyError });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const validCurrent = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!validCurrent) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: nextHash } });

  res.status(200).json({ ok: true, message: "Password updated" });
});

app.get("/tenants", authMiddleware, async (req: AuthedRequest, res) => {
  const tenants = await listAccessibleTenants(req.auth!.sub);
  res.json({ tenants });
});

app.get("/tenants/hierarchy", authMiddleware, async (req: AuthedRequest, res) => {
  const userId = req.auth!.sub;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isSuperAdmin) {
    const tenants = await prisma.tenant.findMany({ orderBy: { name: "asc" } });
    const links = await prisma.tenantHierarchy.findMany({ orderBy: { createdAt: "asc" } });
    res.json({
      isSuperAdmin: true,
      tenants: tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
      links: links.map((l) => ({ parentTenantId: l.parentTenantId, childTenantId: l.childTenantId }))
    });
    return;
  }

  const parentMemberships = await prisma.membership.findMany({
    where: { userId, role: { in: [Role.OWNER, Role.ADMIN] } },
    include: { tenant: true }
  });
  const parentTenantIds = parentMemberships.map((m) => m.tenantId);
  const childLinks = parentTenantIds.length
    ? await prisma.tenantHierarchy.findMany({
        where: { parentTenantId: { in: parentTenantIds } },
        include: { childTenant: true }
      })
    : [];

  const tenants = [
    ...parentMemberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug })),
    ...childLinks.map((l) => ({ id: l.childTenant.id, name: l.childTenant.name, slug: l.childTenant.slug }))
  ];

  const uniqueTenants = Array.from(new Map(tenants.map((t) => [t.id, t])).values());

  res.json({
    isSuperAdmin: false,
    tenants: uniqueTenants,
    links: childLinks.map((l) => ({ parentTenantId: l.parentTenantId, childTenantId: l.childTenantId }))
  });
});

app.post("/admin/msps", authMiddleware, async (req: AuthedRequest, res) => {
  if (!(await isSuperAdmin(req.auth!.sub))) {
    res.status(403).json({ error: "Super admin required" });
    return;
  }

  const parsed = createMspSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { tenantName, tenantSlug: requestedTenantSlug, ownerEmail, ownerPassword } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existing) {
    res.status(409).json({ error: "Owner email already exists" });
    return;
  }

  const hash = await bcrypt.hash(ownerPassword, 10);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenantSlug = await resolveTenantSlug(tx, tenantName, requestedTenantSlug);
      const tenant = await tx.tenant.create({ data: { name: tenantName, slug: tenantSlug } });
      const user = await tx.user.create({ data: { email: ownerEmail, passwordHash: hash } });
      await tx.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: Role.OWNER } });
      return { tenant, user };
    });

    res.status(201).json({
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      owner: { id: result.user.id, email: result.user.email, role: Role.OWNER }
    });
  } catch {
    res.status(409).json({ error: "MSP creation failed. Please retry." });
  }
});

app.get("/providers/catalog", authMiddleware, (_req, res) => {
  const providers = Object.values(Provider).map((provider) => ({
    provider,
    fields: providerCatalogFields[provider],
    ...providerScanCapabilities(provider)
  }));

  res.json({
    awsFirstMode: env.AWS_FIRST_MODE,
    providers: env.AWS_FIRST_MODE ? providers.filter((p) => p.provider === Provider.AWS) : providers
  });
});

app.get("/tenants/:tenantId/providers/capabilities", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);

  const [integrationCounts, recentScans] = await Promise.all([
    prisma.integration.groupBy({
      by: ["provider"],
      where: { tenantId, isActive: true },
      _count: { _all: true }
    }),
    prisma.scanJob.findMany({
      where: { tenantId },
      select: { provider: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 400
    })
  ]);

  const countsByProvider = new Map<Provider, number>();
  for (const row of integrationCounts) countsByProvider.set(row.provider, row._count._all);

  const lastScanByProvider = new Map<Provider, { status: ScanStatus; createdAt: string }>();
  for (const row of recentScans) {
    if (lastScanByProvider.has(row.provider)) continue;
    lastScanByProvider.set(row.provider, { status: row.status, createdAt: row.createdAt.toISOString() });
  }

  const providers = Object.values(Provider).map((provider) => {
    const integrationCount = countsByProvider.get(provider) ?? 0;
    const enabledByRuntimePolicy = !env.AWS_FIRST_MODE || provider === Provider.AWS;
    const capability = providerScanCapabilities(provider);
    const lastScan = lastScanByProvider.get(provider) ?? null;
    return {
      provider,
      enabledByRuntimePolicy,
      integrationCount,
      canQueueScans: enabledByRuntimePolicy && integrationCount > 0,
      profileOptions: capability.profileOptions,
      frameworks: capability.frameworks,
      lastScanStatus: lastScan?.status ?? null,
      lastScanAt: lastScan?.createdAt ?? null
    };
  });

  res.status(200).json({
    tenantId,
    awsFirstMode: env.AWS_FIRST_MODE,
    providers: env.AWS_FIRST_MODE ? providers.filter((item) => item.provider === Provider.AWS) : providers
  });
});

app.get("/tenants/:tenantId/scan-profiles", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);

  const rows = await prisma.tenantScanProfile.findMany({
    where: { tenantId },
    orderBy: { provider: "asc" }
  });

  const profiles = rows.flatMap((row) => {
    try {
      return [parseTenantScanProfileRow(row)];
    } catch {
      return [];
    }
  });

  res.status(200).json({ tenantId, profiles });
});

app.get("/tenants/:tenantId/scan-profiles/:provider", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);
  const provider = Provider[first(req.params.provider) as keyof typeof Provider];
  if (!provider) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }

  const row = await prisma.tenantScanProfile.findUnique({
    where: { tenantId_provider: { tenantId, provider } }
  });
  if (!row) {
    res.status(404).json({ error: "Scan profile not found" });
    return;
  }

  try {
    res.status(200).json(parseTenantScanProfileRow(row));
  } catch {
    res.status(409).json({ error: "Stored scan profile is corrupted and must be recreated." });
  }
});

app.put("/tenants/:tenantId/scan-profiles/:provider", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);
  const provider = Provider[first(req.params.provider) as keyof typeof Provider];
  if (!provider) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }

  const parsed = tenantScanProfileUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const framework = normalizeOptionalFramework(parsed.data.framework ?? undefined);
  const profile = parsed.data.profile === null ? undefined : normalizeScanProfile(parsed.data.profile ?? undefined);
  if (!framework && !profile) {
    res.status(400).json({ error: "Provide a framework or at least one scan profile filter." });
    return;
  }

  const row = await prisma.tenantScanProfile.upsert({
    where: { tenantId_provider: { tenantId, provider } },
    create: {
      tenantId,
      provider,
      framework: framework ?? null,
      profileJson: profile ? JSON.stringify(profile) : null
    },
    update: {
      framework: framework ?? null,
      profileJson: profile ? JSON.stringify(profile) : null
    }
  });

  await writeAuditLog(req, tenantId, "scan_profile.upsert", "tenant_scan_profile", row.id, {
    provider,
    framework: row.framework,
    hasProfile: Boolean(profile)
  });

  res.status(200).json(parseTenantScanProfileRow(row));
});

app.delete("/tenants/:tenantId/scan-profiles/:provider", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);
  const provider = Provider[first(req.params.provider) as keyof typeof Provider];
  if (!provider) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }

  const deleted = await prisma.tenantScanProfile.deleteMany({
    where: { tenantId, provider }
  });
  if (!deleted.count) {
    res.status(404).json({ error: "Scan profile not found" });
    return;
  }

  await writeAuditLog(req, tenantId, "scan_profile.delete", "tenant_scan_profile", undefined, { provider });
  res.status(204).send();
});

app.post("/tenants/:tenantId/integrations/test-aws", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const parsed = awsAssumeRoleTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const requested = parsed.data;
  const accountIds = requested.accountIds?.length
    ? requested.accountIds
    : requested.accountId
      ? [requested.accountId]
      : [];

  if (accountIds.length === 0) {
    res.status(400).json({ error: "Provide accountId or accountIds for AWS role test" });
    return;
  }

  const testTargets = accountIds.slice(0, 5);
  const sts = new STSClient({});
  const results: Array<{ accountId: string; ok: boolean; roleArn: string; error?: string }> = [];

  for (const accountId of testTargets) {
    const roleArn = buildRoleArnForAccount(requested.roleArn, accountId);
    if (!roleArn) {
      results.push({ accountId, ok: false, roleArn: requested.roleArn, error: "Invalid role ARN format" });
      continue;
    }

    try {
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `cspm-test-${Date.now()}`,
        ExternalId: requested.externalId,
        DurationSeconds: requested.sessionDurationSeconds
      });
      await sts.send(command);
      results.push({ accountId, ok: true, roleArn });
    } catch (error) {
      results.push({
        accountId,
        ok: false,
        roleArn,
        error: error instanceof Error ? error.message : "AssumeRole failed"
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - successCount;

  const fingerprint = configFingerprint({
    accountId: requested.accountId ?? undefined,
    accountIds: requested.accountIds?.slice().sort() ?? [],
    roleArn: requested.roleArn,
    externalId: requested.externalId ?? ""
  });

  const verificationToken = jwt.sign(
    {
      kind: "awsIntegrationTest",
      tenantId: first(req.params.tenantId),
      userId: req.auth!.sub,
      fingerprint
    },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  res.status(200).json({
    ok: failedCount === 0,
    summary: `AWS role test finished: ${successCount} succeeded, ${failedCount} failed${accountIds.length > 5 ? " (first 5 tested)" : ""}`,
    results,
    tested: results.length,
    totalRequested: accountIds.length,
    verificationToken: failedCount === 0 ? verificationToken : undefined
  });
});

app.get("/integrations", authMiddleware, async (req: AuthedRequest, res) => {
  const userId = req.auth?.sub;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsedQuery = integrationInventoryQuerySchema.safeParse({
    tenantId: first(req.query.tenantId as string | string[] | undefined) || undefined,
    provider: first(req.query.provider as string | string[] | undefined) || undefined,
    isActive: first(req.query.isActive as string | string[] | undefined) || undefined,
    q: first(req.query.q as string | string[] | undefined) || undefined,
    limit: first(req.query.limit as string | string[] | undefined) || undefined
  });
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.flatten() });
    return;
  }

  const query = parsedQuery.data;
  const accessibleTenants = await listAccessibleTenants(userId);
  const accessByTenantId = new Map(
    accessibleTenants.map((tenant) => [tenant.id, { role: tenant.role, via: tenant.via }])
  );

  if (query.tenantId && !accessByTenantId.has(query.tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const scopedTenantIds = query.tenantId ? [query.tenantId] : Array.from(accessByTenantId.keys());
  if (scopedTenantIds.length === 0) {
    res.status(200).json({ integrations: [] });
    return;
  }

  const where: Prisma.IntegrationWhereInput = {
    tenantId: { in: scopedTenantIds }
  };
  if (query.provider) where.provider = query.provider;
  if (query.isActive !== undefined) where.isActive = query.isActive === "true";
  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { tenant: { name: { contains: query.q } } },
      { tenant: { slug: { contains: query.q } } }
    ];
  }

  const items = await prisma.integration.findMany({
    where,
    include: {
      tenant: {
        select: { id: true, slug: true, name: true }
      }
    },
    orderBy: [{ updatedAt: "desc" }],
    take: query.limit
  });

  res.status(200).json({
    integrations: items.map((item) => {
      const parsedConfig = parseIntegrationConfig(item.configJson);
      const access = accessByTenantId.get(item.tenantId);
      const role = access?.role ?? null;
      const via = access?.via ?? null;
      const canManage = role === "SUPER_ADMIN" || role === Role.OWNER || role === Role.ADMIN;
      return {
        ...item,
        config: redactConfig(parsedConfig.value),
        configParseError: !parsedConfig.ok,
        tenant: item.tenant,
        access: { role, via },
        canManage
      };
    })
  });
});

app.patch("/integrations/:integrationId", authMiddleware, async (req: AuthedRequest, res) => {
  const integrationId = first(req.params.integrationId);
  const required = await requireIntegrationRole(req, res, integrationId, [Role.OWNER, Role.ADMIN]);
  if (!required) return;

  const parsed = integrationGlobalPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const currentConfigParsed = parseIntegrationConfig(required.integration.configJson);
  if (!currentConfigParsed.ok) {
    res.status(400).json({ error: "Integration config is corrupted and cannot be updated until repaired." });
    return;
  }
  const currentConfig = currentConfigParsed.value;
  const changesProviderOrConfig = parsed.data.provider !== undefined || parsed.data.config !== undefined;
  const nextProvider = parsed.data.provider ?? required.integration.provider;
  const nextConfig = parsed.data.config ?? currentConfig;

  if (changesProviderOrConfig) {
    if (parsed.data.provider && parsed.data.provider !== required.integration.provider && parsed.data.config === undefined) {
      res.status(400).json({ error: "Config is required when changing provider." });
      return;
    }

    if (hasRawSecrets(nextConfig)) {
      res.status(400).json({ error: "Raw secret values are not allowed. Use secret references instead." });
      return;
    }

    const providerConfigValidation = validateIntegrationConfig(nextProvider, nextConfig);
    if (!providerConfigValidation.success) {
      res.status(400).json({ error: providerConfigValidation.error.flatten() });
      return;
    }

    if (nextProvider === Provider.AWS && env.NODE_ENV !== "test") {
      const verificationToken = parsed.data.awsTestVerificationToken;
      if (!verificationToken) {
        res.status(400).json({ error: "AWS connection test is required before updating integration." });
        return;
      }

      try {
        const decoded = jwt.verify(verificationToken, env.JWT_SECRET) as {
          kind?: string;
          tenantId?: string;
          userId?: string;
          fingerprint?: string;
        };
        const expectedFingerprint = configFingerprint(normalizeAwsConfigForVerification(nextConfig));
        if (
          decoded.kind !== "awsIntegrationTest" ||
          decoded.tenantId !== required.integration.tenantId ||
          decoded.userId !== req.auth!.sub ||
          decoded.fingerprint !== expectedFingerprint
        ) {
          res.status(400).json({ error: "AWS test verification is invalid or outdated. Re-run AWS connection test." });
          return;
        }
      } catch {
        res.status(400).json({ error: "AWS test verification expired or invalid. Re-run AWS connection test." });
        return;
      }
    }
  }

  const updated = await prisma.integration.update({
    where: { id: required.integration.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(changesProviderOrConfig
        ? {
            provider: nextProvider,
            configJson: JSON.stringify(encryptSensitiveConfigFields(nextConfig))
          }
        : {})
    },
    include: {
      tenant: {
        select: { id: true, slug: true, name: true }
      }
    }
  });

  await writeAuditLog(req, required.integration.tenantId, "integration.global_update", "integration", updated.id, {
    fields: Object.keys(parsed.data)
  });

  const role = required.access.isSuperAdmin ? "SUPER_ADMIN" : required.access.role;
  const canManage = role === "SUPER_ADMIN" || role === Role.OWNER || role === Role.ADMIN;
  res.status(200).json({
    ...updated,
    config: redactConfig(parseIntegrationConfig(updated.configJson).value),
    tenant: updated.tenant,
    access: { role, via: required.access.via },
    canManage
  });
});

app.post("/tenants/:tenantId/integrations", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const parsed = integrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = first(req.params.tenantId);

  if (hasRawSecrets(parsed.data.config)) {
    res.status(400).json({ error: "Raw secret values are not allowed. Use secret references instead." });
    return;
  }

  const providerConfigValidation = validateIntegrationConfig(parsed.data.provider, parsed.data.config);
  if (!providerConfigValidation.success) {
    res.status(400).json({ error: providerConfigValidation.error.flatten() });
    return;
  }

  if (parsed.data.provider === Provider.AWS && env.NODE_ENV !== "test") {
    const verificationToken = parsed.data.awsTestVerificationToken;
    if (!verificationToken) {
      res.status(400).json({ error: "AWS connection test is required before saving integration." });
      return;
    }

    try {
      const decoded = jwt.verify(verificationToken, env.JWT_SECRET) as {
        kind?: string;
        tenantId?: string;
        userId?: string;
        fingerprint?: string;
      };

      const expectedFingerprint = configFingerprint(normalizeAwsConfigForVerification(parsed.data.config));
      if (
        decoded.kind !== "awsIntegrationTest" ||
        decoded.tenantId !== tenantId ||
        decoded.userId !== req.auth!.sub ||
        decoded.fingerprint !== expectedFingerprint
      ) {
        res.status(400).json({ error: "AWS test verification is invalid or outdated. Re-run AWS connection test." });
        return;
      }
    } catch {
      res.status(400).json({ error: "AWS test verification expired or invalid. Re-run AWS connection test." });
      return;
    }
  }

  const integration = await prisma.integration.create({
    data: {
      tenantId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      isActive: parsed.data.isActive,
      configJson: JSON.stringify(encryptSensitiveConfigFields(parsed.data.config))
    }
  });

  await writeAuditLog(req, tenantId, "integration.create", "integration", integration.id, { provider: integration.provider });
  res.status(201).json({ ...integration, config: redactConfig(parseIntegrationConfig(integration.configJson).value) });
});

app.get("/tenants/:tenantId/integrations", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const items = await prisma.integration.findMany({ where: { tenantId: first(req.params.tenantId) }, orderBy: { createdAt: "desc" } });
  res.json({
    integrations: items.map((i) => {
      const parsedConfig = parseIntegrationConfig(i.configJson);
      return { ...i, config: redactConfig(parsedConfig.value), configParseError: !parsedConfig.ok };
    })
  });
});

app.put("/tenants/:tenantId/integrations/:integrationId", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const parsed = integrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.integration.findUnique({ where: { id: first(req.params.integrationId) } });
  if (!existing || existing.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }

  if (hasRawSecrets(parsed.data.config)) {
    res.status(400).json({ error: "Raw secret values are not allowed. Use secret references instead." });
    return;
  }

  const providerConfigValidation = validateIntegrationConfig(parsed.data.provider, parsed.data.config);
  if (!providerConfigValidation.success) {
    res.status(400).json({ error: providerConfigValidation.error.flatten() });
    return;
  }

  if (parsed.data.provider === Provider.AWS && env.NODE_ENV !== "test") {
    const verificationToken = parsed.data.awsTestVerificationToken;
    if (!verificationToken) {
      res.status(400).json({ error: "AWS connection test is required before updating integration." });
      return;
    }

    try {
      const decoded = jwt.verify(verificationToken, env.JWT_SECRET) as {
        kind?: string;
        tenantId?: string;
        userId?: string;
        fingerprint?: string;
      };
      const expectedFingerprint = configFingerprint(normalizeAwsConfigForVerification(parsed.data.config));
      if (
        decoded.kind !== "awsIntegrationTest" ||
        decoded.tenantId !== first(req.params.tenantId) ||
        decoded.userId !== req.auth!.sub ||
        decoded.fingerprint !== expectedFingerprint
      ) {
        res.status(400).json({ error: "AWS test verification is invalid or outdated. Re-run AWS connection test." });
        return;
      }
    } catch {
      res.status(400).json({ error: "AWS test verification expired or invalid. Re-run AWS connection test." });
      return;
    }
  }

  const updated = await prisma.integration.update({
    where: { id: first(req.params.integrationId) },
    data: {
      name: parsed.data.name,
      provider: parsed.data.provider,
      isActive: parsed.data.isActive,
      configJson: JSON.stringify(encryptSensitiveConfigFields(parsed.data.config))
    }
  });
  await writeAuditLog(req, first(req.params.tenantId), "integration.update", "integration", updated.id);
  res.json({ ...updated, config: redactConfig(parseIntegrationConfig(updated.configJson).value) });
});

app.delete("/tenants/:tenantId/integrations/:integrationId", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const deleted = await prisma.integration.deleteMany({ where: { id: first(req.params.integrationId), tenantId: first(req.params.tenantId) } });
  if (!deleted.count) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }
  await writeAuditLog(req, first(req.params.tenantId), "integration.delete", "integration", first(req.params.integrationId));
  res.status(204).send();
});

const subCustomerSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().toLowerCase().regex(slugPattern).optional()
});

app.get("/tenants/:tenantId/users", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const memberships = await prisma.membership.findMany({
    where: { tenantId: first(req.params.tenantId) },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });

  res.json({
    users: memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt
    }))
  });
});

app.post("/tenants/:tenantId/users", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const parsed = addTenantUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tenantId = first(req.params.tenantId);
  const { email, password, role } = parsed.data;
  if (password) {
    const passwordPolicyError = validatePasswordPolicy(password);
    if (passwordPolicyError) {
      res.status(400).json({ error: passwordPolicyError });
      return;
    }
  }

  if (auth.role === Role.ADMIN && role === Role.OWNER) {
    res.status(403).json({ error: "Admins cannot assign OWNER role" });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  const user = existingUser
    ? existingUser
    : await prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(password ?? Math.random().toString(36).slice(2) + "A1!", 10)
        }
      });

  const privilegedRoles: Role[] = [Role.OWNER, Role.ADMIN];
  const existingMembership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId
      }
    },
    select: { role: true }
  });
  const wasPrivileged = Boolean(existingMembership?.role && privilegedRoles.includes(existingMembership.role));
  const willBePrivileged = privilegedRoles.includes(role);
  if (wasPrivileged && !willBePrivileged) {
    const privilegedCount = await prisma.membership.count({
      where: {
        tenantId,
        role: { in: privilegedRoles }
      }
    });
    if (privilegedCount <= 1) {
      res.status(400).json({ error: "Cannot remove the last OWNER/ADMIN from tenant scope." });
      return;
    }
  }

  await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId
      }
    },
    create: { userId: user.id, tenantId, role },
    update: { role }
  });

  await writeAuditLog(req, tenantId, "tenant.user.upsert", "user", user.id, { role });

  res.status(201).json({ user: { id: user.id, email: user.email, role } });
});

app.post("/tenants/:tenantId/subcustomers", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const parsed = subCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const parentTenantId = first(req.params.tenantId);

  try {
    const childTenant = await prisma.$transaction(async (tx) => {
      const tenantSlug = await resolveTenantSlug(tx, parsed.data.name, parsed.data.slug);
      const tenant = await tx.tenant.create({
        data: { name: parsed.data.name, slug: tenantSlug }
      });

      await tx.tenantHierarchy.create({
        data: {
          parentTenantId,
          childTenantId: tenant.id
        }
      });

      return tenant;
    });

    await writeAuditLog(req, parentTenantId, "tenant.subcustomer.create", "tenant", childTenant.id, {
      childTenantId: childTenant.id
    });

    res.status(201).json({
      tenant: {
        id: childTenant.id,
        slug: childTenant.slug,
        name: childTenant.name,
        role: Role.ADMIN,
        via: "msp_parent"
      }
    });
  } catch {
    res.status(409).json({ error: "Sub-customer creation failed. Please retry." });
  }
});

app.post("/tenants/:tenantId/scans", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST]);
  if (!auth) return;
  const parsed = queueScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const integration = await prisma.integration.findUnique({ where: { id: parsed.data.integrationId } });
  if (!integration || integration.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Integration not found" });
    return;
  }

  if (env.AWS_FIRST_MODE && integration.provider !== Provider.AWS) {
    res.status(400).json({
      error: "AWS-first mode is enabled. Only AWS integrations can be scanned right now."
    });
    return;
  }

  const tenantId = first(req.params.tenantId);
  const integrationConfigParsed = parseIntegrationConfig(integration.configJson);
  if (!integrationConfigParsed.ok) {
    res.status(400).json({ error: "Integration config is corrupted and cannot be scanned until repaired." });
    return;
  }
  const integrationConfig = integrationConfigParsed.value;
  const savedTenantProfile = await prisma.tenantScanProfile.findUnique({
    where: {
      tenantId_provider: {
        tenantId,
        provider: integration.provider
      }
    }
  });
  let savedFramework: string | undefined;
  let savedProfile: ScanProfileInput | undefined;
  if (savedTenantProfile) {
    savedFramework = normalizeOptionalFramework(savedTenantProfile.framework);
    if (savedTenantProfile.profileJson) {
      try {
        const parsedSaved = scanProfileSchema.safeParse(JSON.parse(savedTenantProfile.profileJson));
        if (parsedSaved.success) savedProfile = normalizeScanProfile(parsedSaved.data);
      } catch {
        // ignore corrupted saved profile during queueing; explicit request values still work
      }
    }
  }

  const requestFramework = normalizeOptionalFramework(parsed.data.framework);
  const requestProfile = normalizeScanProfile(parsed.data.profile);
  const normalizedProfile = mergeScanProfiles(savedProfile, requestProfile);
  const effectiveFramework = requestFramework ?? savedFramework ?? normalizedProfile?.compliance?.[0] ?? "CIS";

  if (
    integration.provider === Provider.AWS &&
    Array.isArray(integrationConfig.accountIds) &&
    integrationConfig.accountIds.length > 0
  ) {
    const accountIds = integrationConfig.accountIds.filter((v): v is string => typeof v === "string" && /^\d{12}$/.test(v));
    const baseRoleArn = typeof integrationConfig.roleArn === "string" ? integrationConfig.roleArn : "";

    const scans = await prisma.$transaction(
      accountIds.map((accountId) =>
        prisma.scanJob.create({
          data: {
            tenantId,
            integrationId: integration.id,
            requestedByUserId: req.auth!.sub,
            provider: integration.provider,
            framework: effectiveFramework,
            status: ScanStatus.QUEUED,
            metadataJson: JSON.stringify({
              targetAccountId: accountId,
              targetRoleArn: buildRoleArnForAccount(baseRoleArn, accountId),
              profile: normalizedProfile
            })
          }
        })
      )
    );

    await writeAuditLog(req, tenantId, "scan.queue.bulk", "scan", undefined, {
      provider: integration.provider,
      framework: effectiveFramework,
      count: scans.length,
      profile: normalizedProfile,
      profileSource: requestFramework || requestProfile ? "request_override" : savedFramework || savedProfile ? "saved_default" : "none"
    });

    res.status(201).json({
      parentMode: "multi-account",
      queued: scans.length,
      scans
    });
    return;
  }

  const scan = await prisma.scanJob.create({
    data: {
      tenantId,
      integrationId: integration.id,
      requestedByUserId: req.auth!.sub,
      provider: integration.provider,
      framework: effectiveFramework,
      status: ScanStatus.QUEUED,
      ...(normalizedProfile ? { metadataJson: JSON.stringify({ profile: normalizedProfile }) } : {})
    }
  });

  await writeAuditLog(req, tenantId, "scan.queue", "scan", scan.id, {
    provider: scan.provider,
    framework: scan.framework,
    profile: normalizedProfile,
    profileSource: requestFramework || requestProfile ? "request_override" : savedFramework || savedProfile ? "saved_default" : "none"
  });
  res.status(201).json(scan);
});

app.get("/tenants/:tenantId/scans", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const statusFilter = typeof req.query.status === "string" && ["QUEUED", "RUNNING", "COMPLETED", "FAILED"].includes(req.query.status.toUpperCase()) ? req.query.status.toUpperCase() as ScanStatus : undefined;
  const providerFilter = req.query.provider ? Provider[req.query.provider as keyof typeof Provider] : undefined;
  const page = Math.max(1, parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(typeof req.query.pageSize === "string" ? req.query.pageSize : "50", 10) || 50));

  const where: Prisma.ScanJobWhereInput = {
    tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(providerFilter ? { provider: providerFilter } : {})
  };

  const [scans, total] = await Promise.all([
    prisma.scanJob.findMany({ where, orderBy: { createdAt: "desc" }, take: pageSize, skip: (page - 1) * pageSize, include: { integration: { select: { name: true } } } }),
    prisma.scanJob.count({ where })
  ]);

  res.json({
    scans: scans.map((s) => ({ ...s, integrationName: s.integration?.name ?? null, integration: undefined })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
});

app.get("/tenants/:tenantId/scans/worker-events", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const requestedLimit = Number(first(req.query.limit as string | string[] | undefined) || "25");
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(Math.floor(requestedLimit), 100) : 25;
  const candidateTake = Math.min(limit * 4, 200);

  const scans = await prisma.scanJob.findMany({
    where: { tenantId: first(req.params.tenantId) },
    orderBy: { createdAt: "desc" },
    take: candidateTake
  });

  const events = scans
    .map((scan) => {
      if (!scan.metadataJson) return null;
      try {
        const metadata = JSON.parse(scan.metadataJson) as Record<string, unknown>;
        const workerRaw = metadata.worker;
        if (!workerRaw || typeof workerRaw !== "object" || Array.isArray(workerRaw)) return null;
        const worker = workerRaw as Record<string, unknown>;
        const claimRaw = worker.claim;
        const claim = claimRaw && typeof claimRaw === "object" && !Array.isArray(claimRaw) ? (claimRaw as Record<string, unknown>) : null;
        return {
          scanId: scan.id,
          status: scan.status,
          provider: scan.provider,
          framework: scan.framework,
          createdAt: scan.createdAt,
          startedAt: scan.startedAt,
          completedAt: scan.completedAt,
          worker: {
            state: worker.state ?? null,
            attempt: worker.attempt ?? null,
            maxRetries: worker.maxRetries ?? null,
            failureCategory: worker.failureCategory ?? null,
            retryable: worker.retryable ?? null,
            lastError: worker.lastError ?? null,
            updatedAt: worker.updatedAt ?? null,
            claim: claim
              ? {
                  at: claim.at ?? null,
                  by: claim.by ?? null,
                  runtime: claim.runtime ?? null
                }
              : null
          }
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, limit);

  res.json({
    events,
    count: events.length,
    limit
  });
});

app.get("/tenants/:tenantId/scans/:scanId/worker-metadata", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const scan = await prisma.scanJob.findUnique({ where: { id: first(req.params.scanId) } });
  if (!scan || scan.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  let metadata: Record<string, unknown> | undefined;
  if (scan.metadataJson) {
    metadata = parseObjectJson(scan.metadataJson);
    if (!metadata) {
      res.status(500).json({ error: "Invalid scan metadata format" });
      return;
    }
  }

  const workerRaw = metadata?.worker;
  const worker = workerRaw && typeof workerRaw === "object" && !Array.isArray(workerRaw) ? workerRaw : null;
  const dispatch = parseDispatchSummary(metadata?.dispatch);
  res.json({
    scan: {
      id: scan.id,
      tenantId: scan.tenantId,
      provider: scan.provider,
      framework: scan.framework,
      status: scan.status,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt
    },
    worker,
    dispatch,
    dispatchError: typeof metadata?.dispatchError === "string" ? metadata.dispatchError : null,
    runtime: metadata?.runtime ?? null,
    failure: {
      error: metadata?.error ?? scan.errorMessage ?? null,
      failedAt: metadata?.failedAt ?? null
    }
  });
});

app.get("/tenants/:tenantId/scans/:scanId/dispatch", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const scan = await prisma.scanJob.findUnique({ where: { id: first(req.params.scanId) } });
  if (!scan || scan.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const metadata = parseObjectJson(scan.metadataJson);
  const dispatch = parseDispatchSummary(metadata?.dispatch ?? null);
  res.status(200).json({
    scanId: scan.id,
    status: scan.status,
    dispatch,
    dispatchError: typeof metadata?.dispatchError === "string" ? metadata.dispatchError : null,
    replayHistory: Array.isArray(metadata?.dispatchReplayHistory) ? metadata.dispatchReplayHistory : []
  });
});

app.post("/tenants/:tenantId/scans/:scanId/dispatch/replay", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const scan = await prisma.scanJob.findUnique({ where: { id: first(req.params.scanId) } });
  if (!scan || scan.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }
  if (scan.status !== ScanStatus.COMPLETED) {
    res.status(409).json({ error: "Dispatch replay is allowed only for completed scans." });
    return;
  }

  const metadata = parseObjectJson(scan.metadataJson) ?? {};
  const dispatch = parseDispatchSummary(metadata.dispatch);
  if (!dispatch || dispatch.deliveries.length === 0) {
    res.status(400).json({ error: "No dispatch deliveries found for this scan." });
    return;
  }

  const now = new Date().toISOString();
  const replayed: DispatchDelivery[] = [];
  const failed: DispatchDelivery[] = [];

  for (const delivery of dispatch.deliveries) {
    if (delivery.status !== "FAILED") continue;
    const replayPayload: Record<string, unknown> = {
      version: 1,
      replay: true,
      replayedAt: now,
      endpoint: {
        id: delivery.endpointId,
        type: delivery.endpointType,
        target: delivery.target
      },
      scan: {
        id: scan.id,
        tenantId: scan.tenantId
      }
    };
    if (delivery.endpointType === "amazon_s3") {
      const parsedTarget = parseS3Target(delivery.target);
      if (!parsedTarget) {
        failed.push({
          ...delivery,
          attemptedAt: now,
          outboxPath: null,
          error: "Invalid S3 target format (expected s3://bucket[/prefix])"
        });
        continue;
      }
      replayPayload.destination = {
        bucket: parsedTarget.bucket,
        prefix: parsedTarget.prefix,
        objectKey: `${parsedTarget.prefix ? `${parsedTarget.prefix}/` : ""}${scan.id}.json`
      };
    }

    try {
      const outboxPath = await persistReplayOutboxItem(delivery.endpointType, scan.tenantId, delivery.endpointId, scan.id, replayPayload);
      replayed.push({
        ...delivery,
        status: "QUEUED",
        attemptedAt: now,
        outboxPath,
        error: null
      });
    } catch (error) {
      failed.push({
        ...delivery,
        status: "FAILED",
        attemptedAt: now,
        outboxPath: null,
        error: error instanceof Error ? error.message : "Replay outbox persistence failed"
      });
    }
  }

  const untouched = dispatch.deliveries.filter((delivery) => delivery.status !== "FAILED");
  const nextDeliveries = [...untouched, ...replayed, ...failed];
  const updatedDispatch: ScanDispatchSummary = {
    configuredEndpoints: dispatch.configuredEndpoints,
    queued: nextDeliveries.filter((delivery) => delivery.status === "QUEUED").length,
    failed: nextDeliveries.filter((delivery) => delivery.status === "FAILED").length,
    deliveries: nextDeliveries,
    updatedAt: now
  };

  const replayHistory = Array.isArray(metadata.dispatchReplayHistory)
    ? metadata.dispatchReplayHistory
    : [];
  const replayEntry = {
    at: now,
    by: req.auth?.sub ?? null,
    replayed: replayed.length,
    failed: failed.length
  };

  const nextMetadata: ScanMetadataRecord = {
    ...metadata,
    dispatch: updatedDispatch,
    dispatchError: null,
    dispatchReplayHistory: [...replayHistory, replayEntry].slice(-20)
  };

  await prisma.scanJob.update({
    where: { id: scan.id },
    data: { metadataJson: JSON.stringify(nextMetadata) }
  });

  await writeAuditLog(req, scan.tenantId, "scan.dispatch.replay", "scan", scan.id, replayEntry);
  res.status(200).json({
    scanId: scan.id,
    dispatch: updatedDispatch,
    replay: replayEntry
  });
});

app.get("/tenants/:tenantId/scans/:scanId/artifact", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const scan = await prisma.scanJob.findUnique({ where: { id: first(req.params.scanId) } });
  if (!scan || scan.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  if (!scan.metadataJson) {
    res.status(404).json({ error: "Artifact not available for this scan" });
    return;
  }

  let artifactRelativePath: string | undefined;
  try {
    const metadata = JSON.parse(scan.metadataJson) as { artifactRelativePath?: unknown };
    artifactRelativePath = typeof metadata.artifactRelativePath === "string" ? metadata.artifactRelativePath : undefined;
  } catch {
    res.status(500).json({ error: "Invalid scan metadata format" });
    return;
  }

  if (!artifactRelativePath) {
    res.status(404).json({ error: "Artifact not available for this scan" });
    return;
  }

  const artifactRoot = path.resolve(env.SCANNER_ARTIFACTS_DIR);
  const artifactPath = path.isAbsolute(artifactRelativePath)
    ? artifactRelativePath
    : path.resolve(process.cwd(), artifactRelativePath);
  const normalizedRoot = `${artifactRoot}${path.sep}`;
  const normalizedPath = path.resolve(artifactPath);

  if (!(normalizedPath === artifactRoot || normalizedPath.startsWith(normalizedRoot))) {
    res.status(403).json({ error: "Artifact path is outside allowed storage" });
    return;
  }

  try {
    const artifact = await fs.readFile(normalizedPath);
    res.setHeader("content-type", "application/json");
    res.setHeader("content-disposition", `attachment; filename=\"${path.basename(normalizedPath)}\"`);
    res.status(200).send(artifact);
  } catch {
    res.status(404).json({ error: "Artifact file not found" });
  }
});

app.get("/tenants/:tenantId/findings", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const provider = req.query.provider ? Provider[req.query.provider as keyof typeof Provider] : undefined;
  const severity = req.query.severity ? Severity[req.query.severity as keyof typeof Severity] : undefined;
  const framework = typeof req.query.framework === "string" ? req.query.framework : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const sortBy = typeof req.query.sortBy === "string" && ["riskScore", "severity", "detectedAt"].includes(req.query.sortBy) ? req.query.sortBy : "riskScore";
  const sortDir = typeof req.query.sortDir === "string" && req.query.sortDir === "asc" ? "asc" as const : "desc" as const;
  const page = Math.max(1, parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(typeof req.query.pageSize === "string" ? req.query.pageSize : "50", 10) || 50));

  const where: Prisma.FindingWhereInput = {
    tenantId,
    ...(provider ? { provider } : {}),
    ...(severity ? { severity } : {}),
    ...(framework ? { framework } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search } },
        { resourceId: { contains: search } },
        { description: { contains: search } }
      ]
    } : {})
  };

  const orderBy: Prisma.FindingOrderByWithRelationInput[] =
    sortBy === "severity" ? [{ severity: sortDir }, { riskScore: "desc" }]
    : sortBy === "detectedAt" ? [{ detectedAt: sortDir }]
    : [{ riskScore: sortDir }, { detectedAt: "desc" }];

  const [findings, total] = await Promise.all([
    prisma.finding.findMany({ where, orderBy, take: pageSize, skip: (page - 1) * pageSize }),
    prisma.finding.count({ where })
  ]);

  res.json({
    findings: findings.map((f) => ({ ...f, complianceTags: parseComplianceTags(f.complianceTags) })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  });
});

app.get("/tenants/:tenantId/findings/export", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const provider = req.query.provider ? Provider[req.query.provider as keyof typeof Provider] : undefined;
  const severity = req.query.severity ? Severity[req.query.severity as keyof typeof Severity] : undefined;
  const framework = typeof req.query.framework === "string" ? req.query.framework : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

  const where: Prisma.FindingWhereInput = {
    tenantId,
    ...(provider ? { provider } : {}),
    ...(severity ? { severity } : {}),
    ...(framework ? { framework } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search } },
        { resourceId: { contains: search } },
        { description: { contains: search } }
      ]
    } : {})
  };

  const findings = await prisma.finding.findMany({
    where,
    orderBy: [{ riskScore: "desc" }, { detectedAt: "desc" }],
    take: 10000
  });

  const csvEscape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };

  const header = "ID,Severity,Status,Provider,Framework,Title,Description,Risk Score,Resource ID,Category,Compliance Tags,External ID,Detected At\n";
  const rows = findings.map((f) => [
    f.id,
    f.severity,
    f.status,
    f.provider,
    f.framework ?? "",
    csvEscape(f.title ?? ""),
    csvEscape(f.description ?? ""),
    String(f.riskScore ?? 0),
    csvEscape(f.resourceId ?? ""),
    csvEscape(f.category ?? ""),
    csvEscape(parseComplianceTags(f.complianceTags).join("; ")),
    f.externalId ?? "",
    f.detectedAt?.toISOString() ?? ""
  ].join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="findings-${tenantId}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(header + rows);
});

app.patch("/tenants/:tenantId/findings/bulk-status", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const validStatuses = ["OPEN", "ACKNOWLEDGED", "FALSE_POSITIVE", "REMEDIATED", "CLOSED"];
  const newStatus = typeof req.body?.status === "string" ? req.body.status.toUpperCase() : null;
  const findingIds = Array.isArray(req.body?.findingIds) ? req.body.findingIds.filter((id: unknown): id is string => typeof id === "string") : [];

  if (!newStatus || !validStatuses.includes(newStatus)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    return;
  }
  if (findingIds.length === 0 || findingIds.length > 100) {
    res.status(400).json({ error: "Provide between 1 and 100 finding IDs." });
    return;
  }

  const result = await prisma.finding.updateMany({ where: { id: { in: findingIds }, tenantId }, data: { status: newStatus } });
  await writeAuditLog(req, tenantId, "finding.bulk_status_change", "finding", undefined, { count: result.count, status: newStatus, findingIds: findingIds.slice(0, 10) });
  res.json({ updated: result.count });
});

app.patch("/tenants/:tenantId/findings/:findingId", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const findingId = first(req.params.findingId);
  const validStatuses = ["OPEN", "ACKNOWLEDGED", "FALSE_POSITIVE", "REMEDIATED", "CLOSED"];
  const newStatus = typeof req.body?.status === "string" ? req.body.status.toUpperCase() : null;
  if (!newStatus || !validStatuses.includes(newStatus)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const finding = await prisma.finding.findFirst({ where: { id: findingId, tenantId } });
  if (!finding) { res.status(404).json({ error: "Finding not found" }); return; }

  const updated = await prisma.finding.update({ where: { id: findingId }, data: { status: newStatus } });
  await writeAuditLog(req, tenantId, "finding.status_change", "finding", findingId, { from: finding.status, to: newStatus });
  res.json({ finding: { ...updated, complianceTags: parseComplianceTags(updated.complianceTags) } });
});

app.get("/tenants/:tenantId/findings/prioritized", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const findings = await prisma.finding.findMany({
    where: { tenantId: first(req.params.tenantId), status: "OPEN" },
    orderBy: [{ riskScore: "desc" }, { detectedAt: "desc" }],
    take: 100
  });
  res.json({ findings: findings.map((f) => ({ ...f, complianceTags: parseComplianceTags(f.complianceTags) })) });
});

app.get("/tenants/:tenantId/compliance", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const findings = await prisma.finding.findMany({ where: { tenantId: first(req.params.tenantId) }, select: { complianceTags: true, severity: true, status: true } });
  const mapped = new Map<string, { total: number; open: number; critical: number }>();
  findings.forEach((f) => {
    const tags = parseComplianceTags(f.complianceTags);
    tags.forEach((tag) => {
      const current = mapped.get(tag) ?? { total: 0, open: 0, critical: 0 };
      current.total += 1;
      if (f.status === "OPEN") current.open += 1;
      if (f.severity === Severity.CRITICAL) current.critical += 1;
      mapped.set(tag, current);
    });
  });
  res.json({ frameworks: Array.from(mapped.entries()).map(([framework, stats]) => ({ framework, ...stats })) });
});

app.get("/tenants/:tenantId/assets", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;

  const tenantId = first(req.params.tenantId);
  const providerFilter = req.query.provider ? Provider[req.query.provider as keyof typeof Provider] : undefined;
  const assetType = typeof req.query.assetType === "string" ? req.query.assetType : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const page = Math.max(1, parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(typeof req.query.pageSize === "string" ? req.query.pageSize : "50", 10) || 50));

  const where: Prisma.AssetWhereInput = {
    tenantId,
    ...(providerFilter ? { provider: providerFilter } : {}),
    ...(assetType ? { assetType } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search } },
        { externalId: { contains: search } }
      ]
    } : {})
  };

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: [{ criticality: "desc" }, { lastSeenAt: "desc" }], take: pageSize, skip: (page - 1) * pageSize }),
    prisma.asset.count({ where })
  ]);

  res.json({ assets, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

app.get("/tenants/:tenantId/dashboard/executive", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);
  const [findingsCount, scansCount, openCritical, assetsCount] = await Promise.all([
    prisma.finding.count({ where: { tenantId } }),
    prisma.scanJob.count({ where: { tenantId } }),
    prisma.finding.count({ where: { tenantId, status: "OPEN", severity: Severity.CRITICAL } }),
    prisma.asset.count({ where: { tenantId } })
  ]);
  const topRisks = await prisma.finding.findMany({ where: { tenantId, status: "OPEN" }, orderBy: [{ riskScore: "desc" }], take: 5, select: { id: true, title: true, provider: true, riskScore: true, resourceId: true } });
  res.json({ summary: { findingsCount, scansCount, openCritical, assetsCount }, topRisks });
});

app.get("/tenants/:tenantId/dashboard/posture", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const tenantId = first(req.params.tenantId);

  const [findings, scans, assetsByProvider] = await Promise.all([
    prisma.finding.findMany({
      where: { tenantId },
      select: { provider: true, severity: true, status: true, framework: true, category: true, detectedAt: true }
    }),
    prisma.scanJob.findMany({
      where: { tenantId },
      select: { provider: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000
    }),
    prisma.asset.groupBy({
      by: ["provider"],
      where: { tenantId },
      _count: { _all: true }
    })
  ]);

  const severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const openSeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const frameworkMap = new Map<string, { framework: string; total: number; open: number; critical: number }>();
  const serviceWatchlistMap = new Map<string, { service: string; open: number; criticalOpen: number; total: number }>();
  const providerMap = new Map<
    Provider,
    {
      provider: Provider;
      findings: number;
      openFindings: number;
      criticalOpen: number;
      assets: number;
      lastScanStatus: ScanStatus | null;
      lastScanAt: string | null;
    }
  >();

  for (const provider of Object.values(Provider)) {
    providerMap.set(provider, {
      provider,
      findings: 0,
      openFindings: 0,
      criticalOpen: 0,
      assets: 0,
      lastScanStatus: null,
      lastScanAt: null
    });
  }

  for (const finding of findings) {
    severity[finding.severity] += 1;
    if (finding.status === "OPEN") openSeverity[finding.severity] += 1;

    const providerStats = providerMap.get(finding.provider);
    if (providerStats) {
      providerStats.findings += 1;
      if (finding.status === "OPEN") providerStats.openFindings += 1;
      if (finding.status === "OPEN" && finding.severity === Severity.CRITICAL) providerStats.criticalOpen += 1;
    }

    const framework = finding.framework || "UNKNOWN";
    const row = frameworkMap.get(framework) ?? { framework, total: 0, open: 0, critical: 0 };
    row.total += 1;
    if (finding.status === "OPEN") row.open += 1;
    if (finding.status === "OPEN" && finding.severity === Severity.CRITICAL) row.critical += 1;
    frameworkMap.set(framework, row);

    const service = (finding.category ?? "General").trim() || "General";
    const serviceRow = serviceWatchlistMap.get(service) ?? { service, open: 0, criticalOpen: 0, total: 0 };
    serviceRow.total += 1;
    if (finding.status === "OPEN") serviceRow.open += 1;
    if (finding.status === "OPEN" && finding.severity === Severity.CRITICAL) serviceRow.criticalOpen += 1;
    serviceWatchlistMap.set(service, serviceRow);
  }

  for (const entry of assetsByProvider) {
    const providerStats = providerMap.get(entry.provider);
    if (providerStats) providerStats.assets = entry._count._all;
  }

  for (const scan of scans) {
    const providerStats = providerMap.get(scan.provider);
    if (!providerStats || providerStats.lastScanAt) continue;
    providerStats.lastScanAt = scan.createdAt.toISOString();
    providerStats.lastScanStatus = scan.status;
  }

  const scanStatusSummary = { QUEUED: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
  const recentScanMap = new Map<string, { date: string; total: number; queued: number; running: number; completed: number; failed: number }>();
  const recentFindingMap = new Map<
    string,
    { date: string; total: number; critical: number; high: number; medium: number; low: number; info: number }
  >();
  const now = new Date();
  const windowDays = 14;
  const dayMs = 24 * 60 * 60 * 1000;
  const rangeStart = new Date(now.getTime() - (windowDays - 1) * dayMs);

  for (let i = 0; i < windowDays; i += 1) {
    const day = new Date(rangeStart.getTime() + i * dayMs).toISOString().slice(0, 10);
    recentScanMap.set(day, { date: day, total: 0, queued: 0, running: 0, completed: 0, failed: 0 });
    recentFindingMap.set(day, { date: day, total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  }

  for (const scan of scans) {
    scanStatusSummary[scan.status] += 1;
    const day = scan.createdAt.toISOString().slice(0, 10);
    const bucket = recentScanMap.get(day);
    if (!bucket) continue;
    bucket.total += 1;
    if (scan.status === ScanStatus.QUEUED) bucket.queued += 1;
    if (scan.status === ScanStatus.RUNNING) bucket.running += 1;
    if (scan.status === ScanStatus.COMPLETED) bucket.completed += 1;
    if (scan.status === ScanStatus.FAILED) bucket.failed += 1;
  }

  for (const finding of findings) {
    const day = finding.detectedAt.toISOString().slice(0, 10);
    const bucket = recentFindingMap.get(day);
    if (!bucket) continue;
    bucket.total += 1;
    if (finding.severity === Severity.CRITICAL) bucket.critical += 1;
    if (finding.severity === Severity.HIGH) bucket.high += 1;
    if (finding.severity === Severity.MEDIUM) bucket.medium += 1;
    if (finding.severity === Severity.LOW) bucket.low += 1;
    if (finding.severity === Severity.INFO) bucket.info += 1;
  }

  const openFindings = findings.filter((finding) => finding.status === "OPEN").length;
  const openCritical = findings.filter((finding) => finding.status === "OPEN" && finding.severity === Severity.CRITICAL).length;
  const assetsCount = assetsByProvider.reduce((sum, entry) => sum + entry._count._all, 0);
  const frameworkWatchlist = Array.from(frameworkMap.values())
    .filter((item) => item.open > 0)
    .sort((a, b) => b.critical - a.critical || b.open - a.open || b.total - a.total)
    .slice(0, 8);
  const serviceWatchlist = Array.from(serviceWatchlistMap.values())
    .filter((item) => item.open > 0)
    .sort((a, b) => b.criticalOpen - a.criticalOpen || b.open - a.open || b.total - a.total)
    .slice(0, 8);

  res.status(200).json({
    summary: {
      findingsCount: findings.length,
      openFindings,
      openCritical,
      assetsCount,
      scansCount: scans.length,
      scanStatus: scanStatusSummary
    },
    severity,
    openSeverity,
    providerStats: Array.from(providerMap.values()),
    frameworkStats: Array.from(frameworkMap.values()).sort((a, b) => b.critical - a.critical || b.open - a.open || b.total - a.total).slice(0, 20),
    watchlists: {
      frameworks: frameworkWatchlist,
      services: serviceWatchlist
    },
    recentScans: Array.from(recentScanMap.values()),
    recentFindings: Array.from(recentFindingMap.values()),
    riskPipeline: {
      criticalOpen: openSeverity.CRITICAL,
      highOpen: openSeverity.HIGH,
      mediumOpen: openSeverity.MEDIUM,
      lowOpen: openSeverity.LOW,
      infoOpen: openSeverity.INFO,
      closedFindings: findings.length - openFindings
    }
  });
});

app.get("/tenants/:tenantId/audit-logs", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const logs = await prisma.auditLog.findMany({ where: { tenantId: first(req.params.tenantId) }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ logs });
});

app.post("/tenants/:tenantId/schedules", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const body = z.object({ name: z.string().min(2), cron: z.string().min(5), provider: z.nativeEnum(Provider).optional(), framework: z.string().optional() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const item = await prisma.schedulePolicy.create({ data: { tenantId: first(req.params.tenantId), ...body.data } });
  await writeAuditLog(req, first(req.params.tenantId), "schedule.create", "schedule", item.id, body.data);
  res.status(201).json(item);
});

app.get("/tenants/:tenantId/schedules", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const items = await prisma.schedulePolicy.findMany({ where: { tenantId: first(req.params.tenantId) }, orderBy: { createdAt: "desc" } });
  res.json({ schedules: items });
});

app.post("/tenants/:tenantId/alert-endpoints", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;
  const body = createAlertEndpointSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (!isValidAlertEndpointTarget(body.data.endpointType, body.data.target)) {
    res.status(400).json({ error: `Invalid target for endpoint type ${body.data.endpointType}` });
    return;
  }
  const endpoint = await prisma.alertEndpoint.create({ data: { tenantId: first(req.params.tenantId), ...body.data } });
  await writeAuditLog(req, first(req.params.tenantId), "alert-endpoint.create", "alert-endpoint", endpoint.id, { endpointType: endpoint.endpointType });
  res.status(201).json(endpoint);
});

app.get("/tenants/:tenantId/alert-endpoints", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN, Role.ANALYST, Role.VIEWER]);
  if (!auth) return;
  const endpoints = await prisma.alertEndpoint.findMany({ where: { tenantId: first(req.params.tenantId) }, orderBy: { createdAt: "desc" } });
  res.json({ endpoints });
});

app.patch("/tenants/:tenantId/alert-endpoints/:endpointId", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const endpoint = await prisma.alertEndpoint.findUnique({ where: { id: first(req.params.endpointId) } });
  if (!endpoint || endpoint.tenantId !== first(req.params.tenantId)) {
    res.status(404).json({ error: "Alert endpoint not found" });
    return;
  }

  const body = patchAlertEndpointSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const nextEndpointType = (body.data.endpointType ?? endpoint.endpointType) as AlertEndpointType;
  const nextTarget = body.data.target ?? endpoint.target;
  if (!isValidAlertEndpointTarget(nextEndpointType, nextTarget)) {
    res.status(400).json({ error: `Invalid target for endpoint type ${nextEndpointType}` });
    return;
  }

  const updated = await prisma.alertEndpoint.update({
    where: { id: endpoint.id },
    data: {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.endpointType !== undefined ? { endpointType: body.data.endpointType } : {}),
      ...(body.data.target !== undefined ? { target: body.data.target } : {}),
      ...(body.data.secretRef !== undefined ? { secretRef: body.data.secretRef } : {}),
      ...(body.data.isEnabled !== undefined ? { isEnabled: body.data.isEnabled } : {})
    }
  });

  await writeAuditLog(req, first(req.params.tenantId), "alert-endpoint.update", "alert-endpoint", updated.id, {
    fields: Object.keys(body.data)
  });

  res.status(200).json(updated);
});

app.delete("/tenants/:tenantId/alert-endpoints/:endpointId", authMiddleware, async (req: AuthedRequest, res) => {
  const auth = await requireTenantRole(req, res, [Role.OWNER, Role.ADMIN]);
  if (!auth) return;

  const deleted = await prisma.alertEndpoint.deleteMany({
    where: {
      id: first(req.params.endpointId),
      tenantId: first(req.params.tenantId)
    }
  });
  if (!deleted.count) {
    res.status(404).json({ error: "Alert endpoint not found" });
    return;
  }

  await writeAuditLog(req, first(req.params.tenantId), "alert-endpoint.delete", "alert-endpoint", first(req.params.endpointId));
  res.status(204).send();
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as AuthedRequest).requestId ?? randomUUID();
  // eslint-disable-next-line no-console
  console.error(`[api][${requestId}]`, error);
  res.status(500).json({ error: "Internal server error", requestId });
});
