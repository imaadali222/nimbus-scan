import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const resolveProjectPath = (...segments: string[]) => path.resolve(projectRoot, ...segments);

dotenv.config({ path: resolveProjectPath(".env"), override: false });
dotenv.config({ path: resolveProjectPath("apps/api/.env"), override: false });

const configuredDb = process.env.DATABASE_URL?.trim();
const apiRoot = resolveProjectPath("apps/api");
const apiPrismaRoot = resolveProjectPath("apps/api/prisma");
const DEFAULT_DEV_JWT_SECRET = "dev-only-change-me-please";

const resolveDbFilePath = (value?: string) => {
  const fallback = resolveProjectPath("apps/api/prisma/dev.db");
  if (!value?.startsWith("file:")) return fallback;
  const raw = value.slice(5);
  if (path.isAbsolute(raw)) return raw;

  const prismaRelative = path.resolve(apiPrismaRoot, raw);
  const projectRelative = path.resolve(projectRoot, raw);
  const apiRelative = path.resolve(apiRoot, raw);
  if (fs.existsSync(prismaRelative)) return prismaRelative;
  if (fs.existsSync(projectRelative)) return projectRelative;
  if (fs.existsSync(apiRelative)) return apiRelative;
  return projectRelative;
};

const dbAbsolutePath = resolveDbFilePath(configuredDb);
const databaseUrl = configuredDb?.startsWith("file:")
  ? `file:${dbAbsolutePath}`
  : configuredDb || `file:${dbAbsolutePath}`;
process.env.DATABASE_URL = databaseUrl;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1).default(databaseUrl),
  JWT_SECRET: z.string().min(16).optional(),
  INTEGRATION_CONFIG_ENCRYPTION_KEY: z.string().min(16).optional(),
  AUTH_STATE_FILE: z.string().min(1).default(resolveProjectPath(".runtime/auth-state.json")),
  SCANNER_ARTIFACTS_DIR: z.string().min(1).default(resolveProjectPath(".runtime/artifacts/scans")),
  WORKER_EXPORT_OUTBOX_DIR: z.string().min(1).default(resolveProjectPath(".runtime/exports/outbox")),
  PROVIDER_CAPABILITIES_FILE: z.string().min(1).default(resolveProjectPath(".runtime/provider-capabilities.json")),
  SCANNER_RUNTIME: z.enum(["docker", "local"]).default("docker"),
  PROWLER_IMAGE: z.string().min(1).default("ghcr.io/prowler-cloud/prowler:4.6.0"),
  KUBESCAPE_IMAGE: z.string().min(1).default("quay.io/kubescape/kubescape:v3.0.26"),
  PROWLER_BINARY: z.string().min(1).default("prowler"),
  KUBESCAPE_BINARY: z.string().min(1).default("kubescape"),
  AWS_FIRST_MODE: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase() !== "false")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`).join("; ");
  throw new Error(`Invalid API environment: ${details}`);
}

const isProdLike = parsed.data.NODE_ENV === "production" || parsed.data.NODE_ENV === "staging";
const jwtSecret = parsed.data.JWT_SECRET?.trim() || DEFAULT_DEV_JWT_SECRET;
if (isProdLike && jwtSecret === DEFAULT_DEV_JWT_SECRET) {
  throw new Error("Invalid API environment: JWT_SECRET must be explicitly configured in production/staging.");
}

export const env = {
  ...parsed.data,
  JWT_SECRET: jwtSecret,
  INTEGRATION_CONFIG_ENCRYPTION_KEY:
    parsed.data.INTEGRATION_CONFIG_ENCRYPTION_KEY?.trim() || process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY?.trim() || jwtSecret
};
