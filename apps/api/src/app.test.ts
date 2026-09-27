import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { PrismaClient, ScanStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const cwd = path.resolve(import.meta.dirname, "..");
const dbPath = path.resolve(cwd, "prisma/dev.db");
const outboxRoot = path.resolve(cwd, "../../.runtime/exports/outbox-api-test");
const authStateFile = path.resolve(cwd, "../../.runtime/auth-state-api-test.json");
const prisma = new PrismaClient();
const strongPassword = "N3bula!Orbit9";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.JWT_SECRET = "test-secret-123456789";
  process.env.AWS_FIRST_MODE = "false";
  process.env.WORKER_EXPORT_OUTBOX_DIR = outboxRoot;
  process.env.AUTH_STATE_FILE = authStateFile;
  if (fs.existsSync(outboxRoot)) fs.rmSync(outboxRoot, { recursive: true, force: true });
  if (fs.existsSync(authStateFile)) fs.rmSync(authStateFile, { force: true });
  execSync("npx prisma db push --skip-generate", { cwd, stdio: "pipe", env: process.env });
});

afterAll(async () => {
  await prisma.$disconnect();
  if (fs.existsSync(outboxRoot)) fs.rmSync(outboxRoot, { recursive: true, force: true });
  if (fs.existsSync(authStateFile)) fs.rmSync(authStateFile, { force: true });
});

describe("CSPM API critical flow", () => {
  it("register -> integration -> queue scan -> list scans/findings", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `owner-${nonce}@example.com`,
      password: strongPassword,
      tenantName: "Acme",
      tenantSlug: `acme-${nonce}`
    });

    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const integration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "AWS Prod",
        provider: "AWS",
        config: { accountId: "123456789012", roleArn: "arn:aws:iam::123456789012:role/CSPM" }
      });

    expect(integration.status).toBe(201);

    const cloudflareIntegration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Cloudflare Edge",
        provider: "CLOUDFLARE",
        config: { accountId: "023e105f4ecef8ad9ca31a8372d0c353", apiTokenRef: "secret://sm/cloudflare/token" }
      });
    expect(cloudflareIntegration.status).toBe(201);

    const openstackIntegration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "OpenStack Prod",
        provider: "OPENSTACK",
        config: {
          authUrl: "https://keystone.example.com/v3",
          username: "cspm-user",
          passwordRef: "secret://sm/openstack/password",
          projectName: "security"
        }
      });
    expect(openstackIntegration.status).toBe(201);

    const scan = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({ integrationId: integration.body.id, framework: "CIS" });

    expect(scan.status).toBe(201);
    const scanId = scan.body.id as string;

    const cloudflareScan = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({ integrationId: cloudflareIntegration.body.id, framework: "CIS" });
    expect(cloudflareScan.status).toBe(201);

    const openstackScan = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({ integrationId: openstackIntegration.body.id, framework: "CIS" });
    expect(openstackScan.status).toBe(201);

    const scans = await request(app).get(`/tenants/${tenantId}/scans`).set("authorization", `Bearer ${token}`);
    expect(scans.status).toBe(200);
    expect(scans.body.scans.length).toBeGreaterThan(0);

    const workerEvents = await request(app)
      .get(`/tenants/${tenantId}/scans/worker-events`)
      .set("authorization", `Bearer ${token}`);
    expect(workerEvents.status).toBe(200);
    expect(Array.isArray(workerEvents.body.events)).toBe(true);
    expect(workerEvents.body.events.length).toBeGreaterThanOrEqual(0);
    expect((workerEvents.body.events as Array<{ worker?: object | null }>).every((event) => Boolean(event.worker))).toBe(true);

    const workerMeta = await request(app)
      .get(`/tenants/${tenantId}/scans/${scanId}/worker-metadata`)
      .set("authorization", `Bearer ${token}`);
    expect(workerMeta.status).toBe(200);
    expect(workerMeta.body.scan.id).toBe(scanId);
    expect(workerMeta.body.scan.status).toBe("QUEUED");
    expect(workerMeta.body.worker).toBeNull();
    expect(workerMeta.body.dispatch).toBeNull();

    const providerCatalog = await request(app)
      .get("/providers/catalog")
      .set("authorization", `Bearer ${token}`);
    expect(providerCatalog.status).toBe(200);
    const providerEntries = providerCatalog.body.providers as Array<{ provider: string; optionValues?: Record<string, string[]> }>;
    const providerNames = providerEntries.map((entry) => entry.provider);
    expect(providerNames).toContain("AWS");
    expect(providerNames).toContain("M365");
    expect(providerNames).toContain("GITHUB");
    expect(providerNames).toContain("MONGODBATLAS");
    expect(providerNames).toContain("ORACLECLOUD");
    expect(providerNames).toContain("ALIBABACLOUD");
    expect(providerNames).toContain("CLOUDFLARE");
    expect(providerNames).toContain("OPENSTACK");
    const awsCatalogEntry = providerEntries.find((entry) => entry.provider === "AWS");
    expect(Array.isArray(awsCatalogEntry?.optionValues?.services)).toBe(true);
    expect(Array.isArray(awsCatalogEntry?.optionValues?.regions)).toBe(true);

    const capabilityPreview = await request(app)
      .get("/system/provider-capabilities/preview")
      .set("authorization", `Bearer ${token}`);
    expect(capabilityPreview.status).toBe(200);
    expect(typeof capabilityPreview.body.source.filePath).toBe("string");
    expect(Array.isArray(capabilityPreview.body.providers)).toBe(true);
    expect(capabilityPreview.body.providers.length).toBeGreaterThan(0);

    const findings = await request(app).get(`/tenants/${tenantId}/findings`).set("authorization", `Bearer ${token}`);
    expect(findings.status).toBe(200);

    const invalidEndpoint = await request(app)
      .post(`/tenants/${tenantId}/alert-endpoints`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Bad S3 Export",
        endpointType: "amazon_s3",
        target: "bucket-without-scheme"
      });
    expect(invalidEndpoint.status).toBe(400);

    const endpoint = await request(app)
      .post(`/tenants/${tenantId}/alert-endpoints`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Primary S3 Export",
        endpointType: "amazon_s3",
        target: "s3://cspm-findings-export/test-prefix"
      });
    expect(endpoint.status).toBe(201);
    const endpointId = endpoint.body.id as string;

    const endpointList = await request(app)
      .get(`/tenants/${tenantId}/alert-endpoints`)
      .set("authorization", `Bearer ${token}`);
    expect(endpointList.status).toBe(200);
    const createdEndpoint = (endpointList.body.endpoints as Array<{ id: string; endpointType: string }>)
      .find((item) => item.id === endpointId);
    expect(createdEndpoint?.endpointType).toBe("amazon_s3");

    const endpointPatch = await request(app)
      .patch(`/tenants/${tenantId}/alert-endpoints/${endpointId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ isEnabled: false, target: "s3://cspm-findings-export/new-prefix" });
    expect(endpointPatch.status).toBe(200);
    expect(endpointPatch.body.isEnabled).toBe(false);

    const endpointDelete = await request(app)
      .delete(`/tenants/${tenantId}/alert-endpoints/${endpointId}`)
      .set("authorization", `Bearer ${token}`);
    expect(endpointDelete.status).toBe(204);

    const dispatchReplayWithoutMetadata = await request(app)
      .post(`/tenants/${tenantId}/scans/${scanId}/dispatch/replay`)
      .set("authorization", `Bearer ${token}`);
    expect(dispatchReplayWithoutMetadata.status).toBe(409);

    const completedAt = new Date();
    await prisma.scanJob.update({
      where: { id: scanId },
      data: {
        status: ScanStatus.COMPLETED,
        completedAt,
        metadataJson: JSON.stringify({
          dispatch: {
            configuredEndpoints: 1,
            queued: 0,
            failed: 1,
            deliveries: [
              {
                endpointId: "ep-failed-1",
                endpointType: "amazon_s3",
                target: "s3://cspm-findings-export/replay-test",
                status: "FAILED",
                attemptedAt: completedAt.toISOString(),
                outboxPath: null,
                error: "previous dispatch failure"
              }
            ],
            updatedAt: completedAt.toISOString()
          }
        })
      }
    });

    const dispatchRead = await request(app)
      .get(`/tenants/${tenantId}/scans/${scanId}/dispatch`)
      .set("authorization", `Bearer ${token}`);
    expect(dispatchRead.status).toBe(200);
    expect(dispatchRead.body.dispatch.failed).toBe(1);

    const dispatchReplay = await request(app)
      .post(`/tenants/${tenantId}/scans/${scanId}/dispatch/replay`)
      .set("authorization", `Bearer ${token}`);
    expect(dispatchReplay.status).toBe(200);
    expect(dispatchReplay.body.dispatch.failed).toBe(0);
    expect(dispatchReplay.body.dispatch.queued).toBe(1);

    const posture = await request(app).get(`/tenants/${tenantId}/dashboard/posture`).set("authorization", `Bearer ${token}`);
    expect(posture.status).toBe(200);
    expect(posture.body.summary.scansCount).toBeGreaterThan(0);
    expect(Array.isArray(posture.body.providerStats)).toBe(true);
    expect(Array.isArray(posture.body.watchlists?.services)).toBe(true);
    expect(Array.isArray(posture.body.watchlists?.frameworks)).toBe(true);
  });

  it("enforces password policy, throttles repeated failed logins, and supports token revoke", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const weakRegister = await request(app).post("/auth/register").send({
      email: `weak-${nonce}@example.com`,
      password: "password123",
      tenantName: `Weak Test ${nonce}`
    });
    expect(weakRegister.status).toBe(400);
    expect(String(weakRegister.body.error)).toContain("Password");

    const reg = await request(app).post("/auth/register").send({
      email: `auth-hardening-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `Auth Hardening ${nonce}`
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;

    const tenantsBeforeRevoke = await request(app)
      .get("/tenants")
      .set("authorization", `Bearer ${token}`);
    expect(tenantsBeforeRevoke.status).toBe(200);

    const revoke = await request(app)
      .post("/auth/revoke")
      .set("authorization", `Bearer ${token}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.ok).toBe(true);

    const tenantsAfterRevoke = await request(app)
      .get("/tenants")
      .set("authorization", `Bearer ${token}`);
    expect(tenantsAfterRevoke.status).toBe(401);

    const email = `lockout-${nonce}@example.com`;
    const regForLockout = await request(app).post("/auth/register").send({
      email,
      password: strongPassword,
      tenantName: `Lockout ${nonce}`
    });
    expect(regForLockout.status).toBe(201);

    for (let i = 0; i < 4; i++) {
      const badLogin = await request(app).post("/auth/login").send({ email, password: "WrongPass123!" });
      expect(badLogin.status).toBe(401);
    }

    const lockoutAttempt = await request(app).post("/auth/login").send({ email, password: "WrongPass123!" });
    expect(lockoutAttempt.status).toBe(429);
    expect(String(lockoutAttempt.body.error)).toContain("Too many failed login attempts");
    expect(Number(lockoutAttempt.headers["retry-after"])).toBeGreaterThan(0);

    const blockedValidLogin = await request(app).post("/auth/login").send({ email, password: strongPassword });
    expect(blockedValidLogin.status).toBe(429);
  });

  it("saves tenant default scan profiles and applies them to queued scans", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `scan-profile-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `Scan Profile ${nonce}`
    });
    expect(reg.status).toBe(201);

    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const integration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "AWS Saved Default",
        provider: "AWS",
        config: { accountId: "123456789012", roleArn: "arn:aws:iam::123456789012:role/CSPMReadOnly" }
      });
    expect(integration.status).toBe(201);
    const integrationId = integration.body.id as string;

    const putProfile = await request(app)
      .put(`/tenants/${tenantId}/scan-profiles/AWS`)
      .set("authorization", `Bearer ${token}`)
      .send({
        framework: "PCI-DSS",
        profile: {
          compliance: ["PCI-DSS"],
          regions: ["us-east-1"],
          severityThreshold: "HIGH"
        }
      });
    expect(putProfile.status).toBe(200);
    expect(putProfile.body.framework).toBe("PCI-DSS");
    expect(putProfile.body.profile.severityThreshold).toBe("HIGH");

    const getProfiles = await request(app)
      .get(`/tenants/${tenantId}/scan-profiles`)
      .set("authorization", `Bearer ${token}`);
    expect(getProfiles.status).toBe(200);
    expect(Array.isArray(getProfiles.body.profiles)).toBe(true);
    expect(getProfiles.body.profiles.some((p: { provider: string }) => p.provider === "AWS")).toBe(true);

    const queueWithSavedDefaults = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({ integrationId });
    expect(queueWithSavedDefaults.status).toBe(201);
    expect(queueWithSavedDefaults.body.framework).toBe("PCI-DSS");

    const savedDefaultScan = await prisma.scanJob.findUnique({ where: { id: queueWithSavedDefaults.body.id as string } });
    const savedDefaultMetadata = JSON.parse(String(savedDefaultScan?.metadataJson ?? "{}")) as { profile?: Record<string, unknown> };
    expect(savedDefaultMetadata.profile?.severityThreshold).toBe("HIGH");
    expect(savedDefaultMetadata.profile?.regions).toEqual(["us-east-1"]);
    expect(savedDefaultMetadata.profile?.compliance).toEqual(["PCI-DSS"]);

    const queueWithOverride = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({
        integrationId,
        profile: {
          checks: ["iam_root_user"],
          severityThreshold: "CRITICAL"
        }
      });
    expect(queueWithOverride.status).toBe(201);
    expect(queueWithOverride.body.framework).toBe("PCI-DSS");

    const overrideScan = await prisma.scanJob.findUnique({ where: { id: queueWithOverride.body.id as string } });
    const overrideMetadata = JSON.parse(String(overrideScan?.metadataJson ?? "{}")) as { profile?: Record<string, unknown> };
    expect(overrideMetadata.profile?.severityThreshold).toBe("CRITICAL");
    expect(overrideMetadata.profile?.regions).toEqual(["us-east-1"]);
    expect(overrideMetadata.profile?.checks).toEqual(["iam_root_user"]);

    const deleteProfile = await request(app)
      .delete(`/tenants/${tenantId}/scan-profiles/AWS`)
      .set("authorization", `Bearer ${token}`);
    expect(deleteProfile.status).toBe(204);

    const getDeleted = await request(app)
      .get(`/tenants/${tenantId}/scan-profiles/AWS`)
      .set("authorization", `Bearer ${token}`);
    expect(getDeleted.status).toBe(404);
  });

  it("allows MSP parent to inventory and update child integrations via global endpoints", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `msp-owner-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `MSP Root ${nonce}`
    });
    expect(reg.status).toBe(201);

    const token = reg.body.token as string;
    const parentTenantId = reg.body.tenant.id as string;
    const parentOwnerEmail = `msp-owner-${nonce}@example.com`;

    const blockedDemotion = await request(app)
      .post(`/tenants/${parentTenantId}/users`)
      .set("authorization", `Bearer ${token}`)
      .send({ email: parentOwnerEmail, role: "VIEWER" });
    expect(blockedDemotion.status).toBe(400);

    const sub = await request(app)
      .post(`/tenants/${parentTenantId}/subcustomers`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: `Customer ${nonce}` });
    expect(sub.status).toBe(201);
    const childTenantId = sub.body.tenant.id as string;

    const integration = await request(app)
      .post(`/tenants/${childTenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Child AWS",
        provider: "AWS",
        config: { accountId: "123456789012", roleArn: "arn:aws:iam::123456789012:role/CSPM" }
      });
    expect(integration.status).toBe(201);
    const integrationId = integration.body.id as string;

    const list = await request(app).get("/integrations").set("authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.integrations)).toBe(true);
    const listed = (list.body.integrations as Array<{ id: string; tenant: { id: string }; access: { via: string }; canManage: boolean }>)
      .find((item) => item.id === integrationId);
    expect(listed?.tenant.id).toBe(childTenantId);
    expect(listed?.access.via).toBe("msp_parent");
    expect(listed?.canManage).toBe(true);

    const patched = await request(app)
      .patch(`/integrations/${integrationId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ isActive: false, name: "Child AWS Disabled" });
    expect(patched.status).toBe(200);
    expect(patched.body.isActive).toBe(false);
    expect(patched.body.name).toBe("Child AWS Disabled");

    const listChild = await request(app)
      .get(`/tenants/${childTenantId}/integrations`)
      .set("authorization", `Bearer ${token}`);
    expect(listChild.status).toBe(200);
    const childUpdated = (listChild.body.integrations as Array<{ id: string; isActive: boolean; name: string }>)
      .find((item) => item.id === integrationId);
    expect(childUpdated?.isActive).toBe(false);
    expect(childUpdated?.name).toBe("Child AWS Disabled");
  });

  it("rejects plaintext secrets and redacts sensitive integration fields across responses", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `secrets-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `Secrets Test ${nonce}`
    });
    expect(reg.status).toBe(201);

    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const plaintextCreate = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure Plaintext Bad",
        provider: "AZURE",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecret: "plaintext-not-allowed"
        }
      });
    expect(plaintextCreate.status).toBe(400);
    expect(String(plaintextCreate.body.error)).toContain("Raw secret values are not allowed");

    const created = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure Ref OK",
        provider: "AZURE",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecretRef: "secret://sm/azure/client-secret"
        }
      });
    expect(created.status).toBe(201);
    expect(created.body.config.clientSecretRef).toBe("***redacted***");
    const integrationId = created.body.id as string;
    const persistedIntegration = await prisma.integration.findUnique({ where: { id: integrationId } });
    expect(persistedIntegration).not.toBeNull();
    expect(persistedIntegration!.configJson).toContain("enc:v1:");
    expect(persistedIntegration!.configJson).not.toContain("secret://sm/azure/client-secret");

    const tenantList = await request(app)
      .get(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`);
    expect(tenantList.status).toBe(200);
    const tenantListItem = (tenantList.body.integrations as Array<{ id: string; config: Record<string, string> }>)
      .find((item) => item.id === integrationId);
    expect(tenantListItem?.config.clientSecretRef).toBe("***redacted***");

    const globalList = await request(app)
      .get("/integrations")
      .set("authorization", `Bearer ${token}`);
    expect(globalList.status).toBe(200);
    const globalListItem = (globalList.body.integrations as Array<{ id: string; config: Record<string, string> }>)
      .find((item) => item.id === integrationId);
    expect(globalListItem?.config.clientSecretRef).toBe("***redacted***");

    const plaintextGlobalPatch = await request(app)
      .patch(`/integrations/${integrationId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecret: "still-not-allowed"
        }
      });
    expect(plaintextGlobalPatch.status).toBe(400);
    expect(String(plaintextGlobalPatch.body.error)).toContain("Raw secret values are not allowed");

    const globalPatched = await request(app)
      .patch(`/integrations/${integrationId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure Ref OK Updated",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecretRef: "secret://sm/azure/client-secret-v2"
        }
      });
    expect(globalPatched.status).toBe(200);
    expect(globalPatched.body.config.clientSecretRef).toBe("***redacted***");

    const plaintextPut = await request(app)
      .put(`/tenants/${tenantId}/integrations/${integrationId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure PUT Bad",
        provider: "AZURE",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecret: "nope"
        }
      });
    expect(plaintextPut.status).toBe(400);
    expect(String(plaintextPut.body.error)).toContain("Raw secret values are not allowed");

    const putGood = await request(app)
      .put(`/tenants/${tenantId}/integrations/${integrationId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure PUT OK",
        provider: "AZURE",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecretRef: "secret://sm/azure/client-secret-v3"
        }
      });
    expect(putGood.status).toBe(200);
    expect(putGood.body.config.clientSecretRef).toBe("***redacted***");
  });

  it("stores pasted secret-like values encrypted at rest when entered in *Ref fields", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `enc-at-rest-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `EncAtRest ${nonce}`
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const plaintextSecret = "SuperSecretAzureClientSecret!42";
    const created = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({
        name: "Azure Plain Secret UI Paste",
        provider: "AZURE",
        config: {
          tenantId: "11111111-1111-1111-1111-111111111111",
          subscriptionId: "22222222-2222-2222-2222-222222222222",
          clientId: "33333333-3333-3333-3333-333333333333",
          clientSecretRef: plaintextSecret
        }
      });

    expect(created.status).toBe(201);
    expect(created.body.config.clientSecretRef).toBe("***redacted***");
    const integrationId = created.body.id as string;

    const persisted = await prisma.integration.findUnique({ where: { id: integrationId } });
    expect(persisted).not.toBeNull();
    expect(persisted!.configJson).toContain("enc:v1:");
    expect(persisted!.configJson).not.toContain(plaintextSecret);
  });

  it("supports findings pagination, filtering, status updates, bulk updates, and CSV export", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `findings-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `FindingsTest ${nonce}`
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const integration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: "AWS Test", provider: "AWS", config: { accountId: "111111111111", roleArn: "arn:aws:iam::111111111111:role/CSPM" } });
    expect(integration.status).toBe(201);

    const seededScan = await request(app)
      .post(`/tenants/${tenantId}/scans`)
      .set("authorization", `Bearer ${token}`)
      .send({ integrationId: integration.body.id, framework: "CIS" });
    expect(seededScan.status).toBe(201);
    const scanJobId = seededScan.body.id as string;

    // seed findings directly
    for (let i = 0; i < 5; i++) {
      await prisma.finding.create({
        data: {
          tenantId,
          integrationId: integration.body.id,
          scanJobId,
          provider: "AWS",
          framework: i < 3 ? "CIS" : "NIST",
          severity: i === 0 ? "CRITICAL" : i === 1 ? "HIGH" : "MEDIUM",
          riskScore: 100 - i * 10,
          title: `Finding ${i} test title`,
          description: `Description for finding ${i}`,
          resourceId: `arn:aws:s3:::bucket-${i}`,
          status: "OPEN",
          complianceTags: JSON.stringify(i < 3 ? ["CIS"] : ["NIST"]),
          detectedAt: new Date()
        }
      });
    }

    // test default pagination
    const page1 = await request(app).get(`/tenants/${tenantId}/findings?pageSize=2&page=1`).set("authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.findings.length).toBe(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.totalPages).toBe(3);
    expect(page1.body.page).toBe(1);

    // test page 2
    const page2 = await request(app).get(`/tenants/${tenantId}/findings?pageSize=2&page=2`).set("authorization", `Bearer ${token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.findings.length).toBe(2);
    expect(page2.body.page).toBe(2);

    // test severity filter
    const critOnly = await request(app).get(`/tenants/${tenantId}/findings?severity=CRITICAL`).set("authorization", `Bearer ${token}`);
    expect(critOnly.status).toBe(200);
    expect(critOnly.body.total).toBe(1);
    expect(critOnly.body.findings[0].severity).toBe("CRITICAL");

    // test framework filter
    const nistOnly = await request(app).get(`/tenants/${tenantId}/findings?framework=NIST`).set("authorization", `Bearer ${token}`);
    expect(nistOnly.status).toBe(200);
    expect(nistOnly.body.total).toBe(2);

    // test search
    const searchResult = await request(app).get(`/tenants/${tenantId}/findings?search=bucket-0`).set("authorization", `Bearer ${token}`);
    expect(searchResult.status).toBe(200);
    expect(searchResult.body.total).toBeGreaterThanOrEqual(1);

    // test sort
    const sortAsc = await request(app).get(`/tenants/${tenantId}/findings?sortBy=riskScore&sortDir=asc`).set("authorization", `Bearer ${token}`);
    expect(sortAsc.status).toBe(200);
    expect(sortAsc.body.findings[0].riskScore).toBeLessThanOrEqual(sortAsc.body.findings[1].riskScore);

    // test single finding status update
    const findingId = page1.body.findings[0].id;
    const statusUpdate = await request(app)
      .patch(`/tenants/${tenantId}/findings/${findingId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ status: "ACKNOWLEDGED" });
    expect(statusUpdate.status).toBe(200);
    expect(statusUpdate.body.finding.status).toBe("ACKNOWLEDGED");

    // test status filter
    const ackOnly = await request(app).get(`/tenants/${tenantId}/findings?status=ACKNOWLEDGED`).set("authorization", `Bearer ${token}`);
    expect(ackOnly.status).toBe(200);
    expect(ackOnly.body.total).toBe(1);

    // test invalid status
    const badStatus = await request(app)
      .patch(`/tenants/${tenantId}/findings/${findingId}`)
      .set("authorization", `Bearer ${token}`)
      .send({ status: "INVALID" });
    expect(badStatus.status).toBe(400);

    // test bulk status update
    const allFindings = await request(app).get(`/tenants/${tenantId}/findings?pageSize=10`).set("authorization", `Bearer ${token}`);
    const bulkIds = allFindings.body.findings.slice(0, 3).map((f: { id: string }) => f.id);
    const bulkUpdate = await request(app)
      .patch(`/tenants/${tenantId}/findings/bulk-status`)
      .set("authorization", `Bearer ${token}`)
      .send({ findingIds: bulkIds, status: "REMEDIATED" });
    expect(bulkUpdate.status).toBe(200);
    expect(bulkUpdate.body.updated).toBe(3);

    // test CSV export
    const csvExport = await request(app).get(`/tenants/${tenantId}/findings/export`).set("authorization", `Bearer ${token}`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.headers["content-type"]).toContain("text/csv");
    expect(csvExport.text).toContain("ID,Severity,Status");
    expect(csvExport.text.split("\n").length).toBeGreaterThan(1);

    // test CSV export with filter
    const csvFiltered = await request(app).get(`/tenants/${tenantId}/findings/export?severity=CRITICAL`).set("authorization", `Bearer ${token}`);
    expect(csvFiltered.status).toBe(200);
    const csvLines = csvFiltered.text.split("\n").filter(Boolean);
    expect(csvLines.length).toBe(2); // header + 1 critical finding
  });

  it("supports assets pagination and filtering", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `assets-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `AssetsTest ${nonce}`
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    // seed assets
    for (let i = 0; i < 5; i++) {
      await prisma.asset.create({
        data: {
          tenantId,
          provider: i < 3 ? "AWS" : "AZURE",
          externalId: `asset-${nonce}-${i}`,
          name: `Asset ${i}`,
          assetType: i < 2 ? "S3Bucket" : "EC2Instance",
          criticality: i * 20,
          lastSeenAt: new Date(),
          firstSeenAt: new Date()
        }
      });
    }

    // test pagination
    const page1 = await request(app).get(`/tenants/${tenantId}/assets?pageSize=2&page=1`).set("authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.assets.length).toBe(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.totalPages).toBe(3);

    // test provider filter
    const azureOnly = await request(app).get(`/tenants/${tenantId}/assets?provider=AZURE`).set("authorization", `Bearer ${token}`);
    expect(azureOnly.status).toBe(200);
    expect(azureOnly.body.total).toBe(2);

    // test type filter
    const s3Only = await request(app).get(`/tenants/${tenantId}/assets?assetType=S3Bucket`).set("authorization", `Bearer ${token}`);
    expect(s3Only.status).toBe(200);
    expect(s3Only.body.total).toBe(2);

    // test search
    const searchResult = await request(app).get(`/tenants/${tenantId}/assets?search=Asset 1`).set("authorization", `Bearer ${token}`);
    expect(searchResult.status).toBe(200);
    expect(searchResult.body.total).toBeGreaterThanOrEqual(1);
  });

  it("supports scans pagination, filtering, and includes integration names", async () => {
    const { app } = await import("./app.js");

    const nonce = Date.now();
    const reg = await request(app).post("/auth/register").send({
      email: `scans-${nonce}@example.com`,
      password: strongPassword,
      tenantName: `ScansTest ${nonce}`
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token as string;
    const tenantId = reg.body.tenant.id as string;

    const integration = await request(app)
      .post(`/tenants/${tenantId}/integrations`)
      .set("authorization", `Bearer ${token}`)
      .send({ name: "AWS Scans Test", provider: "AWS", config: { accountId: "222222222222", roleArn: "arn:aws:iam::222222222222:role/CSPM" } });
    expect(integration.status).toBe(201);

    // queue scans
    await request(app).post(`/tenants/${tenantId}/scans`).set("authorization", `Bearer ${token}`).send({ integrationId: integration.body.id });
    await request(app).post(`/tenants/${tenantId}/scans`).set("authorization", `Bearer ${token}`).send({ integrationId: integration.body.id });

    // test scans list with pagination
    const scans = await request(app).get(`/tenants/${tenantId}/scans?pageSize=1&page=1`).set("authorization", `Bearer ${token}`);
    expect(scans.status).toBe(200);
    expect(scans.body.scans.length).toBe(1);
    expect(scans.body.total).toBe(2);
    expect(scans.body.scans[0].integrationName).toBe("AWS Scans Test");

    // test status filter
    const queuedOnly = await request(app).get(`/tenants/${tenantId}/scans?status=QUEUED`).set("authorization", `Bearer ${token}`);
    expect(queuedOnly.status).toBe(200);
    expect(queuedOnly.body.total).toBe(2);
  });
});
