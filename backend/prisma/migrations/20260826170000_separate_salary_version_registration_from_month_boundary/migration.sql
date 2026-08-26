ALTER TABLE "SalarySystemVersion"
  ALTER COLUMN "effectiveMonth" DROP NOT NULL;

-- The salary version workflow changed from choosing an effective month while
-- saving to registering a version first and assigning it on the month timeline.
-- Discard the incompatible preview history once; current salary items and rates
-- remain intact and the first subsequent read recreates a clean Ver.1 snapshot.
DELETE FROM "SalarySystemVersion";
