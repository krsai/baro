ALTER TABLE "AccountingOpeningItem" ADD COLUMN IF NOT EXISTS "replacesItemId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingOpeningItem_replacesItemId_key" ON "AccountingOpeningItem"("replacesItemId");
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AccountingOpeningItem_replacement_fkey') THEN
  ALTER TABLE "AccountingOpeningItem" ADD CONSTRAINT "AccountingOpeningItem_replacement_fkey"
   FOREIGN KEY ("replacesItemId","orgId") REFERENCES "AccountingOpeningItem"(id,"orgId") ON DELETE RESTRICT;
 END IF;
END $$;

-- Both sides must be inserted/reversed together. Original documents and cash
-- remain immutable, and a paid opening item cannot be reversed by either ID.
CREATE OR REPLACE FUNCTION baro_opening_replacement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE replacement "AccountingOpeningItem"; source "AccountingOpeningItem";
BEGIN
 FOR replacement IN SELECT * FROM "AccountingOpeningItem"
  WHERE "replacesItemId" IS NOT NULL AND (id=NEW.id OR "replacesItemId"=NEW.id)
 LOOP
  SELECT * INTO source FROM "AccountingOpeningItem" WHERE id=replacement."replacesItemId" AND "orgId"=replacement."orgId";
  IF source.id IS NULL OR replacement.kind<>'OPENING' OR source.kind<>'EXCLUDED'
   OR source."batchKey"<>replacement."batchKey" OR source."balanceDate"<>replacement."balanceDate"
   OR source."createdByEmployeeId"<>replacement."createdByEmployeeId"
   OR (source."voidedAt" IS NULL)<>(replacement."voidedAt" IS NULL)
   OR source."replacesItemId" IS NOT NULL
  THEN RAISE EXCEPTION 'OPENING_REPLACEMENT_INVALID'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "AccountingOpeningItem_replacement_guard" ON "AccountingOpeningItem";
CREATE CONSTRAINT TRIGGER "AccountingOpeningItem_replacement_guard"
 AFTER INSERT OR UPDATE ON "AccountingOpeningItem" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION baro_opening_replacement_guard();
