CREATE UNIQUE INDEX IF NOT EXISTS "MaterialItem_shared_master_unique" ON "MaterialItem"("orgId","baseId") WHERE data->>'sharedMaster'='true';
CREATE TABLE IF NOT EXISTS "InventoryVariant" (
 id text PRIMARY KEY,
 "orgId" integer NOT NULL REFERENCES "Organization"(id),
 "masterId" text NOT NULL,
 "baseId" integer NOT NULL,
 "ownerId" integer NOT NULL REFERENCES "Organization"(id),
 "colorId" integer REFERENCES "AttrColor"(id),
 "typeId" integer REFERENCES "CodeItemType"(id),
 attributes jsonb NOT NULL,
 identity text NOT NULL,
 CONSTRAINT "InventoryVariant_master_scope" FOREIGN KEY ("masterId","orgId","baseId") REFERENCES "MaterialItem"(id,"orgId","baseId"),
 UNIQUE ("orgId",id),
 UNIQUE ("orgId","masterId",identity)
);
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
 id text PRIMARY KEY,
 "orgId" integer NOT NULL REFERENCES "Organization"(id),
 "variantId" text NOT NULL,
 "actorId" integer NOT NULL,
 "clientKey" text NOT NULL,
 "requestHash" text NOT NULL,
 "movementDate" date NOT NULL,
 quantity numeric(20,4) NOT NULL CHECK (quantity <> 0),
 remark text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "InventoryMovement_variant_scope" FOREIGN KEY ("orgId","variantId") REFERENCES "InventoryVariant"("orgId",id),
 CONSTRAINT "InventoryMovement_actor_scope" FOREIGN KEY ("actorId","orgId") REFERENCES "Employee"(id,"orgId"),
 UNIQUE ("orgId","clientKey")
);
CREATE INDEX IF NOT EXISTS "InventoryMovement_history_idx" ON "InventoryMovement"("orgId","movementDate",id);
CREATE OR REPLACE FUNCTION baro_inventory_shared_master_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settings jsonb; BEGIN
 IF NEW."ownerOrgId" IS NOT NULL OR NEW."typeId" IS NOT NULL OR NEW."colorId" IS NOT NULL
 OR coalesce(NEW.data->'inputSettings'->'attributeInputs'->>'owner','HIDDEN')<>'HIDDEN'
 OR coalesce(NEW.data->'inputSettings'->'attributeInputs'->>'type','HIDDEN')<>'HIDDEN'
 OR coalesce(NEW.data->'inputSettings'->'materialSettings'->>'colorInput','HIDDEN')<>'HIDDEN'
 THEN RAISE EXCEPTION 'material master does not use movement attributes'; END IF;
 IF NEW.data->>'sharedMaster'='true' THEN
  IF NEW.data->'details' IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'shared master does not use movement dimensions'; END IF;
  RETURN NEW;
 END IF;
 SELECT "materialSettings"->'masterInputs' INTO settings FROM "TransactionCodeBase" WHERE id=NEW."baseId";
 IF settings IS NULL THEN RETURN NEW; END IF;
 IF (coalesce(settings->>'dimensions','HIDDEN')='REQUIRED') IS DISTINCT FROM (NEW.data->'inputSettings'->'requiredFields' ? 'length') THEN RAISE EXCEPTION 'material master configuration changed'; END IF;
 IF coalesce(settings->>'dimensions','HIDDEN')='HIDDEN' AND EXISTS(SELECT 1 FROM unnest(ARRAY['length','width','height']) axis WHERE coalesce(NEW.data->'details'->>axis,'')<>'') THEN RAISE EXCEPTION 'unexpected material dimensions'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS "MaterialItem_configuration_guard" ON "MaterialItem";
CREATE TRIGGER "MaterialItem_configuration_guard" BEFORE INSERT ON "MaterialItem" FOR EACH ROW EXECUTE FUNCTION baro_inventory_shared_master_guard();
