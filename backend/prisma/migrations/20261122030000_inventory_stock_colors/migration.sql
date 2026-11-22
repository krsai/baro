-- Definitions stay color independent. Stock colors and explicit reclassification
-- have their own real company-scoped links; no historical row is rewritten.
CREATE TABLE IF NOT EXISTS "InventoryStockItem" (
 "orgId" integer NOT NULL, "variantId" text NOT NULL, "definitionId" text NOT NULL,
 PRIMARY KEY ("orgId","variantId"),
 CONSTRAINT "InventoryStockItem_variant_fkey" FOREIGN KEY ("orgId","variantId") REFERENCES "InventoryVariant"("orgId",id),
 CONSTRAINT "InventoryStockItem_definition_fkey" FOREIGN KEY ("orgId","definitionId") REFERENCES "InventoryVariant"("orgId",id),
 CHECK ("variantId"<>"definitionId")
);
CREATE TABLE IF NOT EXISTS "InventoryColorTransfer" (
 id text PRIMARY KEY, "orgId" integer NOT NULL, "sourceId" text NOT NULL, "targetId" text NOT NULL,
 quantity numeric(20,4) NOT NULL CHECK(quantity>0), "actorId" integer NOT NULL,
 "clientKey" text NOT NULL, "requestHash" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryColorTransfer_source_fkey" FOREIGN KEY ("orgId","sourceId") REFERENCES "InventoryVariant"("orgId",id),
 CONSTRAINT "InventoryColorTransfer_target_fkey" FOREIGN KEY ("orgId","targetId") REFERENCES "InventoryVariant"("orgId",id),
 CONSTRAINT "InventoryColorTransfer_actor_fkey" FOREIGN KEY ("actorId","orgId") REFERENCES "Employee"(id,"orgId"),
 UNIQUE("orgId","clientKey"), CHECK("sourceId"<>"targetId")
);
CREATE OR REPLACE FUNCTION baro_inventory_stock_balances(company integer)
RETURNS TABLE(id text,quantity numeric) LANGUAGE sql STABLE AS $$
 SELECT entries.id,SUM(entries.quantity) FROM (
 SELECT m."variantId" AS id,m.quantity FROM "InventoryMovement" m WHERE m."orgId"=company AND m.status='APPROVED'
 UNION ALL SELECT "sourceId",-quantity FROM "InventoryColorTransfer" WHERE "orgId"=company
 UNION ALL SELECT "targetId",quantity FROM "InventoryColorTransfer" WHERE "orgId"=company
 ) entries GROUP BY entries.id
$$;
CREATE OR REPLACE FUNCTION baro_inventory_stock_color_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor integer; source "InventoryVariant"; target "InventoryVariant"; available numeric; BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'STOCK_COLOR_HISTORY_IMMUTABLE'; END IF;
 actor:=nullif(current_setting('baro.inventory_actor',true),'')::integer;
 PERFORM id FROM "Organization" WHERE id=NEW."orgId" AND "isActive" FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=actor AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'ACTIVE_EMPLOYEE_REQUIRED'; END IF;
 IF TG_TABLE_NAME='InventoryStockItem' THEN
  SELECT * INTO source FROM "InventoryVariant" WHERE id=NEW."definitionId" AND "orgId"=NEW."orgId";
  SELECT * INTO target FROM "InventoryVariant" WHERE id=NEW."variantId" AND "orgId"=NEW."orgId";
 ELSE
  IF NEW."actorId"<>actor THEN RAISE EXCEPTION 'ACTIVE_EMPLOYEE_REQUIRED'; END IF;
  SELECT * INTO source FROM "InventoryVariant" WHERE id=NEW."sourceId" AND "orgId"=NEW."orgId";
  SELECT * INTO target FROM "InventoryVariant" WHERE id=NEW."targetId" AND "orgId"=NEW."orgId";
  IF source."colorId" IS NOT NULL OR target."colorId" IS NULL THEN RAISE EXCEPTION 'STOCK_COLOR_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "InventoryStockItem" WHERE "orgId"=NEW."orgId" AND "variantId"=target.id AND "definitionId"=source.id) THEN RAISE EXCEPTION 'STOCK_COLOR_INVALID'; END IF;
  SELECT quantity INTO available FROM baro_inventory_stock_balances(NEW."orgId") WHERE id=source.id;
  IF available IS NULL OR available<NEW.quantity THEN RAISE EXCEPTION 'STOCK_COLOR_BALANCE_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM "InventoryMovement" m JOIN "InventoryApprovalRequest" r ON r."movementId"=m.id AND r."orgId"=m."orgId" WHERE m."variantId"=source.id AND m."orgId"=NEW."orgId" AND r.status='PENDING') THEN RAISE EXCEPTION 'STOCK_COLOR_APPROVAL_PENDING'; END IF;
 END IF;
 IF source.id IS NULL OR target.id IS NULL OR source."masterId"<>target."masterId" OR source."baseId"<>target."baseId" OR source."ownerId"<>target."ownerId" OR source."typeId" IS DISTINCT FROM target."typeId" OR (source.attributes-'color') IS DISTINCT FROM (target.attributes-'color') THEN RAISE EXCEPTION 'STOCK_COLOR_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "TransactionCodeBase" WHERE id=source."baseId" AND "isActive" AND "materialSettings"->>'enabled'='true' AND coalesce("materialSettings"->'masterInputs'->>'color',"materialSettings"->>'colorInput','HIDDEN')<>'HIDDEN') THEN RAISE EXCEPTION 'STOCK_COLOR_DISABLED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_inventory_color_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM "InventoryColorTransfer" WHERE "orgId"=OLD."orgId" AND ("sourceId"=OLD."variantId" OR "targetId"=OLD."variantId")) THEN RAISE EXCEPTION 'STOCK_COLOR_HISTORY_IN_USE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InventoryMovement_color_guard" ON "InventoryMovement";
CREATE TRIGGER "InventoryMovement_color_guard" BEFORE DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION baro_inventory_color_movement_guard();
DROP TRIGGER IF EXISTS "InventoryStockItem_guard" ON "InventoryStockItem";
CREATE TRIGGER "InventoryStockItem_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryStockItem" FOR EACH ROW EXECUTE FUNCTION baro_inventory_stock_color_guard();
DROP TRIGGER IF EXISTS "InventoryColorTransfer_guard" ON "InventoryColorTransfer";
CREATE TRIGGER "InventoryColorTransfer_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryColorTransfer" FOR EACH ROW EXECUTE FUNCTION baro_inventory_stock_color_guard();
-- Keep the complete existing variant actor/revision/reference guard. Only move
-- the required-color check from managed definitions to stock variants.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('baro_inventory_variant_management_guard()'::regprocedure);
 definition:=replace(definition,'OR NEW."colorId" IS NULL AND coalesce','OR NOT NEW.managed AND NEW."colorId" IS NULL AND coalesce');
 IF position('FROM "InventoryStockItem"' in definition)=0 THEN
  definition:=replace(definition,'IF EXISTS(SELECT 1 FROM "InventoryMovement" WHERE "orgId"=OLD."orgId" AND "variantId"=OLD.id) THEN','IF EXISTS(SELECT 1 FROM "InventoryStockItem" WHERE "orgId"=OLD."orgId" AND ("variantId"=OLD.id OR "definitionId"=OLD.id)) OR EXISTS(SELECT 1 FROM "InventoryMovement" WHERE "orgId"=OLD."orgId" AND "variantId"=OLD.id) THEN');
 END IF;
 EXECUTE definition;
END $$;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('baro_expense_payment_guard()'::regprocedure);
 definition:=replace(definition,'c."materialVariantId"<>NEW."variantId"','c."materialVariantId"<>NEW."variantId" AND NOT EXISTS(SELECT 1 FROM "InventoryStockItem" stock WHERE stock."orgId"=NEW."orgId" AND stock."variantId"=NEW."variantId" AND stock."definitionId"=c."materialVariantId")');
 -- Only apply once; retain every other expense/payment guard.
 IF position('FROM "InventoryStockItem" stock' in pg_get_functiondef('baro_expense_payment_guard()'::regprocedure))=0 THEN EXECUTE definition; END IF;
END $$;
