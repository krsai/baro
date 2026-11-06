CREATE TABLE "EmployeeLeaveGrant" (
 "id" TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"employeeId" INTEGER NOT NULL,"year" INTEGER NOT NULL CHECK("year" BETWEEN 1900 AND 2200),
 "days" INTEGER NOT NULL CHECK("days" BETWEEN -366 AND 366 AND "days"<>0),"reason" TEXT NOT NULL CHECK(length(trim("reason")) BETWEEN 1 AND 1000),
 "clientKey" TEXT NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","clientKey"),FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"("id","orgId"),FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"("id","orgId")
);
CREATE TABLE "EmployeeLeaveDay" (
 "id" TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"employeeId" INTEGER NOT NULL,"leaveDate" TEXT NOT NULL CHECK("leaveDate" ~ '^\d{4}-\d{2}-\d{2}$'),
 "kind" TEXT NOT NULL CHECK("kind" IN ('ANNUAL','PAID','UNPAID')),"reason" TEXT NOT NULL CHECK(length(trim("reason")) BETWEEN 1 AND 1000),
 "clientKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,"createdByEmployeeId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "cancelledAt" TIMESTAMP(3),"cancelledByEmployeeId" INTEGER,"cancellationReason" TEXT,
 UNIQUE("orgId","clientKey"),FOREIGN KEY("employeeId","orgId") REFERENCES "Employee"("id","orgId"),FOREIGN KEY("createdByEmployeeId","orgId") REFERENCES "Employee"("id","orgId"),FOREIGN KEY("cancelledByEmployeeId","orgId") REFERENCES "Employee"("id","orgId"),
 CHECK(("cancelledAt" IS NULL AND "cancelledByEmployeeId" IS NULL AND "cancellationReason" IS NULL) OR ("cancelledAt" IS NOT NULL AND "cancelledByEmployeeId" IS NOT NULL AND length(trim("cancellationReason")) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX "EmployeeLeaveDay_active_date" ON "EmployeeLeaveDay"("orgId","employeeId","leaveDate") WHERE "cancelledAt" IS NULL;
CREATE INDEX "EmployeeLeaveDay_month" ON "EmployeeLeaveDay"("orgId","leaveDate");
CREATE FUNCTION "baro_leave_history_guard"() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='EmployeeLeaveGrant' THEN RAISE EXCEPTION 'LEAVE_HISTORY_IMMUTABLE'; END IF;
 IF OLD."cancelledAt" IS NOT NULL OR NEW."cancelledAt" IS NULL OR (to_jsonb(OLD)-ARRAY['cancelledAt','cancelledByEmployeeId','cancellationReason']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['cancelledAt','cancelledByEmployeeId','cancellationReason']) THEN RAISE EXCEPTION 'LEAVE_HISTORY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "EmployeeLeaveGrant_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeLeaveGrant" FOR EACH ROW EXECUTE FUNCTION "baro_leave_history_guard"();
CREATE TRIGGER "EmployeeLeaveDay_history_guard" BEFORE UPDATE OR DELETE ON "EmployeeLeaveDay" FOR EACH ROW EXECUTE FUNCTION "baro_leave_history_guard"();
