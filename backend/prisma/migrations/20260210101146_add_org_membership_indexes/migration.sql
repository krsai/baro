-- CreateIndex
CREATE INDEX "OrganizationUser_status_idx" ON "OrganizationUser"("status");

-- CreateIndex
CREATE INDEX "OrganizationUser_orgId_status_idx" ON "OrganizationUser"("orgId", "status");
