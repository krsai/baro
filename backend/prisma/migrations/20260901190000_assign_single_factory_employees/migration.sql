-- A manufacturer employee must belong to a real factory. Existing employees in
-- an organization with exactly one factory can be assigned without ambiguity.
UPDATE "Employee" AS employee
SET "factoryId" = single_factory."factoryId"
FROM (
  SELECT "orgId", MIN("id") AS "factoryId"
  FROM "Factory"
  GROUP BY "orgId"
  HAVING COUNT(*) = 1
) AS single_factory
WHERE employee."orgId" = single_factory."orgId"
  AND employee."factoryId" IS NULL;
