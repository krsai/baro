CREATE TABLE IF NOT EXISTS "Line" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "managerEmployeeId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LineAssignment" (
    "id" SERIAL NOT NULL,
    "lineId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),

    CONSTRAINT "LineAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Line_factoryId_name_key"
ON "Line"("factoryId", "name");

CREATE INDEX IF NOT EXISTS "Line_orgId_idx"
ON "Line"("orgId");

CREATE INDEX IF NOT EXISTS "Line_factoryId_idx"
ON "Line"("factoryId");

CREATE INDEX IF NOT EXISTS "LineAssignment_lineId_idx"
ON "LineAssignment"("lineId");

CREATE INDEX IF NOT EXISTS "LineAssignment_employeeId_idx"
ON "LineAssignment"("employeeId");

CREATE INDEX IF NOT EXISTS "LineAssignment_endAt_idx"
ON "LineAssignment"("endAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Line_orgId_fkey'
  ) THEN
    ALTER TABLE "Line"
      ADD CONSTRAINT "Line_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Line_factoryId_fkey'
  ) THEN
    ALTER TABLE "Line"
      ADD CONSTRAINT "Line_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Line_managerEmployeeId_fkey'
  ) THEN
    ALTER TABLE "Line"
      ADD CONSTRAINT "Line_managerEmployeeId_fkey"
      FOREIGN KEY ("managerEmployeeId") REFERENCES "Employee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LineAssignment_lineId_fkey'
  ) THEN
    ALTER TABLE "LineAssignment"
      ADD CONSTRAINT "LineAssignment_lineId_fkey"
      FOREIGN KEY ("lineId") REFERENCES "Line"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LineAssignment_employeeId_fkey'
  ) THEN
    ALTER TABLE "LineAssignment"
      ADD CONSTRAINT "LineAssignment_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
