DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProcessGenderScope') THEN
    CREATE TYPE "ProcessGenderScope" AS ENUM ('UNISEX', 'MALE_ONLY', 'FEMALE_ONLY');
  END IF;
END $$;

ALTER TABLE "StyleProcess"
  ADD COLUMN IF NOT EXISTS "genderScope" "ProcessGenderScope" NOT NULL DEFAULT 'UNISEX';
