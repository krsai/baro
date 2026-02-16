-- Remove deprecated per-factory proposal mode.
ALTER TABLE "Factory"
DROP COLUMN IF EXISTS "wageStandard";

-- Remove legacy `st` keys from style process JSON payloads.
UPDATE "Style"
SET "processes" = CASE
  WHEN jsonb_typeof("processes"::jsonb) <> 'array' THEN "processes"::jsonb
  ELSE (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) = 'object' THEN elem - 'st'
          ELSE elem
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements("processes"::jsonb) AS elem
  )
END
WHERE "processes" IS NOT NULL;
