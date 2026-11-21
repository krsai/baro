-- Requests never create a selectable material until final approval.
CREATE TABLE IF NOT EXISTS "MaterialRegistrationRequest" (
 id text PRIMARY KEY,
 "orgId" integer NOT NULL REFERENCES "Organization"(id),
 "baseId" integer NOT NULL REFERENCES "TransactionCodeBase"(id),
 "drafterId" integer NOT NULL,
 "requestHash" text NOT NULL,
 payload jsonb NOT NULL,
 policy jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 "resultVariantId" text,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("orgId",id),
 CONSTRAINT "MaterialRegistrationRequest_drafter_scope" FOREIGN KEY ("drafterId","orgId") REFERENCES "Employee"(id,"orgId"),
 CONSTRAINT "MaterialRegistrationRequest_result_scope" FOREIGN KEY ("resultVariantId","orgId") REFERENCES "InventoryVariant"(id,"orgId")
);
CREATE TABLE IF NOT EXISTS "MaterialRegistrationStep" (
 "requestId" text NOT NULL,
 "orgId" integer NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 0 AND 9),
 "employeeId" integer NOT NULL,
 stage jsonb NOT NULL,
 decision jsonb,
 "decidedAt" timestamptz,
 PRIMARY KEY ("requestId",position),
 CONSTRAINT "MaterialRegistrationStep_request_scope" FOREIGN KEY ("orgId","requestId") REFERENCES "MaterialRegistrationRequest"("orgId",id),
 CONSTRAINT "MaterialRegistrationStep_employee_scope" FOREIGN KEY ("employeeId","orgId") REFERENCES "Employee"(id,"orgId")
);
CREATE OR REPLACE FUNCTION baro_material_registration_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MATERIAL_REGISTRATION_AUDIT_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='MaterialRegistrationStep' THEN
  IF OLD.decision IS NOT NULL OR (to_jsonb(OLD)-'decision'-'decidedAt') IS DISTINCT FROM (to_jsonb(NEW)-'decision'-'decidedAt') OR NEW.decision IS NULL OR NEW."decidedAt" IS NULL THEN RAISE EXCEPTION 'MATERIAL_REGISTRATION_AUDIT_IMMUTABLE'; END IF;
 ELSE
  IF OLD.status<>'PENDING' OR NEW.revision<>OLD.revision+1 OR (to_jsonb(OLD)-'status'-'revision'-'resultVariantId') IS DISTINCT FROM (to_jsonb(NEW)-'status'-'revision'-'resultVariantId') THEN RAISE EXCEPTION 'MATERIAL_REGISTRATION_AUDIT_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "MaterialRegistrationRequest_audit_guard" ON "MaterialRegistrationRequest";
CREATE TRIGGER "MaterialRegistrationRequest_audit_guard" BEFORE UPDATE OR DELETE ON "MaterialRegistrationRequest" FOR EACH ROW EXECUTE FUNCTION baro_material_registration_audit_guard();
DROP TRIGGER IF EXISTS "MaterialRegistrationStep_audit_guard" ON "MaterialRegistrationStep";
CREATE TRIGGER "MaterialRegistrationStep_audit_guard" BEFORE UPDATE OR DELETE ON "MaterialRegistrationStep" FOR EACH ROW EXECUTE FUNCTION baro_material_registration_audit_guard();
CREATE OR REPLACE FUNCTION baro_material_registration_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "MaterialRegistrationRequest"%ROWTYPE;
BEGIN
 SELECT * INTO r FROM "MaterialRegistrationRequest" WHERE id=NEW.id;
 IF NOT EXISTS(SELECT 1 FROM "MaterialRegistrationStep" s WHERE s."requestId"=r.id) OR
  (r.status='APPROVED' AND (r."resultVariantId" IS NULL OR EXISTS(SELECT 1 FROM "MaterialRegistrationStep" s WHERE s."requestId"=r.id AND (s.decision IS NULL OR s.decision->>'action' NOT IN ('APPROVE','EXISTING'))) OR
   (SELECT stage->>'role' FROM "MaterialRegistrationStep" WHERE "requestId"=r.id ORDER BY position DESC LIMIT 1) IS DISTINCT FROM 'ADMIN' OR
   NOT EXISTS(SELECT 1 FROM "InventoryVariant" v WHERE v.id=r."resultVariantId" AND v."orgId"=r."orgId" AND v."baseId"=r."baseId"))) OR
  (r.status='REJECTED' AND NOT EXISTS(SELECT 1 FROM "MaterialRegistrationStep" s WHERE s."requestId"=r.id AND s.decision->>'action'='REJECT')) OR
  (r.status<>'APPROVED' AND r."resultVariantId" IS NOT NULL)
 THEN RAISE EXCEPTION 'MATERIAL_REGISTRATION_APPROVAL_MISMATCH'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "MaterialRegistrationRequest_complete_guard" ON "MaterialRegistrationRequest";
CREATE CONSTRAINT TRIGGER "MaterialRegistrationRequest_complete_guard" AFTER INSERT OR UPDATE ON "MaterialRegistrationRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_material_registration_complete_guard();
