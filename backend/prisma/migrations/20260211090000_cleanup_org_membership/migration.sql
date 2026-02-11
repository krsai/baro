-- Remove BOTH from OrganizationType
UPDATE "Organization" SET "type" = 'MANUFACTURER' WHERE "type" = 'BOTH';

ALTER TABLE "Organization" ALTER COLUMN "type" DROP DEFAULT;
CREATE TYPE "OrganizationType_new" AS ENUM ('MANUFACTURER', 'BRAND');
ALTER TABLE "Organization"
  ALTER COLUMN "type" TYPE "OrganizationType_new"
  USING ("type"::text::"OrganizationType_new");
DROP TYPE "OrganizationType";
ALTER TYPE "OrganizationType_new" RENAME TO "OrganizationType";
ALTER TABLE "Organization" ALTER COLUMN "type" SET DEFAULT 'MANUFACTURER';

-- Rename OrganizationUser -> OrgMembership
ALTER TABLE "OrganizationUser" RENAME TO "OrgMembership";
ALTER SEQUENCE "OrganizationUser_id_seq" RENAME TO "OrgMembership_id_seq";
ALTER TABLE "OrgMembership" RENAME CONSTRAINT "OrganizationUser_pkey" TO "OrgMembership_pkey";
ALTER INDEX "OrganizationUser_orgId_idx" RENAME TO "OrgMembership_orgId_idx";
ALTER INDEX "OrganizationUser_email_idx" RENAME TO "OrgMembership_email_idx";
ALTER INDEX "OrganizationUser_orgId_email_key" RENAME TO "OrgMembership_orgId_email_key";
ALTER INDEX "OrganizationUser_status_idx" RENAME TO "OrgMembership_status_idx";
ALTER INDEX "OrganizationUser_orgId_status_idx" RENAME TO "OrgMembership_orgId_status_idx";
ALTER TABLE "OrgMembership" RENAME CONSTRAINT "OrganizationUser_orgId_fkey" TO "OrgMembership_orgId_fkey";

-- Rename Employee.orgUserId -> orgMembershipId
ALTER TABLE "Employee" RENAME COLUMN "orgUserId" TO "orgMembershipId";
ALTER INDEX "Employee_orgUserId_key" RENAME TO "Employee_orgMembershipId_key";
ALTER TABLE "Employee" RENAME CONSTRAINT "Employee_orgUserId_fkey" TO "Employee_orgMembershipId_fkey";
