-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "roleId" INTEGER;

-- CreateIndex
CREATE INDEX "Employee_roleId_idx" ON "Employee"("roleId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AttrRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
