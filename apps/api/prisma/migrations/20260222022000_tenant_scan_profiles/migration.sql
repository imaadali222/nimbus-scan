-- CreateTable
CREATE TABLE "TenantScanProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "framework" TEXT,
    "profileJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantScanProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantScanProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantScanProfile_tenantId_provider_key" ON "TenantScanProfile"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "TenantScanProfile_tenantId_idx" ON "TenantScanProfile"("tenantId");
