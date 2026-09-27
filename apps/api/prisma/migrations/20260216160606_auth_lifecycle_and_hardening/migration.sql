/*
  Warnings:

  - You are about to alter the column `createdAt` on the `Tenant` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.
  - You are about to alter the column `updatedAt` on the `Tenant` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("timestamp(3)")` to `DateTime`.

*/
-- CreateTable
CREATE TABLE "TenantHierarchy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentTenantId" TEXT NOT NULL,
    "childTenantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantHierarchy_parentTenantId_fkey" FOREIGN KEY ("parentTenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantHierarchy_childTenantId_fkey" FOREIGN KEY ("childTenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "framework" TEXT,
    "provider" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScanJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScanJob_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criticality" INTEGER NOT NULL DEFAULT 50,
    "metadataJson" TEXT,
    CONSTRAINT "Asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "scanJobId" TEXT NOT NULL,
    "assetId" TEXT,
    "provider" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "complianceTags" TEXT,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "externalId" TEXT,
    "rawJson" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Finding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_scanJobId_fkey" FOREIGN KEY ("scanJobId") REFERENCES "ScanJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "provider" TEXT,
    "framework" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchedulePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpointType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secretRef" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tenant" ("createdAt", "id", "name", "slug", "updatedAt") SELECT "createdAt", "id", "name", "slug", "updatedAt" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TenantHierarchy_parentTenantId_idx" ON "TenantHierarchy"("parentTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantHierarchy_parentTenantId_childTenantId_key" ON "TenantHierarchy"("parentTenantId", "childTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantHierarchy_childTenantId_key" ON "TenantHierarchy"("childTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Membership_tenantId_role_idx" ON "Membership"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Integration_tenantId_provider_idx" ON "Integration"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "ScanJob_status_createdAt_idx" ON "ScanJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScanJob_tenantId_provider_idx" ON "ScanJob"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "Asset_tenantId_provider_assetType_idx" ON "Asset"("tenantId", "provider", "assetType");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tenantId_provider_externalId_key" ON "Asset"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Finding_tenantId_severity_idx" ON "Finding"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "Finding_tenantId_provider_framework_idx" ON "Finding"("tenantId", "provider", "framework");

-- CreateIndex
CREATE INDEX "Finding_tenantId_riskScore_idx" ON "Finding"("tenantId", "riskScore");

-- CreateIndex
CREATE INDEX "Finding_scanJobId_idx" ON "Finding"("scanJobId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action");

-- CreateIndex
CREATE INDEX "SchedulePolicy_tenantId_isEnabled_idx" ON "SchedulePolicy"("tenantId", "isEnabled");

-- CreateIndex
CREATE INDEX "AlertEndpoint_tenantId_endpointType_idx" ON "AlertEndpoint"("tenantId", "endpointType");
