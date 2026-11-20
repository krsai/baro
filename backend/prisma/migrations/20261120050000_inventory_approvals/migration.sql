-- Keep existing movements effective. Only new submissions start pending.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_state_check' AND conrelid='"InventoryMovement"'::regclass) THEN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_state_check" CHECK (status IN ('PENDING','APPROVED','REJECTED') AND revision>0);
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_scope_key" ON "InventoryMovement"("orgId",id);
CREATE TABLE IF NOT EXISTS "InventoryApprovalRequest" (
 id text PRIMARY KEY,
 "orgId" integer NOT NULL REFERENCES "Organization"(id),
 "movementId" text,
 operation text NOT NULL CHECK (operation IN ('CREATE','DELETE')),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 "targetRevision" integer NOT NULL,
 "drafterId" integer NOT NULL,
 "clientKey" text NOT NULL,
 "requestHash" text NOT NULL,
 policy jsonb NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryApprovalRequest_movement_scope" FOREIGN KEY ("orgId","movementId") REFERENCES "InventoryMovement"("orgId",id) ON DELETE SET NULL ("movementId"),
 CONSTRAINT "InventoryApprovalRequest_drafter_scope" FOREIGN KEY ("drafterId","orgId") REFERENCES "Employee"(id,"orgId"),
 UNIQUE ("orgId",id), UNIQUE ("orgId","clientKey")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryApprovalRequest_pending_key" ON "InventoryApprovalRequest"("orgId","movementId",operation) WHERE status='PENDING';
CREATE TABLE IF NOT EXISTS "InventoryApprovalStep" (
 "requestId" text NOT NULL,
 "orgId" integer NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 0 AND 9),
 "employeeId" integer NOT NULL,
 "employeeName" text NOT NULL,
 decision text CHECK (decision IN ('APPROVED','REJECTED')),
 "decidedAt" timestamptz,
 PRIMARY KEY ("requestId",position), UNIQUE ("requestId","employeeId"),
 CONSTRAINT "InventoryApprovalStep_request_scope" FOREIGN KEY ("orgId","requestId") REFERENCES "InventoryApprovalRequest"("orgId",id),
 CONSTRAINT "InventoryApprovalStep_employee_scope" FOREIGN KEY ("employeeId","orgId") REFERENCES "Employee"(id,"orgId"),
 CHECK ((decision IS NULL)=("decidedAt" IS NULL))
);
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
   IF r.status<>'PENDING' OR r."drafterId" IS DISTINCT FROM actor OR NEW.decision IS NOT NULL OR NEW."employeeId"=r."drafterId" OR NEW."employeeId" IS DISTINCT FROM (r.policy->'approverIds'->>NEW.position)::integer THEN RAISE EXCEPTION 'invalid inventory stage'; END IF;
  ELSE
   IF r.operation='CREATE' AND EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=r."movementId" AND operation='DELETE' AND status='PENDING') THEN RAISE EXCEPTION 'inventory deletion pending'; END IF;
   IF r.status<>'PENDING' OR OLD.decision IS NOT NULL OR NEW.decision IS NULL OR NEW."employeeId" IS DISTINCT FROM actor OR (to_jsonb(NEW)-'decision'-'decidedAt') IS DISTINCT FROM (to_jsonb(OLD)-'decision'-'decidedAt') OR EXISTS(SELECT 1 FROM "InventoryApprovalStep" WHERE "requestId"=r.id AND position<NEW.position AND decision IS DISTINCT FROM 'APPROVED') THEN RAISE EXCEPTION 'invalid inventory decision'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."employeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'inactive inventory approver'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'inventory approval evidence is immutable'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.revision<>1 OR NEW."drafterId" IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM "InventoryMovement" WHERE id=NEW."movementId" AND "orgId"=NEW."orgId" AND revision=NEW."targetRevision") THEN RAISE EXCEPTION 'invalid inventory request'; END IF;
  IF jsonb_typeof(NEW.policy->'approverIds') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.policy->'approverIds') NOT BETWEEN 1 AND 10
   OR NEW.policy IS DISTINCT FROM (SELECT value FROM "SystemSetting" WHERE key='APPROVAL_POLICY:INVENTORY:'||NEW.operation||':'||NEW."orgId")
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
DROP TRIGGER IF EXISTS "InventoryMovement_approval_guard" ON "InventoryMovement";
CREATE TRIGGER "InventoryMovement_approval_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_guard();
DROP TRIGGER IF EXISTS "InventoryApprovalRequest_guard" ON "InventoryApprovalRequest";
CREATE TRIGGER "InventoryApprovalRequest_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryApprovalRequest" FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_guard();
DROP TRIGGER IF EXISTS "InventoryApprovalStep_guard" ON "InventoryApprovalStep";
CREATE TRIGGER "InventoryApprovalStep_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryApprovalStep" FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_guard();
CREATE OR REPLACE FUNCTION baro_inventory_approval_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid text; r "InventoryApprovalRequest"; BEGIN
 IF TG_TABLE_NAME='InventoryMovement' THEN
  IF EXISTS(SELECT 1 FROM "InventoryMovement" m WHERE m.id=NEW.id AND m.status='PENDING' AND NOT EXISTS(SELECT 1 FROM "InventoryApprovalRequest" WHERE "movementId"=m.id AND operation='CREATE' AND status='PENDING')) THEN RAISE EXCEPTION 'inventory request missing'; END IF;
  RETURN NULL;
 END IF;
 rid:=coalesce(to_jsonb(NEW)->>'requestId',to_jsonb(NEW)->>'id');
 SELECT * INTO r FROM "InventoryApprovalRequest" WHERE id=rid;
 IF r.status='PENDING' AND (r."movementId" IS NULL OR (SELECT count(*) FROM "InventoryApprovalStep" WHERE "requestId"=rid)<>jsonb_array_length(r.policy->'approverIds')) THEN RAISE EXCEPTION 'inventory approval steps missing'; END IF;
 IF r.status='APPROVED' AND r.operation='CREATE' AND EXISTS(SELECT 1 FROM "InventoryMovement" WHERE id=r."movementId" AND status<>'APPROVED') THEN RAISE EXCEPTION 'inventory approval unapplied'; END IF;
 IF r.status='APPROVED' AND r.operation='DELETE' AND r."movementId" IS NOT NULL THEN RAISE EXCEPTION 'inventory deletion unapplied'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "InventoryMovement_approval_consistency" ON "InventoryMovement";
CREATE CONSTRAINT TRIGGER "InventoryMovement_approval_consistency" AFTER INSERT OR UPDATE ON "InventoryMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_consistency();
DROP TRIGGER IF EXISTS "InventoryApprovalRequest_consistency" ON "InventoryApprovalRequest";
CREATE CONSTRAINT TRIGGER "InventoryApprovalRequest_consistency" AFTER INSERT OR UPDATE ON "InventoryApprovalRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_consistency();
DROP TRIGGER IF EXISTS "InventoryApprovalStep_consistency" ON "InventoryApprovalStep";
CREATE CONSTRAINT TRIGGER "InventoryApprovalStep_consistency" AFTER INSERT OR UPDATE ON "InventoryApprovalStep" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_inventory_approval_consistency();
