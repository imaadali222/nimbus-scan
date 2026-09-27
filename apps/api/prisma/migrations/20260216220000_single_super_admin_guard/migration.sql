-- Enforce singleton super-admin bootstrap account.
CREATE UNIQUE INDEX IF NOT EXISTS "User_single_super_admin_key"
ON "User"("isSuperAdmin")
WHERE "isSuperAdmin" = 1;
