-- Input modes are independent. Preserve existing configuration values and history.
CREATE OR REPLACE FUNCTION baro_accounting_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT settings IS NULL OR coalesce(jsonb_typeof(settings)='object' AND settings->>'orderInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND settings->>'styleInput' IN ('REQUIRED','OPTIONAL','HIDDEN') AND settings->>'processInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND jsonb_typeof(settings->'requiredFields')='array'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings->'requiredFields')='array' THEN settings->'requiredFields' ELSE '[]'::jsonb END) f WHERE f NOT IN ('transportDate','origin','destination','reference','length','width'))
 AND ((settings->'requiredFields' ? 'length')=(settings->'requiredFields' ? 'width')),false)
 AND baro_code_attribute_inputs_valid(settings->'attributeInputs')
$$;
DO $$ DECLARE c record; BEGIN
 -- Earlier installs may retain unnamed hierarchy checks. Keep per-field enum checks.
 FOR c IN SELECT t.relname,k.conname FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid
  WHERE t.relname IN ('SettingServiceDefault','OutsourcingServiceType','TransactionCodeBase') AND k.contype='c'
  AND pg_get_constraintdef(k.oid) NOT LIKE '%ANY%'
  AND (pg_get_constraintdef(k.oid) LIKE '%styleInput%orderInput%' OR pg_get_constraintdef(k.oid) LIKE '%orderInput%styleInput%')
 LOOP EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',c.relname,c.conname); END LOOP;
END $$;
CREATE OR REPLACE FUNCTION baro_independent_accounting_inputs_ready() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
