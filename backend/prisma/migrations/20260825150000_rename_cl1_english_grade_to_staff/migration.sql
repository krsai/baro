-- Avoid ambiguity between the CL1 grade and the GENERAL pay type.
-- Preserve organization-specific names that have already been customized.
UPDATE "EmployeeGrade"
SET "nameEn" = 'Staff'
WHERE "code" = 'CL1'
  AND "nameEn" = 'General';
