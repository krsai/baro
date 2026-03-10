-- Convert legacy scalar `at` values to `atParams` and remove the old key.
UPDATE "Style"
SET "processes" = CASE
  WHEN jsonb_typeof("processes"::jsonb) <> 'array' THEN "processes"::jsonb
  ELSE (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(elem) <> 'object' THEN elem
          WHEN elem ? 'atParams' THEN elem - 'at'
          WHEN elem ? 'at' AND (elem->>'at') ~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN
            (elem - 'at') || jsonb_build_object(
              'atParams',
              jsonb_build_object(
                'a', GREATEST((elem->>'at')::numeric, 0),
                'b', 0,
                'version', 1,
                'updatedAt', NULL,
                'trainedPeriod', NULL,
                'attendanceCoverage', NULL,
                'attendanceFallbackShare', NULL,
                'observationCount', NULL
              )
            )
          ELSE elem - 'at'
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements("processes"::jsonb) AS elem
  )
END
WHERE "processes" IS NOT NULL;
