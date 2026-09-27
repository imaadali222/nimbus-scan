import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const resolveProjectPath = (...segments: string[]) => path.resolve(projectRoot, ...segments);

dotenv.config({ path: resolveProjectPath(".env"), override: false });
dotenv.config({ path: resolveProjectPath("apps/worker/.env"), override: false });

const configuredDb = process.env.DATABASE_URL?.trim();
const workerRoot = resolveProjectPath("apps/worker");
const apiPrismaRoot = resolveProjectPath("apps/api/prisma");

const resolveDbFilePath = (value?: string) => {
  const fallback = resolveProjectPath("apps/api/prisma/dev.db");
  if (!value?.startsWith("file:")) return fallback;
  const raw = value.slice(5);
  if (path.isAbsolute(raw)) return raw;

  const prismaRelative = path.resolve(apiPrismaRoot, raw);
  const projectRelative = path.resolve(projectRoot, raw);
  const workerRelative = path.resolve(workerRoot, raw);
  if (fs.existsSync(prismaRelative)) return prismaRelative;
  if (fs.existsSync(projectRelative)) return projectRelative;
  if (fs.existsSync(workerRelative)) return workerRelative;
  return projectRelative;
};

const dbAbsolutePath = resolveDbFilePath(configuredDb);
const databaseUrl = configuredDb?.startsWith("file:")
  ? `file:${dbAbsolutePath}`
  : configuredDb || `file:${dbAbsolutePath}`;
process.env.DATABASE_URL = databaseUrl;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default(databaseUrl),
  INTEGRATION_CONFIG_ENCRYPTION_KEY: z.string().min(16).optional(),
  WORKER_PORT: z.coerce.number().default(4010),
  WORKER_POLL_MS: z.coerce.number().positive().default(2000),
  WORKER_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  WORKER_EXPORT_OUTBOX_DIR: z.string().min(1).default(resolveProjectPath(".runtime/exports/outbox")),
  SCANNER_RUNTIME: z.enum(["docker", "local"]).default("docker"),
  SCANNER_ARTIFACTS_DIR: z.string().min(1).default(resolveProjectPath(".runtime/artifacts/scans")),
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
  throw new Error(`Invalid worker environment: ${details}`);
}

export const env = {
  ...parsed.data,
  INTEGRATION_CONFIG_ENCRYPTION_KEY:
    parsed.data.INTEGRATION_CONFIG_ENCRYPTION_KEY?.trim() ||
    process.env.INTEGRATION_CONFIG_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "dev-only-integration-config-encryption-key"
};
