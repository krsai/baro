-- Code family identity is separate from inheritance/override ownership.
ALTER TABLE "TransactionCode" ADD COLUMN IF NOT EXISTS "baseId" INTEGER REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "TransactionCode_baseId_idx" ON "TransactionCode"("baseId");
CREATE TABLE IF NOT EXISTS "CodeBaseUsageRollout" (id INTEGER PRIMARY KEY);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "CodeBaseUsageRollout" WHERE id=1) THEN
  -- Existing explicit source FKs take precedence.
  UPDATE "TransactionCode" local SET "baseId"=source."baseId"
   FROM "SettingTransactionCodeDefault" source WHERE local."systemDefaultId"=source.id AND local."baseId" IS NULL;
  -- Explicit aliases of the original seeded code catalogue. This links family
  -- identity only; it neither adopts defaults nor changes tenant override values.
  UPDATE "TransactionCode" local SET "baseId"=base.id
   FROM (VALUES ('BUTTONHOLE','BTH'),('CUTTING','CUT'),('EMBROIDERY','EMB'),('PRINTING','PRT'),
     ('WASHING','WSH'),('PLEATING','PLT'),('SEWING','SEW'),('FINISHING','FIN'),('GENERAL','GEN'),
     ('LOGISTICS','LOG'),('TRKV','TRK')) AS alias(legacy,prefix)
   JOIN "TransactionCodeBase" base ON base.code=alias.prefix
   WHERE local.code=alias.legacy AND local."baseId" IS NULL AND local."systemDefaultId" IS NULL;
  INSERT INTO "CodeBaseUsageRollout" VALUES(1);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION baro_code_family_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_base INTEGER; prefix TEXT; suffix TEXT;
BEGIN
 IF NEW."systemDefaultId" IS NOT NULL THEN
  SELECT "baseId" INTO source_base FROM "SettingTransactionCodeDefault" WHERE id=NEW."systemDefaultId";
  IF source_base IS NOT NULL THEN
   IF NEW."baseId" IS NOT NULL AND NEW."baseId"<>source_base THEN RAISE EXCEPTION 'code family source mismatch'; END IF;
   NEW."baseId"=source_base;
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW."baseId" IS DISTINCT FROM OLD."baseId" OR NEW."taxTreatmentId" IS DISTINCT FROM OLD."taxTreatmentId")
    AND EXISTS(SELECT 1 FROM "PartnerTransactionCost" WHERE "transactionCodeId"=OLD.id) THEN RAISE EXCEPTION 'used code family immutable'; END IF;
 END IF;
 IF NEW."baseId" IS NOT NULL AND NEW."taxTreatmentId" IS NOT NULL THEN
  SELECT code INTO STRICT prefix FROM "TransactionCodeBase" WHERE id=NEW."baseId";
  SELECT t.suffix INTO STRICT suffix FROM "TaxTreatment" t WHERE id=NEW."taxTreatmentId";
  IF NEW.code<>prefix||suffix THEN RAISE EXCEPTION 'code family mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ZZCodeFamilyIntegrity" ON "TransactionCode";
CREATE TRIGGER "ZZCodeFamilyIntegrity" BEFORE INSERT OR UPDATE ON "TransactionCode" FOR EACH ROW EXECUTE FUNCTION baro_code_family_integrity();
