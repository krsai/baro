CREATE TABLE "EmployeeCompensationPolicy" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "orgRole" "OrgUserRole" NOT NULL,
  "gradeId" INTEGER NOT NULL,
  "baseSalary" INTEGER NOT NULL DEFAULT 0,
  "fixedAllowance" INTEGER NOT NULL DEFAULT 0,
  "variableAllowance" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeCompensationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeCompensationPolicy_nonnegative_check" CHECK ("baseSalary" >= 0 AND "fixedAllowance" >= 0 AND "variableAllowance" >= 0)
);
CREATE UNIQUE INDEX "EmployeeCompensationPolicy_orgId_orgRole_gradeId_key" ON "EmployeeCompensationPolicy"("orgId", "orgRole", "gradeId");
CREATE INDEX "EmployeeCompensationPolicy_orgId_gradeId_idx" ON "EmployeeCompensationPolicy"("orgId", "gradeId");
ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "EmployeeGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
