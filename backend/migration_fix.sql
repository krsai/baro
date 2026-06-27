-- Step 0d: style localized customer name fields (20260611)
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "customerNameKo" TEXT;
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "customerNameVi" TEXT;
UPDATE "Style" s
  SET "customerNameKo" = o."nameKo", "customerNameVi" = o."nameVi"
  FROM "Organization" o
  WHERE s."orgId" = o.id AND (o."nameKo" IS NOT NULL OR o."nameVi" IS NOT NULL)
    AND s."customerNameKo" IS NULL AND s."customerNameVi" IS NULL;

-- Step 0e: customer pricing prototype storage (20260613)
ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "pricingDefaultTradeType" TEXT;
ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "pricingMatrix" JSONB;

-- Step 0f: org membership onboarding request name (20260618)
ALTER TABLE "OrgMembership" ADD COLUMN IF NOT EXISTS "requestedName" TEXT;

-- Step 0g: org membership email nullable + remove generated worker emails (20260618)
ALTER TABLE "OrgMembership" ALTER COLUMN "email" DROP NOT NULL;
UPDATE "OrgMembership"
SET "email" = NULL
WHERE "email" LIKE 'emp+%@baro.local';

-- Step 0h: org membership terminated status for employee offboarding (20260619)
ALTER TYPE "OrgMembershipStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';

-- Step 0c: work order localized buyer name fields (20260611)
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "buyerOrgNameKo" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS "buyerOrgNameVi" TEXT;

-- Step 0b: organization localized name fields (20260611)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "nameKo" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "nameVi" TEXT;

-- Step 0a: style revenue fields (20260611)
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "unitPriceUsd" DOUBLE PRECISION;
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "revenueMemo" TEXT;

-- Step 0: factory code and employee number (20260610)
ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "factoryCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Factory_orgId_factoryCode_key"
  ON "Factory"("orgId", "factoryCode") WHERE "factoryCode" IS NOT NULL;

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

-- 11. Backfill WorkRecord.styleUid from linked AssignmentPlan card identity (20260626)
-- Source of truth: WorkRecord.assignmentPlanId -> AssignmentPlan.cardId/originOrderId
-- -> WorkOrderItem.styleUid. Ambiguous rows are intentionally left unchanged.
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkRecord'
      AND column_name = 'styleUid'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkRecord'
      AND column_name = 'assignmentPlanId'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssignmentPlan'
      AND column_name = 'cardId'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkOrderItem'
      AND column_name = 'styleUid'
  ) AND NOT EXISTS (
    SELECT 1 FROM "_BaroMigrationState"
    WHERE "key" = '20260626_work_record_style_uid_from_assignment_plan_v1'
  ) THEN
    WITH plan_identity AS (
      SELECT
        ap.id AS "planId",
        ap."orgId" AS "orgId",
        split_part(raw_identity.identity, '::', 1) AS "orderId",
        split_part(raw_identity.identity, '::', 2) AS "styleId"
      FROM "AssignmentPlan" ap
      CROSS JOIN LATERAL (
        VALUES (ap."cardId"), (ap."originOrderId")
      ) AS raw_identity(identity)
      WHERE raw_identity.identity IS NOT NULL
        AND position('::' IN raw_identity.identity) > 0
        AND split_part(raw_identity.identity, '::', 1) <> ''
        AND split_part(raw_identity.identity, '::', 2) <> ''
    ),
    candidate AS (
      SELECT
        pi."planId",
        woi."styleUid",
        COALESCE(s."styleId", woi."styleId") AS "styleId",
        COALESCE(s."name", woi."styleName") AS "styleName"
      FROM plan_identity pi
      JOIN "WorkOrder" wo
        ON wo."orderId" = pi."orderId"
       AND (
            wo."orgId" = pi."orgId"
         OR wo."buyerOrgId" = pi."orgId"
         OR wo."sellerOrgId" = pi."orgId"
       )
      JOIN "WorkOrderItem" woi
        ON woi."workOrderId" = wo.id
       AND woi."styleId" = pi."styleId"
      LEFT JOIN "Style" s
        ON s.uid = woi."styleUid"
      WHERE woi."styleUid" IS NOT NULL
    ),
    canonical AS (
      SELECT
        "planId",
        MIN("styleUid") AS "styleUid",
        MAX("styleId") AS "styleId",
        MAX("styleName") AS "styleName"
      FROM candidate
      GROUP BY "planId"
      HAVING COUNT(DISTINCT "styleUid") = 1
    )
    UPDATE "WorkRecord" wr
    SET
      "styleUid" = canonical."styleUid",
      "styleId" = COALESCE(canonical."styleId", wr."styleId"),
      "styleName" = COALESCE(canonical."styleName", wr."styleName")
    FROM canonical, "WorkLog" wl
    WHERE wr."assignmentPlanId" = canonical."planId"
      AND wr."workLogId" = wl.id
      AND COALESCE(wl."coverageEndDate", wl."workDate") >= '2026-04-01'
      AND (
        wr."styleUid" IS DISTINCT FROM canonical."styleUid"
        OR wr."styleId" IS DISTINCT FROM COALESCE(canonical."styleId", wr."styleId")
        OR wr."styleName" IS DISTINCT FROM COALESCE(canonical."styleName", wr."styleName")
      );

    INSERT INTO "_BaroMigrationState" ("key")
    VALUES ('20260626_work_record_style_uid_from_assignment_plan_v1');
  END IF;
END $$;

-- Step 4b-safety: ensure final column names exist even when neither old nor new name existed
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentQuantity" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentStTotalSeconds" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN IF NOT EXISTS "assignmentCtTotalSeconds" INTEGER;
ALTER TABLE "AtTrainingBucket" ADD COLUMN IF NOT EXISTS "laborInputSeconds" DOUBLE PRECISION;
ALTER TABLE "WorkLog" ADD COLUMN IF NOT EXISTS "totalCtSeconds" DOUBLE PRECISION;

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
-- Step 5: WorkRecord canonical snapshot fields
ALTER TABLE "WorkRecord"
  ADD COLUMN IF NOT EXISTS "orderNo" TEXT,
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

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_orderNo_idx"
  ON "WorkRecord"("orgId", "orderNo");

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
  ON "WorkRecord"("orgId", "lineId");

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

-- 6-0b. Phase 6E preflight: completion-source cleanup and snapshot ST backfill.
--     Snapshot ST fields must not be removed until this backfill has been applied
--     and the notice counts below have been reviewed.
UPDATE "AssignmentPlan"
SET "isCompleted" = TRUE
WHERE "isCompleted" = FALSE
  AND "completedAt" IS NOT NULL;

WITH snapshot_st_targets AS (
  SELECT
    plan."orgId",
    style."uid" AS "styleUid",
    CASE
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10000 THEN 10000
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5000 THEN 5000
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3000 THEN 3000
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 1000 THEN 1000
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 500 THEN 500
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 300 THEN 300
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 100 THEN 100
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 50 THEN 50
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 30 THEN 30
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10 THEN 10
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5 THEN 5
      WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3 THEN 3
      ELSE 1
    END AS "bucketQuantity",
    ROUND((process ->> 'stSeconds')::numeric)::double precision AS "bucketStSeconds",
    LOWER(BTRIM(COALESCE(process ->> 'processCode', process ->> 'code', ''))) AS "processCodeKey",
    LOWER(BTRIM(COALESCE(process ->> 'processKey', ''))) AS "processKey",
    LOWER(BTRIM(REGEXP_REPLACE(COALESCE(process ->> 'processKey', ''), '-[0-9]+-[0-9]+$', ''))) AS "processKeyBase",
    LOWER(BTRIM(COALESCE(process ->> 'name', process ->> 'processName', process ->> 'label', ''))) AS "processNameKey"
  FROM "AssignmentPlan" plan
  JOIN "Style" style
    ON style."orgId" = plan."orgId"
   AND style."styleId" = NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '')
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
        THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
      ELSE '[]'::jsonb
    END
  ) process
  WHERE plan."isCompleted" = FALSE
    AND plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
    AND process ? 'stSeconds'
    AND (process ->> 'stSeconds') ~ '^[0-9]+(\.[0-9]+)?$'
    AND (process ->> 'stSeconds')::numeric > 0
),
matched_snapshot_st AS (
  SELECT
    target."orgId",
    style_process."id" AS "styleProcessId",
    target."bucketQuantity",
    MAX(target."bucketStSeconds") AS "bucketStSeconds"
  FROM snapshot_st_targets target
  JOIN "StyleProcess" style_process
    ON style_process."orgId" = target."orgId"
   AND style_process."styleUid" = target."styleUid"
   AND (
      LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
      OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
   )
  GROUP BY target."orgId", style_process."id", target."bucketQuantity"
)
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
  "orgId",
  "styleProcessId",
  "bucketQuantity",
  "bucketStSeconds",
  'ASSIGNMENT_SNAPSHOT_BACKFILL',
  NOW(),
  NOW()
FROM matched_snapshot_st
ON CONFLICT ("styleProcessId", "bucketQuantity")
DO UPDATE SET
  "bucketStSeconds" = CASE
    WHEN "StyleProcessStandard"."bucketStSeconds" <= 0 THEN EXCLUDED."bucketStSeconds"
    ELSE "StyleProcessStandard"."bucketStSeconds"
  END,
  "setBy" = CASE
    WHEN "StyleProcessStandard"."bucketStSeconds" <= 0 THEN EXCLUDED."setBy"
    ELSE "StyleProcessStandard"."setBy"
  END,
  "setAt" = CASE
    WHEN "StyleProcessStandard"."bucketStSeconds" <= 0 THEN EXCLUDED."setAt"
    ELSE "StyleProcessStandard"."setAt"
  END,
  "updatedAt" = CASE
    WHEN "StyleProcessStandard"."bucketStSeconds" <= 0 THEN NOW()
    ELSE "StyleProcessStandard"."updatedAt"
  END;

DO $$
DECLARE
  unmatched_process_count integer := 0;
  missing_standard_count integer := 0;
BEGIN
  WITH snapshot_st_targets AS (
    SELECT
      plan."orgId",
      style."uid" AS "styleUid",
      CASE
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10000 THEN 10000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5000 THEN 5000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3000 THEN 3000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 1000 THEN 1000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 500 THEN 500
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 300 THEN 300
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 100 THEN 100
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 50 THEN 50
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 30 THEN 30
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10 THEN 10
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5 THEN 5
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3 THEN 3
        ELSE 1
      END AS "bucketQuantity",
      LOWER(BTRIM(COALESCE(process ->> 'processCode', process ->> 'code', ''))) AS "processCodeKey",
      LOWER(BTRIM(COALESCE(process ->> 'processKey', ''))) AS "processKey",
      LOWER(BTRIM(REGEXP_REPLACE(COALESCE(process ->> 'processKey', ''), '-[0-9]+-[0-9]+$', ''))) AS "processKeyBase",
      LOWER(BTRIM(COALESCE(process ->> 'name', process ->> 'processName', process ->> 'label', ''))) AS "processNameKey"
    FROM "AssignmentPlan" plan
    JOIN "Style" style
      ON style."orgId" = plan."orgId"
     AND style."styleId" = NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '')
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
          THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
        ELSE '[]'::jsonb
      END
    ) process
    WHERE plan."isCompleted" = FALSE
      AND plan."assignmentCtSnapshot" IS NOT NULL
      AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
      AND process ? 'stSeconds'
      AND (process ->> 'stSeconds') ~ '^[0-9]+(\.[0-9]+)?$'
      AND (process ->> 'stSeconds')::numeric > 0
  ),
  matched_snapshot_st AS (
    SELECT DISTINCT
      target."orgId",
      target."styleUid",
      target."bucketQuantity",
      style_process."id" AS "styleProcessId"
    FROM snapshot_st_targets target
    JOIN "StyleProcess" style_process
      ON style_process."orgId" = target."orgId"
     AND style_process."styleUid" = target."styleUid"
     AND (
        LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
        OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
     )
  )
  SELECT COUNT(*)
  INTO unmatched_process_count
  FROM snapshot_st_targets target
  WHERE NOT EXISTS (
    SELECT 1
    FROM "StyleProcess" style_process
    WHERE style_process."orgId" = target."orgId"
      AND style_process."styleUid" = target."styleUid"
      AND (
        LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
        OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
      )
  );

  WITH snapshot_st_targets AS (
    SELECT
      plan."orgId",
      style."uid" AS "styleUid",
      CASE
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10000 THEN 10000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5000 THEN 5000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3000 THEN 3000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 1000 THEN 1000
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 500 THEN 500
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 300 THEN 300
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 100 THEN 100
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 50 THEN 50
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 30 THEN 30
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 10 THEN 10
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 5 THEN 5
        WHEN COALESCE(NULLIF(to_jsonb(plan) ->> 'assignmentQuantity', '')::numeric, NULLIF(to_jsonb(plan) ->> 'quantity', '')::numeric, 1) >= 3 THEN 3
        ELSE 1
      END AS "bucketQuantity",
      LOWER(BTRIM(COALESCE(process ->> 'processCode', process ->> 'code', ''))) AS "processCodeKey",
      LOWER(BTRIM(COALESCE(process ->> 'processKey', ''))) AS "processKey",
      LOWER(BTRIM(REGEXP_REPLACE(COALESCE(process ->> 'processKey', ''), '-[0-9]+-[0-9]+$', ''))) AS "processKeyBase",
      LOWER(BTRIM(COALESCE(process ->> 'name', process ->> 'processName', process ->> 'label', ''))) AS "processNameKey"
    FROM "AssignmentPlan" plan
    JOIN "Style" style
      ON style."orgId" = plan."orgId"
     AND style."styleId" = NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '')
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
          THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
        ELSE '[]'::jsonb
      END
    ) process
    WHERE plan."isCompleted" = FALSE
      AND plan."assignmentCtSnapshot" IS NOT NULL
      AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
      AND process ? 'stSeconds'
      AND (process ->> 'stSeconds') ~ '^[0-9]+(\.[0-9]+)?$'
      AND (process ->> 'stSeconds')::numeric > 0
  ),
  matched_snapshot_st AS (
    SELECT DISTINCT
      style_process."id" AS "styleProcessId",
      target."bucketQuantity"
    FROM snapshot_st_targets target
    JOIN "StyleProcess" style_process
      ON style_process."orgId" = target."orgId"
     AND style_process."styleUid" = target."styleUid"
     AND (
        LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
        OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
        OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
     )
  )
  SELECT COUNT(*)
  INTO missing_standard_count
  FROM matched_snapshot_st matched
  LEFT JOIN "StyleProcessStandard" standard
    ON standard."styleProcessId" = matched."styleProcessId"
   AND standard."bucketQuantity" = matched."bucketQuantity"
  WHERE standard."id" IS NULL
     OR standard."bucketStSeconds" <= 0;

  RAISE NOTICE
    'Phase 6E preflight snapshot ST backfill check: unmatched_processes=%, missing_or_zero_standards=%',
    unmatched_process_count,
    missing_standard_count;
END $$;

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

