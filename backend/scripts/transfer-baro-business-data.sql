-- The current n:1 installation explicitly uses BARO GARMENT as data owner.
-- Archive duplicate unused customer defaults; retain every process/ST row and ID.
CREATE TABLE IF NOT EXISTS "ManufacturerDataArchive" (
  key TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "sourceTable" TEXT NOT NULL,
  "sourceId" INTEGER NOT NULL, "sourceOrgId" INTEGER NOT NULL, row JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "StyleProcess" ADD COLUMN IF NOT EXISTS "sourceOrgId" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "StyleProcess_styleId_orgId_processCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "StyleProcess_styleId_orgId_processCode_sourceOrgId_key"
ON "StyleProcess"("styleId","orgId","processCode","sourceOrgId");

DO $$
DECLARE target INTEGER; r RECORD; table_name TEXT; scope_column TEXT; has_remaining BOOLEAN;
BEGIN
  SELECT id INTO target FROM "Organization" WHERE name='BARO GARMENT' AND type::text='MANUFACTURER';
  IF target IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM "DataOwnershipTransfer" WHERE key='baro-business-v1:complete') THEN RETURN; END IF;
  IF (SELECT COUNT(*) FROM "Organization" WHERE type::text='MANUFACTURER')<>1 THEN
    RAISE EXCEPTION 'OWNERSHIP_BARO_SCOPE: n:1 transfer requires exactly one manufacturer';
  END IF;
  -- Serialize all impacted tables before checking references or saving originals.
  LOCK TABLE "StyleProcess","StyleProcessStandard","AssignmentCard","AssignmentPlan",
    "WorkRecord","OutsourcedWorkRecord","AtTrainingBucketProcess","StyleProcessAtObservation",
    "StyleProcessVersion","AttrCategory","AttrRole","Employee","EmployeeGrade","EmployeeGradeSet",
    "SalaryItemRate","EmployeeCompensationPolicy","QuantityBucketSet","QuantityBucketSetVersion",
    "QuantityBucketEntry","OutsourcingServiceType","OrganizationOutsourcingServiceType"
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "AssignmentPlan" p JOIN "AssignmentCard" c ON c.id=p."assignmentCardId" WHERE c."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "Employee" WHERE "orgId"<>target)
    OR EXISTS (SELECT 1 FROM "SalaryItemRate" WHERE "orgId"<>target)
    OR EXISTS (SELECT 1 FROM "EmployeeCompensationPolicy" WHERE "orgId"<>target)
    OR EXISTS (SELECT 1 FROM "OrganizationOutsourcingServiceType" WHERE "ownerOrgId"<>target) THEN
    RAISE EXCEPTION 'OWNERSHIP_REFERENCED_DEFAULTS: customer defaults have live references';
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkRecord" w JOIN "StyleProcess" p ON p.id=w."styleProcessId" WHERE p."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "OutsourcedWorkRecord" w JOIN "StyleProcess" p ON p.id=w."styleProcessId" WHERE p."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "AtTrainingBucketProcess" w JOIN "StyleProcess" p ON p.id=w."styleProcessId" WHERE p."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "StyleProcessAtObservation" w JOIN "StyleProcess" p ON p.id=w."styleProcessId" WHERE p."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "AssignmentPlan" a CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a."assignmentCtSnapshot"->'processes','[]')) p
      JOIN "StyleProcess" s ON s.id::text=p->>'styleProcessId' WHERE s."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "AssignmentPlan" a CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a."assignmentStSnapshot"->'processes','[]')) p
      JOIN "StyleProcess" s ON s.id::text=p->>'styleProcessId' WHERE s."orgId"<>target)
    OR EXISTS (SELECT 1 FROM "StyleProcessVersion" v CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v."processSnapshot")='array' THEN v."processSnapshot" ELSE '[]'::jsonb END) p
      JOIN "StyleProcess" s ON s.id::text=COALESCE(p->>'styleProcessId',p->>'id') WHERE s."orgId"<>target) THEN
    RAISE EXCEPTION 'OWNERSHIP_REFERENCED_PROCESS: legacy process has production references';
  END IF;
  -- Exact original row JSON is durable even for unused duplicate catalog rows.
  FOREACH table_name IN ARRAY ARRAY['StyleProcess','StyleProcessStandard','AssignmentCard','AttrCategory','AttrRole',
    'EmployeeGrade','EmployeeGradeSet','QuantityBucketSet','QuantityBucketSetVersion','QuantityBucketEntry','OutsourcingServiceType'] LOOP
    scope_column:=CASE WHEN table_name='OutsourcingServiceType' THEN 'ownerOrgId' ELSE 'orgId' END;
    EXECUTE format('INSERT INTO "ManufacturerDataArchive" (key,"orgId","sourceTable","sourceId","sourceOrgId",row)
      SELECT %L||id,%L,%L,id,%I,to_jsonb(t) FROM %I t WHERE %I<>%L ON CONFLICT (key) DO NOTHING',
      'baro-v1:'||table_name||':',target,table_name,scope_column,table_name,scope_column,target);
  END LOOP;
  -- Customer copies were never current manufacturer production processes.
  -- Preserve their IDs and standards in an inactive historical namespace.
  UPDATE "StyleProcess" SET "sourceOrgId"="orgId","orgId"=target,"isActive"=false WHERE "orgId"<>target;
  -- Composite FK ON UPDATE CASCADE transfers each legacy standard with its process.
  UPDATE "StyleProcessStandard" SET "orgId"=target WHERE "orgId"<>target;
  UPDATE "QuantityBucketSet" SET name='LEGACY_ORG_'||"orgId"||'_'||name,"orgId"=target WHERE "orgId"<>target;
  UPDATE "QuantityBucketSetVersion" SET "orgId"=target WHERE "orgId"<>target;
  UPDATE "QuantityBucketEntry" SET "orgId"=target WHERE "orgId"<>target;
  -- Only unused duplicate views/defaults are removed, after the reference audit.
  DELETE FROM "AssignmentCard" WHERE "orgId"<>target;
  FOREACH table_name IN ARRAY ARRAY['AttrCategory','AttrRole','OutsourcingServiceType'] LOOP
    scope_column:=CASE WHEN table_name='OutsourcingServiceType' THEN 'ownerOrgId' ELSE 'orgId' END;
    EXECUTE format('DELETE FROM %I old USING %I current WHERE old.%I<>%L AND current.%I=%L AND old.code=current.code',
      table_name,table_name,scope_column,target,scope_column,target);
    EXECUTE format('UPDATE %I SET %I=%L WHERE %I<>%L',table_name,scope_column,target,scope_column,target);
  END LOOP;
  -- Preserve custom grade catalogs by refusing an incomplete merge rather than
  -- inventing a mapping; current duplicate CL defaults map by their stable code.
  IF EXISTS (SELECT 1 FROM "EmployeeGrade" old WHERE old."orgId"<>target
    AND NOT EXISTS (SELECT 1 FROM "EmployeeGrade" current WHERE current."orgId"=target AND current.code=old.code)) THEN
    RAISE EXCEPTION 'OWNERSHIP_CUSTOM_GRADES: custom grade mapping required';
  END IF;
  DELETE FROM "EmployeeGrade" WHERE "orgId"<>target;
  DELETE FROM "EmployeeGradeSet" WHERE "orgId"<>target;
  -- Every business scope must now be BARO. Subscription.orgId identifies the
  -- subscribing company, just as buyer/customer IDs identify counterparties.
  FOR r IN SELECT c.table_name AS name FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.column_name='orgId' AND c.table_name<>'OrganizationSubscription' LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "orgId"<>$1)',r.name) INTO STRICT has_remaining USING target;
    IF has_remaining THEN RAISE EXCEPTION 'OWNERSHIP_REMAINING_SCOPE: %',r.name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM "ManufacturerDataArchive" a JOIN "StyleProcess" p ON p.id=a."sourceId"
    WHERE a."sourceTable"='StyleProcess' AND (a.row-ARRAY['orgId','sourceOrgId','isActive'])
      IS DISTINCT FROM (to_jsonb(p)-ARRAY['orgId','sourceOrgId','isActive']))
    OR EXISTS (SELECT 1 FROM "ManufacturerDataArchive" a JOIN "StyleProcessStandard" s ON s.id=a."sourceId"
    WHERE a."sourceTable"='StyleProcessStandard' AND (a.row-'orgId') IS DISTINCT FROM (to_jsonb(s)-'orgId')) THEN
    RAISE EXCEPTION 'OWNERSHIP_PROCESS_VALUES_CHANGED: historical values were not preserved';
  END IF;
  INSERT INTO "DataOwnershipTransfer" (key,"entityType","entityId","previousOwnerOrgId","ownerOrgId")
    VALUES ('baro-business-v1:complete','BusinessScope',target,target,target);
END $$;
