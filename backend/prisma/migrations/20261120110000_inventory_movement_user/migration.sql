-- Additive rollout: old movements and approval snapshots stay unchanged.
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "userEmployeeId" integer;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "userSnapshot" jsonb;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_user_scope') THEN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_user_scope" FOREIGN KEY ("userEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_inventory_user_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW."userEmployeeId" IS DISTINCT FROM OLD."userEmployeeId" OR NEW."userSnapshot" IS DISTINCT FROM OLD."userSnapshot" THEN RAISE EXCEPTION 'INVENTORY_USER_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."userEmployeeId" IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."userEmployeeId" AND "orgId"=NEW."orgId" AND status='ACTIVE') OR NEW."userSnapshot"->>'id' IS DISTINCT FROM NEW."userEmployeeId"::text) THEN RAISE EXCEPTION 'INVALID_INVENTORY_USER'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InventoryMovement_user_guard" ON "InventoryMovement";
CREATE TRIGGER "InventoryMovement_user_guard" BEFORE INSERT OR UPDATE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION baro_inventory_user_guard();
