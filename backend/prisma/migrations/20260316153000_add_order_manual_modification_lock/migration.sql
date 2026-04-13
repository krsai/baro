ALTER TABLE "WorkOrder"
ADD COLUMN "modificationLockedAt" TIMESTAMP(3),
ADD COLUMN "modificationLockedBy" TEXT;
