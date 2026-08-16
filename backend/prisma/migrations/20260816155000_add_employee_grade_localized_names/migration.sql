ALTER TABLE "EmployeeGrade"
  ADD COLUMN "nameKo" TEXT,
  ADD COLUMN "nameEn" TEXT,
  ADD COLUMN "nameVi" TEXT;

UPDATE "EmployeeGrade"
SET
  "nameKo" = CASE "code"
    WHEN 'CL1' THEN '일반' WHEN 'CL2' THEN '선임' WHEN 'CL3' THEN '책임' WHEN 'CL4' THEN '수석'
    ELSE "name" END,
  "nameEn" = CASE "code"
    WHEN 'CL1' THEN 'General' WHEN 'CL2' THEN 'Senior' WHEN 'CL3' THEN 'Principal' WHEN 'CL4' THEN 'Master'
    ELSE "name" END,
  "nameVi" = CASE "code"
    WHEN 'CL1' THEN 'Nhân viên' WHEN 'CL2' THEN 'Chuyên viên cao cấp' WHEN 'CL3' THEN 'Chuyên viên chính' WHEN 'CL4' THEN 'Chuyên gia'
    ELSE "name" END;

ALTER TABLE "EmployeeGrade"
  ALTER COLUMN "nameKo" SET NOT NULL,
  ALTER COLUMN "nameEn" SET NOT NULL,
  ALTER COLUMN "nameVi" SET NOT NULL;

CREATE OR REPLACE FUNCTION baro_assign_default_employee_grade() RETURNS trigger AS $$
BEGIN
  IF NEW."gradeId" IS NULL THEN
    INSERT INTO "EmployeeGradeSet" ("orgId", "code", "name", "updatedAt")
    VALUES (NEW."orgId", 'CL', 'CL', CURRENT_TIMESTAMP)
    ON CONFLICT ("orgId", "code") DO NOTHING;
    INSERT INTO "EmployeeGrade" ("orgId", "setId", "code", "name", "nameKo", "nameEn", "nameVi", "sortOrder", "isDefault", "updatedAt")
    SELECT s."orgId", s."id", v.code, v.name_ko, v.name_ko, v.name_en, v.name_vi, v.sort_order, v.is_default, CURRENT_TIMESTAMP
    FROM "EmployeeGradeSet" s
    CROSS JOIN (VALUES
      ('CL1','일반','General','Nhân viên',1,true),
      ('CL2','선임','Senior','Chuyên viên cao cấp',2,false),
      ('CL3','책임','Principal','Chuyên viên chính',3,false),
      ('CL4','수석','Master','Chuyên gia',4,false)
    ) v(code,name_ko,name_en,name_vi,sort_order,is_default)
    WHERE s."orgId" = NEW."orgId" AND s."code" = 'CL'
    ON CONFLICT ("orgId", "code") DO NOTHING;
    SELECT "id" INTO NEW."gradeId" FROM "EmployeeGrade" WHERE "orgId" = NEW."orgId" AND "isDefault" = true LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
