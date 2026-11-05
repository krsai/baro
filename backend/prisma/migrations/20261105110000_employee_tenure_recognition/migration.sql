CREATE TABLE "EmployeeTenureRecognition" (
 "id" SERIAL PRIMARY KEY,
 "orgId" INTEGER NOT NULL,
 "employeeId" INTEGER NOT NULL,
 "effectiveMonth" TEXT NOT NULL,
 "additionalYears" INTEGER NOT NULL,
 "reason" TEXT NOT NULL,
 "clientKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdByEmployeeId" INTEGER NOT NULL,
 CONSTRAINT "EmployeeTenureRecognition_employeeId_orgId_fkey" FOREIGN KEY ("employeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "EmployeeTenureRecognition_createdByEmployeeId_orgId_fkey" FOREIGN KEY ("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "EmployeeTenureRecognition_values_check" CHECK (
   "effectiveMonth" ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'
   AND "additionalYears" BETWEEN 0 AND 100
   AND length(btrim(reason)) BETWEEN 1 AND 1000
   AND length("clientKey") BETWEEN 8 AND 80
 )
);
CREATE UNIQUE INDEX "EmployeeTenureRecognition_orgId_clientKey_key" ON "EmployeeTenureRecognition"("orgId","clientKey");
CREATE INDEX "EmployeeTenureRecognition_orgId_employeeId_effectiveMonth_id_idx" ON "EmployeeTenureRecognition"("orgId","employeeId","effectiveMonth",id);
CREATE FUNCTION baro_employee_tenure_recognition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'TENURE_RECOGNITION_APPEND_ONLY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."createdByEmployeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"='ADMIN') THEN
   RAISE EXCEPTION 'TENURE_RECOGNITION_ADMIN_REQUIRED';
 END IF;
 IF EXISTS(SELECT 1 FROM "PayrollSnapshot" p JOIN "Employee" e ON e.id=NEW."employeeId" AND e."orgId"=NEW."orgId"
   WHERE p."orgId"=NEW."orgId" AND p."factoryId"=e."factoryId" AND p.month>=NEW."effectiveMonth") THEN
   RAISE EXCEPTION 'TENURE_RECOGNITION_PAYROLL_SAVED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "EmployeeTenureRecognition_guard" BEFORE INSERT OR UPDATE OR DELETE ON "EmployeeTenureRecognition"
 FOR EACH ROW EXECUTE FUNCTION baro_employee_tenure_recognition_guard();
