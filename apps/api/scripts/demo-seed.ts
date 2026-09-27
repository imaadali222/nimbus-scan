import { PrismaClient, Provider, Role, ScanStatus, Severity } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../.env") });
loadEnv({ path: resolve(here, "../.env") });

const prisma = new PrismaClient();

const DEMO_OWNER_EMAIL = "demo-owner@cspm.local";
const DEMO_ANALYST_EMAIL = "demo-analyst@cspm.local";
const DEMO_PASSWORD = "DemoPilot!2026";

type IntegrationSeed = {
  name: string;
  provider: Provider;
  config: Record<string, unknown>;
};

function json(value: unknown) {
  return JSON.stringify(value);
}

async function ensureUser(email: string, passwordHash: string, isSuperAdmin = false) {
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, isSuperAdmin },
    create: { email, passwordHash, isSuperAdmin }
  });
}

async function ensureTenant(slug: string, name: string) {
  return prisma.tenant.upsert({
    where: { slug },
    update: { name },
    create: { slug, name }
  });
}

async function ensureMembership(userId: string, tenantId: string, role: Role) {
  return prisma.membership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { role },
    create: { userId, tenantId, role }
  });
}

async function resetDemoTenantData(tenantId: string) {
  await prisma.finding.deleteMany({ where: { tenantId } });
  await prisma.scanJob.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.integration.deleteMany({ where: { tenantId } });
  await prisma.tenantScanProfile.deleteMany({ where: { tenantId } });
  await prisma.alertEndpoint.deleteMany({ where: { tenantId } });
  await prisma.schedulePolicy.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
}

async function createIntegrations(tenantId: string, inputs: IntegrationSeed[]) {
  const created = [];
  for (const input of inputs) {
    const row = await prisma.integration.create({
      data: {
        tenantId,
        name: input.name,
        provider: input.provider,
        configJson: json(input.config),
        isActive: true
      }
    });
    created.push(row);
  }
  return created;
}

async function seedDemo() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [owner, analyst] = await Promise.all([
    ensureUser(DEMO_OWNER_EMAIL, passwordHash, false),
    ensureUser(DEMO_ANALYST_EMAIL, passwordHash, false)
  ]);

  const mspTenant = await ensureTenant("acme-mssp", "Acme MSSP Operations");
  const customerTenant = await ensureTenant("northwind-retail", "Northwind Retail (Customer)");

  await Promise.all([
    ensureMembership(owner.id, mspTenant.id, Role.OWNER),
    ensureMembership(owner.id, customerTenant.id, Role.OWNER),
    ensureMembership(analyst.id, customerTenant.id, Role.ANALYST)
  ]);

  await prisma.tenantHierarchy.upsert({
    where: { childTenantId: customerTenant.id },
    update: { parentTenantId: mspTenant.id },
    create: { parentTenantId: mspTenant.id, childTenantId: customerTenant.id }
  });

  await resetDemoTenantData(mspTenant.id);
  await resetDemoTenantData(customerTenant.id);

  await prisma.schedulePolicy.createMany({
    data: [
      {
        tenantId: customerTenant.id,
        name: "Daily AWS Critical/High",
        cron: "0 6 * * *",
        provider: Provider.AWS,
        framework: "CIS",
        isEnabled: true
      },
      {
        tenantId: customerTenant.id,
        name: "Weekly Azure Baseline",
        cron: "0 3 * * 1",
        provider: Provider.AZURE,
        framework: "CIS",
        isEnabled: true
      }
    ]
  });

  await prisma.alertEndpoint.createMany({
    data: [
      {
        tenantId: customerTenant.id,
        name: "Security Slack",
        endpointType: "slack",
        target: "https://hooks.slack.com/services/T000/B000/REDACTED",
        secretRef: "secret://demo/slack/webhook-signing",
        isEnabled: true
      }
    ]
  });

  const integrations = await createIntegrations(customerTenant.id, [
    {
      name: "AWS Production Org",
      provider: Provider.AWS,
      config: {
        accountIds: ["123456789012", "210987654321"],
        roleArn: "arn:aws:iam::123456789012:role/ProwlerAuditRole",
        externalId: "northwind-mssp-demo",
        regions: ["us-east-1", "us-west-2"]
      }
    },
    {
      name: "Azure Tenant",
      provider: Provider.AZURE,
      config: {
        tenantId: "11111111-2222-3333-4444-555555555555",
        subscriptionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        clientId: "99999999-8888-7777-6666-555555555555",
        clientSecretRef: "secret://demo/azure/northwind-client-secret"
      }
    },
    {
      name: "GCP Production",
      provider: Provider.GCP,
      config: {
        projectId: "northwind-prod",
        serviceAccountJsonRef: "secret://demo/gcp/northwind-sa-json"
      }
    },
    {
      name: "GitHub Org",
      provider: Provider.GITHUB,
      config: {
        organization: "northwind-retail",
        tokenRef: "secret://demo/github/pat"
      }
    }
  ]);

  const awsIntegration = integrations.find((i) => i.provider === Provider.AWS);
  const azureIntegration = integrations.find((i) => i.provider === Provider.AZURE);
  if (!awsIntegration || !azureIntegration) {
    throw new Error("Demo integrations were not created correctly");
  }

  await prisma.tenantScanProfile.createMany({
    data: [
      {
        tenantId: customerTenant.id,
        provider: Provider.AWS,
        framework: "CIS",
        profileJson: json({
          compliance: ["CIS-1.5", "AWS-Well-Architected-Security-Pillar"],
          services: ["iam", "s3", "ec2", "cloudtrail", "kms"],
          regions: ["us-east-1", "us-west-2"],
          severityThreshold: "HIGH"
        })
      },
      {
        tenantId: customerTenant.id,
        provider: Provider.AZURE,
        framework: "CIS",
        profileJson: json({
          compliance: ["CIS", "NIST-800-53"],
          categories: ["identity", "encryption", "networking"],
          severityThreshold: "MEDIUM"
        })
      }
    ]
  });

  const [ec2Asset, s3Asset, aadAsset] = await Promise.all([
    prisma.asset.create({
      data: {
        tenantId: customerTenant.id,
        provider: Provider.AWS,
        externalId: "i-0demoec2prod1",
        name: "prod-web-01",
        assetType: "ec2-instance",
        criticality: 82,
        metadataJson: json({ region: "us-east-1", env: "prod", owner: "platform" })
      }
    }),
    prisma.asset.create({
      data: {
        tenantId: customerTenant.id,
        provider: Provider.AWS,
        externalId: "arn:aws:s3:::northwind-prod-logs",
        name: "northwind-prod-logs",
        assetType: "s3-bucket",
        criticality: 76,
        metadataJson: json({ region: "us-east-1", dataClass: "logs" })
      }
    }),
    prisma.asset.create({
      data: {
        tenantId: customerTenant.id,
        provider: Provider.AZURE,
        externalId: "/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/resourceGroups/identity/providers/Microsoft.KeyVault/vaults/nw-prod-kv",
        name: "nw-prod-kv",
        assetType: "keyvault",
        criticality: 88,
        metadataJson: json({ region: "eastus", env: "prod" })
      }
    })
  ]);

  const now = new Date();
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  const completedAwsScan = await prisma.scanJob.create({
    data: {
      tenantId: customerTenant.id,
      integrationId: awsIntegration.id,
      requestedByUserId: owner.id,
      status: ScanStatus.COMPLETED,
      framework: "CIS",
      provider: Provider.AWS,
      startedAt: hoursAgo(4),
      completedAt: hoursAgo(3.7),
      metadataJson: json({
        scanner: "prowler",
        runtime: "docker",
        durationSeconds: 1096,
        summary: { totalFindings: 5, critical: 1, high: 2, medium: 2 }
      })
    }
  });

  const failedAwsScan = await prisma.scanJob.create({
    data: {
      tenantId: customerTenant.id,
      integrationId: awsIntegration.id,
      requestedByUserId: analyst.id,
      status: ScanStatus.FAILED,
      framework: "CIS",
      provider: Provider.AWS,
      startedAt: hoursAgo(26),
      completedAt: hoursAgo(25.9),
      errorMessage: "Docker runtime could not pull scanner image (demo seed)",
      metadataJson: json({ scanner: "prowler", runtime: "docker" })
    }
  });

  const runningAzureScan = await prisma.scanJob.create({
    data: {
      tenantId: customerTenant.id,
      integrationId: azureIntegration.id,
      requestedByUserId: owner.id,
      status: ScanStatus.RUNNING,
      framework: "CIS",
      provider: Provider.AZURE,
      startedAt: hoursAgo(0.2),
      metadataJson: json({ scanner: "prowler", runtime: "docker", phase: "collecting" })
    }
  });

  const queuedAzureScan = await prisma.scanJob.create({
    data: {
      tenantId: customerTenant.id,
      integrationId: azureIntegration.id,
      requestedByUserId: analyst.id,
      status: ScanStatus.QUEUED,
      framework: "NIST-800-53",
      provider: Provider.AZURE,
      metadataJson: json({ requestedFrom: "demo-seed" })
    }
  });

  await prisma.finding.createMany({
    data: [
      {
        tenantId: customerTenant.id,
        integrationId: awsIntegration.id,
        scanJobId: completedAwsScan.id,
        assetId: ec2Asset.id,
        provider: Provider.AWS,
        framework: "CIS",
        severity: Severity.CRITICAL,
        riskScore: 94,
        complianceTags: "CIS-1.4,PCI-DSS",
        resourceId: ec2Asset.externalId,
        title: "Security group allows 0.0.0.0/0 to SSH",
        description: "Port 22 is open to the internet on a production instance.",
        category: "networking",
        status: "OPEN",
        externalId: "aws_ec2_securitygroup_allow_ingress_from_internet_to_22"
      },
      {
        tenantId: customerTenant.id,
        integrationId: awsIntegration.id,
        scanJobId: completedAwsScan.id,
        assetId: s3Asset.id,
        provider: Provider.AWS,
        framework: "CIS",
        severity: Severity.HIGH,
        riskScore: 85,
        complianceTags: "CIS-2.1",
        resourceId: s3Asset.externalId,
        title: "S3 bucket logging not encrypted with KMS",
        description: "Server access logs bucket is not using customer-managed KMS keys.",
        category: "encryption",
        status: "OPEN",
        externalId: "aws_s3_bucket_logging_kms_encryption"
      },
      {
        tenantId: customerTenant.id,
        integrationId: awsIntegration.id,
        scanJobId: completedAwsScan.id,
        assetId: s3Asset.id,
        provider: Provider.AWS,
        framework: "CIS",
        severity: Severity.MEDIUM,
        riskScore: 61,
        complianceTags: "AWS-WAFR",
        resourceId: s3Asset.externalId,
        title: "S3 bucket versioning disabled",
        description: "Versioning is not enabled on a production logging bucket.",
        category: "resilience",
        status: "ACKNOWLEDGED",
        externalId: "aws_s3_bucket_versioning_disabled"
      },
      {
        tenantId: customerTenant.id,
        integrationId: azureIntegration.id,
        scanJobId: runningAzureScan.id,
        assetId: aadAsset.id,
        provider: Provider.AZURE,
        framework: "CIS",
        severity: Severity.HIGH,
        riskScore: 80,
        complianceTags: "CIS,NIST-800-53",
        resourceId: aadAsset.externalId,
        title: "Key Vault purge protection disabled",
        description: "Purge protection is not enabled for production vault.",
        category: "encryption",
        status: "OPEN",
        externalId: "azure_keyvault_purge_protection_disabled"
      },
      {
        tenantId: customerTenant.id,
        integrationId: azureIntegration.id,
        scanJobId: queuedAzureScan.id,
        provider: Provider.AZURE,
        framework: "NIST-800-53",
        severity: Severity.LOW,
        riskScore: 28,
        complianceTags: "NIST-800-53",
        resourceId: "subscription/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        title: "Diagnostic settings partially configured",
        description: "Some services are not forwarding diagnostics to the central workspace.",
        category: "logging",
        status: "OPEN",
        externalId: "azure_subscription_diagnostic_settings_partial"
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: customerTenant.id,
        userId: owner.id,
        action: "integration.create",
        entityType: "integration",
        entityId: awsIntegration.id,
        detailsJson: json({ provider: "AWS", source: "demo-seed" })
      },
      {
        tenantId: customerTenant.id,
        userId: analyst.id,
        action: "scan.queue",
        entityType: "scanJob",
        entityId: queuedAzureScan.id,
        detailsJson: json({ provider: "AZURE", framework: "NIST-800-53", source: "demo-seed" })
      },
      {
        tenantId: mspTenant.id,
        userId: owner.id,
        action: "tenant.subcustomer.link",
        entityType: "tenant",
        entityId: customerTenant.id,
        detailsJson: json({ source: "demo-seed", childTenantSlug: "northwind-retail" })
      }
    ]
  });

  return {
    users: [
      { email: DEMO_OWNER_EMAIL, password: DEMO_PASSWORD, role: "Owner" },
      { email: DEMO_ANALYST_EMAIL, password: DEMO_PASSWORD, role: "Analyst" }
    ],
    tenants: [
      { slug: "acme-mssp", name: "Acme MSSP Operations" },
      { slug: "northwind-retail", name: "Northwind Retail (Customer)" }
    ],
    counts: {
      integrations: integrations.length,
      scanJobs: 4,
      findings: 5,
      assets: 3
    }
  };
}

async function main() {
  const result = await seedDemo();
  console.log("Demo data seeded successfully.");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to seed demo data.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
