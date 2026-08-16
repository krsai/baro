CREATE TABLE "EmployeeGradeSet" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeGradeSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeGrade" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "setId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeGrade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeGradeSet_orgId_code_key" ON "EmployeeGradeSet"("orgId", "code");
CREATE INDEX "EmployeeGradeSet_orgId_isActive_idx" ON "EmployeeGradeSet"("orgId", "isActive");
CREATE UNIQUE INDEX "EmployeeGrade_orgId_code_key" ON "EmployeeGrade"("orgId", "code");
CREATE UNIQUE INDEX "EmployeeGrade_setId_sortOrder_key" ON "EmployeeGrade"("setId", "sortOrder");
CREATE INDEX "EmployeeGrade_orgId_isActive_sortOrder_idx" ON "EmployeeGrade"("orgId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "EmployeeGrade_one_default_per_org_key" ON "EmployeeGrade"("orgId") WHERE "isDefault" = true;

ALTER TABLE "EmployeeGradeSet" ADD CONSTRAINT "EmployeeGradeSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeGrade" ADD CONSTRAINT "EmployeeGrade_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeGrade" ADD CONSTRAINT "EmployeeGrade_setId_fkey" FOREIGN KEY ("setId") REFERENCES "EmployeeGradeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EmployeeGradeSet" ("orgId", "code", "name", "updatedAt")
SELECT "id", 'CL', 'CL', CURRENT_TIMESTAMP FROM "Organization"
ON CONFLICT ("orgId", "code") DO NOTHING;

INSERT INTO "EmployeeGrade" ("orgId", "setId", "code", "name", "sortOrder", "isDefault", "updatedAt")
SELECT s."orgId", s."id", v.code, v.name, v.sort_order, v.is_default, CURRENT_TIMESTAMP
FROM "EmployeeGradeSet" s
CROSS JOIN (VALUES
  ('CL1', '일반', 1, true),
  ('CL2', '선임', 2, false),
  ('CL3', '책임', 3, false),
  ('CL4', '수석', 4, false)
) AS v(code, name, sort_order, is_default)
WHERE s."code" = 'CL'
ON CONFLICT ("orgId", "code") DO NOTHING;

ALTER TABLE "Employee" ADD COLUMN "gradeId" INTEGER;
UPDATE "Employee" e SET "gradeId" = g."id"
FROM "EmployeeGrade" g WHERE g."orgId" = e."orgId" AND g."isDefault" = true;
ALTER TABLE "Employee" ALTER COLUMN "gradeId" SET NOT NULL;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "EmployeeGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Employee_gradeId_idx" ON "Employee"("gradeId");

CREATE OR REPLACE FUNCTION baro_assign_default_employee_grade() RETURNS trigger AS $$
BEGIN
  IF NEW."gradeId" IS NULL THEN
    INSERT INTO "EmployeeGradeSet" ("orgId", "code", "name", "updatedAt")
    VALUES (NEW."orgId", 'CL', 'CL', CURRENT_TIMESTAMP)
    ON CONFLICT ("orgId", "code") DO NOTHING;
    INSERT INTO "EmployeeGrade" ("orgId", "setId", "code", "name", "sortOrder", "isDefault", "updatedAt")
    SELECT s."orgId", s."id", v.code, v.name, v.sort_order, v.is_default, CURRENT_TIMESTAMP
    FROM "EmployeeGradeSet" s
    CROSS JOIN (VALUES ('CL1','일반',1,true), ('CL2','선임',2,false), ('CL3','책임',3,false), ('CL4','수석',4,false)) v(code,name,sort_order,is_default)
    WHERE s."orgId" = NEW."orgId" AND s."code" = 'CL'
    ON CONFLICT ("orgId", "code") DO NOTHING;
    SELECT "id" INTO NEW."gradeId" FROM "EmployeeGrade"
    WHERE "orgId" = NEW."orgId" AND "isDefault" = true LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Employee_assign_default_grade" BEFORE INSERT ON "Employee"
FOR EACH ROW EXECUTE FUNCTION baro_assign_default_employee_grade();
