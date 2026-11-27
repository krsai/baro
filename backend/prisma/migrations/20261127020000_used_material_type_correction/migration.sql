-- Type corrections retain the original item, owner, stock, references and snapshots.
CREATE OR REPLACE FUNCTION baro_variant_type_correction(old_row jsonb,new_row jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE actor integer; BEGIN
 IF current_setting('baro.variant_type_correction',true) IS DISTINCT FROM old_row->>'id' THEN RETURN false; END IF;
 actor:=nullif(current_setting('baro.variant_actor',true),'')::integer;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId"
  WHERE e.id=actor AND e."orgId"=(old_row->>'orgId')::integer AND e.status='ACTIVE'
  AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT') AND o."isActive") THEN RETURN false; END IF;
 IF (new_row-ARRAY['typeId','attributes','identity','revision','managed']) IS DISTINCT FROM (old_row-ARRAY['typeId','attributes','identity','revision','managed'])
  OR (new_row->>'revision')::integer<>(old_row->>'revision')::integer+1 OR new_row->>'managed'<>'true'
  OR new_row->'typeId' IS NOT DISTINCT FROM old_row->'typeId'
  OR ((new_row->'attributes')-'type') IS DISTINCT FROM ((old_row->'attributes')-'type')
  OR new_row->'attributes'->'type'->>'id' IS DISTINCT FROM new_row->>'typeId'
  OR new_row->>'identity' !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM "TransactionCodeBase" b WHERE b.id=(old_row->>'baseId')::integer
  AND coalesce(b."materialSettings"->'masterInputs'->>'type',b."attributeInputs"->>'type') IN ('REQUIRED','OPTIONAL')) THEN RETURN false; END IF;
 IF new_row->>'typeId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CodeItemType" t
  WHERE t.id=(new_row->>'typeId')::integer AND t."orgId"=(old_row->>'orgId')::integer AND t."baseId"=(old_row->>'baseId')::integer
  AND t."nameEn" IS NOT DISTINCT FROM new_row->'attributes'->'type'->>'nameEn'
  AND t."nameKo" IS NOT DISTINCT FROM new_row->'attributes'->'type'->>'nameKo'
  AND t."nameVi" IS NOT DISTINCT FROM new_row->'attributes'->'type'->>'nameVi') THEN RETURN false; END IF;
 IF new_row->>'typeId' IS NULL AND EXISTS(SELECT 1 FROM "TransactionCodeBase" b WHERE b.id=(old_row->>'baseId')::integer
  AND coalesce(b."materialSettings"->'masterInputs'->>'type',b."attributeInputs"->>'type')='REQUIRED') THEN RETURN false; END IF;
 RETURN true;
END $$;

-- Keep existing guards, including audit and all non-correction checks intact.
DO $$ DECLARE fn text; definition text; BEGIN
 FOREACH fn IN ARRAY ARRAY['baro_inventory_variant_management_guard','baro_expense_variant_guard'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(fn||'()')) INTO definition;
  IF definition IS NULL THEN RAISE EXCEPTION 'VARIANT_CORRECTION_GUARD_MISSING'; END IF;
  IF position('baro_variant_type_correction' in definition)=0 THEN
   definition:=regexp_replace(definition,'BEGIN',
    'BEGIN IF TG_TABLE_NAME=''InventoryVariant'' AND TG_OP=''UPDATE'' THEN IF baro_variant_type_correction(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF; END IF;','i');
   EXECUTE definition;
  END IF;
 END LOOP;
END $$;
