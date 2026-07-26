-- Step 0o: Employee becomes the canonical organization account table (20260707)
-- Employee.id is the account id. OrgMembership was a temporary compatibility
-- shadow and is dropped after any remaining rows are copied into Employee.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "orgRole" "OrgUserRole" NOT NULL DEFAULT 'WORKER';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "status" "OrgMembershipStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "requestedName" TEXT;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'OrgMembership'
  ) THEN
    ALTER TABLE "OrgMembership" ADD COLUMN IF NOT EXISTS "requestedName" TEXT;
    ALTER TABLE "OrgMembership" ALTER COLUMN "email" DROP NOT NULL;
    UPDATE "OrgMembership"
    SET "email" = NULL
    WHERE "email" LIKE 'emp+%@baro.local';

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Employee'
        AND column_name = 'orgMembershipId'
    ) THEN
      ALTER TABLE "Employee" ALTER COLUMN "orgMembershipId" DROP NOT NULL;

      UPDATE "Employee" e
      SET
        "email" = m."email",
        "orgRole" = m."role",
        "status" = m."status",
        "requestedAt" = COALESCE(e."requestedAt", m."requestedAt"),
        "requestedName" = COALESCE(e."requestedName", m."requestedName"),
        "approvedAt" = COALESCE(e."approvedAt", m."approvedAt"),
        "approvedBy" = COALESCE(e."approvedBy", m."approvedBy"),
        "name" = COALESCE(NULLIF(btrim(e."name"), ''), NULLIF(btrim(m."requestedName"), ''))
      FROM "OrgMembership" m
      WHERE e."orgMembershipId" = m.id;

      INSERT INTO "Employee" (
        "orgId",
        "orgMembershipId",
        "email",
        "orgRole",
        "status",
        "requestedAt",
        "requestedName",
        "approvedAt",
        "approvedBy",
        "name",
        "joinedAt",
        "createdAt",
        "createdBy",
        "updatedAt"
      )
      SELECT
        m."orgId",
        m.id,
        m."email",
        m."role",
        m."status",
        m."requestedAt",
        m."requestedName",
        m."approvedAt",
        m."approvedBy",
        NULLIF(btrim(m."requestedName"), ''),
        CASE WHEN m."status" = 'ACTIVE' THEN COALESCE(m."approvedAt", m."createdAt") ELSE NULL END,
        m."createdAt",
        m."createdBy",
        m."updatedAt"
      FROM "OrgMembership" m
      WHERE NOT EXISTS (
        SELECT 1 FROM "Employee" e WHERE e."orgMembershipId" = m.id
      );

      ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_orgMembershipId_fkey";
      DROP INDEX IF EXISTS "Employee_orgMembershipId_key";
      ALTER TABLE "Employee" DROP COLUMN IF EXISTS "orgMembershipId";
    END IF;

    DROP TABLE IF EXISTS "OrgMembership";
  END IF;
END $$;


-- Step 0q: versioned quantity bucket sets and immutable assignment ST snapshots.
CREATE TABLE IF NOT EXISTS "QuantityBucketSet" (
  "id" SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "currentVersionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketSet_orgId_name_key"
  ON "QuantityBucketSet"("orgId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketSet_currentVersionId_key"
  ON "QuantityBucketSet"("currentVersionId");
CREATE INDEX IF NOT EXISTS "QuantityBucketSet_orgId_idx"
  ON "QuantityBucketSet"("orgId");

CREATE TABLE IF NOT EXISTS "QuantityBucketSetVersion" (
  "id" SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "quantityBucketSetId" INTEGER NOT NULL REFERENCES "QuantityBucketSet"("id") ON DELETE CASCADE,
  "versionNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local'
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketSetVersion_set_version_key"
  ON "QuantityBucketSetVersion"("quantityBucketSetId", "versionNumber");
CREATE INDEX IF NOT EXISTS "QuantityBucketSetVersion_orgId_idx"
  ON "QuantityBucketSetVersion"("orgId");
CREATE INDEX IF NOT EXISTS "QuantityBucketSetVersion_setId_idx"
  ON "QuantityBucketSetVersion"("quantityBucketSetId");

CREATE TABLE IF NOT EXISTS "QuantityBucketEntry" (
  "id" SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "quantityBucketSetVersionId" INTEGER NOT NULL REFERENCES "QuantityBucketSetVersion"("id") ON DELETE CASCADE,
  "bucketQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuantityBucketEntry_bucketQuantity_positive" CHECK ("bucketQuantity" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketEntry_version_quantity_key"
  ON "QuantityBucketEntry"("quantityBucketSetVersionId", "bucketQuantity");
CREATE INDEX IF NOT EXISTS "QuantityBucketEntry_orgId_idx"
  ON "QuantityBucketEntry"("orgId");
CREATE INDEX IF NOT EXISTS "QuantityBucketEntry_versionId_idx"
  ON "QuantityBucketEntry"("quantityBucketSetVersionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSalesPriceList_pricingBasis_check'
  ) THEN
    ALTER TABLE "CustomerSalesPriceList"
      ADD CONSTRAINT "CustomerSalesPriceList_pricingBasis_check"
      CHECK ("pricingBasis" IN ('MANUFACTURING_SERVICE_PRICE', 'FINISHED_GOODS_PRICE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSalesPriceList_currencyCode_check'
  ) THEN
    ALTER TABLE "CustomerSalesPriceList"
      ADD CONSTRAINT "CustomerSalesPriceList_currencyCode_check"
      CHECK ("currencyCode" IN ('USD', 'VND', 'KRW'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSalesPrice_unitPrice_check'
  ) THEN
    ALTER TABLE "CustomerSalesPrice"
      ADD CONSTRAINT "CustomerSalesPrice_unitPrice_check" CHECK ("unitPrice" > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'QuantityBucketSet_currentVersionId_fkey'
  ) THEN
    ALTER TABLE "QuantityBucketSet"
      ADD CONSTRAINT "QuantityBucketSet_currentVersionId_fkey"
      FOREIGN KEY ("currentVersionId") REFERENCES "QuantityBucketSetVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "salesBucketSetVersionId" INTEGER;
ALTER TABLE "Style"
  ADD COLUMN IF NOT EXISTS "timeBucketSetVersionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "timeBucketSource" TEXT NOT NULL DEFAULT 'CUSTOMER_DEFAULT';
ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "assignmentStSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "ctReviewRequired" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "ctReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ctReviewedByEmployeeId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'OrgRelationship_salesBucketSetVersionId_fkey'
  ) THEN
    ALTER TABLE "OrgRelationship"
      ADD CONSTRAINT "OrgRelationship_salesBucketSetVersionId_fkey"
      FOREIGN KEY ("salesBucketSetVersionId") REFERENCES "QuantityBucketSetVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Style_timeBucketSetVersionId_fkey'
  ) THEN
    ALTER TABLE "Style"
      ADD CONSTRAINT "Style_timeBucketSetVersionId_fkey"
      FOREIGN KEY ("timeBucketSetVersionId") REFERENCES "QuantityBucketSetVersion"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AssignmentPlan_ctReviewedByEmployeeId_fkey'
  ) THEN
    ALTER TABLE "AssignmentPlan"
      ADD CONSTRAINT "AssignmentPlan_ctReviewedByEmployeeId_fkey"
      FOREIGN KEY ("ctReviewedByEmployeeId") REFERENCES "Employee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrgRelationship_salesBucketSetVersionId_idx"
  ON "OrgRelationship"("salesBucketSetVersionId");
CREATE INDEX IF NOT EXISTS "Style_timeBucketSetVersionId_idx"
  ON "Style"("timeBucketSetVersionId");
CREATE INDEX IF NOT EXISTS "AssignmentPlan_ctReviewedByEmployeeId_idx"
  ON "AssignmentPlan"("ctReviewedByEmployeeId");

-- Seed one immutable standard version per style-owning organization.
INSERT INTO "QuantityBucketSet" ("orgId", "name", "createdBy", "updatedAt")
SELECT DISTINCT s."orgId", 'DEFAULT_TIME_BUCKETS', 'MIGRATION', CURRENT_TIMESTAMP
FROM "Style" s
ON CONFLICT ("orgId", "name") DO NOTHING;

INSERT INTO "QuantityBucketSetVersion"
  ("orgId", "quantityBucketSetId", "versionNumber", "createdBy")
SELECT qbs."orgId", qbs."id", 1, 'MIGRATION'
FROM "QuantityBucketSet" qbs
WHERE qbs."name" = 'DEFAULT_TIME_BUCKETS'
ON CONFLICT ("quantityBucketSetId", "versionNumber") DO NOTHING;

INSERT INTO "QuantityBucketEntry"
  ("orgId", "quantityBucketSetVersionId", "bucketQuantity")
SELECT qbsv."orgId", qbsv."id", bucket_quantity
FROM "QuantityBucketSetVersion" qbsv
JOIN "QuantityBucketSet" qbs ON qbs."id" = qbsv."quantityBucketSetId"
CROSS JOIN unnest(ARRAY[1,3,5,10,30,50,100,300,500,1000,3000,5000,10000]) bucket_quantity
WHERE qbs."name" = 'DEFAULT_TIME_BUCKETS' AND qbsv."versionNumber" = 1
ON CONFLICT ("quantityBucketSetVersionId", "bucketQuantity") DO NOTHING;

UPDATE "QuantityBucketSet" qbs
SET "currentVersionId" = qbsv."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "QuantityBucketSetVersion" qbsv
WHERE qbsv."quantityBucketSetId" = qbs."id"
  AND qbsv."versionNumber" = 1
  AND qbs."name" = 'DEFAULT_TIME_BUCKETS'
  AND qbs."currentVersionId" IS NULL;

UPDATE "Style" s
SET "timeBucketSetVersionId" = qbs."currentVersionId"
FROM "QuantityBucketSet" qbs
WHERE qbs."orgId" = s."orgId"
  AND qbs."name" = 'DEFAULT_TIME_BUCKETS'
  AND s."timeBucketSetVersionId" IS NULL;

-- Seed a separate customer sales set. It may later diverge without changing style time buckets.
INSERT INTO "QuantityBucketSet" ("orgId", "name", "createdBy", "updatedAt")
SELECT rel."manufacturerOrgId", 'CUSTOMER_PRICE_BUCKETS_' || rel."id", 'MIGRATION', CURRENT_TIMESTAMP
FROM "OrgRelationship" rel
ON CONFLICT ("orgId", "name") DO NOTHING;

INSERT INTO "QuantityBucketSetVersion"
  ("orgId", "quantityBucketSetId", "versionNumber", "createdBy")
SELECT qbs."orgId", qbs."id", 1, 'MIGRATION'
FROM "QuantityBucketSet" qbs
WHERE qbs."name" LIKE 'CUSTOMER_PRICE_BUCKETS_%'
ON CONFLICT ("quantityBucketSetId", "versionNumber") DO NOTHING;

INSERT INTO "QuantityBucketEntry"
  ("orgId", "quantityBucketSetVersionId", "bucketQuantity")
SELECT qbsv."orgId", qbsv."id", bucket_quantity
FROM "QuantityBucketSetVersion" qbsv
JOIN "QuantityBucketSet" qbs ON qbs."id" = qbsv."quantityBucketSetId"
CROSS JOIN unnest(ARRAY[1,3,5,10,30,50,100,300,500,1000,3000,5000,10000]) bucket_quantity
WHERE qbs."name" LIKE 'CUSTOMER_PRICE_BUCKETS_%' AND qbsv."versionNumber" = 1
ON CONFLICT ("quantityBucketSetVersionId", "bucketQuantity") DO NOTHING;

UPDATE "QuantityBucketSet" qbs
SET "currentVersionId" = qbsv."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "QuantityBucketSetVersion" qbsv
WHERE qbsv."quantityBucketSetId" = qbs."id"
  AND qbsv."versionNumber" = 1
  AND qbs."name" LIKE 'CUSTOMER_PRICE_BUCKETS_%'
  AND qbs."currentVersionId" IS NULL;

UPDATE "OrgRelationship" rel
SET "salesBucketSetVersionId" = qbs."currentVersionId"
FROM "QuantityBucketSet" qbs
WHERE qbs."orgId" = rel."manufacturerOrgId"
  AND qbs."name" = 'CUSTOMER_PRICE_BUCKETS_' || rel."id"
  AND rel."salesBucketSetVersionId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_orgId_email_key"
  ON "Employee"("orgId", "email");
CREATE INDEX IF NOT EXISTS "Employee_email_idx" ON "Employee"("email");
CREATE INDEX IF NOT EXISTS "Employee_status_idx" ON "Employee"("status");
CREATE INDEX IF NOT EXISTS "Employee_orgId_status_idx" ON "Employee"("orgId", "status");

CREATE TABLE IF NOT EXISTS "QuantitySettlementSnapshot" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER,
  "updatedByEmployeeId" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  CONSTRAINT "QuantitySettlementSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuantitySettlementSnapshot_orgId_month_key"
  ON "QuantitySettlementSnapshot"("orgId", "month");
CREATE INDEX IF NOT EXISTS "QuantitySettlementSnapshot_orgId_idx"
  ON "QuantitySettlementSnapshot"("orgId");
DO $$ BEGIN
  ALTER TABLE "QuantitySettlementSnapshot"
    ADD CONSTRAINT "QuantitySettlementSnapshot_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
DECLARE
  audited_table TEXT;
  audited_tables TEXT[] := ARRAY[
    'SystemUser',
    'ProcessMasterOption',
    'Organization',
    'OnboardingRequest',
    'OrganizationSubscription',
    'Factory',
    'Line',
    'Employee',
    'AttendanceEntry',
    'OrganizationHoliday',
    'OrgRelationship',
    'Style',
    'StyleProcess',
    'AtTrainingBucket',
    'AtTrainingBucketProcess',
    'WorkOrder',
    'WorkOrderItem',
    'AssignmentPlan',
    'QcPassEvent',
    'WorkLog',
    'WorkRecord',
    'PayrollSnapshot',
    'QuantitySettlementSnapshot',
    'AssignmentBoardState',
    'AssignmentCard'
  ];
BEGIN
  FOREACH audited_table IN ARRAY audited_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = audited_table
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "createdByEmployeeId" INTEGER', audited_table);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER', audited_table);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("createdByEmployeeId")', audited_table || '_createdByEmployeeId_idx', audited_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("updatedByEmployeeId")', audited_table || '_updatedByEmployeeId_idx', audited_table);

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE',
        audited_table,
        audited_table || '_createdByEmployeeId_fkey'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE',
        audited_table,
        audited_table || '_updatedByEmployeeId_fkey'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'SystemSetting'
  ) THEN
    ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER;
    CREATE INDEX IF NOT EXISTS "SystemSetting_updatedByEmployeeId_idx" ON "SystemSetting"("updatedByEmployeeId");
    BEGIN
      ALTER TABLE "SystemSetting"
        ADD CONSTRAINT "SystemSetting_updatedByEmployeeId_fkey"
        FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
DECLARE
  audited_table TEXT;
  audited_tables TEXT[] := ARRAY[
    'Organization',
    'OnboardingRequest',
    'OrganizationSubscription',
    'Factory',
    'Line',
    'Employee',
    'AttendanceEntry',
    'OrganizationHoliday',
    'OrgRelationship',
    'Style',
    'StyleProcess',
    'AtTrainingBucket',
    'AtTrainingBucketProcess',
    'WorkOrder',
    'AssignmentPlan',
    'QcPassEvent',
    'WorkLog',
    'WorkRecord',
    'PayrollSnapshot',
    'QuantitySettlementSnapshot',
    'AssignmentBoardState',
    'AssignmentCard'
  ];
  has_org_id BOOLEAN;
  has_created_by BOOLEAN;
  has_updated_by BOOLEAN;
BEGIN
  FOREACH audited_table IN ARRAY audited_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = audited_table
    ) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = audited_table AND column_name = 'orgId'
    ) INTO has_org_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = audited_table AND column_name = 'createdBy'
    ) INTO has_created_by;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = audited_table AND column_name = 'updatedBy'
    ) INTO has_updated_by;

    IF has_org_id AND has_created_by THEN
      EXECUTE format(
        'UPDATE %I t SET "createdByEmployeeId" = e.id FROM "Employee" e WHERE t."createdByEmployeeId" IS NULL AND t."orgId" = e."orgId" AND t."createdBy" IS NOT NULL AND e."email" IS NOT NULL AND lower(btrim(t."createdBy")) = lower(btrim(e."email"))',
        audited_table
      );
    END IF;

    IF has_org_id AND has_updated_by THEN
      EXECUTE format(
        'UPDATE %I t SET "updatedByEmployeeId" = e.id FROM "Employee" e WHERE t."updatedByEmployeeId" IS NULL AND t."orgId" = e."orgId" AND t."updatedBy" IS NOT NULL AND e."email" IS NOT NULL AND lower(btrim(t."updatedBy")) = lower(btrim(e."email"))',
        audited_table
      );
    END IF;
  END LOOP;
END $$;

-- Step 0r: independent sales buckets, relational sales prices, and order price snapshots (20260725)
ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "pricingBasis" TEXT NOT NULL DEFAULT 'MANUFACTURING_SERVICE_PRICE',
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "WorkOrderItem"
  ADD COLUMN IF NOT EXISTS "salesPriceSnapshot" JSONB;

CREATE TABLE IF NOT EXISTS "OrgRelationshipStyleSalesBucket" (
  "id" SERIAL PRIMARY KEY,
  "orgRelationshipId" INTEGER NOT NULL REFERENCES "OrgRelationship"("id") ON DELETE CASCADE,
  "styleId" INTEGER NOT NULL REFERENCES "Style"("id") ON DELETE CASCADE,
  "quantityBucketSetVersionId" INTEGER NOT NULL REFERENCES "QuantityBucketSetVersion"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRelationshipStyleSalesBucket_relationship_style_key"
  ON "OrgRelationshipStyleSalesBucket"("orgRelationshipId", "styleId");
CREATE INDEX IF NOT EXISTS "OrgRelationshipStyleSalesBucket_styleId_idx"
  ON "OrgRelationshipStyleSalesBucket"("styleId");
CREATE INDEX IF NOT EXISTS "OrgRelationshipStyleSalesBucket_versionId_idx"
  ON "OrgRelationshipStyleSalesBucket"("quantityBucketSetVersionId");

CREATE TABLE IF NOT EXISTS "CustomerSalesPriceList" (
  "id" SERIAL PRIMARY KEY,
  "orgRelationshipId" INTEGER NOT NULL REFERENCES "OrgRelationship"("id") ON DELETE RESTRICT,
  "styleId" INTEGER NOT NULL REFERENCES "Style"("id") ON DELETE RESTRICT,
  "pricingBasis" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "quantityBucketSetVersionId" INTEGER NOT NULL REFERENCES "QuantityBucketSetVersion"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSalesPriceList_pricingBasis_check"
    CHECK ("pricingBasis" IN ('MANUFACTURING_SERVICE_PRICE', 'FINISHED_GOODS_PRICE')),
  CONSTRAINT "CustomerSalesPriceList_currencyCode_check"
    CHECK ("currencyCode" IN ('USD', 'VND', 'KRW'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSalesPriceList_scope_version_key"
  ON "CustomerSalesPriceList"(
    "orgRelationshipId", "styleId", "pricingBasis", "currencyCode", "quantityBucketSetVersionId"
  );
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSalesPriceList_id_version_key"
  ON "CustomerSalesPriceList"("id", "quantityBucketSetVersionId");
CREATE INDEX IF NOT EXISTS "CustomerSalesPriceList_relationshipId_idx"
  ON "CustomerSalesPriceList"("orgRelationshipId");
CREATE INDEX IF NOT EXISTS "CustomerSalesPriceList_styleId_idx"
  ON "CustomerSalesPriceList"("styleId");
CREATE INDEX IF NOT EXISTS "CustomerSalesPriceList_versionId_idx"
  ON "CustomerSalesPriceList"("quantityBucketSetVersionId");

CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketEntry_id_version_key"
  ON "QuantityBucketEntry"("id", "quantityBucketSetVersionId");
CREATE TABLE IF NOT EXISTS "CustomerSalesPrice" (
  "id" SERIAL PRIMARY KEY,
  "salesPriceListId" INTEGER NOT NULL REFERENCES "CustomerSalesPriceList"("id") ON DELETE CASCADE,
  "quantityBucketEntryId" INTEGER NOT NULL REFERENCES "QuantityBucketEntry"("id") ON DELETE RESTRICT,
  "quantityBucketSetVersionId" INTEGER NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedByEmployeeId" INTEGER REFERENCES "Employee"("id") ON DELETE SET NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSalesPrice_unitPrice_check" CHECK ("unitPrice" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSalesPrice_list_entry_key"
  ON "CustomerSalesPrice"("salesPriceListId", "quantityBucketEntryId");
CREATE INDEX IF NOT EXISTS "CustomerSalesPrice_entryId_idx"
  ON "CustomerSalesPrice"("quantityBucketEntryId");
CREATE INDEX IF NOT EXISTS "CustomerSalesPrice_versionId_idx"
  ON "CustomerSalesPrice"("quantityBucketSetVersionId");
ALTER TABLE "CustomerSalesPrice"
  DROP CONSTRAINT IF EXISTS "CustomerSalesPrice_quantityBucketSetVersionId_fkey";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSalesPrice_list_version_fkey'
  ) THEN
    ALTER TABLE "CustomerSalesPrice"
      ADD CONSTRAINT "CustomerSalesPrice_list_version_fkey"
      FOREIGN KEY ("salesPriceListId", "quantityBucketSetVersionId")
      REFERENCES "CustomerSalesPriceList"("id", "quantityBucketSetVersionId")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSalesPrice_entry_version_fkey'
  ) THEN
    ALTER TABLE "CustomerSalesPrice"
      ADD CONSTRAINT "CustomerSalesPrice_entry_version_fkey"
      FOREIGN KEY ("quantityBucketEntryId", "quantityBucketSetVersionId")
      REFERENCES "QuantityBucketEntry"("id", "quantityBucketSetVersionId")
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Step 0s: fail closed for canonical WorkRecord references (20260725).
-- Never manufacture these links from names/codes during migration.
BEGIN;
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM "WorkRecord"
  WHERE "assignmentPlanId" IS NULL OR "styleId" IS NULL OR "styleProcessId" IS NULL;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'WorkRecord canonical FK migration blocked: % rows need explicit repair',
      invalid_count;
  END IF;
  SELECT COUNT(*) INTO invalid_count
  FROM "WorkRecord" wr
  JOIN "AssignmentPlan" ap ON ap.id = wr."assignmentPlanId"
  JOIN "StyleProcess" sp ON sp.id = wr."styleProcessId"
  WHERE wr."orgId" <> ap."orgId"
     OR wr."orgId" <> sp."orgId"
     OR wr."styleId" <> sp."styleId";
  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'WorkRecord canonical relation migration blocked: % rows need explicit repair',
      invalid_count;
  END IF;
END $$;
ALTER TABLE "WorkRecord"
  DROP CONSTRAINT IF EXISTS "WorkRecord_assignmentPlanId_fkey",
  DROP CONSTRAINT IF EXISTS "WorkRecord_styleId_fkey",
  DROP CONSTRAINT IF EXISTS "WorkRecord_styleProcessId_fkey",
  DROP CONSTRAINT IF EXISTS "WorkRecord_assignmentPlan_org_fkey",
  DROP CONSTRAINT IF EXISTS "WorkRecord_style_org_fkey",
  DROP CONSTRAINT IF EXISTS "WorkRecord_styleProcess_style_org_fkey";
CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentPlan_id_org_key"
  ON "AssignmentPlan"("id", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcess_id_style_org_key"
  ON "StyleProcess"("id", "styleId", "orgId");
ALTER TABLE "WorkRecord"
  ALTER COLUMN "assignmentPlanId" SET NOT NULL,
  ALTER COLUMN "styleId" SET NOT NULL,
  ALTER COLUMN "styleProcessId" SET NOT NULL;
ALTER TABLE "WorkRecord"
  ADD CONSTRAINT "WorkRecord_assignmentPlan_org_fkey"
    FOREIGN KEY ("assignmentPlanId", "orgId") REFERENCES "AssignmentPlan"("id", "orgId") ON DELETE RESTRICT,
  ADD CONSTRAINT "WorkRecord_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "WorkRecord_styleProcess_style_org_fkey"
    FOREIGN KEY ("styleProcessId", "styleId", "orgId")
    REFERENCES "StyleProcess"("id", "styleId", "orgId") ON DELETE RESTRICT;
COMMIT;

-- Step 0n: drop AssignmentPlan.orderNo/customer/label/previewUrl (20260706)
-- Phase E of the AssignmentCard/AssignmentPlan FK+join redesign. Unlike
-- Phase D's color columns, these four WERE actively written by every board
-- save up until this phase's code change - they are not "always null" the
-- way colorId/colorName were. They are fully derivable through
-- workOrderId/styleId/buyerOrgId (workOrder.orderNumber, style.name,
-- buyerOrg.name, style.imageUrls[0]) and application code no longer reads or
-- writes any of them (backend/src/index.ts, see the comment in
-- toAssignmentPlanResponse and ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE).
-- Before running against production, re-confirm row count is still safe:
--   SELECT COUNT(*) FROM "AssignmentPlan";
--   SELECT COUNT(*) FROM "AssignmentPlan" WHERE "orderNo" IS NOT NULL;
-- (At the time this step was written, AssignmentPlan had 0 rows in
-- production - the org's assignment data had not yet been re-populated
-- since the 2026-07-03 incident, see AGENTS.md 39/40/42 - so there was
-- nothing to lose. If rows exist by the time this runs, the columns being
-- dropped are still fully reconstructable from the FK joins for any row
-- whose workOrderId/styleId/buyerOrgId are populated; only rows that
-- predate the Phase A backfill AND lack an assignmentCardId link would lose
-- their orderNo/customer/label/previewUrl display text permanently.)
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "orderNo";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "customer";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "label";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "previewUrl";

-- Step 0m: drop AssignmentPlan.colorId/colorName/color/stripeColor/imageUrl/
-- thumbnailUrl (20260706)
-- Phase D of the AssignmentCard/AssignmentPlan FK+join redesign. All six are
-- confirmed dead: colorId/colorName were never populated by any real save
-- (the frontend never sends a real color - color/gender are not tracked at
-- the assignment level), and color/stripeColor/imageUrl/thumbnailUrl are
-- write-only (the frontend recomputes basis-color at render time and only
-- ever reads previewUrl for the card image, confirmed by grep - never these).
-- Application code no longer reads or writes any of these six columns
-- (backend/src/index.ts, see the comment in toAssignmentPlanResponse).
-- Safe regardless of current AssignmentPlan row count: these columns were
-- never populated with real data by any save path, so existing rows already
-- have them null (verify with a COUNT(*) WHERE column IS NOT NULL check
-- before running against production if this needs re-confirming).
ALTER TABLE "AssignmentPlan" DROP CONSTRAINT IF EXISTS "AssignmentPlan_colorId_fkey";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "colorId";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "colorName";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "color";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "stripeColor";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "imageUrl";
ALTER TABLE "AssignmentPlan" DROP COLUMN IF EXISTS "thumbnailUrl";

-- Step 0l: AssignmentCard.styleId/workOrderId/buyerOrgId + AssignmentPlan.buyerOrgId
-- real FK columns (20260706)
-- Part of the AssignmentCard/AssignmentPlan FK+join redesign (AGENTS.md, see
-- the section documenting this phased plan). AssignmentCard.payload already
-- carries styleId/workOrderId as plain unambiguous integers - this promotes
-- them to real relation columns. payload itself is left untouched for now
-- as a read-compatibility fallback during the migration - do not remove yet.
ALTER TABLE "AssignmentCard" ADD COLUMN IF NOT EXISTS "styleId" INTEGER;
ALTER TABLE "AssignmentCard" ADD COLUMN IF NOT EXISTS "workOrderId" INTEGER;
ALTER TABLE "AssignmentCard" ADD COLUMN IF NOT EXISTS "buyerOrgId" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "buyerOrgId" INTEGER;

UPDATE "AssignmentCard"
SET "styleId" = (payload->>'styleId')::integer
WHERE "styleId" IS NULL
  AND payload->>'styleId' ~ '^[0-9]+$';

UPDATE "AssignmentCard"
SET "workOrderId" = (payload->>'workOrderId')::integer
WHERE "workOrderId" IS NULL
  AND payload->>'workOrderId' ~ '^[0-9]+$';

-- buyerOrgId has no raw id in payload (only resolved display strings), so it
-- must come from a join through the workOrderId just backfilled above.
UPDATE "AssignmentCard" ac
SET "buyerOrgId" = COALESCE(wo."buyerOrgId", wo."customerId")
FROM "WorkOrder" wo
WHERE ac."workOrderId" = wo.id
  AND ac."buyerOrgId" IS NULL;

-- AssignmentPlan.styleId/buyerOrgId are backfilled only through
-- assignmentCardId (Step 0k), never re-derived independently, so a plan
-- always agrees with the card it was scheduled from. Plans with no
-- assignmentCardId match (pre-Step-0k stragglers) are left NULL, same as
-- Step 0k itself did.
UPDATE "AssignmentPlan" ap
SET
  "styleId" = COALESCE(ap."styleId", ac."styleId"),
  "buyerOrgId" = COALESCE(ap."buyerOrgId", ac."buyerOrgId")
FROM "AssignmentCard" ac
WHERE ap."assignmentCardId" = ac.id
  AND (ap."styleId" IS NULL OR ap."buyerOrgId" IS NULL);

CREATE INDEX IF NOT EXISTS "AssignmentCard_styleId_idx" ON "AssignmentCard"("styleId");
CREATE INDEX IF NOT EXISTS "AssignmentCard_workOrderId_idx" ON "AssignmentCard"("workOrderId");
CREATE INDEX IF NOT EXISTS "AssignmentCard_buyerOrgId_idx" ON "AssignmentCard"("buyerOrgId");
CREATE INDEX IF NOT EXISTS "AssignmentPlan_buyerOrgId_idx" ON "AssignmentPlan"("buyerOrgId");

DO $$ BEGIN
  ALTER TABLE "AssignmentCard"
    ADD CONSTRAINT "AssignmentCard_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentCard"
    ADD CONSTRAINT "AssignmentCard_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentCard"
    ADD CONSTRAINT "AssignmentCard_buyerOrgId_fkey"
    FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentPlan"
    ADD CONSTRAINT "AssignmentPlan_buyerOrgId_fkey"
    FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0k: AssignmentPlan.assignmentCardId real FK to AssignmentCard (20260705)
-- Replaces the "cardId string happens to match" application-level convention
-- (AGENTS.md structural-problems list) with a real FK, same pattern as Step 0i
-- did for workOrderId. cardId itself stays for now as a read fallback during
-- the migration - see AGENTS.md 43 for the phased plan and why onDelete is
-- SET NULL rather than RESTRICT for this first rollout.
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentCardId" INTEGER;

UPDATE "AssignmentPlan" ap
SET "assignmentCardId" = ac.id
FROM "AssignmentCard" ac
WHERE ap."assignmentCardId" IS NULL
  AND ap."cardId" IS NOT NULL
  AND ac."orgId" = ap."orgId"
  AND ac."cardId" = ap."cardId";

CREATE INDEX IF NOT EXISTS "AssignmentPlan_assignmentCardId_idx"
  ON "AssignmentPlan"("assignmentCardId");

DO $$ BEGIN
  ALTER TABLE "AssignmentPlan"
    ADD CONSTRAINT "AssignmentPlan_assignmentCardId_fkey"
    FOREIGN KEY ("assignmentCardId") REFERENCES "AssignmentCard"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0d-5: backfill WorkOrderItem rows from legacy WorkOrder.items JSON (20260702)
-- Only touches orders that have zero WorkOrderItem rows today (current write paths
-- already keep WorkOrderItem in sync, so this only affects pre-relational legacy data).
-- styleId/colorId are copied as already-resolved FK ids from the JSON, not re-resolved
-- by name/code.
DO $$
DECLARE
  backfilled_count INT;
BEGIN
  INSERT INTO "WorkOrderItem" (
    "workOrderId", "itemId", "styleId", "colorId", "gender",
    "sizeQuantities", "totalQuantity", "sortOrder",
    "createdAt", "createdBy", "updatedAt"
  )
  SELECT
    w.id,
    COALESCE(NULLIF(item.value ->> 'id', ''), ''),
    CASE
      WHEN (item.value ->> 'styleId') ~ '^[0-9]+$'
        THEN (SELECT s.id FROM "Style" s WHERE s.id = (item.value ->> 'styleId')::integer)
      ELSE NULL
    END,
    CASE
      WHEN (item.value ->> 'colorId') ~ '^[0-9]+$'
        THEN (SELECT c.id FROM "AttrColor" c WHERE c.id = (item.value ->> 'colorId')::integer)
      ELSE NULL
    END,
    CASE
      WHEN item.value ->> 'gender' IN ('M', 'W', 'U') THEN (item.value ->> 'gender')::"WorkOrderItemGender"
      ELSE 'M'::"WorkOrderItemGender"
    END,
    item.value -> 'sizeQuantities',
    CASE
      WHEN (item.value ->> 'totalQuantity') ~ '^[0-9]+$' THEN (item.value ->> 'totalQuantity')::integer
      ELSE 0
    END,
    (item.ordinality - 1)::integer,
    NOW(), 'system:migration-backfill', NOW()
  FROM "WorkOrder" w
  -- jsonb_array_elements/jsonb_array_length raise an error on non-array jsonb, and a
  -- LATERAL join's function argument is evaluated as part of FROM (before WHERE can
  -- filter anything out), so the CASE guard below must live inside the function call
  -- itself rather than relying on a WHERE clause to skip non-array rows first.
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN w."items" IS NOT NULL AND jsonb_typeof(w."items"::jsonb) = 'array'
        THEN w."items"::jsonb
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS item(value, ordinality)
  WHERE w."items" IS NOT NULL
    AND jsonb_typeof(w."items"::jsonb) = 'array'
    AND jsonb_array_length(
      CASE
        WHEN jsonb_typeof(w."items"::jsonb) = 'array' THEN w."items"::jsonb
        ELSE '[]'::jsonb
      END
    ) > 0
    AND NOT EXISTS (
      SELECT 1 FROM "WorkOrderItem" wi WHERE wi."workOrderId" = w.id
    );
  GET DIAGNOSTICS backfilled_count = ROW_COUNT;
  IF backfilled_count > 0 THEN
    RAISE NOTICE 'WorkOrderItem: backfilled % rows from legacy WorkOrder.items JSON', backfilled_count;
  END IF;
END $$;

-- Diagnostic only (does not modify data): orders where WorkOrder.items JSON item
-- count still does not match WorkOrderItem row count after the backfill above.
-- The INSERT above only fills orders with zero WorkOrderItem rows; a partial
-- mismatch (e.g. 3 JSON items but 1 WorkOrderItem row) is not auto-fixed here
-- because there is no safe way to tell which JSON items are already represented
-- without re-resolving by name/code. Run `npm run verify:workorder-item-backfill`
-- for the authoritative count before dropping WorkOrder.items.
DO $$
DECLARE
  mismatch_count INT;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM (
    SELECT w.id
    FROM "WorkOrder" w
    LEFT JOIN "WorkOrderItem" wi ON wi."workOrderId" = w.id
    WHERE w."items" IS NOT NULL
      AND jsonb_typeof(w."items"::jsonb) = 'array'
      AND jsonb_array_length(
        CASE
          WHEN jsonb_typeof(w."items"::jsonb) = 'array' THEN w."items"::jsonb
          ELSE '[]'::jsonb
        END
      ) > 0
    GROUP BY w.id, w."items"
    HAVING jsonb_array_length(
      CASE
        WHEN jsonb_typeof(w."items"::jsonb) = 'array' THEN w."items"::jsonb
        ELSE '[]'::jsonb
      END
    ) <> COUNT(wi.id)
  ) mismatched_orders;
  IF mismatch_count > 0 THEN
    RAISE NOTICE 'WorkOrderItem: % order(s) still have a WorkOrder.items JSON / WorkOrderItem row count mismatch after backfill — do not drop WorkOrder.items yet', mismatch_count;
  END IF;
END $$;

-- Step 0d-4: organization representative uses an employee FK (20260702)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "representativeEmployeeId" INTEGER;

WITH unique_organization_representative_matches AS (
  SELECT
    o.id AS "organizationId",
    e.id AS "employeeId",
    ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY e.id) AS rn,
    COUNT(*) OVER (PARTITION BY o.id) AS match_count
  FROM "Organization" o
  JOIN "Employee" e
    ON e."orgId" = o.id
   AND lower(btrim(COALESCE(e."name", ''))) = lower(btrim(COALESCE(o."representative", '')))
  WHERE o."representativeEmployeeId" IS NULL
    AND o."representative" IS NOT NULL
    AND btrim(o."representative") <> ''
)
UPDATE "Organization" o
SET "representativeEmployeeId" = matches."employeeId"
FROM unique_organization_representative_matches matches
WHERE o.id = matches."organizationId"
  AND matches.rn = 1
  AND matches.match_count = 1;

CREATE INDEX IF NOT EXISTS "Organization_representativeEmployeeId_idx"
  ON "Organization"("representativeEmployeeId");

DO $$
DECLARE
  cleared_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Organization_representativeEmployeeId_fkey'
      AND table_name = 'Organization'
  ) THEN
    UPDATE "Organization" o
    SET "representativeEmployeeId" = NULL
    WHERE o."representativeEmployeeId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "Employee" e
        WHERE e.id = o."representativeEmployeeId"
          AND e."orgId" = o.id
      );
    GET DIAGNOSTICS cleared_count = ROW_COUNT;
    IF cleared_count > 0 THEN
      RAISE NOTICE 'Organization: cleared % invalid representativeEmployeeId references before FK creation', cleared_count;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_representativeEmployeeId_fkey"
    FOREIGN KEY ("representativeEmployeeId") REFERENCES "Employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0d: style customer display fields are derived from Organization (20260701)
ALTER TABLE "Style" DROP CONSTRAINT IF EXISTS "Style_orgId_customer_name_key";
DROP INDEX IF EXISTS "Style_orgId_customer_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_name_key"
  ON "Style"("orgId", "name");
ALTER TABLE "Style"
  DROP COLUMN IF EXISTS "customer",
  DROP COLUMN IF EXISTS "customerNameKo",
  DROP COLUMN IF EXISTS "customerNameVi";

-- Step 0d-2: employee current line is a FK to Line, not denormalized text (20260701)
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "lineId" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Employee'
      AND column_name = 'lineName'
  ) THEN
    WITH employee_line_source AS (
      SELECT
        e.id AS "employeeId",
        e."orgId",
        e."factoryId",
        btrim(e."lineName") AS "lineName"
      FROM "Employee" e
      WHERE e."lineId" IS NULL
        AND e."lineName" IS NOT NULL
        AND btrim(e."lineName") <> ''
    ),
    line_matches AS (
      SELECT
        source."employeeId",
        l.id AS "lineId",
        count(*) OVER (PARTITION BY source."employeeId") AS "matchCount"
      FROM employee_line_source source
      JOIN "Line" l
        ON l."orgId" = source."orgId"
       AND lower(btrim(l."name")) = lower(source."lineName")
       AND (
         source."factoryId" IS NULL
         OR l."factoryId" = source."factoryId"
       )
    ),
    unique_line_matches AS (
      SELECT "employeeId", "lineId"
      FROM line_matches
      WHERE "matchCount" = 1
    )
    UPDATE "Employee" e
    SET "lineId" = unique_line_matches."lineId"
    FROM unique_line_matches
    WHERE e.id = unique_line_matches."employeeId"
      AND e."lineId" IS NULL;

    IF EXISTS (
      SELECT 1
      FROM "Employee"
      WHERE "lineName" IS NOT NULL
        AND btrim("lineName") <> ''
        AND "lineId" IS NULL
    ) THEN
      RAISE EXCEPTION 'Employee.lineName could not be mapped to exactly one Line.id; resolve Employee.lineId before dropping lineName.';
    END IF;

    ALTER TABLE "Employee" DROP COLUMN "lineName";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Employee_lineId_idx" ON "Employee"("lineId");
DO $$ BEGIN
  ALTER TABLE "Employee"
    ADD CONSTRAINT "Employee_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "Line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0d-3: remaining FK-able display columns cleanup (20260701)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkOrder' AND column_name = 'buyerOrgName'
  ) THEN
    WITH source_rows AS (
      SELECT id, btrim("buyerOrgName") AS "orgName"
      FROM "WorkOrder"
      WHERE "buyerOrgId" IS NULL
        AND "buyerOrgName" IS NOT NULL
        AND btrim("buyerOrgName") <> ''
    ),
    matches AS (
      SELECT
        source_rows.id AS "workOrderId",
        o.id AS "orgId",
        count(*) OVER (PARTITION BY source_rows.id) AS "matchCount"
      FROM source_rows
      JOIN "Organization" o
        ON lower(btrim(o."name")) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameKo", ''))) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameVi", ''))) = lower(source_rows."orgName")
    ),
    unique_matches AS (
      SELECT "workOrderId", "orgId"
      FROM matches
      WHERE "matchCount" = 1
    )
    UPDATE "WorkOrder" wo
    SET "buyerOrgId" = unique_matches."orgId"
    FROM unique_matches
    WHERE wo.id = unique_matches."workOrderId"
      AND wo."buyerOrgId" IS NULL;

    IF EXISTS (
      SELECT 1
      FROM "WorkOrder"
      WHERE "buyerOrgName" IS NOT NULL
        AND btrim("buyerOrgName") <> ''
        AND "buyerOrgId" IS NULL
    ) THEN
      RAISE EXCEPTION 'WorkOrder.buyerOrgName could not be mapped to exactly one Organization.id; resolve buyerOrgId before dropping buyerOrgName.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkOrder' AND column_name = 'customerName'
  ) THEN
    WITH source_rows AS (
      SELECT id, btrim("customerName") AS "orgName"
      FROM "WorkOrder"
      WHERE "customerId" IS NULL
        AND "customerName" IS NOT NULL
        AND btrim("customerName") <> ''
    ),
    matches AS (
      SELECT
        source_rows.id AS "workOrderId",
        o.id AS "orgId",
        count(*) OVER (PARTITION BY source_rows.id) AS "matchCount"
      FROM source_rows
      JOIN "Organization" o
        ON lower(btrim(o."name")) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameKo", ''))) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameVi", ''))) = lower(source_rows."orgName")
    ),
    unique_matches AS (
      SELECT "workOrderId", "orgId"
      FROM matches
      WHERE "matchCount" = 1
    )
    UPDATE "WorkOrder" wo
    SET "customerId" = unique_matches."orgId"
    FROM unique_matches
    WHERE wo.id = unique_matches."workOrderId"
      AND wo."customerId" IS NULL;

    IF EXISTS (
      SELECT 1
      FROM "WorkOrder"
      WHERE "customerName" IS NOT NULL
        AND btrim("customerName") <> ''
        AND "customerId" IS NULL
    ) THEN
      RAISE EXCEPTION 'WorkOrder.customerName could not be mapped to exactly one Organization.id; resolve customerId before dropping customerName.';
    END IF;
  END IF;

  UPDATE "WorkOrder"
  SET "customerId" = "buyerOrgId"
  WHERE "customerId" IS NULL AND "buyerOrgId" IS NOT NULL;

  UPDATE "WorkOrder"
  SET "buyerOrgId" = "customerId"
  WHERE "buyerOrgId" IS NULL AND "customerId" IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkOrder' AND column_name = 'sellerOrgName'
  ) THEN
    WITH source_rows AS (
      SELECT id, btrim("sellerOrgName") AS "orgName"
      FROM "WorkOrder"
      WHERE "sellerOrgId" IS NULL
        AND "sellerOrgName" IS NOT NULL
        AND btrim("sellerOrgName") <> ''
    ),
    matches AS (
      SELECT
        source_rows.id AS "workOrderId",
        o.id AS "orgId",
        count(*) OVER (PARTITION BY source_rows.id) AS "matchCount"
      FROM source_rows
      JOIN "Organization" o
        ON lower(btrim(o."name")) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameKo", ''))) = lower(source_rows."orgName")
        OR lower(btrim(COALESCE(o."nameVi", ''))) = lower(source_rows."orgName")
    ),
    unique_matches AS (
      SELECT "workOrderId", "orgId"
      FROM matches
      WHERE "matchCount" = 1
    )
    UPDATE "WorkOrder" wo
    SET "sellerOrgId" = unique_matches."orgId"
    FROM unique_matches
    WHERE wo.id = unique_matches."workOrderId"
      AND wo."sellerOrgId" IS NULL;

    IF EXISTS (
      SELECT 1
      FROM "WorkOrder"
      WHERE "sellerOrgName" IS NOT NULL
        AND btrim("sellerOrgName") <> ''
        AND "sellerOrgId" IS NULL
    ) THEN
      RAISE EXCEPTION 'WorkOrder.sellerOrgName could not be mapped to exactly one Organization.id; resolve sellerOrgId before dropping sellerOrgName.';
    END IF;
  END IF;

  UPDATE "WorkOrder"
  SET "sellerOrgId" = "orgId"
  WHERE "sellerOrgId" IS NULL;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkOrderItem' AND column_name = 'colorCode'
  ) THEN
    UPDATE "WorkOrderItem" item
    SET "colorId" = color.id
    FROM "AttrColor" color
    WHERE item."colorId" IS NULL
      AND item."colorCode" IS NOT NULL
      AND btrim(item."colorCode") <> ''
      AND lower(btrim(color."code")) = lower(btrim(item."colorCode"));

    IF EXISTS (
      SELECT 1
      FROM "WorkOrderItem"
      WHERE "colorCode" IS NOT NULL
        AND btrim("colorCode") <> ''
        AND "colorId" IS NULL
    ) THEN
      RAISE EXCEPTION 'WorkOrderItem.colorCode could not be mapped to AttrColor.id; resolve colorId before dropping colorCode.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'factoryName'
  ) THEN
    WITH source_rows AS (
      SELECT id, "orgId", btrim("factoryName") AS "factoryName"
      FROM "WorkLog"
      WHERE "factoryId" IS NULL
        AND "factoryName" IS NOT NULL
        AND btrim("factoryName") <> ''
    ),
    matches AS (
      SELECT
        source_rows.id AS "workLogId",
        f.id AS "factoryId",
        count(*) OVER (PARTITION BY source_rows.id) AS "matchCount"
      FROM source_rows
      JOIN "Factory" f
        ON f."orgId" = source_rows."orgId"
       AND lower(btrim(f."name")) = lower(source_rows."factoryName")
    ),
    unique_matches AS (
      SELECT "workLogId", "factoryId"
      FROM matches
      WHERE "matchCount" = 1
    )
    UPDATE "WorkLog" wl
    SET "factoryId" = unique_matches."factoryId"
    FROM unique_matches
    WHERE wl.id = unique_matches."workLogId"
      AND wl."factoryId" IS NULL;

    IF EXISTS (
      SELECT 1
      FROM "WorkLog"
      WHERE "factoryName" IS NOT NULL
        AND btrim("factoryName") <> ''
        AND "factoryId" IS NULL
    ) THEN
      RAISE EXCEPTION 'WorkLog.factoryName could not be mapped to exactly one Factory.id; resolve factoryId before dropping factoryName.';
    END IF;
  END IF;
END $$;

ALTER TABLE "WorkOrder"
  DROP COLUMN IF EXISTS "buyerOrgName",
  DROP COLUMN IF EXISTS "buyerOrgNameKo",
  DROP COLUMN IF EXISTS "buyerOrgNameVi",
  DROP COLUMN IF EXISTS "sellerOrgName",
  DROP COLUMN IF EXISTS "customerName";

ALTER TABLE "WorkOrderItem" DROP COLUMN IF EXISTS "colorCode";
ALTER TABLE "WorkLog" DROP COLUMN IF EXISTS "factoryName";

CREATE INDEX IF NOT EXISTS "WorkLog_factoryId_idx" ON "WorkLog"("factoryId");

DO $$ BEGIN
  ALTER TABLE "WorkOrder"
    ADD CONSTRAINT "WorkOrder_buyerOrgId_fkey"
    FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrder"
    ADD CONSTRAINT "WorkOrder_sellerOrgId_fkey"
    FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrder"
    ADD CONSTRAINT "WorkOrder_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Organization"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkLog"
    ADD CONSTRAINT "WorkLog_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkRecord"
    ADD CONSTRAINT "WorkRecord_lineId_fkey"
    FOREIGN KEY ("lineId") REFERENCES "Line"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0e: customer pricing prototype storage (20260613)
ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "pricingDefaultTradeType" TEXT;
ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "pricingMatrix" JSONB;

-- Step 0e-2: per-customer default order size notation (20260716)
ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "defaultSizeSetCode" TEXT DEFAULT 'LEGACY_APPAREL';
UPDATE "OrgRelationship"
SET "defaultSizeSetCode" = 'LEGACY_APPAREL'
WHERE "defaultSizeSetCode" IS NULL;
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "defaultSizeSetCode" TEXT NOT NULL DEFAULT 'LEGACY_APPAREL';

-- Step 0f/0g legacy OrgMembership cleanup is now handled in Step 0o.

-- Step 0h: org membership terminated status for employee offboarding (20260619)
ALTER TYPE "OrgMembershipStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';

-- Step 0h-2: work order editable draft status (20260701)
-- NOTE: ALTER TYPE ADD VALUE cannot be followed by use of the new value in the
-- same transaction (PostgreSQL limitation). The SET DEFAULT for 'EDITING' is
-- applied separately in ensureWorkOrderStatusSchemaReady() after this migration
-- commits.
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'EDITING';

-- Step 0i: assignment plan -> work order FK normalization (20260629)
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "workOrderId" INTEGER;

WITH assignment_plan_work_order_candidates AS (
  SELECT DISTINCT ON (ap.id)
    ap.id AS "assignmentPlanId",
    wo.id AS "workOrderId"
  FROM "AssignmentPlan" ap
  JOIN "WorkOrder" wo
    ON wo."orderId" = NULLIF(
      split_part(
        COALESCE(NULLIF(ap."cardId", ''), NULLIF(ap."originOrderId", '')),
        '::',
        1
      ),
      ''
    )
   AND (
     wo."orgId" = ap."orgId"
     OR wo."sellerOrgId" = ap."orgId"
     OR wo."buyerOrgId" = ap."orgId"
   )
  WHERE ap."workOrderId" IS NULL
  ORDER BY
    ap.id,
    CASE
      WHEN wo."orgId" = ap."orgId" THEN 0
      WHEN wo."sellerOrgId" = ap."orgId" THEN 1
      WHEN wo."buyerOrgId" = ap."orgId" THEN 2
      ELSE 3
    END,
    wo.id
)
UPDATE "AssignmentPlan" ap
SET "workOrderId" = candidate."workOrderId"
FROM assignment_plan_work_order_candidates candidate
WHERE ap.id = candidate."assignmentPlanId"
  AND ap."workOrderId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'orderNo'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'customer'
  ) THEN
    UPDATE "AssignmentPlan" ap
    SET
      "orderNo" = COALESCE(ap."orderNo", wo."orderNumber"),
      "customer" = COALESCE(ap."customer", customer_org."name", buyer_org."name")
    FROM "WorkOrder" wo
    LEFT JOIN "Organization" customer_org ON customer_org.id = wo."customerId"
    LEFT JOIN "Organization" buyer_org ON buyer_org.id = wo."buyerOrgId"
    WHERE ap."workOrderId" = wo.id
      AND (
        ap."orderNo" IS NULL
        OR ap."customer" IS NULL
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AssignmentPlan_workOrderId_idx"
  ON "AssignmentPlan"("workOrderId");

DO $$ BEGIN
  ALTER TABLE "AssignmentPlan"
    ADD CONSTRAINT "AssignmentPlan_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 0b: organization localized name fields (20260611)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "nameKo" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "nameVi" TEXT;

-- Step 0a: style revenue fields (20260611)
ALTER TABLE "Style" DROP COLUMN IF EXISTS "unitPriceUsd";
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "revenueMemo" TEXT;

-- Step 0: factory code and employee number (20260610)
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "factoryCode" TEXT;
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "nameKo" TEXT;
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "nameVi" TEXT;
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "managementStartDate" TEXT;
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "managerEmployeeId" INTEGER;
UPDATE "Factory"
SET "managementStartDate" = '2026-04-01'
WHERE "managementStartDate" IS NULL;

WITH unique_factory_manager_matches AS (
  SELECT
    f.id AS "factoryId",
    e.id AS "employeeId",
    ROW_NUMBER() OVER (PARTITION BY f.id ORDER BY e.id) AS rn,
    COUNT(*) OVER (PARTITION BY f.id) AS match_count
  FROM "Factory" f
  JOIN "Employee" e
    ON e."orgId" = f."orgId"
   AND e."factoryId" = f.id
   AND lower(btrim(COALESCE(e."name", ''))) = lower(btrim(COALESCE(f."manager", '')))
  WHERE f."managerEmployeeId" IS NULL
    AND f."manager" IS NOT NULL
    AND btrim(f."manager") <> ''
)
UPDATE "Factory" f
SET "managerEmployeeId" = matches."employeeId"
FROM unique_factory_manager_matches matches
WHERE f.id = matches."factoryId"
  AND matches.rn = 1
  AND matches.match_count = 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Factory_orgId_factoryCode_key"
  ON "Factory"("orgId", "factoryCode") WHERE "factoryCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Factory_managerEmployeeId_idx"
  ON "Factory"("managerEmployeeId");

DO $$
DECLARE
  cleared_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Factory_managerEmployeeId_fkey'
      AND table_name = 'Factory'
  ) THEN
    UPDATE "Factory" f
    SET "managerEmployeeId" = NULL
    WHERE f."managerEmployeeId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "Employee" e
        WHERE e.id = f."managerEmployeeId"
          AND e."orgId" = f."orgId"
          AND e."factoryId" = f.id
      );
    GET DIAGNOSTICS cleared_count = ROW_COUNT;
    IF cleared_count > 0 THEN
      RAISE NOTICE 'Factory: cleared % invalid managerEmployeeId references before FK creation', cleared_count;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "Factory"
    ADD CONSTRAINT "Factory_managerEmployeeId_fkey"
    FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeNo" TEXT;

-- Step 0aa: four-digit employee numbers and missing-number backfill (20260615)
UPDATE "Employee"
SET "employeeNo" = regexp_replace(
  "employeeNo",
  '[0-9]+$',
  lpad(substring("employeeNo" from '([0-9]+)$'), 4, '0')
)
WHERE "employeeNo" ~ '^.+-[0-9]{1,3}$';

WITH factory_sequences AS (
  SELECT
    f.id AS "factoryId",
    f."orgId",
    trim(f."factoryCode") AS "factoryCode",
    COALESCE(
      MAX(
        CASE
          WHEN left(
            e."employeeNo",
            char_length(trim(f."factoryCode")) + 1
          ) = trim(f."factoryCode") || '-'
            AND substring(
              e."employeeNo"
              from char_length(trim(f."factoryCode")) + 2
            ) ~ '^[0-9]+$'
          THEN substring(
            e."employeeNo"
            from char_length(trim(f."factoryCode")) + 2
          )::bigint
          ELSE 0
        END
      ),
      0
    ) AS "maxSequence"
  FROM "Factory" f
  LEFT JOIN "Employee" e
    ON e."orgId" = f."orgId"
    AND e."factoryId" = f.id
  WHERE NULLIF(trim(f."factoryCode"), '') IS NOT NULL
  GROUP BY f.id, f."orgId", trim(f."factoryCode")
),
missing_employee_numbers AS (
  SELECT
    e.id,
    fs."factoryCode",
    fs."maxSequence"
      + ROW_NUMBER() OVER (
          PARTITION BY fs."factoryId"
          ORDER BY e.id
        ) AS "nextSequence"
  FROM "Employee" e
  JOIN factory_sequences fs
    ON fs."orgId" = e."orgId"
    AND fs."factoryId" = e."factoryId"
  WHERE NULLIF(trim(e."employeeNo"), '') IS NULL
)
UPDATE "Employee" e
SET "employeeNo" = men."factoryCode" || '-'
  || lpad(men."nextSequence"::text, 4, '0')
FROM missing_employee_numbers men
WHERE e.id = men.id;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_orgId_employeeNo_key"
  ON "Employee"("orgId", "employeeNo");

-- Step 1: close fields (20260517)
DO $$ BEGIN
  CREATE TYPE "AssignmentCloseMode" AS ENUM ('FULL', 'SHORT', 'OVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AssignmentCloseBasis" AS ENUM ('QC_BASED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "closedQty" INTEGER,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "closeMode" "AssignmentCloseMode",
  ADD COLUMN IF NOT EXISTS "closeBasis" "AssignmentCloseBasis";

-- Step 2: QC pass events (20260518)
DO $$ BEGIN
  CREATE TYPE "QcPassEventSourceType" AS ENUM ('MANUAL', 'MIGRATED_LEGACY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "qcPassedTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "latestQcDate" TEXT;

CREATE TABLE IF NOT EXISTS "QcPassEvent" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "assignmentPlanId" INTEGER NOT NULL,
  "inspectedOn" TEXT NOT NULL,
  "passedQuantity" INTEGER NOT NULL DEFAULT 0,
  "colorId" INTEGER,
  "sizeKey" TEXT,
  "note" TEXT,
  "sourceType" "QcPassEventSourceType" NOT NULL DEFAULT 'MANUAL',
  "cancelledAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QcPassEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QcPassEvent_orgId_assignmentPlanId_inspectedOn_idx"
  ON "QcPassEvent"("orgId", "assignmentPlanId", "inspectedOn");
CREATE INDEX IF NOT EXISTS "QcPassEvent_orgId_inspectedOn_idx"
  ON "QcPassEvent"("orgId", "inspectedOn");
CREATE INDEX IF NOT EXISTS "QcPassEvent_assignmentPlanId_idx"
  ON "QcPassEvent"("assignmentPlanId");
CREATE INDEX IF NOT EXISTS "QcPassEvent_colorId_idx"
  ON "QcPassEvent"("colorId");

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_assignmentPlanId_fkey"
    FOREIGN KEY ("assignmentPlanId") REFERENCES "AssignmentPlan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "QcPassEvent"
    ADD CONSTRAINT "QcPassEvent_colorId_fkey"
    FOREIGN KEY ("colorId") REFERENCES "AttrColor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step 3: WorkLog coverage fields (20260518)
ALTER TABLE "WorkLog"
  ADD COLUMN IF NOT EXISTS "coverageStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "coverageEndDate" TEXT,
  ADD COLUMN IF NOT EXISTS "entryMode" TEXT;

-- Global system settings, including shared role access policy.
CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Step 4: Schedule realization fields (20260521)
ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "productionCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualProducedCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "candidateEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renderEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "forecastCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "forecastBasis" TEXT,
  ADD COLUMN IF NOT EXISTS "confidence" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleStatus" TEXT;

CREATE INDEX IF NOT EXISTS "AssignmentPlan_orgId_scheduleStatus_idx"
  ON "AssignmentPlan"("orgId", "scheduleStatus");

-- Step 4b: explicit time field names
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'totalSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "totalSeconds" TO "stTotalSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "stSeconds" TO "stTotalSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds') THEN
    UPDATE "AssignmentPlan" SET "stTotalSeconds" = COALESCE("stTotalSeconds", "stSeconds");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "stSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'totalSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds') THEN
    UPDATE "AssignmentPlan" SET "stTotalSeconds" = COALESCE("stTotalSeconds", "totalSeconds");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "totalSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'contractedSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'ctTotalSeconds') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "contractedSeconds" TO "ctTotalSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'contractedSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'ctTotalSeconds') THEN
    UPDATE "AssignmentPlan" SET "ctTotalSeconds" = COALESCE("ctTotalSeconds", "contractedSeconds");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "contractedSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'quantity')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentQuantity') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "quantity" TO "assignmentQuantity";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'quantity')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentQuantity') THEN
    UPDATE "AssignmentPlan" SET "assignmentQuantity" = COALESCE("assignmentQuantity", "quantity");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "quantity";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentStTotalSeconds') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "stTotalSeconds" TO "assignmentStTotalSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'stTotalSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentStTotalSeconds') THEN
    UPDATE "AssignmentPlan" SET "assignmentStTotalSeconds" = COALESCE("assignmentStTotalSeconds", "stTotalSeconds");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "stTotalSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'ctTotalSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentCtTotalSeconds') THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "ctTotalSeconds" TO "assignmentCtTotalSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'ctTotalSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AssignmentPlan' AND column_name = 'assignmentCtTotalSeconds') THEN
    UPDATE "AssignmentPlan" SET "assignmentCtTotalSeconds" = COALESCE("assignmentCtTotalSeconds", "ctTotalSeconds");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "ctTotalSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucket' AND column_name = 'totalSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucket' AND column_name = 'laborInputSeconds') THEN
    ALTER TABLE "AtTrainingBucket" RENAME COLUMN "totalSeconds" TO "laborInputSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucket' AND column_name = 'totalSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucket' AND column_name = 'laborInputSeconds') THEN
    UPDATE "AtTrainingBucket" SET "laborInputSeconds" = COALESCE("laborInputSeconds", "totalSeconds");
    ALTER TABLE "AtTrainingBucket" DROP COLUMN "totalSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalContractedSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtSeconds') THEN
    ALTER TABLE "WorkLog" RENAME COLUMN "totalContractedSeconds" TO "totalCtSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalContractedSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtSeconds') THEN
    UPDATE "WorkLog" SET "totalCtSeconds" = COALESCE("totalCtSeconds", "totalContractedSeconds");
    ALTER TABLE "WorkLog" DROP COLUMN "totalContractedSeconds";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtTotalSeconds')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtSeconds') THEN
    ALTER TABLE "WorkLog" RENAME COLUMN "totalCtTotalSeconds" TO "totalCtSeconds";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtTotalSeconds')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkLog' AND column_name = 'totalCtSeconds') THEN
    UPDATE "WorkLog" SET "totalCtSeconds" = COALESCE("totalCtSeconds", "totalCtTotalSeconds");
    ALTER TABLE "WorkLog" DROP COLUMN "totalCtTotalSeconds";
  END IF;
END $$;

-- Step 0j: canonical Style.id / Style.code and styleId FK normalization (20260701)
-- Rule: every *Id column stores an integer FK. Style's business code is Style.code.
ALTER TABLE "StyleProcess" DROP CONSTRAINT IF EXISTS "StyleProcess_styleUid_fkey";
ALTER TABLE "StyleProcess" DROP CONSTRAINT IF EXISTS "StyleProcess_styleId_fkey";
ALTER TABLE "WorkOrderItem" DROP CONSTRAINT IF EXISTS "WorkOrderItem_styleUid_fkey";
ALTER TABLE "WorkOrderItem" DROP CONSTRAINT IF EXISTS "WorkOrderItem_styleId_fkey";
ALTER TABLE "WorkRecord" DROP CONSTRAINT IF EXISTS "WorkRecord_styleUid_fkey";
ALTER TABLE "WorkRecord" DROP CONSTRAINT IF EXISTS "WorkRecord_styleId_fkey";
ALTER TABLE "AtTrainingBucketProcess" DROP CONSTRAINT IF EXISTS "AtTrainingBucketProcess_styleUid_fkey";
ALTER TABLE "AtTrainingBucketProcess" DROP CONSTRAINT IF EXISTS "AtTrainingBucketProcess_styleId_fkey";
ALTER TABLE "AssignmentPlan" DROP CONSTRAINT IF EXISTS "AssignmentPlan_styleId_fkey";

DROP INDEX IF EXISTS "Style_orgId_styleId_key";
DROP INDEX IF EXISTS "Style_orgId_styleCode_key";
DROP INDEX IF EXISTS "StyleProcess_styleUid_idx";
DROP INDEX IF EXISTS "StyleProcess_styleUid_orgId_processCode_key";
DROP INDEX IF EXISTS "WorkOrderItem_styleUid_idx";
DROP INDEX IF EXISTS "WorkRecord_styleUid_idx";
DROP INDEX IF EXISTS "AtTrainingBucketProcess_orgId_styleUid_idx";

DO $$
DECLARE
  work_order_item_style_id_type TEXT;
  work_record_style_id_type TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'uid')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'id') THEN
    ALTER TABLE "Style" RENAME COLUMN "uid" TO "id";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'uid')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'id') THEN
    RAISE EXCEPTION 'Style has both id and legacy uid; resolve manually before migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'styleId')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'code') THEN
    ALTER TABLE "Style" RENAME COLUMN "styleId" TO "code";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'styleId')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'code') THEN
    RAISE EXCEPTION 'Style has both code and legacy styleId; resolve manually before migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'styleCode') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'code') THEN
      ALTER TABLE "Style" RENAME COLUMN "styleCode" TO "code";
    ELSE
      -- Both code and styleCode exist. code is canonical (current app reads it).
      -- Fill code from styleCode only where code is blank; discard styleCode otherwise.
      UPDATE "Style"
        SET "code" = BTRIM("styleCode")
        WHERE NULLIF(BTRIM("code"), '') IS NULL
          AND NULLIF(BTRIM("styleCode"), '') IS NOT NULL;
      ALTER TABLE "Style" DROP COLUMN "styleCode";
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Style' AND column_name = 'code') THEN
    RAISE EXCEPTION 'Style.code is missing; resolve manually before migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM "Style" WHERE NULLIF(BTRIM("code"), '') IS NULL) THEN
    RAISE EXCEPTION 'Style.code contains blank values; resolve manually before migration.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StyleProcess' AND column_name = 'styleUid')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StyleProcess' AND column_name = 'styleId') THEN
    ALTER TABLE "StyleProcess" RENAME COLUMN "styleUid" TO "styleId";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StyleProcess' AND column_name = 'styleUid')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StyleProcess' AND column_name = 'styleId') THEN
    -- styleId is the canonical integer FK; keep it, fill nulls from styleUid, drop styleUid.
    UPDATE "StyleProcess" SET "styleId" = "styleUid" WHERE "styleId" IS NULL AND "styleUid" IS NOT NULL;
    ALTER TABLE "StyleProcess" DROP COLUMN "styleUid";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucketProcess' AND column_name = 'styleUid')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucketProcess' AND column_name = 'styleId') THEN
    ALTER TABLE "AtTrainingBucketProcess" RENAME COLUMN "styleUid" TO "styleId";
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucketProcess' AND column_name = 'styleUid')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AtTrainingBucketProcess' AND column_name = 'styleId') THEN
    -- styleId is the canonical integer FK; keep it, fill nulls from styleUid, drop styleUid.
    UPDATE "AtTrainingBucketProcess" SET "styleId" = "styleUid" WHERE "styleId" IS NULL AND "styleUid" IS NOT NULL;
    ALTER TABLE "AtTrainingBucketProcess" DROP COLUMN "styleUid";
  END IF;

  SELECT data_type INTO work_order_item_style_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'WorkOrderItem' AND column_name = 'styleId';

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkOrderItem' AND column_name = 'styleUid') THEN
    IF work_order_item_style_id_type IS NOT NULL AND work_order_item_style_id_type <> 'integer' THEN
      ALTER TABLE "WorkOrderItem" DROP COLUMN "styleId";
      ALTER TABLE "WorkOrderItem" RENAME COLUMN "styleUid" TO "styleId";
    ELSIF work_order_item_style_id_type IS NULL THEN
      ALTER TABLE "WorkOrderItem" RENAME COLUMN "styleUid" TO "styleId";
    ELSE
      -- styleId is the canonical integer FK; keep it, fill nulls from styleUid, drop styleUid.
      UPDATE "WorkOrderItem" SET "styleId" = "styleUid" WHERE "styleId" IS NULL AND "styleUid" IS NOT NULL;
      ALTER TABLE "WorkOrderItem" DROP COLUMN "styleUid";
    END IF;
  ELSIF work_order_item_style_id_type IS NOT NULL AND work_order_item_style_id_type <> 'integer' THEN
    RAISE EXCEPTION 'WorkOrderItem.styleId is not an integer FK and no legacy styleUid exists; resolve manually before migration.';
  END IF;

  ALTER TABLE "WorkOrderItem"
    DROP COLUMN IF EXISTS "styleName",
    DROP COLUMN IF EXISTS "styleCode";

  SELECT data_type INTO work_record_style_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'WorkRecord' AND column_name = 'styleId';

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'WorkRecord' AND column_name = 'styleUid') THEN
    IF work_record_style_id_type IS NOT NULL AND work_record_style_id_type <> 'integer' THEN
      ALTER TABLE "WorkRecord" DROP COLUMN "styleId";
      ALTER TABLE "WorkRecord" RENAME COLUMN "styleUid" TO "styleId";
    ELSIF work_record_style_id_type IS NULL THEN
      ALTER TABLE "WorkRecord" RENAME COLUMN "styleUid" TO "styleId";
    ELSE
      -- styleId is the canonical integer FK; keep it, fill nulls from styleUid, drop styleUid.
      UPDATE "WorkRecord" SET "styleId" = "styleUid" WHERE "styleId" IS NULL AND "styleUid" IS NOT NULL;
      ALTER TABLE "WorkRecord" DROP COLUMN "styleUid";
    END IF;
  ELSIF work_record_style_id_type IS NOT NULL AND work_record_style_id_type <> 'integer' THEN
    RAISE EXCEPTION 'WorkRecord.styleId is not an integer FK and no legacy styleUid exists; resolve manually before migration.';
  END IF;

  ALTER TABLE "WorkRecord"
    DROP COLUMN IF EXISTS "workerName",
    DROP COLUMN IF EXISTS "orderNo",
    DROP COLUMN IF EXISTS "customerName",
    DROP COLUMN IF EXISTS "styleName",
    DROP COLUMN IF EXISTS "processId",
    DROP COLUMN IF EXISTS "processCode",
    DROP COLUMN IF EXISTS "processName",
    DROP COLUMN IF EXISTS "colorId",
    DROP COLUMN IF EXISTS "colorCode",
    DROP COLUMN IF EXISTS "colorName",
    DROP COLUMN IF EXISTS "gender";

  ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "styleId" INTEGER;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Style_orgId_code_key" ON "Style"("orgId", "code");
CREATE INDEX IF NOT EXISTS "StyleProcess_styleId_idx" ON "StyleProcess"("styleId");
CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcess_styleId_orgId_processCode_key" ON "StyleProcess"("styleId", "orgId", "processCode");
CREATE INDEX IF NOT EXISTS "WorkOrderItem_styleId_idx" ON "WorkOrderItem"("styleId");
CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_styleId_idx" ON "WorkRecord"("orgId", "styleId");
CREATE INDEX IF NOT EXISTS "AtTrainingBucketProcess_orgId_styleId_idx" ON "AtTrainingBucketProcess"("orgId", "styleId");
CREATE INDEX IF NOT EXISTS "AssignmentPlan_styleId_idx" ON "AssignmentPlan"("styleId");

DO $$ BEGIN
  ALTER TABLE "StyleProcess"
    ADD CONSTRAINT "StyleProcess_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkOrderItem"
    ADD CONSTRAINT "WorkOrderItem_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WorkRecord"
    ADD CONSTRAINT "WorkRecord_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AtTrainingBucketProcess"
    ADD CONSTRAINT "AtTrainingBucketProcess_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssignmentPlan"
    ADD CONSTRAINT "AssignmentPlan_styleId_fkey"
    FOREIGN KEY ("styleId") REFERENCES "Style"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AtTrainingBucket FK constraints (sourceWorkLogId → WorkLog, factoryId → Factory)
-- Clean up orphaned sourceWorkLogId references before adding FK.
-- ON DELETE CASCADE is the policy, so rows pointing to deleted WorkLogs are removed here
-- to match what CASCADE would have done had the FK existed earlier.
-- Pattern for additive FK migrations:
--   1. Check whether the FK constraint already exists.
--   2. If it does not, clean up existing rows that violate the target FK.
--   3. Only then add the FK constraint.
DO $$
DECLARE
  deleted_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AtTrainingBucket_sourceWorkLogId_fkey'
      AND table_name = 'AtTrainingBucket'
  ) THEN
    DELETE FROM "AtTrainingBucket"
    WHERE "sourceWorkLogId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "WorkLog" WHERE "WorkLog"."id" = "AtTrainingBucket"."sourceWorkLogId"
      );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      RAISE NOTICE 'AtTrainingBucket: deleted % orphaned rows with missing sourceWorkLogId before FK creation', deleted_count;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtTrainingBucket"
    ADD CONSTRAINT "AtTrainingBucket_sourceWorkLogId_fkey"
    FOREIGN KEY ("sourceWorkLogId") REFERENCES "WorkLog"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- factoryId uses ON DELETE SET NULL, so orphaned references are nulled before FK creation.
DO $$
DECLARE
  updated_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AtTrainingBucket_factoryId_fkey'
      AND table_name = 'AtTrainingBucket'
  ) THEN
    UPDATE "AtTrainingBucket"
    SET "factoryId" = NULL
    WHERE "factoryId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Factory" WHERE "Factory"."id" = "AtTrainingBucket"."factoryId"
      );
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count > 0 THEN
      RAISE NOTICE 'AtTrainingBucket: cleared % orphaned factoryId references before FK creation', updated_count;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtTrainingBucket"
    ADD CONSTRAINT "AtTrainingBucket_factoryId_fkey"
    FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "AtTrainingBucket_factoryId_idx" ON "AtTrainingBucket"("factoryId");

-- Migration state table for one-off data migrations.
CREATE TABLE IF NOT EXISTS "_BaroMigrationState" (
  "key" TEXT PRIMARY KEY,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "_BaroMigrationState"
    WHERE "key" = '20260627_st_bucket_standard_v1'
  ) THEN
    DELETE FROM "StyleProcessStandard" legacy
    USING "StyleProcessStandard" target
    WHERE legacy."styleProcessId" = target."styleProcessId"
      AND (
        (legacy."bucketQuantity" = 2 AND target."bucketQuantity" = 3)
        OR (legacy."bucketQuantity" = 20 AND target."bucketQuantity" = 30)
        OR (legacy."bucketQuantity" = 200 AND target."bucketQuantity" = 300)
        OR (legacy."bucketQuantity" = 2000 AND target."bucketQuantity" = 3000)
      );

    UPDATE "StyleProcessStandard"
    SET "bucketQuantity" = CASE
      WHEN "bucketQuantity" = 2 THEN 3
      WHEN "bucketQuantity" = 20 THEN 30
      WHEN "bucketQuantity" = 200 THEN 300
      WHEN "bucketQuantity" = 2000 THEN 3000
      ELSE "bucketQuantity"
    END
    WHERE "bucketQuantity" IN (2, 20, 200, 2000);

    UPDATE "Style"
    SET "processes" = (
      SELECT COALESCE(
        jsonb_agg(
          proc
          || CASE
            WHEN jsonb_typeof(COALESCE(proc -> 'stBuckets', proc -> 'stValues')) = 'array' THEN
              jsonb_build_object(
                'stBuckets',
                (
                  SELECT COALESCE(
                    jsonb_agg(
                      (
                        bucket - 'quantity'
                        || jsonb_build_object(
                          'bucketQuantity',
                          to_jsonb(
                            CASE
                              WHEN COALESCE((bucket ->> 'bucketQuantity')::int, (bucket ->> 'quantity')::int) = 2 THEN 3
                              WHEN COALESCE((bucket ->> 'bucketQuantity')::int, (bucket ->> 'quantity')::int) = 20 THEN 30
                              WHEN COALESCE((bucket ->> 'bucketQuantity')::int, (bucket ->> 'quantity')::int) = 200 THEN 300
                              WHEN COALESCE((bucket ->> 'bucketQuantity')::int, (bucket ->> 'quantity')::int) = 2000 THEN 3000
                              ELSE COALESCE((bucket ->> 'bucketQuantity')::int, (bucket ->> 'quantity')::int)
                            END
                          )
                        )
                      )
                      ORDER BY bucket_ord
                    ),
                    '[]'::jsonb
                  )
                  FROM jsonb_array_elements(COALESCE(proc -> 'stBuckets', proc -> 'stValues', '[]'::jsonb))
                    WITH ORDINALITY AS bucket_items(bucket, bucket_ord)
                )
              )
            ELSE '{}'::jsonb
          END
          ORDER BY proc_ord
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(COALESCE("processes"::jsonb, '[]'::jsonb))
        WITH ORDINALITY AS proc_items(proc, proc_ord)
    )
    WHERE "processes" IS NOT NULL
      AND jsonb_typeof("processes"::jsonb) = 'array'
      AND (
        "processes"::text LIKE '%"bucketQuantity": 2%'
        OR "processes"::text LIKE '%"bucketQuantity": 20%'
        OR "processes"::text LIKE '%"bucketQuantity": 200%'
        OR "processes"::text LIKE '%"bucketQuantity": 2000%'
        OR "processes"::text LIKE '%"quantity": 2%'
        OR "processes"::text LIKE '%"quantity": 20%'
        OR "processes"::text LIKE '%"quantity": 200%'
        OR "processes"::text LIKE '%"quantity": 2000%'
      );

    INSERT INTO "_BaroMigrationState" ("key")
    VALUES ('20260627_st_bucket_standard_v1');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'ptSeconds'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "_BaroMigrationState"
    WHERE "key" = '20260627_pt_seed_missing_st_buckets_v1'
  ) THEN
    INSERT INTO "StyleProcessStandard" (
      "orgId",
      "styleProcessId",
      "bucketQuantity",
      "bucketStSeconds",
      "setBy",
      "setAt",
      "updatedAt"
    )
    SELECT
      sp."orgId",
      sp.id,
      buckets."bucketQuantity",
      sp."ptSeconds",
      'PT_DERIVED',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "StyleProcess" sp
    CROSS JOIN (
      VALUES (1), (3), (5), (10), (30), (50), (100), (300), (500), (1000), (3000), (5000), (10000)
    ) AS buckets("bucketQuantity")
    LEFT JOIN "StyleProcessStandard" existing
      ON existing."styleProcessId" = sp.id
     AND existing."bucketQuantity" = buckets."bucketQuantity"
    WHERE sp."ptSeconds" IS NOT NULL
      AND sp."ptSeconds" > 0
      AND existing.id IS NULL;

    INSERT INTO "_BaroMigrationState" ("key")
    VALUES ('20260627_pt_seed_missing_st_buckets_v1');
  END IF;
END $$;

-- Step 4b: ensure final column names exist.
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentQuantity" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentStTotalSeconds" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentCtTotalSeconds" INTEGER;
ALTER TABLE "AtTrainingBucket" ADD COLUMN IF NOT EXISTS "laborInputSeconds" DOUBLE PRECISION;
ALTER TABLE "AtTrainingBucketProcess" ADD COLUMN IF NOT EXISTS "eventCount" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "AtTrainingBucketProcess" ADD COLUMN IF NOT EXISTS "assignmentPlanId" INTEGER;
ALTER TABLE "AtTrainingBucketProcess" ADD COLUMN IF NOT EXISTS "sourceGroupKey" TEXT NOT NULL DEFAULT 'missingAssignmentPlan';
ALTER TABLE "AtTrainingBucket" ADD COLUMN IF NOT EXISTS "workerId" INTEGER;
DELETE FROM "AtTrainingBucket" WHERE "workerId" IS NULL;
DROP INDEX IF EXISTS "AtTrainingBucket_orgId_sourceWorkLogId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AtTrainingBucket_orgId_sourceWorkLogId_workerId_key"
  ON "AtTrainingBucket"("orgId", "sourceWorkLogId", "workerId");
CREATE INDEX IF NOT EXISTS "AtTrainingBucket_workerId_idx" ON "AtTrainingBucket"("workerId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AtTrainingBucket_workerId_fkey'
  ) THEN
    ALTER TABLE "AtTrainingBucket"
      ADD CONSTRAINT "AtTrainingBucket_workerId_fkey"
      FOREIGN KEY ("workerId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AtTrainingBucket" ALTER COLUMN "workerId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "_BaroMigrationState"
    WHERE "key" = '20260723_clear_stale_at_params_v1'
  ) THEN
    DELETE FROM "AtTrainingBucket";

    UPDATE "StyleProcess"
    SET "atParams" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "atParams" IS NOT NULL;

    UPDATE "Style" AS s
    SET "processes" = (
          SELECT COALESCE(
            jsonb_agg(
              CASE
                WHEN jsonb_typeof(proc.value) = 'object'
                  THEN proc.value - 'atParams' - 'at'
                ELSE proc.value
              END
              ORDER BY proc.ordinality
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(s."processes"::jsonb)
            WITH ORDINALITY AS proc(value, ordinality)
        ),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE s."processes" IS NOT NULL
      AND jsonb_typeof(s."processes"::jsonb) = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(s."processes"::jsonb) AS elem(value)
        WHERE jsonb_typeof(elem.value) = 'object'
          AND (elem.value ? 'atParams' OR elem.value ? 'at')
      );

    INSERT INTO "_BaroMigrationState" ("key")
    VALUES ('20260723_clear_stale_at_params_v1');
  END IF;
END $$;

ALTER TABLE "AtTrainingBucketProcess" ALTER COLUMN "sourceGroupKey" SET DEFAULT 'missingAssignmentPlan';
ALTER TABLE "WorkLog" ADD COLUMN IF NOT EXISTS "totalCtSeconds" DOUBLE PRECISION;

UPDATE "AtTrainingBucketProcess"
SET "sourceGroupKey" = CASE
  WHEN "assignmentPlanId" IS NOT NULL THEN CONCAT('assignmentPlan:', "assignmentPlanId")
  ELSE CONCAT('missingAssignmentPlan:process:', "styleProcessId")
END
WHERE "sourceGroupKey" IS NULL
  OR "sourceGroupKey" = 'legacy'
  OR "sourceGroupKey" LIKE 'legacyBucket:%'
  OR "sourceGroupKey" LIKE 'workLog:%';

ALTER TABLE "AtTrainingBucketProcess"
  DROP CONSTRAINT IF EXISTS "AtTrainingBucketProcess_bucketId_styleProcessId_key";
DROP INDEX IF EXISTS "AtTrainingBucketProcess_bucketId_styleProcessId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AtTrainingBucketProcess_bucket_styleProcess_source_key"
  ON "AtTrainingBucketProcess"("bucketId", "styleProcessId", "sourceGroupKey");
CREATE INDEX IF NOT EXISTS "AtTrainingBucketProcess_orgId_styleProcess_source_idx"
  ON "AtTrainingBucketProcess"("orgId", "styleProcessId", "sourceGroupKey");
CREATE INDEX IF NOT EXISTS "AtTrainingBucketProcess_assignmentPlanId_idx"
  ON "AtTrainingBucketProcess"("assignmentPlanId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AtTrainingBucketProcess_assignmentPlanId_fkey'
  ) THEN
    ALTER TABLE "AtTrainingBucketProcess"
      ADD CONSTRAINT "AtTrainingBucketProcess_assignmentPlanId_fkey"
      FOREIGN KEY ("assignmentPlanId") REFERENCES "AssignmentPlan"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Ensure correct column types (fix environments where columns were created as INTEGER)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AtTrainingBucket'
      AND column_name = 'laborInputSeconds'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "AtTrainingBucket" ALTER COLUMN "laborInputSeconds" TYPE DOUBLE PRECISION USING "laborInputSeconds"::DOUBLE PRECISION;
    RAISE NOTICE 'AtTrainingBucket.laborInputSeconds converted from INTEGER to DOUBLE PRECISION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkLog'
      AND column_name = 'totalCtSeconds'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "WorkLog" ALTER COLUMN "totalCtSeconds" TYPE DOUBLE PRECISION USING "totalCtSeconds"::DOUBLE PRECISION;
    RAISE NOTICE 'WorkLog.totalCtSeconds converted from INTEGER to DOUBLE PRECISION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AtTrainingBucketProcess'
      AND column_name = 'eventCount'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE "AtTrainingBucketProcess" ALTER COLUMN "eventCount" TYPE DOUBLE PRECISION USING "eventCount"::DOUBLE PRECISION;
    RAISE NOTICE 'AtTrainingBucketProcess.eventCount converted from INTEGER to DOUBLE PRECISION';
  END IF;
END $$;

UPDATE "AssignmentBoardState"
SET "cards" = (
  SELECT COALESCE(jsonb_agg(
    elem - 'totalSeconds' - 'stSeconds' - 'contractedSeconds'
    || CASE
      WHEN elem ? 'stTotalSeconds' THEN '{}'::jsonb
      WHEN elem ? 'stSeconds' THEN jsonb_build_object('stTotalSeconds', elem -> 'stSeconds')
      WHEN elem ? 'totalSeconds' THEN jsonb_build_object('stTotalSeconds', elem -> 'totalSeconds')
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN elem ? 'ctTotalSeconds' THEN '{}'::jsonb
      WHEN elem ? 'contractedSeconds' THEN jsonb_build_object('ctTotalSeconds', elem -> 'contractedSeconds')
      ELSE '{}'::jsonb
    END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("cards"::jsonb) WITH ORDINALITY AS t(elem, ord)
)
WHERE "cards" IS NOT NULL AND jsonb_typeof("cards"::jsonb) = 'array';

UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT COALESCE(jsonb_agg(
    elem - 'totalSeconds' - 'stSeconds' - 'contractedSeconds'
    || CASE
      WHEN elem ? 'stTotalSeconds' THEN '{}'::jsonb
      WHEN elem ? 'stSeconds' THEN jsonb_build_object('stTotalSeconds', elem -> 'stSeconds')
      WHEN elem ? 'totalSeconds' THEN jsonb_build_object('stTotalSeconds', elem -> 'totalSeconds')
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN elem ? 'ctTotalSeconds' THEN '{}'::jsonb
      WHEN elem ? 'contractedSeconds' THEN jsonb_build_object('ctTotalSeconds', elem -> 'contractedSeconds')
      ELSE '{}'::jsonb
    END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("assignments"::jsonb) WITH ORDINALITY AS t(elem, ord)
)
WHERE "assignments" IS NOT NULL AND jsonb_typeof("assignments"::jsonb) = 'array';

-- Step 4b-1: AssignmentBoardState JSON is no longer canonical.
-- Before dropping the legacy JSON columns, verify that every legacy board row
-- is represented by AssignmentCard/AssignmentPlan.
DO $$
DECLARE
  missing_assignment_count INTEGER := 0;
  missing_card_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)
    INTO missing_assignment_count
  FROM "AssignmentBoardState" state
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(state."assignments"::jsonb) = 'array'
        THEN state."assignments"::jsonb
      ELSE '[]'::jsonb
    END
  ) AS assignment_elem(elem)
  WHERE COALESCE(assignment_elem.elem ->> 'id', assignment_elem.elem ->> 'externalId') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "AssignmentPlan" plan
      WHERE plan."orgId" = state."orgId"
        AND plan."externalId" = COALESCE(
          assignment_elem.elem ->> 'id',
          assignment_elem.elem ->> 'externalId'
        )
    );

  SELECT COUNT(*)
    INTO missing_card_count
  FROM "AssignmentBoardState" state
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(state."cards"::jsonb) = 'array'
        THEN state."cards"::jsonb
      ELSE '[]'::jsonb
    END
  ) AS card_elem(elem)
  WHERE COALESCE(card_elem.elem ->> 'id', card_elem.elem ->> 'cardId') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "AssignmentCard" card
      WHERE card."orgId" = state."orgId"
        AND card."cardId" = COALESCE(card_elem.elem ->> 'id', card_elem.elem ->> 'cardId')
    );

  IF missing_assignment_count > 0 THEN
    RAISE WARNING 'AssignmentBoardState.assignments has % legacy rows missing AssignmentPlan; keep JSON columns until backfilled', missing_assignment_count;
  END IF;
  IF missing_card_count > 0 THEN
    RAISE WARNING 'AssignmentBoardState.cards has % legacy rows missing AssignmentCard; keep JSON columns until backfilled', missing_card_count;
  END IF;
END $$;

UPDATE "AssignmentCard"
SET "payload" = "payload"::jsonb - 'totalSeconds' - 'stSeconds' - 'contractedSeconds'
  || CASE
    WHEN "payload"::jsonb ? 'stTotalSeconds' THEN '{}'::jsonb
    WHEN "payload"::jsonb ? 'stSeconds' THEN jsonb_build_object('stTotalSeconds', "payload"::jsonb -> 'stSeconds')
    WHEN "payload"::jsonb ? 'totalSeconds' THEN jsonb_build_object('stTotalSeconds', "payload"::jsonb -> 'totalSeconds')
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN "payload"::jsonb ? 'ctTotalSeconds' THEN '{}'::jsonb
    WHEN "payload"::jsonb ? 'contractedSeconds' THEN jsonb_build_object('ctTotalSeconds', "payload"::jsonb -> 'contractedSeconds')
    ELSE '{}'::jsonb
  END
WHERE "payload" IS NOT NULL
  AND jsonb_typeof("payload"::jsonb) = 'object'
  AND ("payload"::jsonb ? 'totalSeconds' OR "payload"::jsonb ? 'stSeconds' OR "payload"::jsonb ? 'contractedSeconds');
-- Step 5: WorkRecord effective coverage fields
ALTER TABLE "WorkRecord"
  ADD COLUMN IF NOT EXISTS "lineId" INTEGER,
  ADD COLUMN IF NOT EXISTS "effectiveCoverageStartDate" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveCoverageEndDate" TEXT;

UPDATE "WorkRecord" AS wr
SET
  "effectiveCoverageStartDate" = GREATEST(
    wl."coverageStartDate",
    COALESCE(
      (
        SELECT TO_CHAR(e."joinedAt", 'YYYY-MM-DD')
        FROM "Employee" AS e
        WHERE e."orgId" = wl."orgId"
          AND e."id" = wr."workerId"
      ),
      wl."coverageStartDate"
    )
  ),
  "effectiveCoverageEndDate" = LEAST(
    wl."coverageEndDate",
    COALESCE(
      (
        SELECT TO_CHAR(e."leftAt", 'YYYY-MM-DD')
        FROM "Employee" AS e
        WHERE e."orgId" = wl."orgId"
          AND e."id" = wr."workerId"
      ),
      wl."coverageEndDate"
    )
  )
FROM "WorkLog" AS wl
WHERE wr."workLogId" = wl."id"
  AND wl."coverageStartDate" IS NOT NULL
  AND wl."coverageEndDate" IS NOT NULL
  AND (
    wr."effectiveCoverageStartDate" IS NULL
    OR wr."effectiveCoverageEndDate" IS NULL
  );

WITH adjusted_workers AS (
  SELECT DISTINCT
    wl."id" AS "workLogId",
    wr."workerId",
    COALESCE(NULLIF(BTRIM(e."name"), ''), '작업자 #' || wr."workerId"::TEXT) AS "workerLabel",
    wl."coverageStartDate",
    wl."coverageEndDate",
    wr."effectiveCoverageStartDate",
    wr."effectiveCoverageEndDate",
    TO_CHAR(e."joinedAt", 'YYYY-MM-DD') AS "joinedDateKey",
    TO_CHAR(e."leftAt", 'YYYY-MM-DD') AS "leftDateKey"
  FROM "WorkRecord" AS wr
  JOIN "WorkLog" AS wl
    ON wl."id" = wr."workLogId"
  LEFT JOIN "Employee" AS e
    ON e."orgId" = wr."orgId"
   AND e."id" = wr."workerId"
  WHERE wr."effectiveCoverageStartDate" IS NOT NULL
    AND wr."effectiveCoverageEndDate" IS NOT NULL
    AND wr."effectiveCoverageStartDate" <= wr."effectiveCoverageEndDate"
    AND (
      wr."effectiveCoverageStartDate" <> wl."coverageStartDate"
      OR wr."effectiveCoverageEndDate" <> wl."coverageEndDate"
    )
),
adjustment_notes AS (
  SELECT
    "workLogId",
    STRING_AGG(
      '- ' || "workerLabel" || ': '
      || "coverageStartDate" || '~' || "coverageEndDate"
      || ' → '
      || "effectiveCoverageStartDate" || '~' || "effectiveCoverageEndDate"
      || CASE
        WHEN "joinedDateKey" IS NOT NULL
          AND "effectiveCoverageStartDate" <> "coverageStartDate"
          AND "leftDateKey" IS NOT NULL
          AND "effectiveCoverageEndDate" <> "coverageEndDate"
          THEN ' (입사일 ' || "joinedDateKey" || ', 퇴사일 ' || "leftDateKey" || ')'
        WHEN "joinedDateKey" IS NOT NULL
          AND "effectiveCoverageStartDate" <> "coverageStartDate"
          THEN ' (입사일 ' || "joinedDateKey" || ')'
        WHEN "leftDateKey" IS NOT NULL
          AND "effectiveCoverageEndDate" <> "coverageEndDate"
          THEN ' (퇴사일 ' || "leftDateKey" || ')'
        ELSE ''
      END,
      E'\n' ORDER BY "workerId"
    ) AS "adjustmentNote"
  FROM adjusted_workers
  GROUP BY "workLogId"
)
UPDATE "WorkLog" AS wl
SET "note" = CASE
  WHEN NULLIF(BTRIM(wl."note"), '') IS NULL
    THEN '[재직기간 자동 조정]' || E'\n' || notes."adjustmentNote"
  ELSE RTRIM(wl."note") || E'\n\n[재직기간 자동 조정]\n' || notes."adjustmentNote"
END
FROM adjustment_notes AS notes
WHERE wl."id" = notes."workLogId"
  AND POSITION('[재직기간 자동 조정]' IN COALESCE(wl."note", '')) = 0;

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
  ON "WorkRecord"("orgId", "lineId");

-- Step 5a-2: WorkRecord exact style process FK (20260629)
-- styleProcessId points to StyleProcess.id and is the canonical ST matching key.
ALTER TABLE "WorkRecord"
  ADD COLUMN IF NOT EXISTS "styleProcessId" INTEGER;

CREATE INDEX IF NOT EXISTS "WorkRecord_styleProcessId_idx"
  ON "WorkRecord"("styleProcessId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkRecord_styleProcessId_fkey'
  ) THEN
    ALTER TABLE "WorkRecord"
      ADD CONSTRAINT "WorkRecord_styleProcessId_fkey"
      FOREIGN KEY ("styleProcessId") REFERENCES "StyleProcess"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_styleId_idx"
  ON "WorkRecord"("orgId", "styleId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkRecord'
      AND column_name = 'styleId'
      AND data_type = 'integer'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkRecord_styleId_fkey'
  ) THEN
    ALTER TABLE "WorkRecord"
      ADD CONSTRAINT "WorkRecord_styleId_fkey"
      FOREIGN KEY ("styleId") REFERENCES "Style"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkRecord'
      AND column_name = 'workerId'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkRecord_workerId_fkey'
  ) THEN
    ALTER TABLE "WorkRecord"
      ADD CONSTRAINT "WorkRecord_workerId_fkey"
      FOREIGN KEY ("workerId") REFERENCES "Employee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6-0. AssignmentPlan physical snapshot column rename.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssignmentPlan'
      AND column_name = 'ctSnapshot'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssignmentPlan'
      AND column_name = 'assignmentCtSnapshot'
  ) THEN
    ALTER TABLE "AssignmentPlan" RENAME COLUMN "ctSnapshot" TO "assignmentCtSnapshot";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssignmentPlan'
      AND column_name = 'ctSnapshot'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssignmentPlan'
      AND column_name = 'assignmentCtSnapshot'
  ) THEN
    UPDATE "AssignmentPlan"
    SET "assignmentCtSnapshot" = COALESCE("assignmentCtSnapshot", "ctSnapshot");
    ALTER TABLE "AssignmentPlan" DROP COLUMN "ctSnapshot";
  END IF;
END $$;

ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "assignmentCtSnapshot" JSONB;

-- Phase 6E preflight runs after AssignmentPlan.assignmentCtSnapshot is available
-- and before the later StyleProcessStandard no-op rename section, so ensure
-- StyleProcessStandard already exposes the final physical column names here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) THEN
    ALTER TABLE "StyleProcessStandard" RENAME COLUMN "quantity" TO "bucketQuantity";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'quantity'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) THEN
    UPDATE "StyleProcessStandard"
    SET "bucketQuantity" = COALESCE("bucketQuantity", "quantity");
    ALTER TABLE "StyleProcessStandard" DROP COLUMN "quantity";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'stSeconds'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketStSeconds'
  ) THEN
    ALTER TABLE "StyleProcessStandard" RENAME COLUMN "stSeconds" TO "bucketStSeconds";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'stSeconds'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketStSeconds'
  ) THEN
    UPDATE "StyleProcessStandard"
    SET "bucketStSeconds" = COALESCE("bucketStSeconds", "stSeconds");
    ALTER TABLE "StyleProcessStandard" DROP COLUMN "stSeconds";
  END IF;
END $$;

-- 6-0b removed 2026-07-25: live ST is FK-versioned and historical assignments use frozen snapshots.

-- Step 6: ctSnapshot JSON 내부 구 키명 정리 (20260525)
-- 구 이름: totalAgreedSeconds/totalAgreedPerPieceSeconds/agreedAt/agreedBy/agreedSeconds/agreedPerPieceSeconds/requestedSeconds/proposedSeconds/ctAgreedSnapshot
-- 신 이름: totalCtSeconds/totalCtPerPieceSeconds/updatedAt/updatedBy/ctSeconds/ctPerPieceSeconds/ctSnapshot

-- 6-1. AssignmentPlan.ctSnapshot 최상위 키 rename
UPDATE "AssignmentPlan"
SET "assignmentCtSnapshot" = (
  "assignmentCtSnapshot"::jsonb
  - 'totalAgreedSeconds' - 'totalAgreedPerPieceSeconds' - 'agreedAt' - 'agreedBy'
  || CASE WHEN "assignmentCtSnapshot"::jsonb ? 'totalAgreedSeconds' AND NOT "assignmentCtSnapshot"::jsonb ? 'totalCtSeconds'
          THEN jsonb_build_object('totalCtSeconds', "assignmentCtSnapshot"::jsonb -> 'totalAgreedSeconds')
          ELSE '{}'::jsonb END
  || CASE WHEN "assignmentCtSnapshot"::jsonb ? 'totalAgreedPerPieceSeconds' AND NOT "assignmentCtSnapshot"::jsonb ? 'totalCtPerPieceSeconds'
          THEN jsonb_build_object('totalCtPerPieceSeconds', "assignmentCtSnapshot"::jsonb -> 'totalAgreedPerPieceSeconds')
          ELSE '{}'::jsonb END
  || CASE WHEN "assignmentCtSnapshot"::jsonb ? 'agreedAt' AND NOT "assignmentCtSnapshot"::jsonb ? 'updatedAt'
          THEN jsonb_build_object('updatedAt', "assignmentCtSnapshot"::jsonb -> 'agreedAt')
          ELSE '{}'::jsonb END
  || CASE WHEN "assignmentCtSnapshot"::jsonb ? 'agreedBy' AND NOT "assignmentCtSnapshot"::jsonb ? 'updatedBy'
          THEN jsonb_build_object('updatedBy', "assignmentCtSnapshot"::jsonb -> 'agreedBy')
          ELSE '{}'::jsonb END
)
WHERE "assignmentCtSnapshot" IS NOT NULL
  AND (
    "assignmentCtSnapshot"::jsonb ? 'totalAgreedSeconds'
    OR "assignmentCtSnapshot"::jsonb ? 'totalAgreedPerPieceSeconds'
    OR "assignmentCtSnapshot"::jsonb ? 'agreedAt'
    OR "assignmentCtSnapshot"::jsonb ? 'agreedBy'
  );

-- 6-2. AssignmentPlan.ctSnapshot.processes[] 공정 키 rename
UPDATE "AssignmentPlan"
SET "assignmentCtSnapshot" = jsonb_set(
  "assignmentCtSnapshot"::jsonb,
  '{processes}',
  (
    SELECT jsonb_agg(
      elem
      - 'agreedSeconds' - 'agreedPerPieceSeconds' - 'requestedSeconds' - 'proposedSeconds'
      || CASE WHEN (elem ? 'agreedSeconds' OR elem ? 'requestedSeconds' OR elem ? 'proposedSeconds')
                   AND NOT elem ? 'ctSeconds'
              THEN jsonb_build_object('ctSeconds',
                COALESCE(elem -> 'agreedSeconds', elem -> 'requestedSeconds', elem -> 'proposedSeconds'))
              ELSE '{}'::jsonb END
      || CASE WHEN elem ? 'agreedPerPieceSeconds' AND NOT elem ? 'ctPerPieceSeconds'
              THEN jsonb_build_object('ctPerPieceSeconds', elem -> 'agreedPerPieceSeconds')
              ELSE '{}'::jsonb END
    )
    FROM jsonb_array_elements("assignmentCtSnapshot"::jsonb -> 'processes') elem
  )
)
WHERE "assignmentCtSnapshot" IS NOT NULL
  AND jsonb_typeof("assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignmentCtSnapshot"::jsonb -> 'processes') elem
    WHERE elem ? 'agreedSeconds' OR elem ? 'agreedPerPieceSeconds'
       OR elem ? 'requestedSeconds' OR elem ? 'proposedSeconds'
  );

-- 6-3. AssignmentBoardState.assignments ctAgreedSnapshot → ctSnapshot
UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'ctAgreedSnapshot' AND NOT elem ? 'ctSnapshot' THEN
        elem - 'ctAgreedSnapshot' || jsonb_build_object('ctSnapshot', elem -> 'ctAgreedSnapshot')
      WHEN elem ? 'ctAgreedSnapshot' THEN
        elem - 'ctAgreedSnapshot'
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE elem ? 'ctAgreedSnapshot'
  );

-- 6-4. AssignmentBoardState.assignments[].ctSnapshot 최상위 키 rename
UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'ctSnapshot' AND (
        (elem -> 'ctSnapshot') ? 'totalAgreedSeconds'
        OR (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds'
        OR (elem -> 'ctSnapshot') ? 'agreedAt'
        OR (elem -> 'ctSnapshot') ? 'agreedBy'
      ) THEN
        jsonb_set(
          elem, '{ctSnapshot}',
          (elem -> 'ctSnapshot')
          - 'totalAgreedSeconds' - 'totalAgreedPerPieceSeconds' - 'agreedAt' - 'agreedBy'
          || CASE WHEN (elem -> 'ctSnapshot') ? 'totalAgreedSeconds' AND NOT (elem -> 'ctSnapshot') ? 'totalCtSeconds'
                  THEN jsonb_build_object('totalCtSeconds', (elem -> 'ctSnapshot') -> 'totalAgreedSeconds')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds' AND NOT (elem -> 'ctSnapshot') ? 'totalCtPerPieceSeconds'
                  THEN jsonb_build_object('totalCtPerPieceSeconds', (elem -> 'ctSnapshot') -> 'totalAgreedPerPieceSeconds')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'agreedAt' AND NOT (elem -> 'ctSnapshot') ? 'updatedAt'
                  THEN jsonb_build_object('updatedAt', (elem -> 'ctSnapshot') -> 'agreedAt')
                  ELSE '{}'::jsonb END
          || CASE WHEN (elem -> 'ctSnapshot') ? 'agreedBy' AND NOT (elem -> 'ctSnapshot') ? 'updatedBy'
                  THEN jsonb_build_object('updatedBy', (elem -> 'ctSnapshot') -> 'agreedBy')
                  ELSE '{}'::jsonb END
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE elem ? 'ctSnapshot' AND (
      (elem -> 'ctSnapshot') ? 'totalAgreedSeconds'
      OR (elem -> 'ctSnapshot') ? 'totalAgreedPerPieceSeconds'
      OR (elem -> 'ctSnapshot') ? 'agreedAt'
      OR (elem -> 'ctSnapshot') ? 'agreedBy'
    )
  );

-- 6-5. AssignmentCard.payload ctAgreedSnapshot 제거
-- 6-4b. AssignmentBoardState.assignments[].ctSnapshot -> assignmentCtSnapshot
UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'assignmentCtSnapshot' THEN elem - 'ctSnapshot' - 'ctAgreedSnapshot'
      WHEN elem ? 'ctSnapshot' THEN
        elem - 'ctSnapshot' - 'ctAgreedSnapshot'
        || jsonb_build_object('assignmentCtSnapshot', elem -> 'ctSnapshot')
      WHEN elem ? 'ctAgreedSnapshot' THEN
        elem - 'ctAgreedSnapshot'
        || jsonb_build_object('assignmentCtSnapshot', elem -> 'ctAgreedSnapshot')
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE elem ? 'ctSnapshot' OR elem ? 'ctAgreedSnapshot'
  );

-- 6-4c. assignmentCtSnapshot nested CT keys -> scoped canonical names.
UPDATE "AssignmentPlan"
SET "assignmentCtSnapshot" = (
  "assignmentCtSnapshot"::jsonb
  - 'totalCtSeconds' - 'totalCtPerPieceSeconds'
  || CASE
    WHEN COALESCE(
      "assignmentCtSnapshot"::jsonb -> 'assignmentCtTotalSeconds',
      "assignmentCtSnapshot"::jsonb -> 'totalCtSeconds'
    ) IS NOT NULL THEN
      jsonb_build_object(
        'assignmentCtTotalSeconds',
        COALESCE(
          "assignmentCtSnapshot"::jsonb -> 'assignmentCtTotalSeconds',
          "assignmentCtSnapshot"::jsonb -> 'totalCtSeconds'
        )
      )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN COALESCE(
      "assignmentCtSnapshot"::jsonb -> 'pieceCtTotalSeconds',
      "assignmentCtSnapshot"::jsonb -> 'totalCtPerPieceSeconds'
    ) IS NOT NULL THEN
      jsonb_build_object(
        'pieceCtTotalSeconds',
        COALESCE(
          "assignmentCtSnapshot"::jsonb -> 'pieceCtTotalSeconds',
          "assignmentCtSnapshot"::jsonb -> 'totalCtPerPieceSeconds'
        )
      )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN jsonb_typeof("assignmentCtSnapshot"::jsonb -> 'processes') = 'array' THEN
      jsonb_build_object(
        'processes',
        (
          SELECT COALESCE(
            jsonb_agg(
              elem - 'quantity' - 'ctSeconds' - 'ctPerPieceSeconds'
              || CASE
                WHEN COALESCE(elem -> 'timesPerPiece', elem -> 'quantity') IS NOT NULL THEN
                  jsonb_build_object('timesPerPiece', COALESCE(elem -> 'timesPerPiece', elem -> 'quantity'))
                ELSE '{}'::jsonb
              END
              || CASE
                WHEN COALESCE(elem -> 'snapshotCtSeconds', elem -> 'ctSeconds') IS NOT NULL THEN
                  jsonb_build_object('snapshotCtSeconds', COALESCE(elem -> 'snapshotCtSeconds', elem -> 'ctSeconds'))
                ELSE '{}'::jsonb
              END
              || CASE
                WHEN COALESCE(elem -> 'pieceCtSeconds', elem -> 'ctPerPieceSeconds') IS NOT NULL THEN
                  jsonb_build_object('pieceCtSeconds', COALESCE(elem -> 'pieceCtSeconds', elem -> 'ctPerPieceSeconds'))
                ELSE '{}'::jsonb
              END
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements("assignmentCtSnapshot"::jsonb -> 'processes') elem
        )
      )
    ELSE '{}'::jsonb
  END
)
WHERE "assignmentCtSnapshot" IS NOT NULL
  AND (
    "assignmentCtSnapshot"::jsonb ? 'totalCtSeconds'
    OR "assignmentCtSnapshot"::jsonb ? 'totalCtPerPieceSeconds'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof("assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
            THEN "assignmentCtSnapshot"::jsonb -> 'processes'
          ELSE '[]'::jsonb
        END
      ) elem
      WHERE elem ? 'quantity' OR elem ? 'ctSeconds' OR elem ? 'ctPerPieceSeconds'
    )
  );

UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem -> 'assignmentCtSnapshot') = 'object' THEN
        jsonb_set(
          elem,
          '{assignmentCtSnapshot}',
          (
            (elem -> 'assignmentCtSnapshot')
            - 'totalCtSeconds' - 'totalCtPerPieceSeconds'
            || CASE
              WHEN COALESCE(
                (elem -> 'assignmentCtSnapshot') -> 'assignmentCtTotalSeconds',
                (elem -> 'assignmentCtSnapshot') -> 'totalCtSeconds'
              ) IS NOT NULL THEN
                jsonb_build_object(
                  'assignmentCtTotalSeconds',
                  COALESCE(
                    (elem -> 'assignmentCtSnapshot') -> 'assignmentCtTotalSeconds',
                    (elem -> 'assignmentCtSnapshot') -> 'totalCtSeconds'
                  )
                )
              ELSE '{}'::jsonb
            END
            || CASE
              WHEN COALESCE(
                (elem -> 'assignmentCtSnapshot') -> 'pieceCtTotalSeconds',
                (elem -> 'assignmentCtSnapshot') -> 'totalCtPerPieceSeconds'
              ) IS NOT NULL THEN
                jsonb_build_object(
                  'pieceCtTotalSeconds',
                  COALESCE(
                    (elem -> 'assignmentCtSnapshot') -> 'pieceCtTotalSeconds',
                    (elem -> 'assignmentCtSnapshot') -> 'totalCtPerPieceSeconds'
                  )
                )
              ELSE '{}'::jsonb
            END
            || CASE
              WHEN jsonb_typeof((elem -> 'assignmentCtSnapshot') -> 'processes') = 'array' THEN
                jsonb_build_object(
                  'processes',
                  (
                    SELECT COALESCE(
                      jsonb_agg(
                        proc - 'quantity' - 'ctSeconds' - 'ctPerPieceSeconds'
                        || CASE
                          WHEN COALESCE(proc -> 'timesPerPiece', proc -> 'quantity') IS NOT NULL THEN
                            jsonb_build_object('timesPerPiece', COALESCE(proc -> 'timesPerPiece', proc -> 'quantity'))
                          ELSE '{}'::jsonb
                        END
                        || CASE
                          WHEN COALESCE(proc -> 'snapshotCtSeconds', proc -> 'ctSeconds') IS NOT NULL THEN
                            jsonb_build_object('snapshotCtSeconds', COALESCE(proc -> 'snapshotCtSeconds', proc -> 'ctSeconds'))
                          ELSE '{}'::jsonb
                        END
                        || CASE
                          WHEN COALESCE(proc -> 'pieceCtSeconds', proc -> 'ctPerPieceSeconds') IS NOT NULL THEN
                            jsonb_build_object('pieceCtSeconds', COALESCE(proc -> 'pieceCtSeconds', proc -> 'ctPerPieceSeconds'))
                          ELSE '{}'::jsonb
                        END
                      ),
                      '[]'::jsonb
                    )
                    FROM jsonb_array_elements((elem -> 'assignmentCtSnapshot') -> 'processes') proc
                  )
                )
              ELSE '{}'::jsonb
            END
          )
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements("assignments"::jsonb) elem
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE jsonb_typeof(elem -> 'assignmentCtSnapshot') = 'object'
      AND (
        (elem -> 'assignmentCtSnapshot') ? 'totalCtSeconds'
        OR (elem -> 'assignmentCtSnapshot') ? 'totalCtPerPieceSeconds'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof((elem -> 'assignmentCtSnapshot') -> 'processes') = 'array'
                THEN (elem -> 'assignmentCtSnapshot') -> 'processes'
              ELSE '[]'::jsonb
            END
          ) proc
          WHERE proc ? 'quantity' OR proc ? 'ctSeconds' OR proc ? 'ctPerPieceSeconds'
        )
      )
  );

-- 6-4d. assignmentCtSnapshot ST copy cleanup.
--      StyleProcessStandard.bucketStSeconds is the ST source of truth; persisted CT snapshots
--      must not keep process stSeconds or totalStPerPieceSeconds copies.
UPDATE "AssignmentPlan"
SET "assignmentCtSnapshot" = (
  ("assignmentCtSnapshot"::jsonb - 'totalStPerPieceSeconds')
  || CASE
    WHEN jsonb_typeof("assignmentCtSnapshot"::jsonb -> 'processes') = 'array' THEN
      jsonb_build_object(
        'processes',
        (
          SELECT COALESCE(jsonb_agg(proc.value - 'stSeconds' ORDER BY proc.ordinality), '[]'::jsonb)
          FROM jsonb_array_elements("assignmentCtSnapshot"::jsonb -> 'processes')
            WITH ORDINALITY AS proc(value, ordinality)
        )
      )
    ELSE '{}'::jsonb
  END
)
WHERE "assignmentCtSnapshot" IS NOT NULL
  AND jsonb_typeof("assignmentCtSnapshot"::jsonb) = 'object'
  AND (
    "assignmentCtSnapshot"::jsonb ? 'totalStPerPieceSeconds'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof("assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
            THEN "assignmentCtSnapshot"::jsonb -> 'processes'
          ELSE '[]'::jsonb
        END
      ) proc
      WHERE proc ? 'stSeconds'
    )
  );

UPDATE "AssignmentBoardState"
SET "assignments" = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem.value -> 'assignmentCtSnapshot') = 'object'
        AND (
          (elem.value -> 'assignmentCtSnapshot') ? 'totalStPerPieceSeconds'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof((elem.value -> 'assignmentCtSnapshot') -> 'processes') = 'array'
                  THEN (elem.value -> 'assignmentCtSnapshot') -> 'processes'
                ELSE '[]'::jsonb
              END
            ) proc
            WHERE proc ? 'stSeconds'
          )
        )
        THEN elem.value || jsonb_build_object(
          'assignmentCtSnapshot',
          (
            ((elem.value -> 'assignmentCtSnapshot') - 'totalStPerPieceSeconds')
            || CASE
              WHEN jsonb_typeof((elem.value -> 'assignmentCtSnapshot') -> 'processes') = 'array' THEN
                jsonb_build_object(
                  'processes',
                  (
                    SELECT COALESCE(jsonb_agg(proc.value - 'stSeconds' ORDER BY proc.ordinality), '[]'::jsonb)
                    FROM jsonb_array_elements((elem.value -> 'assignmentCtSnapshot') -> 'processes')
                      WITH ORDINALITY AS proc(value, ordinality)
                  )
                )
              ELSE '{}'::jsonb
            END
          )
        )
      ELSE elem.value
    END
    ORDER BY elem.ordinality
  )
  FROM jsonb_array_elements("assignments"::jsonb) WITH ORDINALITY AS elem(value, ordinality)
)
WHERE "assignments" IS NOT NULL
  AND jsonb_typeof("assignments"::jsonb) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("assignments"::jsonb) elem
    WHERE jsonb_typeof(elem -> 'assignmentCtSnapshot') = 'object'
      AND (
        (elem -> 'assignmentCtSnapshot') ? 'totalStPerPieceSeconds'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof((elem -> 'assignmentCtSnapshot') -> 'processes') = 'array'
                THEN (elem -> 'assignmentCtSnapshot') -> 'processes'
              ELSE '[]'::jsonb
            END
          ) proc
          WHERE proc ? 'stSeconds'
        )
      )
  );

-- 6-4e. Backfill legacy assignmentCtSnapshot process references.
--      Some historical snapshots kept the StyleProcess id only inside legacy
--      processKey values such as TA01-1216-0. Exact completion/progress checks
--      use StyleProcess FK identity, so restore processes[].styleProcessId only
--      when the parsed id points to a real StyleProcess on the same Style.
WITH rebuilt_assignment_ct_snapshots AS (
  SELECT
    plan.id,
    (
      plan."assignmentCtSnapshot"::jsonb
      || jsonb_build_object(
        'processes',
        COALESCE(
          jsonb_agg(
            CASE
              WHEN NULLIF(proc.value ->> 'styleProcessId', '') IS NULL
                AND matched."styleProcessId" IS NOT NULL
                THEN proc.value || jsonb_build_object('styleProcessId', matched."styleProcessId")
              ELSE proc.value
            END
            ORDER BY proc.ordinality
          ),
          '[]'::jsonb
        )
      )
    ) AS next_snapshot
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(plan."assignmentCtSnapshot"::jsonb -> 'processes')
    WITH ORDINALITY AS proc(value, ordinality)
  LEFT JOIN LATERAL (
    SELECT sp.id AS "styleProcessId"
    FROM (
      SELECT CASE
        WHEN proc.value ->> 'processKey' ~ '^[0-9]+$'
          THEN (proc.value ->> 'processKey')::integer
        WHEN proc.value ->> 'processKey' ~ '-[0-9]+-[0-9]+$'
          THEN regexp_replace(proc.value ->> 'processKey', '^.*-([0-9]+)-[0-9]+$', '\1')::integer
        ELSE NULL
      END AS "styleProcessId"
    ) candidate
    JOIN "StyleProcess" sp
      ON sp.id = candidate."styleProcessId"
     AND sp."styleId" = plan."styleId"
    WHERE NULLIF(proc.value ->> 'styleProcessId', '') IS NULL
  ) matched ON TRUE
  WHERE plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb) = 'object'
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
  GROUP BY plan.id, plan."assignmentCtSnapshot"
)
UPDATE "AssignmentPlan" plan
SET "assignmentCtSnapshot" = rebuilt.next_snapshot
FROM rebuilt_assignment_ct_snapshots rebuilt
WHERE plan.id = rebuilt.id
  AND plan."assignmentCtSnapshot"::jsonb IS DISTINCT FROM rebuilt.next_snapshot;

-- 6-4f. Remove legacy processKey from CT snapshots once styleProcessId exists.
--      processKey used to carry legacy identity such as TA01-1216-0. New runtime
--      matching must use processes[].styleProcessId only. Keep processKey only on
--      still-unrepaired rows so the repair evidence is not destroyed.
WITH rebuilt_assignment_ct_snapshots AS (
  SELECT
    plan.id,
    (
      plan."assignmentCtSnapshot"::jsonb
      || jsonb_build_object(
        'processes',
        COALESCE(
          jsonb_agg(
            CASE
              WHEN NULLIF(proc.value ->> 'styleProcessId', '') IS NOT NULL
                THEN proc.value - 'processKey'
              ELSE proc.value
            END
            ORDER BY proc.ordinality
          ),
          '[]'::jsonb
        )
      )
    ) AS next_snapshot
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(plan."assignmentCtSnapshot"::jsonb -> 'processes')
    WITH ORDINALITY AS proc(value, ordinality)
  WHERE plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb) = 'object'
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(plan."assignmentCtSnapshot"::jsonb -> 'processes') existing_proc(value)
      WHERE existing_proc.value ? 'processKey'
        AND NULLIF(existing_proc.value ->> 'styleProcessId', '') IS NOT NULL
    )
  GROUP BY plan.id, plan."assignmentCtSnapshot"
)
UPDATE "AssignmentPlan" plan
SET "assignmentCtSnapshot" = rebuilt.next_snapshot
FROM rebuilt_assignment_ct_snapshots rebuilt
WHERE plan.id = rebuilt.id
  AND plan."assignmentCtSnapshot"::jsonb IS DISTINCT FROM rebuilt.next_snapshot;

WITH rebuilt_assignment_board_states AS (
  SELECT
    state.id,
    jsonb_agg(
      CASE
        WHEN elem.value ? 'assignmentCtSnapshot'
          AND jsonb_typeof(elem.value -> 'assignmentCtSnapshot') = 'object'
          AND jsonb_typeof((elem.value -> 'assignmentCtSnapshot') -> 'processes') = 'array'
          THEN jsonb_set(
            elem.value,
            '{assignmentCtSnapshot,processes}',
            (
              SELECT COALESCE(
                jsonb_agg(
                  CASE
                    WHEN NULLIF(proc.value ->> 'styleProcessId', '') IS NOT NULL
                      THEN proc.value - 'processKey'
                    ELSE proc.value
                  END
                  ORDER BY proc.ordinality
                ),
                '[]'::jsonb
              )
              FROM jsonb_array_elements((elem.value -> 'assignmentCtSnapshot') -> 'processes')
                WITH ORDINALITY AS proc(value, ordinality)
            )
          )
        ELSE elem.value
      END
      ORDER BY elem.ordinality
    ) AS next_assignments
  FROM "AssignmentBoardState" state
  CROSS JOIN LATERAL jsonb_array_elements(state."assignments"::jsonb)
    WITH ORDINALITY AS elem(value, ordinality)
  WHERE state."assignments" IS NOT NULL
    AND jsonb_typeof(state."assignments"::jsonb) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(state."assignments"::jsonb) assignment_elem(value)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN assignment_elem.value ? 'assignmentCtSnapshot'
            AND jsonb_typeof((assignment_elem.value -> 'assignmentCtSnapshot') -> 'processes') = 'array'
            THEN (assignment_elem.value -> 'assignmentCtSnapshot') -> 'processes'
          ELSE '[]'::jsonb
        END
      ) proc(value)
      WHERE proc.value ? 'processKey'
        AND NULLIF(proc.value ->> 'styleProcessId', '') IS NOT NULL
    )
  GROUP BY state.id
)
UPDATE "AssignmentBoardState" state
SET "assignments" = rebuilt.next_assignments
FROM rebuilt_assignment_board_states rebuilt
WHERE state.id = rebuilt.id
  AND state."assignments"::jsonb IS DISTINCT FROM rebuilt.next_assignments;

-- 6-5. AssignmentCard.payload ctAgreedSnapshot cleanup
UPDATE "AssignmentCard"
SET "payload" = "payload"::jsonb - 'ctAgreedSnapshot'
WHERE "payload" IS NOT NULL
  AND "payload"::jsonb ? 'ctAgreedSnapshot';

-- 6-6. AssignmentCard.payload canonical quantity/time keys.
--    quantity -> cardQuantity
--    totalPt -> cardPtTotalSeconds
--    totalAt -> cardAtTotalSeconds
--    totalSt -> cardStTotalSeconds
UPDATE "AssignmentCard"
SET "payload" = (
  "payload"::jsonb
    - 'quantity'
    - 'totalPt'
    - 'totalAt'
    - 'totalSt'
    - 'stTotalSeconds'
    - 'totalSeconds'
    - 'stSeconds'
    - 'contractedSeconds'
  || CASE
    WHEN COALESCE("payload"::jsonb -> 'cardQuantity', "payload"::jsonb -> 'quantity') IS NOT NULL THEN
      jsonb_build_object(
        'cardQuantity',
        COALESCE("payload"::jsonb -> 'cardQuantity', "payload"::jsonb -> 'quantity')
      )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN COALESCE(
      "payload"::jsonb -> 'cardPtTotalSeconds',
      "payload"::jsonb -> 'totalPt',
      CASE
        WHEN UPPER(COALESCE("payload"::jsonb ->> 'status', '')) <> 'ST'
          THEN "payload"::jsonb -> 'stTotalSeconds'
        ELSE NULL
      END
    ) IS NOT NULL THEN
      jsonb_build_object(
        'cardPtTotalSeconds',
        COALESCE(
          "payload"::jsonb -> 'cardPtTotalSeconds',
          "payload"::jsonb -> 'totalPt',
          CASE
            WHEN UPPER(COALESCE("payload"::jsonb ->> 'status', '')) <> 'ST'
              THEN "payload"::jsonb -> 'stTotalSeconds'
            ELSE NULL
          END
        )
      )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN COALESCE("payload"::jsonb -> 'cardAtTotalSeconds', "payload"::jsonb -> 'totalAt') IS NOT NULL THEN
      jsonb_build_object(
        'cardAtTotalSeconds',
        COALESCE("payload"::jsonb -> 'cardAtTotalSeconds', "payload"::jsonb -> 'totalAt')
      )
    ELSE '{}'::jsonb
  END
  || CASE
    WHEN COALESCE(
      "payload"::jsonb -> 'cardStTotalSeconds',
      "payload"::jsonb -> 'totalSt',
      CASE
        WHEN UPPER(COALESCE("payload"::jsonb ->> 'status', '')) = 'ST'
          THEN "payload"::jsonb -> 'stTotalSeconds'
        ELSE NULL
      END
    ) IS NOT NULL THEN
      jsonb_build_object(
        'cardStTotalSeconds',
        COALESCE(
          "payload"::jsonb -> 'cardStTotalSeconds',
          "payload"::jsonb -> 'totalSt',
          CASE
            WHEN UPPER(COALESCE("payload"::jsonb ->> 'status', '')) = 'ST'
              THEN "payload"::jsonb -> 'stTotalSeconds'
            ELSE NULL
          END
        )
      )
    ELSE '{}'::jsonb
  END
)
WHERE "payload" IS NOT NULL
  AND jsonb_typeof("payload"::jsonb) = 'object'
  AND (
    "payload"::jsonb ? 'quantity'
    OR "payload"::jsonb ? 'totalPt'
    OR "payload"::jsonb ? 'totalAt'
    OR "payload"::jsonb ? 'totalSt'
    OR "payload"::jsonb ? 'stTotalSeconds'
    OR "payload"::jsonb ? 'totalSeconds'
    OR "payload"::jsonb ? 'stSeconds'
    OR "payload"::jsonb ? 'contractedSeconds'
  );

-- 6-6b. AssignmentCard.payload legacy display/FK copy cleanup.
-- The row FK columns (styleId/workOrderId/buyerOrgId) and their joins are now
-- the only source of truth for card display fields. Remove any lingering
-- payload copies so stale text/ids cannot silently mask FK/join problems.
UPDATE "AssignmentCard"
SET "payload" = (
  "payload"::jsonb
    - 'styleCode'
    - 'styleName'
    - 'previewUrl'
    - 'orderNo'
    - 'dueDate'
    - 'customer'
    - 'customerNameKo'
    - 'customerNameVi'
    - 'colorName'
    - 'gender'
    - 'styleId'
    - 'workOrderId'
    - 'buyerOrgId'
)
WHERE "payload" IS NOT NULL
  AND jsonb_typeof("payload"::jsonb) = 'object'
  AND (
    "payload"::jsonb ? 'styleCode'
    OR "payload"::jsonb ? 'styleName'
    OR "payload"::jsonb ? 'previewUrl'
    OR "payload"::jsonb ? 'orderNo'
    OR "payload"::jsonb ? 'dueDate'
    OR "payload"::jsonb ? 'customer'
    OR "payload"::jsonb ? 'customerNameKo'
    OR "payload"::jsonb ? 'customerNameVi'
    OR "payload"::jsonb ? 'colorName'
    OR "payload"::jsonb ? 'gender'
    OR "payload"::jsonb ? 'styleId'
    OR "payload"::jsonb ? 'workOrderId'
    OR "payload"::jsonb ? 'buyerOrgId'
  );

-- 7. Style.processes canonical JSON keys for ST buckets and process repeat count.
--    stValues -> stBuckets
--    stValues[].quantity -> stBuckets[].bucketQuantity
--    stValues[].seconds -> stBuckets[].bucketStSeconds
--    processes[].quantity -> processes[].timesPerPiece
UPDATE "Style"
SET "processes" = (
  SELECT COALESCE(
    jsonb_agg(
      proc - 'stValues' - 'stBuckets' - 'quantity'
      || jsonb_build_object(
        'timesPerPiece',
        COALESCE(proc -> 'timesPerPiece', proc -> 'quantity', '1'::jsonb)
      )
      || CASE
        WHEN jsonb_typeof(COALESCE(proc -> 'stBuckets', proc -> 'stValues')) = 'array' THEN
          jsonb_build_object(
            'stBuckets',
            (
              SELECT COALESCE(
                jsonb_agg(
                  bucket - 'quantity' - 'seconds'
                  || CASE
                    WHEN bucket ? 'bucketQuantity' THEN
                      jsonb_build_object('bucketQuantity', bucket -> 'bucketQuantity')
                    WHEN bucket ? 'quantity' THEN
                      jsonb_build_object('bucketQuantity', bucket -> 'quantity')
                    ELSE '{}'::jsonb
                  END
                  || CASE
                    WHEN bucket ? 'bucketStSeconds' THEN
                      jsonb_build_object('bucketStSeconds', bucket -> 'bucketStSeconds')
                    WHEN bucket ? 'seconds' THEN
                      jsonb_build_object('bucketStSeconds', bucket -> 'seconds')
                    ELSE '{}'::jsonb
                  END
                  ORDER BY bucket_ord
                ),
                '[]'::jsonb
              )
              FROM jsonb_array_elements(COALESCE(proc -> 'stBuckets', proc -> 'stValues'))
                WITH ORDINALITY AS bucket_items(bucket, bucket_ord)
            )
          )
        ELSE '{}'::jsonb
      END
      ORDER BY proc_ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements("processes"::jsonb)
    WITH ORDINALITY AS proc_items(proc, proc_ord)
)
WHERE "processes" IS NOT NULL
  AND jsonb_typeof("processes"::jsonb) = 'array'
  AND (
    "processes"::text LIKE '%"stValues"%'
    OR "processes"::text LIKE '%"stBuckets"%'
    OR "processes"::text LIKE '%"quantity"%'
    OR "processes"::text LIKE '%"timesPerPiece"%'
  );

-- 8. StyleProcessStandard physical column rename for ST bucket naming.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'quantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) THEN
    ALTER TABLE "StyleProcessStandard" RENAME COLUMN "quantity" TO "bucketQuantity";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'quantity'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) THEN
    UPDATE "StyleProcessStandard"
    SET "bucketQuantity" = COALESCE("bucketQuantity", "quantity");
    ALTER TABLE "StyleProcessStandard" DROP COLUMN "quantity";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'stSeconds'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketStSeconds'
  ) THEN
    ALTER TABLE "StyleProcessStandard" RENAME COLUMN "stSeconds" TO "bucketStSeconds";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'stSeconds'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketStSeconds'
  ) THEN
    UPDATE "StyleProcessStandard"
    SET "bucketStSeconds" = COALESCE("bucketStSeconds", "stSeconds");
    ALTER TABLE "StyleProcessStandard" DROP COLUMN "stSeconds";
  END IF;
END $$;

-- 9. StyleProcess physical column rename for per-piece process repetition.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'processQuantity'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'timesPerPiece'
  ) THEN
    ALTER TABLE "StyleProcess" RENAME COLUMN "processQuantity" TO "timesPerPiece";
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'processQuantity'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'timesPerPiece'
  ) THEN
    UPDATE "StyleProcess"
    SET "timesPerPiece" = COALESCE("timesPerPiece", "processQuantity");
    ALTER TABLE "StyleProcess" DROP COLUMN "processQuantity";
  END IF;
END $$;

-- 10. Process row time model normalization (20260604)
-- `timesPerPiece` remains metadata, but PT/ST/CT values now represent the
-- whole process row time for one garment, so persisted per-repeat values must
-- be expanded exactly once.
CREATE TABLE IF NOT EXISTS "_BaroMigrationState" (
  "key" TEXT PRIMARY KEY,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcess'
      AND column_name = 'timesPerPiece'
  ) AND NOT EXISTS (
    SELECT 1
    FROM "_BaroMigrationState"
    WHERE "key" = '20260604_process_row_total_time_v1'
  ) THEN
    UPDATE "StyleProcess"
    SET "ptSeconds" = ROUND(("ptSeconds"::numeric * GREATEST(1, "timesPerPiece"))::numeric, 4)::double precision
    WHERE COALESCE("timesPerPiece", 1) > 1
      AND "ptSeconds" IS NOT NULL;

    UPDATE "StyleProcessStandard" sps
    SET "bucketStSeconds" = ROUND((sps."bucketStSeconds"::numeric * GREATEST(1, sp."timesPerPiece"))::numeric, 4)::double precision
    FROM "StyleProcess" sp
    WHERE sps."styleProcessId" = sp.id
      AND COALESCE(sp."timesPerPiece", 1) > 1;

    UPDATE "Style"
    SET "processes" = (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN process_repeat_count > 1 THEN
              proc
              || CASE
                WHEN proc ? 'pt' AND jsonb_typeof(proc -> 'pt') = 'number' THEN
                  jsonb_build_object(
                    'pt',
                    to_jsonb(
                      ROUND((((proc ->> 'pt')::numeric) * process_repeat_count)::numeric, 4)
                    )
                  )
                ELSE '{}'::jsonb
              END
              || CASE
                WHEN proc ? 'ct' AND jsonb_typeof(proc -> 'ct') = 'number' THEN
                  jsonb_build_object(
                    'ct',
                    to_jsonb(
                      ROUND((((proc ->> 'ct')::numeric) * process_repeat_count)::numeric, 4)
                    )
                  )
                ELSE '{}'::jsonb
              END
              || CASE
                WHEN proc ? 'stBuckets' THEN
                  jsonb_build_object(
                    'stBuckets',
                    (
                      SELECT COALESCE(
                        jsonb_agg(
                          CASE
                            WHEN bucket ? 'bucketStSeconds'
                                 AND jsonb_typeof(bucket -> 'bucketStSeconds') = 'number' THEN
                              bucket
                              || jsonb_build_object(
                                'bucketStSeconds',
                                to_jsonb(
                                  ROUND((((bucket ->> 'bucketStSeconds')::numeric) * process_repeat_count)::numeric, 4)
                                )
                              )
                            ELSE bucket
                          END
                          ORDER BY bucket_ord
                        ),
                        '[]'::jsonb
                      )
                      FROM jsonb_array_elements(COALESCE(proc -> 'stBuckets', '[]'::jsonb))
                        WITH ORDINALITY AS bucket_items(bucket, bucket_ord)
                    )
                  )
                ELSE '{}'::jsonb
              END
              || CASE
                WHEN proc ? 'stValues' THEN
                  jsonb_build_object(
                    'stValues',
                    (
                      SELECT COALESCE(
                        jsonb_agg(
                          CASE
                            WHEN bucket ? 'seconds'
                                 AND jsonb_typeof(bucket -> 'seconds') = 'number' THEN
                              bucket
                              || jsonb_build_object(
                                'seconds',
                                to_jsonb(
                                  ROUND((((bucket ->> 'seconds')::numeric) * process_repeat_count)::numeric, 4)
                                )
                              )
                            ELSE bucket
                          END
                          ORDER BY bucket_ord
                        ),
                        '[]'::jsonb
                      )
                      FROM jsonb_array_elements(COALESCE(proc -> 'stValues', '[]'::jsonb))
                        WITH ORDINALITY AS bucket_items(bucket, bucket_ord)
                    )
                  )
                ELSE '{}'::jsonb
              END
            ELSE proc
          END
          ORDER BY proc_ord
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          proc,
          proc_ord,
          CASE
            WHEN COALESCE(proc ->> 'timesPerPiece', proc ->> 'quantity', proc ->> 'processQuantity', '') ~ '^\d+$'
              THEN GREATEST(1, (COALESCE(proc ->> 'timesPerPiece', proc ->> 'quantity', proc ->> 'processQuantity'))::integer)
            ELSE 1
          END AS process_repeat_count
        FROM jsonb_array_elements(COALESCE("processes"::jsonb, '[]'::jsonb))
          WITH ORDINALITY AS proc_items(proc, proc_ord)
      ) AS normalized_proc
    )
    WHERE "processes" IS NOT NULL
      AND jsonb_typeof("processes"::jsonb) = 'array'
      AND "processes"::text LIKE '%timesPerPiece%';

    INSERT INTO "_BaroMigrationState" ("key")
    VALUES ('20260604_process_row_total_time_v1');
  END IF;
END $$;

-- 2026-07-25: establish the canonical ST -> quantity bucket entry identity.
ALTER TABLE "StyleProcessStandard"
  ADD COLUMN IF NOT EXISTS "quantityBucketEntryId" INTEGER,
  ADD COLUMN IF NOT EXISTS "quantityBucketSetVersionId" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'StyleProcessStandard'
      AND column_name = 'bucketQuantity'
  ) THEN
    EXECUTE $backfill$
      UPDATE "StyleProcessStandard" standard
      SET
        "quantityBucketEntryId" = entry.id,
        "quantityBucketSetVersionId" = entry."quantityBucketSetVersionId"
      FROM "StyleProcess" process
      JOIN "Style" style ON style.id = process."styleId"
      JOIN "QuantityBucketEntry" entry
        ON entry."quantityBucketSetVersionId" = style."timeBucketSetVersionId"
      WHERE process.id = standard."styleProcessId"
        AND entry."bucketQuantity" = standard."bucketQuantity"
        AND (
          standard."quantityBucketEntryId" IS NULL
          OR standard."quantityBucketSetVersionId" IS NULL
        )
    $backfill$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "StyleProcessStandard"
    WHERE "quantityBucketEntryId" IS NULL
       OR "quantityBucketSetVersionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'StyleProcessStandard quantity bucket FK backfill is incomplete';
  END IF;
END $$;

ALTER TABLE "StyleProcessStandard"
  ALTER COLUMN "quantityBucketEntryId" SET NOT NULL,
  ALTER COLUMN "quantityBucketSetVersionId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcessStandard_process_entry_key"
  ON "StyleProcessStandard"("styleProcessId", "quantityBucketEntryId");
CREATE INDEX IF NOT EXISTS "StyleProcessStandard_quantityBucketEntryId_idx"
  ON "StyleProcessStandard"("quantityBucketEntryId");
CREATE INDEX IF NOT EXISTS "StyleProcessStandard_quantityBucketSetVersionId_idx"
  ON "StyleProcessStandard"("quantityBucketSetVersionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StyleProcessStandard_entry_version_fkey'
  ) THEN
    ALTER TABLE "StyleProcessStandard"
      ADD CONSTRAINT "StyleProcessStandard_entry_version_fkey"
      FOREIGN KEY ("quantityBucketEntryId", "quantityBucketSetVersionId")
      REFERENCES "QuantityBucketEntry"("id", "quantityBucketSetVersionId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "StyleProcessStandard_styleProcessId_bucketQuantity_key";
ALTER TABLE "StyleProcessStandard" DROP COLUMN IF EXISTS "bucketQuantity";

-- 2026-07-26: a standard must belong to the same organization as its process.
-- Code-side org filters are not sufficient protection against cross-org writes.
CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcess_id_org_key"
  ON "StyleProcess"("id", "orgId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "StyleProcessStandard" standard
    JOIN "StyleProcess" process ON process.id = standard."styleProcessId"
    WHERE process."orgId" <> standard."orgId"
  ) THEN
    RAISE EXCEPTION 'StyleProcessStandard process organization mismatch exists';
  END IF;
END $$;

ALTER TABLE "StyleProcessStandard"
  DROP CONSTRAINT IF EXISTS "StyleProcessStandard_styleProcessId_fkey";
ALTER TABLE "StyleProcessStandard"
  DROP CONSTRAINT IF EXISTS "StyleProcessStandard_process_org_fkey";
ALTER TABLE "StyleProcessStandard"
  ADD CONSTRAINT "StyleProcessStandard_process_org_fkey"
  FOREIGN KEY ("styleProcessId", "orgId")
  REFERENCES "StyleProcess"("id", "orgId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2026-07-26: payroll/time buckets are scoped by manufacturer-brand
-- relationship, with optional style overrides. Historical Style bucket links
-- remain in place only as migration sources; operational reads use the new
-- relationship rows after this backfill.
BEGIN;

ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "timeBucketSetVersionId" INTEGER;
ALTER TABLE "AssignmentPlan"
  ADD COLUMN IF NOT EXISTS "orgRelationshipId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "OrgRelationship_id_manufacturer_brand_key"
  ON "OrgRelationship"("id", "manufacturerOrgId", "brandOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "QuantityBucketSetVersion_id_org_key"
  ON "QuantityBucketSetVersion"("id", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "Style_id_org_key"
  ON "Style"("id", "orgId");

CREATE TABLE IF NOT EXISTS "OrgRelationshipStyleTimeBucket" (
  "id" SERIAL PRIMARY KEY,
  "orgRelationshipId" INTEGER NOT NULL,
  "manufacturerOrgId" INTEGER NOT NULL,
  "brandOrgId" INTEGER NOT NULL,
  "styleId" INTEGER NOT NULL,
  "quantityBucketSetVersionId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL',
  "createdByEmployeeId" INTEGER,
  "updatedByEmployeeId" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "OrgRelationshipStyleTimeBucket"
  ADD COLUMN IF NOT EXISTS "createdByEmployeeId" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedByEmployeeId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRelationshipStyleTimeBucket_relationship_style_key"
  ON "OrgRelationshipStyleTimeBucket"("orgRelationshipId", "styleId");
CREATE INDEX IF NOT EXISTS "OrgRelationshipStyleTimeBucket_styleId_idx"
  ON "OrgRelationshipStyleTimeBucket"("styleId");
CREATE INDEX IF NOT EXISTS "OrgRelationshipStyleTimeBucket_versionId_idx"
  ON "OrgRelationshipStyleTimeBucket"("quantityBucketSetVersionId");
CREATE INDEX IF NOT EXISTS "OrgRelationshipStyleTimeBucket_org_scope_idx"
  ON "OrgRelationshipStyleTimeBucket"("manufacturerOrgId", "brandOrgId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationship_time_bucket_version_org_fkey') THEN
    ALTER TABLE "OrgRelationship"
      ADD CONSTRAINT "OrgRelationship_time_bucket_version_org_fkey"
      FOREIGN KEY ("timeBucketSetVersionId", "manufacturerOrgId")
      REFERENCES "QuantityBucketSetVersion"("id", "orgId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationshipStyleTimeBucket_relationship_scope_fkey') THEN
    ALTER TABLE "OrgRelationshipStyleTimeBucket"
      ADD CONSTRAINT "OrgRelationshipStyleTimeBucket_relationship_scope_fkey"
      FOREIGN KEY ("orgRelationshipId", "manufacturerOrgId", "brandOrgId")
      REFERENCES "OrgRelationship"("id", "manufacturerOrgId", "brandOrgId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationshipStyleTimeBucket_style_brand_fkey') THEN
    ALTER TABLE "OrgRelationshipStyleTimeBucket"
      ADD CONSTRAINT "OrgRelationshipStyleTimeBucket_style_brand_fkey"
      FOREIGN KEY ("styleId", "brandOrgId")
      REFERENCES "Style"("id", "orgId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationshipStyleTimeBucket_version_manufacturer_fkey') THEN
    ALTER TABLE "OrgRelationshipStyleTimeBucket"
      ADD CONSTRAINT "OrgRelationshipStyleTimeBucket_version_manufacturer_fkey"
      FOREIGN KEY ("quantityBucketSetVersionId", "manufacturerOrgId")
      REFERENCES "QuantityBucketSetVersion"("id", "orgId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationshipStyleTimeBucket_createdByEmployeeId_fkey') THEN
    ALTER TABLE "OrgRelationshipStyleTimeBucket"
      ADD CONSTRAINT "OrgRelationshipStyleTimeBucket_createdByEmployeeId_fkey"
      FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrgRelationshipStyleTimeBucket_updatedByEmployeeId_fkey') THEN
    ALTER TABLE "OrgRelationshipStyleTimeBucket"
      ADD CONSTRAINT "OrgRelationshipStyleTimeBucket_updatedByEmployeeId_fkey"
      FOREIGN KEY ("updatedByEmployeeId") REFERENCES "Employee"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  ALTER TABLE "AssignmentPlan" DROP CONSTRAINT IF EXISTS "AssignmentPlan_orgRelationshipId_fkey";
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssignmentPlan_relationship_scope_fkey') THEN
    ALTER TABLE "AssignmentPlan"
      ADD CONSTRAINT "AssignmentPlan_relationship_scope_fkey"
      FOREIGN KEY ("orgRelationshipId", "orgId", "buyerOrgId")
      REFERENCES "OrgRelationship"("id", "manufacturerOrgId", "brandOrgId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  rel RECORD;
  style_row RECORD;
  set_id INTEGER;
  version_id INTEGER;
  next_version INTEGER;
  source_version_id INTEGER;
BEGIN
  FOR rel IN SELECT * FROM "OrgRelationship" ORDER BY id LOOP
    IF rel."timeBucketSetVersionId" IS NULL THEN
      INSERT INTO "QuantityBucketSet" ("orgId", name, "createdBy", "updatedAt")
      VALUES (rel."manufacturerOrgId", 'RELATIONSHIP_TIME_BUCKETS_' || rel.id, 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL', CURRENT_TIMESTAMP)
      ON CONFLICT ("orgId", name) DO UPDATE SET "updatedAt" = "QuantityBucketSet"."updatedAt"
      RETURNING id INTO set_id;

      SELECT COALESCE(MAX("versionNumber"), 0) + 1 INTO next_version
      FROM "QuantityBucketSetVersion" WHERE "quantityBucketSetId" = set_id;
      INSERT INTO "QuantityBucketSetVersion" ("orgId", "quantityBucketSetId", "versionNumber", "createdBy")
      VALUES (rel."manufacturerOrgId", set_id, next_version, 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL')
      RETURNING id INTO version_id;

      SELECT MIN(s."timeBucketSetVersionId"), COUNT(DISTINCT s."timeBucketSetVersionId")
      INTO source_version_id, next_version
      FROM "Style" s
      WHERE s."orgId" = rel."brandOrgId"
        AND s."timeBucketSetVersionId" IS NOT NULL
        AND s."timeBucketSource" = 'CUSTOMER_DEFAULT';
      IF next_version > 1 THEN
        RAISE EXCEPTION
          'relationship % has multiple legacy CUSTOMER_DEFAULT time bucket versions',
          rel.id;
      END IF;
      IF source_version_id IS NULL THEN
        RAISE EXCEPTION 'relationship % has no source quantity bucket version', rel.id;
      END IF;

      INSERT INTO "QuantityBucketEntry" ("orgId", "quantityBucketSetVersionId", "bucketQuantity")
      SELECT rel."manufacturerOrgId", version_id, e."bucketQuantity"
      FROM "QuantityBucketEntry" e
      WHERE e."quantityBucketSetVersionId" = source_version_id
      ORDER BY e."bucketQuantity";
      UPDATE "QuantityBucketSet" SET "currentVersionId" = version_id WHERE id = set_id;
      UPDATE "OrgRelationship" SET "timeBucketSetVersionId" = version_id WHERE id = rel.id;
    ELSE
      version_id := rel."timeBucketSetVersionId";
    END IF;

    FOR style_row IN
      SELECT DISTINCT s.id, s."timeBucketSetVersionId", s."timeBucketSource"
      FROM "Style" s
      JOIN "StyleProcess" sp ON sp."styleId" = s.id AND sp."orgId" = rel."manufacturerOrgId"
      WHERE s."orgId" = rel."brandOrgId" AND s."timeBucketSetVersionId" IS NOT NULL
      ORDER BY s.id
    LOOP
      IF style_row."timeBucketSource" = 'STYLE_OVERRIDE' THEN
        SELECT "quantityBucketSetVersionId" INTO source_version_id
        FROM "OrgRelationshipStyleTimeBucket"
        WHERE "orgRelationshipId" = rel.id AND "styleId" = style_row.id;
        IF source_version_id IS NULL THEN
          INSERT INTO "QuantityBucketSet" ("orgId", name, "createdBy", "updatedAt")
          VALUES (rel."manufacturerOrgId", 'RELATIONSHIP_TIME_BUCKETS_' || rel.id || '_STYLE_' || style_row.id, 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL', CURRENT_TIMESTAMP)
          ON CONFLICT ("orgId", name) DO UPDATE SET "updatedAt" = "QuantityBucketSet"."updatedAt"
          RETURNING id INTO set_id;
          SELECT COALESCE(MAX("versionNumber"), 0) + 1 INTO next_version
          FROM "QuantityBucketSetVersion" WHERE "quantityBucketSetId" = set_id;
          INSERT INTO "QuantityBucketSetVersion" ("orgId", "quantityBucketSetId", "versionNumber", "createdBy")
          VALUES (rel."manufacturerOrgId", set_id, next_version, 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL')
          RETURNING id INTO source_version_id;
          INSERT INTO "QuantityBucketEntry" ("orgId", "quantityBucketSetVersionId", "bucketQuantity")
          SELECT rel."manufacturerOrgId", source_version_id, e."bucketQuantity"
          FROM "QuantityBucketEntry" e
          WHERE e."quantityBucketSetVersionId" = style_row."timeBucketSetVersionId"
          ORDER BY e."bucketQuantity";
          UPDATE "QuantityBucketSet" SET "currentVersionId" = source_version_id WHERE id = set_id;
          INSERT INTO "OrgRelationshipStyleTimeBucket" (
            "orgRelationshipId", "manufacturerOrgId", "brandOrgId", "styleId", "quantityBucketSetVersionId"
          ) VALUES (rel.id, rel."manufacturerOrgId", rel."brandOrgId", style_row.id, source_version_id);
        END IF;
      ELSE
        source_version_id := version_id;
      END IF;

      INSERT INTO "StyleProcessStandard" (
        "orgId", "styleProcessId", "quantityBucketEntryId", "quantityBucketSetVersionId",
        "bucketStSeconds", "setBy", "setAt", "updatedAt"
      )
      SELECT
        sp."orgId", sp.id, new_entry.id, source_version_id,
        old_standard."bucketStSeconds", old_standard."setBy", old_standard."setAt", CURRENT_TIMESTAMP
      FROM "StyleProcess" sp
      JOIN "StyleProcessStandard" old_standard ON old_standard."styleProcessId" = sp.id
      JOIN "QuantityBucketEntry" old_entry
        ON old_entry.id = old_standard."quantityBucketEntryId"
       AND old_entry."quantityBucketSetVersionId" = style_row."timeBucketSetVersionId"
      JOIN "QuantityBucketEntry" new_entry
        ON new_entry."quantityBucketSetVersionId" = source_version_id
       AND new_entry."bucketQuantity" = old_entry."bucketQuantity"
      WHERE sp."styleId" = style_row.id AND sp."orgId" = rel."manufacturerOrgId"
      ON CONFLICT ("styleProcessId", "quantityBucketEntryId") DO NOTHING;
    END LOOP;
  END LOOP;

  UPDATE "AssignmentPlan" plan
  SET "orgRelationshipId" = relationship_row.id
  FROM "OrgRelationship" relationship_row
  WHERE plan."orgRelationshipId" IS NULL
    AND plan."orgId" = relationship_row."manufacturerOrgId"
    AND plan."buyerOrgId" = relationship_row."brandOrgId";
END $$;

DO $$
DECLARE
  missing_standard_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_standard_count
  FROM "OrgRelationship" r
  JOIN "Style" s ON s."orgId" = r."brandOrgId"
  JOIN "StyleProcess" sp
    ON sp."styleId" = s.id AND sp."orgId" = r."manufacturerOrgId"
  LEFT JOIN "OrgRelationshipStyleTimeBucket" override
    ON override."orgRelationshipId" = r.id AND override."styleId" = s.id
  JOIN "QuantityBucketEntry" e
    ON e."quantityBucketSetVersionId" = COALESCE(
      override."quantityBucketSetVersionId",
      r."timeBucketSetVersionId"
    )
  LEFT JOIN "StyleProcessStandard" x
    ON x."styleProcessId" = sp.id
   AND x."orgId" = r."manufacturerOrgId"
   AND x."quantityBucketEntryId" = e.id
   AND x."quantityBucketSetVersionId" = e."quantityBucketSetVersionId"
  WHERE x.id IS NULL;

  IF missing_standard_count > 0 THEN
    RAISE EXCEPTION
      'relationship time bucket backfill left % active StyleProcessStandard rows missing',
      missing_standard_count;
  END IF;
END $$;

COMMIT;
