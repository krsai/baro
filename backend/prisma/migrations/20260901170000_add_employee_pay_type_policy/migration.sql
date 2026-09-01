CREATE TABLE "EmployeePayTypePolicy" (
  "id" SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL,
  "payType" TEXT NOT NULL,
  "workWeekdays" JSONB NOT NULL,
  "standardClockIn" TEXT NOT NULL DEFAULT '08:00',
  "standardClockOut" TEXT NOT NULL DEFAULT '17:00',
  "breakMinutes" INTEGER NOT NULL DEFAULT 60,
  "workdayMinimumMinutes" INTEGER NOT NULL DEFAULT 240,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePayTypePolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeePayTypePolicy_payType_check" CHECK ("payType" IN ('GENERAL','OUTPUT')),
  CONSTRAINT "EmployeePayTypePolicy_breakMinutes_check" CHECK ("breakMinutes" BETWEEN 0 AND 720),
  CONSTRAINT "EmployeePayTypePolicy_workdayMinimumMinutes_check" CHECK ("workdayMinimumMinutes" BETWEEN 1 AND 1440)
);
CREATE UNIQUE INDEX "EmployeePayTypePolicy_orgId_payType_key" ON "EmployeePayTypePolicy"("orgId", "payType");
CREATE INDEX "EmployeePayTypePolicy_orgId_idx" ON "EmployeePayTypePolicy"("orgId");
