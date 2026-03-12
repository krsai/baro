UPDATE "OrganizationSubscription" AS subscription
SET
  "status" = 'ACTIVE',
  "trialStartedAt" = NULL,
  "trialEndsAt" = NULL,
  "activeEndsAt" = NULL,
  "suspendedAt" = NULL,
  "activatedAt" = COALESCE(subscription."activatedAt", NOW()),
  "membershipEmail" = COALESCE(subscription."membershipEmail", organization."email"),
  "billingEmail" = COALESCE(subscription."billingEmail", organization."email")
FROM "Organization" AS organization
WHERE subscription."orgId" = organization."id"
  AND organization."code" IN ('TSMF', 'TSBR');
