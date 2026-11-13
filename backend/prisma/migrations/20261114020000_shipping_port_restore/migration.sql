-- Permit active and legacy inactive restores during rolling deployment.
CREATE OR REPLACE FUNCTION baro_shipping_port_change_guard_v2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_PORT_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "SystemUser" WHERE id=NEW."actorId" AND "systemRole"::text='SYSTEM_ADMIN') OR NOT EXISTS(SELECT 1 FROM "ShippingPort" WHERE code=NEW.code AND version=NEW.version AND "updatedBySystemUserId"=NEW."actorId") THEN RAISE EXCEPTION 'SYSTEM_ADMIN_REQUIRED'; END IF;
 IF NEW."before"->>'code' IS DISTINCT FROM NEW.code OR NEW."after"->>'code' IS DISTINCT FROM NEW.code OR (NEW."before"->>'version')::int IS DISTINCT FROM NEW.version-1 OR (NEW."after"->>'version')::int IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'SHIPPING_PORT_CHANGED'; END IF;
 IF NEW.action='ACTIVATE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'true'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NOT NULL)
 OR NEW.action='DEACTIVATE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'false'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NOT NULL)
 OR NEW.action='DELETE' AND (NEW."after"->'isActive' IS DISTINCT FROM 'false'::jsonb OR NEW."before"->>'deletedAt' IS NOT NULL OR NEW."after"->>'deletedAt' IS NULL)
 OR NEW.action='RESTORE' AND (NEW."before"->>'deletedAt' IS NULL OR NEW."after"->>'deletedAt' IS NOT NULL) THEN RAISE EXCEPTION 'SHIPPING_PORT_CHANGED'; END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "ShippingPortChange_guard" ON "ShippingPortChange";
CREATE TRIGGER "ShippingPortChange_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ShippingPortChange" FOR EACH ROW EXECUTE FUNCTION baro_shipping_port_change_guard_v2();

-- Rollback: compatible application; retain source and immutable audit receipts.
