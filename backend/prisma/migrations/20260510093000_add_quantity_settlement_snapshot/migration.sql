CREATE TABLE IF NOT EXISTS "QuantitySettlementSnapshot" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT NOT NULL DEFAULT 'system@baro.local',

  CONSTRAINT "QuantitySettlementSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuantitySettlementSnapshot_orgId_month_key"
  ON "QuantitySettlementSnapshot"("orgId", "month");

CREATE INDEX IF NOT EXISTS "QuantitySettlementSnapshot_orgId_idx"
  ON "QuantitySettlementSnapshot"("orgId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'QuantitySettlementSnapshot_orgId_fkey'
      AND table_name = 'QuantitySettlementSnapshot'
  ) THEN
    ALTER TABLE "QuantitySettlementSnapshot"
      ADD CONSTRAINT "QuantitySettlementSnapshot_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
