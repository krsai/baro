-- Extend input settings only; do not rewrite historical policies, costs or audits.
CREATE OR REPLACE FUNCTION baro_accounting_inputs_valid(settings JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT settings IS NULL OR coalesce(jsonb_typeof(settings)='object' AND settings->>'orderInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND settings->>'styleInput' IN ('REQUIRED','OPTIONAL','HIDDEN') AND settings->>'processInput' IN ('REQUIRED','OPTIONAL','HIDDEN')
 AND jsonb_typeof(settings->'requiredFields')='array'
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(settings->'requiredFields')='array' THEN settings->'requiredFields' ELSE '[]'::jsonb END) f WHERE f NOT IN ('transportDate','origin','destination','reference','length','width'))
 AND ((settings->'requiredFields' ? 'length')=(settings->'requiredFields' ? 'width'))
 AND (settings->>'styleInput'='HIDDEN' OR settings->>'orderInput'<>'HIDDEN')
 AND (settings->>'processInput'='HIDDEN' OR settings->>'styleInput'<>'HIDDEN' AND settings->>'orderInput'<>'HIDDEN')
 AND (settings->>'styleInput'<>'REQUIRED' OR settings->>'orderInput'='REQUIRED')
 AND (settings->>'processInput'<>'REQUIRED' OR settings->>'styleInput'='REQUIRED'),false)
$$;

CREATE OR REPLACE FUNCTION baro_cost_dimensions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text; value text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.details IS NOT DISTINCT FROM OLD.details THEN RETURN NEW; END IF;
 IF coalesce(NEW.details->>'length','')<>'' OR coalesce(NEW.details->>'width','')<>'' OR coalesce(NEW.details->>'height','')<>'' THEN
  IF coalesce(NEW.details->>'length','')='' OR coalesce(NEW.details->>'width','')='' THEN RAISE EXCEPTION 'length and width are required'; END IF;
  FOREACH field IN ARRAY ARRAY['length','width','height'] LOOP
   value:=NEW.details->>field;
   IF coalesce(value,'')<>'' THEN
    IF jsonb_typeof(NEW.details->field)<>'string' OR value !~ '^[0-9]{1,12}(\.[0-9]{1,4})?$' THEN RAISE EXCEPTION 'invalid dimension'; END IF;
    IF value::numeric<=0 THEN RAISE EXCEPTION 'invalid dimension'; END IF;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Cost_dimensions_guard" ON "PartnerTransactionCost";
CREATE TRIGGER "Cost_dimensions_guard" BEFORE INSERT OR UPDATE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_cost_dimensions_guard();
-- Rollback: disable new dimension writes in the app; retain this additive validator
-- and stored millimetre dimensions so audited policies/documents remain readable.
