-- AlterTable
ALTER TABLE "AttrRole"
ADD COLUMN "defaultPayType" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "payType" TEXT;

-- CreateIndex
CREATE INDEX "AttrRole_orgId_sortOrder_idx" ON "AttrRole"("orgId", "sortOrder");
