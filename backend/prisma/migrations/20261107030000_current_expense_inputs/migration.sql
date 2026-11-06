CREATE OR REPLACE FUNCTION baro_current_expense_inputs(company_id integer,code_id integer) RETURNS jsonb LANGUAGE sql STABLE AS $inputs$
 SELECT coalesce(p."inputSettings",jsonb_build_object('orderInput',b."orderInput",'styleInput',b."styleInput",'processInput',b."processInput",'requiredFields',to_jsonb(b."requiredFields")))
 || CASE WHEN o.type::text='SERVICE' THEN '{"orderInput":"HIDDEN","styleInput":"HIDDEN","processInput":"HIDDEN"}'::jsonb ELSE '{}'::jsonb END
 FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "Organization" o ON o.id=company_id
 LEFT JOIN "ExpenseCodeLinkPolicy" p ON p."orgId"=company_id AND p."baseId"=b.id
 WHERE c.id=code_id AND c."ownerOrgId"=company_id;
$inputs$;
-- Validate edits against current settings without rewriting historical policy IDs or audit snapshots.
DO $migration$
DECLARE definition text; anchor text := ' FOREACH field IN ARRAY fields LOOP'; addition text := $addition$
 -- CURRENT_EXPENSE_INPUTS_V1
 IF TG_OP='UPDATE' AND NEW."transactionCodeId" IS NOT NULL THEN
   input_settings:=baro_current_expense_inputs(NEW."orgId",NEW."transactionCodeId");
   fields:=ARRAY(SELECT jsonb_array_elements_text(input_settings->'requiredFields'));
   options."orderInput":=input_settings->>'orderInput';options."styleInput":=input_settings->>'styleInput';options."processInput":=input_settings->>'processInput';
   IF options."orderInput"='HIDDEN' AND OLD."workOrderId" IS NOT NULL AND NEW."workOrderId"=OLD."workOrderId" THEN options."orderInput":='OPTIONAL'; END IF;
   IF options."styleInput"='HIDDEN' AND OLD."styleId" IS NOT NULL AND NEW."styleId"=OLD."styleId" THEN options."styleInput":='OPTIONAL'; END IF;
   IF options."processInput"='HIDDEN' AND OLD."styleProcessId" IS NOT NULL AND NEW."styleProcessId"=OLD."styleProcessId" THEN options."processInput":='OPTIONAL'; END IF;
 END IF;
$addition$;
BEGIN
 definition:=pg_get_functiondef('baro_transaction_cost_guard()'::regprocedure);
 IF position('CURRENT_EXPENSE_INPUTS_V1' in definition)>0 THEN RETURN; END IF;
 IF position(anchor in definition)=0 THEN RAISE EXCEPTION 'current expense inputs: guard anchor missing'; END IF;
 EXECUTE replace(definition,anchor,addition||anchor);
END $migration$;
