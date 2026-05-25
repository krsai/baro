-- Add canonical assignment context fields to WorkRecord
ALTER TABLE "WorkRecord"
  ADD COLUMN IF NOT EXISTS "orderNo" TEXT,
  ADD COLUMN IF NOT EXISTS "lineId" INTEGER;

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_orderNo_idx"
  ON "WorkRecord"("orgId", "orderNo");

CREATE INDEX IF NOT EXISTS "WorkRecord_orgId_lineId_idx"
  ON "WorkRecord"("orgId", "lineId");
