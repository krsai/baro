ALTER TABLE "WorkRecord"
ADD COLUMN "isOutsourced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "outsourceVendorName" TEXT,
ADD COLUMN "outsourceUnitPrice" DECIMAL(18, 4);

CREATE INDEX "WorkRecord_orgId_isOutsourced_idx"
ON "WorkRecord"("orgId", "isOutsourced");

ALTER TABLE "WorkRecord"
ADD CONSTRAINT "WorkRecord_outsource_actor_check"
CHECK (
  ("isOutsourced" = false AND "outsourceVendorName" IS NULL AND "outsourceUnitPrice" IS NULL)
  OR
  ("isOutsourced" = true AND "workerId" IS NULL AND length(trim("outsourceVendorName")) > 0 AND "outsourceUnitPrice" >= 0)
);
