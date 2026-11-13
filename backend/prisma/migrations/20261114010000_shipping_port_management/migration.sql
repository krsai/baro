-- SYSTEM state management of the existing public catalogue. Keep all source
-- records, existing selections, issued snapshots and history. No bulk disabling.
ALTER TABLE "ShippingPort" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShippingPort" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShippingPort" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ShippingPort" ADD COLUMN IF NOT EXISTS "updatedBySystemUserId" INTEGER;
ALTER TABLE "ShippingPort" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPort_system_actor_fkey') THEN ALTER TABLE "ShippingPort" ADD CONSTRAINT "ShippingPort_system_actor_fkey" FOREIGN KEY("updatedBySystemUserId") REFERENCES "SystemUser"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPort_state_check') THEN ALTER TABLE "ShippingPort" ADD CONSTRAINT "ShippingPort_state_check" CHECK (version>0 AND ("deletedAt" IS NULL OR NOT "isActive")); END IF;
END $$;
CREATE INDEX IF NOT EXISTS "ShippingPort_active_country_idx" ON "ShippingPort"("isActive",country,code) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "FreightJob_origin_port_idx" ON "FreightJob"("originPortCode") WHERE "originPortCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "FreightJob_destination_port_idx" ON "FreightJob"("destinationPortCode") WHERE "destinationPortCode" IS NOT NULL;
CREATE TABLE IF NOT EXISTS "ShippingPortChange" (
 "clientKey" TEXT PRIMARY KEY, "requestHash" TEXT NOT NULL, code TEXT NOT NULL,
 version INTEGER NOT NULL, "actorId" INTEGER NOT NULL, action TEXT NOT NULL,
 "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ShippingPortChange_port_fkey" FOREIGN KEY(code) REFERENCES "ShippingPort"(code) ON DELETE RESTRICT,
 CONSTRAINT "ShippingPortChange_actor_fkey" FOREIGN KEY("actorId") REFERENCES "SystemUser"(id) ON DELETE RESTRICT,
 CONSTRAINT "ShippingPortChange_action_check" CHECK (action IN ('ACTIVATE','DEACTIVATE','DELETE','RESTORE')),
 CONSTRAINT "ShippingPortChange_code_version_key" UNIQUE(code,version)
);
-- Ensure FKs also exist when starting from a generated empty Prisma schema.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPortChange_port_fkey') THEN ALTER TABLE "ShippingPortChange" ADD CONSTRAINT "ShippingPortChange_port_fkey" FOREIGN KEY(code) REFERENCES "ShippingPort"(code) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPortChange_actor_fkey') THEN ALTER TABLE "ShippingPortChange" ADD CONSTRAINT "ShippingPortChange_actor_fkey" FOREIGN KEY("actorId") REFERENCES "SystemUser"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingPortChange_action_check') THEN ALTER TABLE "ShippingPortChange" ADD CONSTRAINT "ShippingPortChange_action_check" CHECK (action IN ('ACTIVATE','DEACTIVATE','DELETE','RESTORE')); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_shipping_port_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_PORT_HISTORY_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-ARRAY['isActive','version','deletedAt','updatedBySystemUserId','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['isActive','version','deletedAt','updatedBySystemUserId','updatedAt']) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'SHIPPING_PORT_CHANGED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "SystemUser" WHERE id=NEW."updatedBySystemUserId" AND "systemRole"::text='SYSTEM_ADMIN') THEN RAISE EXCEPTION 'SYSTEM_ADMIN_REQUIRED'; END IF;
 IF NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightJob" WHERE "originPortCode"=NEW.code OR "destinationPortCode"=NEW.code) THEN RAISE EXCEPTION 'SHIPPING_PORT_IN_USE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPort_state_guard" ON "ShippingPort";
CREATE TRIGGER "ShippingPort_state_guard" BEFORE UPDATE OR DELETE ON "ShippingPort" FOR EACH ROW EXECUTE FUNCTION baro_shipping_port_state_guard();
CREATE OR REPLACE FUNCTION baro_shipping_port_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_PORT_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "SystemUser" WHERE id=NEW."actorId" AND "systemRole"::text='SYSTEM_ADMIN') OR NOT EXISTS(SELECT 1 FROM "ShippingPort" WHERE code=NEW.code AND version=NEW.version AND "updatedBySystemUserId"=NEW."actorId") THEN RAISE EXCEPTION 'SYSTEM_ADMIN_REQUIRED'; END IF;
 IF NEW."before"->>'code' IS DISTINCT FROM NEW.code OR NEW."after"->>'code' IS DISTINCT FROM NEW.code OR (NEW."before"->>'version')::int IS DISTINCT FROM NEW.version-1 OR (NEW."after"->>'version')::int IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'SHIPPING_PORT_CHANGED'; END IF;
 IF NEW.action='ACTIVATE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'true'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NOT NULL)
 OR NEW.action='DEACTIVATE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'false'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NOT NULL)
 OR NEW.action='DELETE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'false'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NULL)
 OR NEW.action='RESTORE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'false'::jsonb OR NEW."before"->>'deletedAt' IS NULL OR NEW."after"->>'deletedAt' IS NOT NULL) THEN RAISE EXCEPTION 'SHIPPING_PORT_CHANGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPortChange_guard" ON "ShippingPortChange";
CREATE TRIGGER "ShippingPortChange_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingPortChange" FOR EACH ROW EXECUTE FUNCTION baro_shipping_port_change_guard();
CREATE OR REPLACE FUNCTION baro_shipping_port_state_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "ShippingPortChange" WHERE code=NEW.code AND version=NEW.version AND "actorId"=NEW."updatedBySystemUserId" AND "before"->'isActive'=to_jsonb(OLD."isActive") AND ("before"->>'deletedAt' IS NULL)=(OLD."deletedAt" IS NULL) AND "after"->'isActive'=to_jsonb(NEW."isActive") AND ("after"->>'deletedAt' IS NULL)=(NEW."deletedAt" IS NULL)) THEN RAISE EXCEPTION 'SHIPPING_PORT_AUDIT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ShippingPort_state_audit" ON "ShippingPort";
CREATE CONSTRAINT TRIGGER "ShippingPort_state_audit" AFTER UPDATE ON "ShippingPort" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_shipping_port_state_audit();

-- Existing inactive selections remain valid when editing their original job.
-- New selections must be active, even through a raw SQL write. Lock the public
-- master while selecting to serialize with SYSTEM state changes.
CREATE OR REPLACE FUNCTION baro_shipping_port_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE port_code TEXT; old_code TEXT; field TEXT; active_port BOOLEAN;
BEGIN
 NEW."originPortCode":=NULLIF(NEW.data->>'originPortCode','');
 NEW."destinationPortCode":=NULLIF(NEW.data->>'destinationPortCode','');
 IF (NEW."originPortCode" IS NOT NULL OR NEW."destinationPortCode" IS NOT NULL) AND NEW.mode<>'SEA' THEN RAISE EXCEPTION 'SHIPPING_PORT_MODE'; END IF;
 FOREACH field IN ARRAY ARRAY['originPortCode','destinationPortCode'] LOOP
  port_code:=to_jsonb(NEW)->>field;
  IF port_code IS NULL THEN CONTINUE; END IF;
  old_code:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
  SELECT "isActive" AND "deletedAt" IS NULL INTO active_port FROM "ShippingPort" WHERE code=port_code FOR SHARE;
  IF active_port IS DISTINCT FROM true AND port_code IS DISTINCT FROM old_code THEN RAISE EXCEPTION 'SHIPPING_PORT_UNAVAILABLE'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
-- Rollback: use a compatible app deployment; retain catalogue state, restrictive
-- FKs and immutable change receipts. Never re-enable ports or rewrite jobs.
