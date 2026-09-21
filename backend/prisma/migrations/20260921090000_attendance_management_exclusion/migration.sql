-- Preserve punches; synchronize their management state with the employee's current exception policy.
ALTER TABLE "AttendanceEntry" ADD COLUMN IF NOT EXISTS "managementExcluded" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION baro_attendance_management_state() RETURNS trigger AS $$
BEGIN
  SELECT (e."alwaysFullAttendance" OR e."payrollExcluded")
    INTO NEW."managementExcluded"
    FROM "Employee" e WHERE e.id = NEW."workerId" AND e."orgId" = NEW."orgId"
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance employee does not belong to the organization';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_management_state ON "AttendanceEntry";
CREATE TRIGGER attendance_management_state BEFORE INSERT OR UPDATE ON "AttendanceEntry"
  FOR EACH ROW EXECUTE FUNCTION baro_attendance_management_state();

CREATE OR REPLACE FUNCTION baro_employee_attendance_management_state() RETURNS trigger AS $$
BEGIN
  UPDATE "AttendanceEntry"
    SET "managementExcluded" = (NEW."alwaysFullAttendance" OR NEW."payrollExcluded"),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "workerId" = NEW.id AND "orgId" = NEW."orgId"
      AND "managementExcluded" IS DISTINCT FROM (NEW."alwaysFullAttendance" OR NEW."payrollExcluded");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS employee_attendance_management_state ON "Employee";
CREATE TRIGGER employee_attendance_management_state AFTER UPDATE OF "alwaysFullAttendance", "payrollExcluded" ON "Employee"
  FOR EACH ROW EXECUTE FUNCTION baro_employee_attendance_management_state();

UPDATE "AttendanceEntry" a
  SET "managementExcluded" = (e."alwaysFullAttendance" OR e."payrollExcluded"), "updatedAt" = CURRENT_TIMESTAMP
  FROM "Employee" e
  WHERE e.id = a."workerId" AND e."orgId" = a."orgId"
    AND a."managementExcluded" IS DISTINCT FROM (e."alwaysFullAttendance" OR e."payrollExcluded");
