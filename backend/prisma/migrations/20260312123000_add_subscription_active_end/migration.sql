ALTER TABLE "OrganizationSubscription"
ADD COLUMN IF NOT EXISTS "activeEndsAt" TIMESTAMP(3);
