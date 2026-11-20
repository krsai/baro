-- Additive policy support. Existing settings and submitted employee snapshots are retained.
CREATE OR REPLACE FUNCTION baro_inventory_stage_eligible(org_id integer,employee_id integer,stage jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "Employee" e LEFT JOIN "EmployeeGrade" own ON own.id=e."gradeId" AND own."orgId"=e."orgId" LEFT JOIN "EmployeeGradeSet" own_set ON own_set.id=own."setId" AND own_set."orgId"=e."orgId"
 WHERE e.id=employee_id AND e."orgId"=org_id AND e.status='ACTIVE' AND e."orgRole"::text=stage->>'role' AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT')
 AND CASE WHEN stage->>'gradeMatch'='ANY' THEN stage->>'gradeId' IS NULL
 ELSE own."isActive" AND own_set."isActive" AND EXISTS(SELECT 1 FROM "EmployeeGrade" required JOIN "EmployeeGradeSet" required_set ON required_set.id=required."setId" AND required_set."orgId"=required."orgId" WHERE required.id=(stage->>'gradeId')::integer AND required."orgId"=org_id AND required."isActive" AND required_set."isActive" AND required."setId"=own."setId" AND CASE WHEN stage->>'gradeMatch'='MINIMUM' THEN own."sortOrder">=required."sortOrder" ELSE own.id=required.id END) END)
$$;
CREATE OR REPLACE FUNCTION baro_inventory_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "InventoryApprovalRequest"; actor integer; BEGIN
 actor:=nullif(current_setting('baro.inventory_actor',true),'')::integer;
 IF TG_TABLE_NAME='InventoryMovement' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'PENDING' OR NEW.revision<>1 OR NEW."actorId" IS DISTINCT FROM actor THEN RAISE EXCEPTION 'inventory approval required'; END IF;
  ELSIF TG_OP='UPDATE' THEN
   IF (to_jsonb(NEW)-'status'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'revision') OR OLD.status<>'PENDING' OR NEW.status NOT IN ('APPROVED','REJECTED') OR NEW.revision<>OLD.revision+1
    OR NOT EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=OLD.id AND "orgId"=OLD."orgId" AND operation='CREATE' AND status=NEW.status)
   THEN RAISE EXCEPTION 'inventory movement approval mismatch'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=OLD.id AND "orgId"=OLD."orgId" AND operation='DELETE' AND status='APPROVED' AND "targetRevision"=OLD.revision)
   THEN RAISE EXCEPTION 'inventory deletion approval required'; END IF;
   RETURN OLD;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'inventory actor required'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='InventoryApprovalStep' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'inventory approval evidence is immutable'; END IF;
  SELECT * INTO r FROM "InventoryApprovalRequest" WHERE id=NEW."requestId" AND "orgId"=NEW."orgId";
  IF TG_OP='INSERT' THEN
   IF r.policy->'config'->>'version'='2' AND NOT EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=NEW."employeeId" AND e."orgId"=NEW."orgId" AND e.id=(r.policy->'resolvedStages'->NEW.position->>'employeeId')::integer AND e."orgRole"::text=r.policy->'resolvedStages'->NEW.position->>'role' AND e."gradeId" IS NOT DISTINCT FROM (r.policy->'resolvedStages'->NEW.position->>'gradeId')::integer) THEN RAISE EXCEPTION 'inventory resolved stage mismatch'; END IF;
   IF r.status<>'PENDING' OR r."drafterId" IS DISTINCT FROM actor OR NEW.decision IS NOT NULL OR NEW."employeeId"=r."drafterId" OR NEW."employeeId" IS DISTINCT FROM (r.policy->'approverIds'->>NEW.position)::integer THEN RAISE EXCEPTION 'invalid inventory stage'; END IF;
  ELSE
   IF r.operation='CREATE' AND EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=r."movementId" AND operation='DELETE' AND status='PENDING') THEN RAISE EXCEPTION 'inventory deletion pending'; END IF;
   IF r.status<>'PENDING' OR OLD.decision IS NOT NULL OR NEW.decision IS NULL OR NEW."employeeId" IS DISTINCT FROM actor OR (to_jsonb(NEW)-'decision'-'decidedAt') IS DISTINCT FROM (to_jsonb(OLD)-'decision'-'decidedAt') OR EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=r.id AND position<NEW.position AND decision IS DISTINCT FROM 'APPROVED') THEN RAISE EXCEPTION 'invalid inventory decision'; END IF;
  END IF;
  IF r.policy->'config'->>'version'='2' AND NOT baro_inventory_stage_eligible(NEW."orgId",NEW."employeeId",r.policy->'config'->'stages'->NEW.position) THEN RAISE EXCEPTION 'inventory approver role or grade changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."employeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'inactive inventory approver'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'inventory approval evidence is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.revision<>1 OR NEW."drafterId" IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM "InventoryMovement" WHERE id=NEW."movementId" AND "orgId"=NEW."orgId" AND revision=NEW."targetRevision") THEN RAISE EXCEPTION 'invalid inventory request'; END IF;
  IF jsonb_typeof(NEW.policy->'approverIds') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.policy->'approverIds') NOT BETWEEN 1 AND 10
   OR (CASE WHEN NEW.policy->'config'->>'version'='2' THEN
    NEW.policy->'config' IS DISTINCT FROM (SELECT value FROM "SystemSetting" WHERE key='APPROVAL_POLICY:INVENTORY:'||NEW.operation||':'||NEW."orgId")
    OR (NEW.policy-'config'-'approverIds'-'resolvedStages') IS DISTINCT FROM NEW.policy->'config'
    OR jsonb_array_length(NEW.policy->'approverIds')<>jsonb_array_length(NEW.policy->'config'->'stages')
   ELSE NEW.policy IS DISTINCT FROM (SELECT value FROM "SystemSetting" WHERE key='APPROVAL_POLICY:INVENTORY:'||NEW.operation||':'||NEW."orgId") END)
   OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status='ACTIVE' AND NEW.policy->'drafterRoles' ? "orgRole"::text)
  THEN RAISE EXCEPTION 'inventory policy changed'; END IF;
 ELSE
  -- FK nulling after an authorized physical delete retains only approval evidence.
  IF NEW."movementId" IS NULL AND OLD."movementId" IS NOT NULL AND (to_jsonb(NEW)-'movementId')=(to_jsonb(OLD)-'movementId') THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'status'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'revision') OR OLD.status<>'PENDING' OR NEW.status NOT IN ('PENDING','APPROVED','REJECTED','CANCELLED') OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'invalid inventory request change'; END IF;
  IF NEW.status<>'CANCELLED' AND NOT EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=NEW.id AND "employeeId"=actor AND decision IS NOT NULL) THEN RAISE EXCEPTION 'inventory decision actor required'; END IF;
  IF NEW.status='APPROVED' AND (NOT EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=NEW.id) OR EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=NEW.id AND decision IS DISTINCT FROM 'APPROVED')) THEN RAISE EXCEPTION 'inventory final approval missing'; END IF;
  IF NEW.status='REJECTED' AND NOT EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=NEW.id AND decision='REJECTED') THEN RAISE EXCEPTION 'inventory rejection missing'; END IF;
  IF NEW.status='CANCELLED' AND NOT EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=OLD."movementId" AND operation='DELETE' AND status='APPROVED') THEN RAISE EXCEPTION 'inventory cancellation requires deletion'; END IF;
 END IF;
 RETURN NEW;
END $$;
