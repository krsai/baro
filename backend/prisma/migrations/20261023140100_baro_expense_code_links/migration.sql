-- Explicit requested bootstrap data only. No runtime code-name conditions.
-- The tenant ID and identity guard must both match; other tenants stay NONE.
DO $$ DECLARE tenant INTEGER; base RECORD; event_id INTEGER; next_target TEXT;
BEGIN
 SELECT id INTO tenant FROM "Organization" WHERE id=1 AND type::text='MANUFACTURER' AND upper(name) IN ('BARO','BARO GARMENT');
 IF tenant IS NULL THEN RETURN; END IF;
 FOR base IN SELECT id,code FROM "TransactionCodeBase" WHERE code IN ('BTH','PRT') LOOP
  IF EXISTS(SELECT 1 FROM "ExpenseCodeLinkPolicy" WHERE "orgId"=tenant AND "baseId"=base.id) THEN CONTINUE; END IF;
  next_target:=CASE WHEN base.code='BTH' THEN 'PROCESS' ELSE 'NONE' END;
  INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId","previousTarget",target,source)
   VALUES(tenant,base.id,'NONE',next_target,'BARO_INITIAL') RETURNING id INTO event_id;
  INSERT INTO "ExpenseCodeLinkPolicy"("orgId","baseId",target,"auditId") VALUES(tenant,base.id,next_target,event_id);
 END LOOP;
END $$;
