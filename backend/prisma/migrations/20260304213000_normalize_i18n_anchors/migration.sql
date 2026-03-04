CREATE TYPE "WorkOrderStatus" AS ENUM (
  'ORDER_RECEIVED',
  'IN_PROGRESS',
  'PRODUCTION_DONE',
  'SHIPPED'
);

CREATE TYPE "CtStatus" AS ENUM (
  'PENDING',
  'SENT',
  'AGREED',
  'REJECTED'
);

ALTER TABLE "WorkOrder"
  ALTER COLUMN "status" TYPE "WorkOrderStatus"
  USING (
    CASE REPLACE(BTRIM(COALESCE("status", '')), ' ', '')
      WHEN 'ORDER_RECEIVED' THEN 'ORDER_RECEIVED'
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
      WHEN 'PRODUCTION_DONE' THEN 'PRODUCTION_DONE'
      WHEN 'SHIPPED' THEN 'SHIPPED'
      WHEN '주문접수' THEN 'ORDER_RECEIVED'
      WHEN '작업중' THEN 'IN_PROGRESS'
      WHEN '생산완료' THEN 'PRODUCTION_DONE'
      WHEN '출고완료' THEN 'SHIPPED'
      ELSE 'ORDER_RECEIVED'
    END
  )::"WorkOrderStatus";

ALTER TABLE "WorkOrder"
  ALTER COLUMN "status" SET DEFAULT 'ORDER_RECEIVED';

ALTER TABLE "AssignmentPlan"
  ALTER COLUMN "ctStatus" DROP DEFAULT;

ALTER TABLE "AssignmentPlan"
  ALTER COLUMN "ctStatus" TYPE "CtStatus"
  USING (
    CASE UPPER(BTRIM(COALESCE("ctStatus", '')))
      WHEN 'PENDING' THEN 'PENDING'
      WHEN 'SENT' THEN 'SENT'
      WHEN 'AGREED' THEN 'AGREED'
      WHEN 'REJECTED' THEN 'REJECTED'
      ELSE 'PENDING'
    END
  )::"CtStatus";

ALTER TABLE "AssignmentPlan"
  ALTER COLUMN "ctStatus" SET DEFAULT 'PENDING';

ALTER TABLE "WorkOrderItem" ADD COLUMN "styleUid" INTEGER;
ALTER TABLE "AssignmentPlan" ADD COLUMN "colorId" INTEGER;
ALTER TABLE "WorkRecord" ADD COLUMN "styleUid" INTEGER;

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleId" IS NOT NULL
  AND s."orgId" = wo."orgId"
  AND LOWER(BTRIM(s."styleId")) = LOWER(BTRIM(COALESCE(woi."styleId", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleId" IS NOT NULL
  AND wo."buyerOrgId" IS NOT NULL
  AND s."orgId" = wo."buyerOrgId"
  AND LOWER(BTRIM(s."styleId")) = LOWER(BTRIM(COALESCE(woi."styleId", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleId" IS NOT NULL
  AND wo."sellerOrgId" IS NOT NULL
  AND s."orgId" = wo."sellerOrgId"
  AND LOWER(BTRIM(s."styleId")) = LOWER(BTRIM(COALESCE(woi."styleId", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleCode" IS NOT NULL
  AND s."orgId" = wo."orgId"
  AND LOWER(BTRIM(s."styleCode")) = LOWER(BTRIM(COALESCE(woi."styleCode", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleCode" IS NOT NULL
  AND wo."buyerOrgId" IS NOT NULL
  AND s."orgId" = wo."buyerOrgId"
  AND LOWER(BTRIM(s."styleCode")) = LOWER(BTRIM(COALESCE(woi."styleCode", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleCode" IS NOT NULL
  AND wo."sellerOrgId" IS NOT NULL
  AND s."orgId" = wo."sellerOrgId"
  AND LOWER(BTRIM(s."styleCode")) = LOWER(BTRIM(COALESCE(woi."styleCode", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleName" IS NOT NULL
  AND s."orgId" = wo."orgId"
  AND LOWER(BTRIM(s."name")) = LOWER(BTRIM(COALESCE(woi."styleName", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleName" IS NOT NULL
  AND wo."buyerOrgId" IS NOT NULL
  AND s."orgId" = wo."buyerOrgId"
  AND LOWER(BTRIM(s."name")) = LOWER(BTRIM(COALESCE(woi."styleName", '')));

UPDATE "WorkOrderItem" woi
SET "styleUid" = s.uid
FROM "WorkOrder" wo,
     "Style" s
WHERE woi."workOrderId" = wo.id
  AND woi."styleUid" IS NULL
  AND woi."styleName" IS NOT NULL
  AND wo."sellerOrgId" IS NOT NULL
  AND s."orgId" = wo."sellerOrgId"
  AND LOWER(BTRIM(s."name")) = LOWER(BTRIM(COALESCE(woi."styleName", '')));

UPDATE "WorkRecord" wr
SET "styleUid" = s.uid
FROM "Style" s
WHERE wr."styleUid" IS NULL
  AND wr."styleId" IS NOT NULL
  AND s."orgId" = wr."orgId"
  AND LOWER(BTRIM(s."styleId")) = LOWER(BTRIM(wr."styleId"));

UPDATE "WorkRecord" wr
SET "styleUid" = s.uid
FROM "Style" s
WHERE wr."styleUid" IS NULL
  AND wr."styleName" IS NOT NULL
  AND s."orgId" = wr."orgId"
  AND LOWER(BTRIM(s."name")) = LOWER(BTRIM(wr."styleName"));

UPDATE "WorkRecord" wr
SET "processId" = ap.id
FROM "AttrProcess" ap
WHERE wr."processId" IS NULL
  AND ap."orgId" = wr."orgId"
  AND wr."processCode" IS NOT NULL
  AND LOWER(BTRIM(ap."code")) = LOWER(BTRIM(wr."processCode"));

UPDATE "WorkRecord" wr
SET "processId" = ap.id
FROM "AttrProcess" ap
WHERE wr."processId" IS NULL
  AND ap."orgId" = wr."orgId"
  AND wr."processName" IS NOT NULL
  AND LOWER(BTRIM(ap."name")) = LOWER(BTRIM(wr."processName"));

UPDATE "WorkRecord" wr
SET "colorId" = ac.id
FROM "AttrColor" ac
WHERE wr."colorId" IS NULL
  AND ac."orgId" = wr."orgId"
  AND wr."colorCode" IS NOT NULL
  AND LOWER(BTRIM(ac."code")) = LOWER(BTRIM(wr."colorCode"));

UPDATE "WorkRecord" wr
SET "colorId" = ac.id
FROM "AttrColor" ac
WHERE wr."colorId" IS NULL
  AND ac."orgId" = wr."orgId"
  AND wr."colorName" IS NOT NULL
  AND LOWER(BTRIM(ac."name")) = LOWER(BTRIM(wr."colorName"));

UPDATE "AssignmentPlan" ap
SET "colorId" = ac.id
FROM "AttrColor" ac
WHERE ap."colorId" IS NULL
  AND ac."orgId" = ap."orgId"
  AND ap."colorName" IS NOT NULL
  AND LOWER(BTRIM(ac."name")) = LOWER(BTRIM(ap."colorName"));

UPDATE "AssignmentPlan" ap
SET "colorId" = ac.id
FROM "AttrColor" ac
WHERE ap."colorId" IS NULL
  AND ac."orgId" = ap."orgId"
  AND ap."color" IS NOT NULL
  AND LOWER(BTRIM(ac."code")) = LOWER(BTRIM(ap."color"));

ALTER TABLE "WorkOrderItem"
  ADD CONSTRAINT "WorkOrderItem_styleUid_fkey"
  FOREIGN KEY ("styleUid") REFERENCES "Style"("uid")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssignmentPlan"
  ADD CONSTRAINT "AssignmentPlan_colorId_fkey"
  FOREIGN KEY ("colorId") REFERENCES "AttrColor"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkRecord"
  ADD CONSTRAINT "WorkRecord_styleUid_fkey"
  FOREIGN KEY ("styleUid") REFERENCES "Style"("uid")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkOrderItem_styleUid_idx" ON "WorkOrderItem"("styleUid");
CREATE INDEX "AssignmentPlan_colorId_idx" ON "AssignmentPlan"("colorId");
CREATE INDEX "WorkRecord_styleUid_idx" ON "WorkRecord"("styleUid");

ALTER TABLE "WorkOrderItem" DROP COLUMN "colorName";
ALTER TABLE "WorkRecord" DROP COLUMN "processName";
ALTER TABLE "WorkRecord" DROP COLUMN "colorName";
