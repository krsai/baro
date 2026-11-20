ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS managed boolean NOT NULL DEFAULT false;
ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS "InventoryVariantEvent" (
 id bigserial PRIMARY KEY, "orgId" integer NOT NULL REFERENCES "Organization"(id),
 "variantId" text, "originalId" text NOT NULL, revision integer NOT NULL,
 action text NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE')),
 "actorId" integer NOT NULL, "beforeSnapshot" jsonb, "afterSnapshot" jsonb,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryVariantEvent_variant_scope" FOREIGN KEY("orgId","variantId") REFERENCES "InventoryVariant"("orgId",id) ON DELETE SET NULL ("variantId"),
 CONSTRAINT "InventoryVariantEvent_actor_scope" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId"),
 UNIQUE("orgId","originalId",revision)
);
CREATE OR REPLACE FUNCTION baro_inventory_variant_management_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor integer; row_org integer; BEGIN
 IF TG_TABLE_NAME='InventoryVariantEvent' THEN
  IF TG_OP='UPDATE' AND NEW."variantId" IS NULL AND OLD."variantId" IS NOT NULL AND (to_jsonb(NEW)-'variantId')=(to_jsonb(OLD)-'variantId') AND NOT EXISTS(SELECT 1 FROM "InventoryVariant" WHERE id=OLD."variantId" AND "orgId"=OLD."orgId") THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'VARIANT_AUDIT_IMMUTABLE'; END IF;RETURN NEW;
 END IF;
 actor:=coalesce(nullif(current_setting('baro.variant_actor',true),''),nullif(current_setting('baro.inventory_actor',true),''))::integer;
 row_org:=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END;
 IF NOT EXISTS(SELECT 1 FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e.id=actor AND e."orgId"=row_org AND e.status='ACTIVE' AND e."orgRole" IN ('ADMIN','OPERATOR','ACCOUNTANT') AND o."isActive") THEN RAISE EXCEPTION 'VARIANT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'VARIANT_CHANGED'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW."orgId"<>OLD."orgId" OR NEW."masterId"<>OLD."masterId" OR NEW."baseId"<>OLD."baseId" OR NEW.revision<>OLD.revision+1 OR NOT NEW.managed THEN RAISE EXCEPTION 'VARIANT_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM "InventoryMovement" WHERE "orgId"=OLD."orgId" AND "variantId"=OLD.id) THEN RAISE EXCEPTION 'VARIANT_IN_USE'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM "InventoryMovement" WHERE "orgId"=OLD."orgId" AND "variantId"=OLD.id) THEN RAISE EXCEPTION 'VARIANT_IN_USE'; END IF;RETURN OLD;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "MaterialItem" WHERE id=NEW."masterId" AND "orgId"=NEW."orgId" AND "baseId"=NEW."baseId")
 OR NEW.attributes->'owner'->>'id' IS DISTINCT FROM NEW."ownerId"::text
 OR NEW.attributes->'type'->>'id' IS DISTINCT FROM NEW."typeId"::text
 OR NEW.attributes->'color'->>'id' IS DISTINCT FROM NEW."colorId"::text
 OR NEW."typeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CodeItemType" WHERE id=NEW."typeId" AND "orgId"=NEW."orgId" AND "baseId"=NEW."baseId") THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM "TransactionCodeBase" b WHERE b.id=NEW."baseId" AND
  (NEW."typeId" IS NULL AND coalesce(b."materialSettings"->'masterInputs'->>'type',b."attributeInputs"->>'type')='REQUIRED'
   OR NEW."colorId" IS NULL AND coalesce(b."materialSettings"->'masterInputs'->>'color',b."materialSettings"->>'colorInput')='REQUIRED')) THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_inventory_variant_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor integer; BEGIN
 actor:=coalesce(nullif(current_setting('baro.variant_actor',true),''),nullif(current_setting('baro.inventory_actor',true),''))::integer;
 INSERT INTO "InventoryVariantEvent"("orgId","variantId","originalId",revision,action,"actorId","beforeSnapshot","afterSnapshot")
 VALUES(CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE NEW.id END,
 CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END,CASE WHEN TG_OP='DELETE' THEN OLD.revision+1 ELSE NEW.revision END,
 CASE WHEN TG_OP='INSERT' THEN 'CREATE' WHEN TG_OP='UPDATE' THEN 'UPDATE' ELSE 'DELETE' END,actor,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "InventoryVariant_management_guard" ON "InventoryVariant";
CREATE TRIGGER "InventoryVariant_management_guard" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryVariant" FOR EACH ROW EXECUTE FUNCTION baro_inventory_variant_management_guard();
DROP TRIGGER IF EXISTS "InventoryVariant_management_event" ON "InventoryVariant";
CREATE TRIGGER "InventoryVariant_management_event" AFTER INSERT OR UPDATE OR DELETE ON "InventoryVariant" FOR EACH ROW EXECUTE FUNCTION baro_inventory_variant_event();
DROP TRIGGER IF EXISTS "InventoryVariantEvent_immutable" ON "InventoryVariantEvent";
CREATE TRIGGER "InventoryVariantEvent_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "InventoryVariantEvent" FOR EACH ROW EXECUTE FUNCTION baro_inventory_variant_management_guard();
