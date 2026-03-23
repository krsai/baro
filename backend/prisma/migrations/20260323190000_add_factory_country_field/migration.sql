ALTER TABLE "Factory"
ADD COLUMN "country" TEXT;

UPDATE "Factory"
SET "country" = CASE
  WHEN UPPER(TRIM(COALESCE("countryCode", ''))) IN ('KR', 'VN')
    THEN UPPER(TRIM("countryCode"))
  WHEN TRIM(COALESCE("countryCode", '')) = '+82'
    THEN 'KR'
  WHEN TRIM(COALESCE("countryCode", '')) = '+84'
    THEN 'VN'
  ELSE "country"
END
WHERE "country" IS NULL;

UPDATE "Factory"
SET "countryCode" = CASE
  WHEN UPPER(TRIM(COALESCE("countryCode", ''))) = 'KR'
    THEN '+82'
  WHEN UPPER(TRIM(COALESCE("countryCode", ''))) = 'VN'
    THEN '+84'
  ELSE "countryCode"
END
WHERE "countryCode" IS NOT NULL;
