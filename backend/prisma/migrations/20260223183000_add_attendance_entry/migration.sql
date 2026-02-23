-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "factoryId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "workDate" TEXT NOT NULL,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "workedSeconds" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEntry_orgId_factoryId_workerId_workDate_key" ON "AttendanceEntry"("orgId", "factoryId", "workerId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEntry_orgId_workDate_idx" ON "AttendanceEntry"("orgId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEntry_orgId_factoryId_workDate_idx" ON "AttendanceEntry"("orgId", "factoryId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceEntry_orgId_workerId_workDate_idx" ON "AttendanceEntry"("orgId", "workerId", "workDate");

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
