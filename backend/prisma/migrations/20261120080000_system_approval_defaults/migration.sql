CREATE OR REPLACE FUNCTION baro_approval_local_key(company integer,menu text,operation text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN menu='WORK_TIME' THEN 'WORK_TIME_POLICY:'||company WHEN menu='EXPENSE' AND operation='CREATE' THEN 'EXPENSE_APPROVAL_POLICY:'||company ELSE 'APPROVAL_POLICY:'||menu||':'||operation||':'||company END
$$;
CREATE OR REPLACE FUNCTION baro_approval_portable(v jsonb,company integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb; k text; item jsonb; ref jsonb; person record; BEGIN
 IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(baro_approval_portable(value,company)),'[]') INTO result FROM jsonb_array_elements(v); RETURN result; END IF;
 IF jsonb_typeof(v)<>'object' THEN RETURN v; END IF;
 result:='{}';
 FOR k,item IN SELECT * FROM jsonb_each(v) LOOP
  IF k IN ('revision','source','defaultRevision','legacyStages','fallbackGrades','approvalTemplateStages','noApprovalRequired') THEN CONTINUE; END IF;
  IF k IN ('gradeId','drafterGradeId','seniorGradeId','leadGradeId') AND jsonb_typeof(item)='number' THEN
   SELECT jsonb_build_object('_gradeRef',jsonb_build_object('setCode',s.code,'code',g.code)) INTO ref FROM "EmployeeGrade" g JOIN "EmployeeGradeSet" s ON s.id=g."setId" AND s."orgId"=g."orgId" WHERE g.id=item::text::integer AND g."orgId"=company;
   IF ref IS NULL THEN RAISE EXCEPTION 'APPROVAL_DEFAULT_GRADE_REFERENCE_MISSING'; END IF;
   result:=result||jsonb_build_object(k,ref);
  ELSIF k='approverIds' THEN
   ref:='[]';
   FOR person IN SELECT e.* FROM jsonb_array_elements_text(item) WITH ORDINALITY ids(id,n) JOIN "Employee" e ON e.id=ids.id::integer AND e."orgId"=company ORDER BY ids.n LOOP
    ref:=ref||jsonb_build_array(baro_approval_portable(jsonb_build_object('role',person."orgRole",'gradeId',person."gradeId",'gradeMatch',CASE WHEN person."gradeId" IS NULL THEN 'ANY' ELSE 'EXACT' END),company));
   END LOOP;
   IF jsonb_array_length(ref)<>jsonb_array_length(item) THEN RAISE EXCEPTION 'APPROVAL_DEFAULT_EMPLOYEE_REFERENCE_MISSING'; END IF;
   result:=result||jsonb_build_object('version',2,'stages',ref);
  ELSE result:=result||jsonb_build_object(k,baro_approval_portable(item,company)); END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION baro_approval_resolve(v jsonb,company integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb; k text; item jsonb; found_id integer; BEGIN
 IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(baro_approval_resolve(value,company)),'[]') INTO result FROM jsonb_array_elements(v); RETURN result; END IF;
 IF jsonb_typeof(v)<>'object' THEN RETURN v; END IF;
 IF v ? '_gradeRef' THEN
  SELECT g.id INTO found_id FROM "EmployeeGrade" g JOIN "EmployeeGradeSet" s ON s.id=g."setId" AND s."orgId"=g."orgId" WHERE g."orgId"=company AND g."isActive" AND s."isActive" AND g.code=v->'_gradeRef'->>'code' AND s.code=v->'_gradeRef'->>'setCode';
  RETURN to_jsonb(coalesce(found_id,-1));
 END IF;
 result:='{}'; FOR k,item IN SELECT * FROM jsonb_each(v) LOOP result:=result||jsonb_build_object(k,baro_approval_resolve(item,company)); END LOOP; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION baro_approval_effective(company integer,menu text,operation text,force_default boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE local_value jsonb; defaults jsonb; mode jsonb; result jsonb; stage jsonb; ids jsonb:='[]'; chosen integer; n integer; position integer:=0; generation bigint; BEGIN
 SELECT value INTO local_value FROM "SystemSetting" WHERE key=baro_approval_local_key(company,menu,operation);
 SELECT value INTO mode FROM "SystemSetting" WHERE key='APPROVAL_MODE:'||menu||':'||operation||':'||company;
 IF NOT force_default AND (mode->>'mode'='LOCAL' OR mode IS NULL AND local_value IS NOT NULL) THEN RETURN local_value; END IF;
 SELECT value INTO defaults FROM "SystemSetting" WHERE key='APPROVAL_DEFAULT:'||menu||':'||operation;
 IF defaults IS NULL THEN IF mode->>'mode'='DEFAULT' OR force_default THEN RAISE EXCEPTION 'APPROVAL_DEFAULT_UNAVAILABLE'; END IF; RETURN local_value; END IF;
 result:=baro_approval_resolve(defaults->'policy',company);
 IF menu='WORK_TIME' AND NOT force_default THEN
  FOR stage IN SELECT value FROM jsonb_array_elements(coalesce(result->'stages','[]')) LOOP
   chosen:=(local_value->'approverIds'->>position)::integer;
   IF chosen IS NULL OR NOT baro_inventory_stage_eligible(company,chosen,stage) THEN
    SELECT count(*),min(id) INTO n,chosen FROM "Employee" WHERE "orgId"=company AND baro_inventory_stage_eligible(company,id,stage); IF n<>1 THEN chosen:=0; END IF;
   END IF;
   ids:=ids||jsonb_build_array(chosen);position:=position+1;
  END LOOP;
  result:=(result-'stages')||jsonb_build_object('approverIds',ids,'approvalTemplateStages',result->'stages');
 END IF;
 generation:=('x'||substr(md5(jsonb_build_object('value',result,'defaultRevision',defaults->'revision','mode',mode)::text),1,12))::bit(48)::bigint;
 RETURN result||jsonb_build_object('revision',CASE WHEN force_default THEN (defaults->>'revision')::bigint ELSE generation END,'source','SYSTEM','defaultRevision',defaults->'revision');
END $$;
CREATE OR REPLACE FUNCTION baro_approval_no_line(policy jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(policy->>'exemptionReason'='NO_APPROVAL_REQUIRED' AND policy->>'noApprovalRequired'='true' AND
 (policy->'config'->>'approvalRequired'='false' OR policy->'config'->'stages'='[]'::jsonb OR policy->'config'->'registrationStages'='[]'::jsonb OR policy->'config'->'approverIds'='[]'::jsonb OR
 jsonb_array_length(coalesce(policy->'ruleIds','[]'))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(policy->'ruleIds') id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'config'->'rules') rule WHERE rule->>'id'=id AND rule->'stages'='[]'::jsonb))),false)
$$;
-- One bounded, non-destructive bootstrap. Company IDs are the previously verified
-- source/target FKs; the source name is an additional sanity check, never a merge key.
DO $bootstrap$
DECLARE menu text; operation text; company integer; raw jsonb; expense jsonb; senior integer; source_exists boolean; BEGIN
 SELECT EXISTS(SELECT 1 FROM "Organization" WHERE id=1 AND "isActive" AND type::text='MANUFACTURER' AND upper(name) LIKE 'BARO%') INTO source_exists;
 IF NOT source_exists OR EXISTS(SELECT 1 FROM "SystemSetting" WHERE key='APPROVAL_DEFAULT_BOOTSTRAP:v1') THEN RETURN; END IF;
 PERFORM id FROM "Organization" WHERE id IN (1,1845) ORDER BY id FOR UPDATE;
 SELECT value INTO expense FROM "SystemSetting" WHERE key='EXPENSE_APPROVAL_POLICY:1';
 expense:=coalesce(expense,'{"limits":{"VND":{"senior":"20000000","lead":"100000000"},"USD":{"senior":"1000","lead":"5000"},"KRW":{"senior":"1000000","lead":"5000000"}}}'::jsonb);
 FOR menu,operation IN SELECT * FROM (VALUES ('EXPENSE','CREATE'),('EXPENSE','UPDATE'),('EXPENSE','DELETE'),('BANK_LEDGER','CREATE'),('BANK_LEDGER','UPDATE'),('BANK_LEDGER','DELETE'),('INVOICE','DELETE'),('WORK_TIME','CREATE'),('INVENTORY','CREATE'),('INVENTORY','DELETE')) pairs LOOP
  SELECT value INTO raw FROM "SystemSetting" WHERE key=baro_approval_local_key(1,menu,operation);
  IF raw IS NULL THEN
   IF menu='INVENTORY' THEN raw:='{"version":2,"drafterRoles":["ADMIN","OPERATOR","ACCOUNTANT"],"stages":[]}';
   ELSIF menu='WORK_TIME' THEN raw:='{"drafterRoles":["ADMIN","OPERATOR","ACCOUNTANT","WORKER"],"proxyRoles":["ADMIN","OPERATOR"],"approverIds":[]}';
   ELSIF menu='BANK_LEDGER' AND operation='CREATE' THEN
    SELECT id INTO senior FROM "EmployeeGrade" WHERE "orgId"=1 AND "isActive" AND (id=(expense->>'seniorGradeId')::integer OR expense->>'seniorGradeId' IS NULL AND code='CL2') ORDER BY id LIMIT 1;
    raw:=jsonb_build_object('drafterScope',jsonb_build_object('role','ALL','gradeId',null),'registrationStages',jsonb_build_array(jsonb_build_object('role','ACCOUNTANT','gradeId',null,'gradeMatch','ANY'),jsonb_build_object('role','ACCOUNTANT','gradeId',senior,'gradeMatch','MINIMUM')));
   ELSE raw:=expense; END IF;
  END IF;
  INSERT INTO "SystemSetting"(key,value,"updatedAt") VALUES('APPROVAL_DEFAULT:'||menu||':'||operation,jsonb_build_object('revision',1,'sourceOrgId',1,'policy',baro_approval_portable(raw,1)),now()) ON CONFLICT(key) DO NOTHING;
  FOREACH company IN ARRAY ARRAY[1,1845] LOOP
   IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=company AND "isActive" AND type::text IN ('MANUFACTURER','SERVICE')) THEN CONTINUE; END IF;
   INSERT INTO "SystemSetting"(key,value,"updatedAt") SELECT 'APPROVAL_DEFAULT_BOOTSTRAP:v1:LOCAL:'||menu||':'||operation||':'||company,value,now() FROM "SystemSetting" WHERE key=baro_approval_local_key(company,menu,operation) ON CONFLICT(key) DO NOTHING;
   INSERT INTO "SystemSetting"(key,value,"updatedAt") VALUES('APPROVAL_MODE:'||menu||':'||operation||':'||company,'{"mode":"DEFAULT","revision":1}',now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,"updatedAt"=now();
  END LOOP;
 END LOOP;
 INSERT INTO "SystemSetting"(key,value,"updatedAt") VALUES('APPROVAL_DEFAULT_BOOTSTRAP:v1','{"sourceOrgId":1,"targetOrgIds":[1,1845],"originalsPreserved":true}',now());
END $bootstrap$;

CREATE OR REPLACE FUNCTION baro_approval_snapshot_matches(company integer,menu text,operation text,config jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT config IS NOT DISTINCT FROM coalesce(baro_approval_effective(company,menu,operation),
  CASE WHEN menu='INVENTORY' THEN '{"version":2,"revision":0,"drafterRoles":["ADMIN","OPERATOR","ACCOUNTANT"],"stages":[]}'::jsonb
  WHEN menu IN ('EXPENSE','BANK_LEDGER','INVOICE') THEN (SELECT value||'{"revision":0}'::jsonb FROM "SystemSetting" WHERE key='EXPENSE_APPROVAL_POLICY:'||company) END)
$$;
-- Preserve all existing guarded branches. Extend only explicit zero-line policies;
-- an unavailable configured approver is never treated as an empty policy.
DO $guards$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('baro_inventory_approval_guard()'::regprocedure);
 definition:=replace(definition,'(SELECT value FROM "SystemSetting" WHERE key=''APPROVAL_POLICY:INVENTORY:''||NEW.operation||'':''||NEW."orgId")','baro_approval_effective(NEW."orgId",''INVENTORY'',NEW.operation)');
 definition:=replace(definition,'IF jsonb_typeof(NEW.policy->''approverIds'')',
 'IF baro_approval_no_line(NEW.policy) THEN
   IF NOT baro_approval_snapshot_matches(NEW."orgId",''INVENTORY'',NEW.operation,NEW.policy->''config'') OR NEW.policy->''approverIds''<>''[]''::jsonb OR NEW.policy->''resolvedStages''<>''[]''::jsonb OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status=''ACTIVE'' AND NEW.policy->''config''->''drafterRoles'' ? "orgRole"::text) THEN RAISE EXCEPTION ''inventory no-approval policy mismatch''; END IF;
  ELSE IF jsonb_typeof(NEW.policy->''approverIds'')');
 definition:=replace(definition,'THEN RAISE EXCEPTION ''inventory policy changed''; END IF;','THEN RAISE EXCEPTION ''inventory policy changed''; END IF; END IF;');
 definition:=replace(definition,'IF NEW.status<>''CANCELLED'' AND NOT EXISTS','IF baro_approval_no_line(NEW.policy) AND actor IS DISTINCT FROM NEW."drafterId" THEN RAISE EXCEPTION ''inventory actor required''; END IF;
  IF NEW.status<>''CANCELLED'' AND NOT baro_approval_no_line(NEW.policy) AND NOT EXISTS');
 definition:=replace(definition,'IF NEW.status=''APPROVED'' AND (NOT EXISTS','IF NEW.status=''APPROVED'' AND NOT baro_approval_no_line(NEW.policy) AND (NOT EXISTS');
 EXECUTE definition;
 definition:=pg_get_functiondef('baro_inventory_approval_consistency()'::regprocedure);
 definition:=replace(definition,'IF r.status=''PENDING'' AND (','IF r.status=''PENDING'' AND baro_approval_no_line(r.policy) THEN RAISE EXCEPTION ''inventory immediate policy unapplied''; END IF;
 IF r.status=''PENDING'' AND (');EXECUTE definition;

 definition:=pg_get_functiondef('baro_work_time_guard()'::regprocedure);
 definition:=replace(definition,'NEW.status<>''PENDING'' OR NEW.revision<>0 OR NEW."approvedMinutes" IS NOT NULL OR NEW."decidedAt" IS NOT NULL',
 '(NEW.status<>''PENDING'' OR NEW.revision<>0 OR NEW."approvedMinutes" IS NOT NULL OR NEW."decidedAt" IS NOT NULL) AND NOT (NEW.status=''APPROVED'' AND NEW.revision=0 AND NEW."approvedMinutes" IS NOT DISTINCT FROM NEW."requestedMinutes" AND NEW."decidedAt" IS NOT NULL AND NEW.policy->>''noApprovalRequired''=''true'' AND NEW.policy->''approverIds''=''[]''::jsonb AND (NEW.policy - ARRAY[''noApprovalRequired'',''drafterRole'',''calendarSnapshot'',''requestedDays'']) IS NOT DISTINCT FROM coalesce(baro_approval_effective(NEW."orgId",''WORK_TIME'',''CREATE''),''{"revision":0,"drafterRoles":["ADMIN","OPERATOR","ACCOUNTANT","WORKER"],"proxyRoles":["ADMIN","OPERATOR"],"approverIds":[]}''::jsonb) AND NEW.policy->''approverIds''=''[]''::jsonb)');
 definition:=replace(definition,'IF NOT FOUND OR r.status<>''PENDING'' THEN','IF NOT FOUND OR (r.status<>''PENDING'' AND NOT (TG_TABLE_NAME=''WorkTimeDay'' AND r.status=''APPROVED'' AND r.policy->>''noApprovalRequired''=''true'' AND r.policy->''approverIds''=''[]''::jsonb AND a=r."drafterId")) THEN');
 EXECUTE definition;
 definition:=pg_get_functiondef('baro_work_time_consistency()'::regprocedure);
 definition:=replace(definition,'IF steps=0 OR','IF (steps=0 AND NOT (r.status IN (''APPROVED'',''CANCELLED'') AND r.policy->>''noApprovalRequired''=''true'' AND r.policy->''approverIds''=''[]''::jsonb)) OR');EXECUTE definition;

 definition:=pg_get_functiondef('baro_change_request_guard()'::regprocedure);
 definition:=replace(definition,'jsonb_array_length(NEW.policy->''resolvedStages'')=0','(jsonb_array_length(NEW.policy->''resolvedStages'')=0 AND NOT baro_approval_no_line(NEW.policy))');
 definition:=replace(definition,'IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy->''resolvedStages'')',
 'IF baro_approval_no_line(NEW.policy) AND NOT baro_approval_snapshot_matches(NEW."orgId",NEW.menu,NEW.operation,NEW.policy->''config'') THEN RAISE EXCEPTION ''CHANGE_INVALID_REQUEST''; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.policy->''resolvedStages'')');
 definition:=replace(definition,'IF OLD.status=''APPROVED'' AND NEW.status=''APPROVED''',
 'IF OLD.status=''PENDING'' AND NEW.status=''APPROVED'' AND baro_approval_no_line(OLD.policy) AND NEW."decidedByEmployeeId"=OLD."requestedByEmployeeId" AND EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."decidedByEmployeeId" AND "orgId"=NEW."orgId" AND status=''ACTIVE'' AND "orgRole"::text=NEW.policy->>''requestedByRole'') THEN RETURN NEW; END IF;
  IF OLD.status=''APPROVED'' AND NEW.status=''APPROVED''');EXECUTE definition;
 definition:=pg_get_functiondef('baro_change_applied_guard()'::regprocedure);
 definition:=replace(definition,'IF r.status=''APPROVED'' THEN','IF r.status=''PENDING'' AND baro_approval_no_line(r.policy) THEN RAISE EXCEPTION ''CHANGE_NOT_APPLIED''; END IF;
 IF r.status=''APPROVED'' THEN');EXECUTE definition;
END $guards$;
