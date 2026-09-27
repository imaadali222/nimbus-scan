import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, Provider, ScanStatus, Severity } from "@prisma/client";

const apiCwd = path.resolve(import.meta.dirname, "../../api");
const dbPath = path.resolve(apiCwd, "prisma/worker-integration.db");
const sourceDbPath = path.resolve(apiCwd, "prisma/dev.db");
const outboxRoot = path.resolve(import.meta.dirname, "../../../.runtime/exports/outbox-test");

let prisma: PrismaClient;
let processOneQueuedScan: () => Promise<boolean>;
let disconnectWorkerPrisma: () => Promise<void>;

async function createQueuedScan(input: {
  provider?: Provider;
  framework?: string;
  metadata: Record<string, unknown>;
}) {
  const provider = input.provider ?? Provider.AWS;
  const tenant = await prisma.tenant.create({
    data: { name: `Tenant ${Date.now()}`, slug: `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}` }
  });
  const integration = await prisma.integration.create({
    data: {
      tenantId: tenant.id,
      name: `${provider} Integration`,
      provider,
      configJson: JSON.stringify({ accountId: "123456789012", roleArn: "arn:aws:iam::123456789012:role/CSPMReadOnly" })
    }
  });

  return await prisma.scanJob.create({
    data: {
      tenantId: tenant.id,
      integrationId: integration.id,
      requestedByUserId: "test-user",
      status: ScanStatus.QUEUED,
      provider,
      framework: input.framework ?? "CIS",
      metadataJson: JSON.stringify(input.metadata)
    }
  });
}

function parseJson(raw: string | null | undefined) {
  if (!raw) return {} as Record<string, unknown>;
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeAll(async () => {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  if (fs.existsSync(outboxRoot)) fs.rmSync(outboxRoot, { recursive: true, force: true });
  fs.copyFileSync(sourceDbPath, dbPath);

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.WORKER_MAX_RETRIES = "1";
  process.env.WORKER_POLL_MS = "5";
  process.env.WORKER_EXPORT_OUTBOX_DIR = outboxRoot;
  process.env.SCANNER_RUNTIME = "local";
  process.env.AWS_FIRST_MODE = "false";
  process.env.WORKER_ONCE = "0";

  prisma = new PrismaClient();
  const workerModule = await import("./index.js");
  processOneQueuedScan = workerModule.processOneQueuedScan;
  disconnectWorkerPrisma = workerModule.disconnectWorkerPrisma;
});

beforeEach(async () => {
  if (fs.existsSync(outboxRoot)) fs.rmSync(outboxRoot, { recursive: true, force: true });
  await prisma.finding.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.scanJob.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenantHierarchy.deleteMany();
  await prisma.tenant.deleteMany();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (disconnectWorkerPrisma) await disconnectWorkerPrisma();
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
  if (fs.existsSync(outboxRoot)) fs.rmSync(outboxRoot, { recursive: true, force: true });
});

describe("worker integration behavior", () => {
  it("keeps finding count stable when same scan job is reprocessed", async () => {
    const queued = await createQueuedScan({
      provider: Provider.AWS,
      metadata: {
        testAdapter: {
          findings: [
            {
              provider: Provider.AWS,
              framework: "CIS",
              severity: Severity.HIGH,
              resourceId: "arn:aws:s3:::prod-bucket",
              title: "S3 bucket is public",
              category: "s3",
              externalId: "s3_public_access",
              description: "public bucket"
            },
            {
              provider: Provider.AWS,
              framework: "CIS",
              severity: Severity.HIGH,
              resourceId: "arn:aws:s3:::prod-bucket",
              title: "S3 bucket is public",
              category: "s3",
              externalId: "s3_public_access",
              description: "public bucket"
            }
          ]
        }
      }
    });

    expect(await processOneQueuedScan()).toBe(true);
    const firstCount = await prisma.finding.count({ where: { scanJobId: queued.id } });
    expect(firstCount).toBe(1);

    await prisma.scanJob.update({
      where: { id: queued.id },
      data: {
        status: ScanStatus.QUEUED,
        startedAt: null,
        completedAt: null,
        errorMessage: null
      }
    });

    expect(await processOneQueuedScan()).toBe(true);
    const secondCount = await prisma.finding.count({ where: { scanJobId: queued.id } });
    expect(secondCount).toBe(1);
  });

  it("transitions queued scan through retry and then failed when retry budget is exhausted", async () => {
    const queued = await createQueuedScan({
      provider: Provider.AWS,
      metadata: {
        testAdapter: {
          errorMessage: "network timeout to scanner backend"
        }
      }
    });

    expect(await processOneQueuedScan()).toBe(true);
    const afterFirstAttempt = await prisma.scanJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(afterFirstAttempt.status).toBe(ScanStatus.QUEUED);
    const firstMetadata = parseJson(afterFirstAttempt.metadataJson);
    const firstWorker = firstMetadata.worker as Record<string, unknown>;
    expect(firstWorker.state).toBe("QUEUED_FOR_RETRY");
    expect(firstWorker.attempt).toBe(1);

    expect(await processOneQueuedScan()).toBe(true);
    const afterSecondAttempt = await prisma.scanJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(afterSecondAttempt.status).toBe(ScanStatus.FAILED);
    expect(afterSecondAttempt.errorMessage).toContain("network timeout");
    const secondMetadata = parseJson(afterSecondAttempt.metadataJson);
    const secondWorker = secondMetadata.worker as Record<string, unknown>;
    expect(secondWorker.state).toBe("FAILED");
    expect(secondWorker.attempt).toBe(2);
  });

  it("writes downstream dispatch outbox items when endpoints are configured", async () => {
    const queued = await createQueuedScan({
      provider: Provider.AWS,
      metadata: {
        testAdapter: {
          findings: [
            {
              provider: Provider.AWS,
              framework: "CIS",
              severity: Severity.HIGH,
              resourceId: "arn:aws:iam::123456789012:user/security-audit",
              title: "IAM user without MFA",
              category: "iam",
              externalId: "iam_user_without_mfa",
              description: "MFA not enabled"
            }
          ]
        }
      }
    });

    await prisma.alertEndpoint.create({
      data: {
        tenantId: queued.tenantId,
        name: "S3 Export",
        endpointType: "amazon_s3",
        target: "s3://cspm-test-bucket/tenant-exports",
        isEnabled: true
      }
    });

    expect(await processOneQueuedScan()).toBe(true);
    const completed = await prisma.scanJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(completed.status).toBe(ScanStatus.COMPLETED);

    const metadata = parseJson(completed.metadataJson);
    const dispatch = metadata.dispatch as Record<string, unknown>;
    expect(dispatch.configuredEndpoints).toBe(1);
    expect(dispatch.queued).toBe(1);
    expect(dispatch.failed).toBe(0);

    const deliveries = dispatch.deliveries as Array<Record<string, unknown>>;
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]?.status).toBe("QUEUED");
    const outboxPath = String(deliveries[0]?.outboxPath ?? "");
    expect(outboxPath.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.resolve(process.cwd(), outboxPath))).toBe(true);
  });

  it("completes one smoke scan per supported provider via test adapter", async () => {
    const providers: Provider[] = [
      Provider.AWS,
      Provider.AZURE,
      Provider.GCP,
      Provider.KUBERNETES,
      Provider.M365,
      Provider.GITHUB,
      Provider.MONGODBATLAS,
      Provider.ORACLECLOUD,
      Provider.ALIBABACLOUD,
      Provider.CLOUDFLARE,
      Provider.OPENSTACK
    ];

    for (const provider of providers) {
      const queued = await createQueuedScan({
        provider,
        framework: provider === Provider.KUBERNETES ? "NSA" : "CIS",
        metadata: {
          testAdapter: {
            findings: [
              {
                severity: Severity.MEDIUM,
                resourceId: `${provider.toLowerCase()}-resource-1`,
                title: `${provider} smoke finding`,
                category: "smoke",
                externalId: `${provider.toLowerCase()}_smoke_1`,
                description: "provider smoke finding"
              }
            ]
          }
        }
      });

      expect(await processOneQueuedScan()).toBe(true);
      const completed = await prisma.scanJob.findUniqueOrThrow({ where: { id: queued.id } });
      expect(completed.status).toBe(ScanStatus.COMPLETED);
      const findings = await prisma.finding.findMany({ where: { scanJobId: queued.id } });
      expect(findings.length).toBe(1);
      expect(findings[0]?.provider).toBe(provider);
    }
  });
});
