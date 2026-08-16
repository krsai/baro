-- Prevent cross-organization employee role, grade, and compensation-policy links.
CREATE UNIQUE INDEX "EmployeeGrade_orgId_id_key" ON "EmployeeGrade"("orgId", "id");
CREATE UNIQUE INDEX "AttrRole_orgId_id_key" ON "AttrRole"("orgId", "id");

ALTER TABLE "Employee" DROP CONSTRAINT "Employee_roleId_fkey";
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_gradeId_fkey";
ALTER TABLE "EmployeeCompensationPolicy" DROP CONSTRAINT "EmployeeCompensationPolicy_gradeId_fkey";

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_roleId_fkey"
  FOREIGN KEY ("orgId", "roleId") REFERENCES "AttrRole"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_gradeId_fkey"
  FOREIGN KEY ("orgId", "gradeId") REFERENCES "EmployeeGrade"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensationPolicy" ADD CONSTRAINT "EmployeeCompensationPolicy_gradeId_fkey"
  FOREIGN KEY ("orgId", "gradeId") REFERENCES "EmployeeGrade"("orgId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
