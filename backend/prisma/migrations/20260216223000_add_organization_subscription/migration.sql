CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM (
  'NOT_SUBSCRIBED',
  'TRIAL',
  'ACTIVE',
  'GRACE',
  'SUSPENDED'
);

CREATE TABLE "OrganizationSubscription" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "status" "OrganizationSubscriptionStatus" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
  "membershipEmail" TEXT,
  "billingEmail" TEXT,
  "trialStartedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSubscription_orgId_key" ON "OrganizationSubscription"("orgId");
CREATE INDEX "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");

ALTER TABLE "OrganizationSubscription"
ADD CONSTRAINT "OrganizationSubscription_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationSubscription" (
  "orgId",
  "status",
  "membershipEmail",
  "billingEmail",
  "activatedAt"
)
SELECT
  o."id",
  CASE
    WHEN UPPER(TRIM(COALESCE(o."code", ''))) = 'BARO'
      OR LOWER(TRIM(COALESCE(o."name", ''))) LIKE 'baro%'
      THEN 'ACTIVE'::"OrganizationSubscriptionStatus"
    ELSE 'NOT_SUBSCRIBED'::"OrganizationSubscriptionStatus"
  END,
  CASE
    WHEN UPPER(TRIM(COALESCE(o."code", ''))) = 'BARO'
      OR LOWER(TRIM(COALESCE(o."name", ''))) LIKE 'baro%'
      THEN 'baro.garment@gmail.com'
    ELSE NULL
  END,
  CASE
    WHEN UPPER(TRIM(COALESCE(o."code", ''))) = 'BARO'
      OR LOWER(TRIM(COALESCE(o."name", ''))) LIKE 'baro%'
      THEN 'baro.garment@gmail.com'
    ELSE NULL
  END,
  CASE
    WHEN UPPER(TRIM(COALESCE(o."code", ''))) = 'BARO'
      OR LOWER(TRIM(COALESCE(o."name", ''))) LIKE 'baro%'
      THEN CURRENT_TIMESTAMP
    ELSE NULL
  END
FROM "Organization" o;
