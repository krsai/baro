CREATE TABLE IF NOT EXISTS "EmployeePayrollManagementVersion" (
  id SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "effectiveMonth" TEXT NOT NULL CHECK ("effectiveMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  "alwaysFullAttendance" BOOLEAN NOT NULL DEFAULT false,
  "payrollExcluded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByEmployeeId" INTEGER REFERENCES "Employee"(id) ON DELETE SET NULL,
  FOREIGN KEY ("employeeId", "orgId") REFERENCES "Employee"(id, "orgId") ON DELETE RESTRICT,
  CHECK (NOT ("alwaysFullAttendance" AND "payrollExcluded"))
);
CREATE INDEX IF NOT EXISTS "EmployeePayrollManagementVersion_orgId_employeeId_effectiveMonth_id_idx"
  ON "EmployeePayrollManagementVersion" ("orgId", "employeeId", "effectiveMonth", id);

-- Employee flags remain the unchanged baseline for dates before the first version.
CREATE OR REPLACE FUNCTION baro_attendance_management_state() RETURNS trigger AS $$
DECLARE base_excluded BOOLEAN;
BEGIN
  SELECT (e."alwaysFullAttendance" OR e."payrollExcluded") INTO base_excluded
    FROM "Employee" e WHERE e.id = NEW."workerId" AND e."orgId" = NEW."orgId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attendance employee does not belong to the organization'; END IF;
  SELECT (v."alwaysFullAttendance" OR v."payrollExcluded") INTO NEW."managementExcluded"
    FROM "EmployeePayrollManagementVersion" v
    WHERE v."employeeId"=NEW."workerId" AND v."orgId"=NEW."orgId"
      AND v."effectiveMonth" <= LEFT(NEW."workDate",7)
    ORDER BY v."effectiveMonth" DESC, v.id DESC LIMIT 1;
  IF NOT FOUND THEN NEW."managementExcluded" := base_excluded; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION baro_employee_attendance_management_state() RETURNS trigger AS $$
BEGIN
  IF (NEW."alwaysFullAttendance", NEW."payrollExcluded") IS DISTINCT FROM (OLD."alwaysFullAttendance", OLD."payrollExcluded") THEN
    RAISE EXCEPTION 'Use effective-month payroll management settings instead of changing the baseline';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION baro_payroll_management_version_added() RETURNS trigger AS $$
DECLARE next_month TEXT;
BEGIN
  SELECT MIN("effectiveMonth") INTO next_month FROM "EmployeePayrollManagementVersion"
    WHERE "employeeId"=NEW."employeeId" AND "effectiveMonth">NEW."effectiveMonth";
  UPDATE "AttendanceEntry" SET "managementExcluded"=(NEW."alwaysFullAttendance" OR NEW."payrollExcluded"), "updatedAt"=CURRENT_TIMESTAMP
    WHERE "workerId"=NEW."employeeId" AND "orgId"=NEW."orgId"
      AND LEFT("workDate",7)>=NEW."effectiveMonth" AND (next_month IS NULL OR LEFT("workDate",7)<next_month)
      AND "managementExcluded" IS DISTINCT FROM (NEW."alwaysFullAttendance" OR NEW."payrollExcluded");
  UPDATE "PayrollSnapshot" SET "recalculationRequested"=true
    WHERE "orgId"=NEW."orgId" AND "isProvisional"=true
      AND month>=NEW."effectiveMonth" AND (next_month IS NULL OR month<next_month);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payroll_management_version_added ON "EmployeePayrollManagementVersion";
CREATE TRIGGER payroll_management_version_added AFTER INSERT ON "EmployeePayrollManagementVersion"
  FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_version_added();

CREATE OR REPLACE FUNCTION baro_payroll_management_version_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payroll management history cannot be deleted'; END IF;
  IF (NEW."orgId",NEW."employeeId",NEW."effectiveMonth",NEW."alwaysFullAttendance",NEW."payrollExcluded",NEW."createdAt")
    IS DISTINCT FROM (OLD."orgId",OLD."employeeId",OLD."effectiveMonth",OLD."alwaysFullAttendance",OLD."payrollExcluded",OLD."createdAt") THEN
    RAISE EXCEPTION 'Payroll management history cannot be changed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payroll_management_version_immutable ON "EmployeePayrollManagementVersion";
CREATE TRIGGER payroll_management_version_immutable BEFORE UPDATE OR DELETE ON "EmployeePayrollManagementVersion"
  FOR EACH ROW EXECUTE FUNCTION baro_payroll_management_version_immutable();
