DO $$
BEGIN
  CREATE TYPE "WorkOrderItemGender" AS ENUM ('M', 'W', 'U');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "WorkOrder"
SET "items" = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(item) = 'object' THEN
          jsonb_set(
            item,
            '{gender}',
            to_jsonb(
              CASE
                WHEN trim(COALESCE(item ->> 'gender', '')) = '' THEN 'M'
                WHEN upper(trim(item ->> 'gender')) IN ('M', 'MEN', 'MALE') OR trim(item ->> 'gender') = U&'\B0A8\C131' THEN 'M'
                WHEN upper(trim(item ->> 'gender')) IN ('W', 'WOMEN', 'FEMALE') OR trim(item ->> 'gender') = U&'\C5EC\C131' THEN 'W'
                WHEN upper(trim(item ->> 'gender')) IN ('U', 'UNISEX') OR trim(item ->> 'gender') = U&'\ACF5\C6A9' THEN 'U'
                ELSE 'M'
              END
            ),
            true
          )
        ELSE item
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof("items"::jsonb) = 'array' THEN "items"::jsonb
      ELSE '[]'::jsonb
    END
  ) AS item
)
WHERE "items" IS NOT NULL;

ALTER TABLE "WorkOrderItem"
ALTER COLUMN "gender" TYPE "WorkOrderItemGender"
USING (
  CASE
    WHEN "gender" IS NULL OR btrim("gender") = '' THEN NULL
    WHEN upper(btrim("gender")) IN ('M', 'MEN', 'MALE') OR btrim("gender") = U&'\B0A8\C131' THEN 'M'::"WorkOrderItemGender"
    WHEN upper(btrim("gender")) IN ('W', 'WOMEN', 'FEMALE') OR btrim("gender") = U&'\C5EC\C131' THEN 'W'::"WorkOrderItemGender"
    WHEN upper(btrim("gender")) IN ('U', 'UNISEX') OR btrim("gender") = U&'\ACF5\C6A9' THEN 'U'::"WorkOrderItemGender"
    ELSE 'M'::"WorkOrderItemGender"
  END
);
