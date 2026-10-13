CREATE TABLE IF NOT EXISTS "TaxTreatment" (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, suffix TEXT NOT NULL UNIQUE,
 "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL
);
INSERT INTO "TaxTreatment" VALUES
 (1,'VAT','V','과세','VAT','Chịu thuế'),
 (2,'ZERO','Z','영세율','Zero-rated','Thuế suất 0%'),
 (3,'EXEMPT','E','면세','Exempt','Không chịu thuế') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "TransactionCodeBase" (
 id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE CHECK(code ~ '^[A-Z]{3}$'),
 "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
 "serviceTypeId" INTEGER NOT NULL REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT,
 "isActive" BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE "SettingTransactionCodeDefault" ADD COLUMN IF NOT EXISTS "baseId" INTEGER REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT;
ALTER TABLE "SettingTransactionCodeDefault" ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SettingTransactionCodeDefault" ADD COLUMN IF NOT EXISTS "taxTreatmentId" INTEGER REFERENCES "TaxTreatment"(id) ON DELETE RESTRICT;
ALTER TABLE "TransactionCode" ADD COLUMN IF NOT EXISTS "taxTreatmentId" INTEGER REFERENCES "TaxTreatment"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "CodeDefault_base_tax_key" ON "SettingTransactionCodeDefault"("baseId","taxTreatmentId");
CREATE TABLE IF NOT EXISTS "CodeBaseRollout" (id INTEGER PRIMARY KEY);
DO $$
DECLARE old "SettingTransactionCodeDefault"; base_id INTEGER; treatment "TaxTreatment"; prefix TEXT;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM "CodeBaseRollout" WHERE id=1) THEN
  FOR old IN SELECT * FROM "SettingTransactionCodeDefault" ORDER BY id LOOP
   prefix := CASE old.code WHEN 'BUTTONHOLE' THEN 'BTH' WHEN 'CUTTING' THEN 'CUT' WHEN 'EMBROIDERY' THEN 'EMB'
     WHEN 'PRINTING' THEN 'PRT' WHEN 'WASHING' THEN 'WSH' WHEN 'PLEATING' THEN 'PLT' WHEN 'SEWING' THEN 'SEW'
     WHEN 'FINISHING' THEN 'FIN' WHEN 'GENERAL' THEN 'GEN' WHEN 'LOGISTICS' THEN 'LOG' WHEN 'TRKV' THEN 'TRK' ELSE NULL END;
   IF prefix IS NULL THEN CONTINUE; END IF;
   INSERT INTO "TransactionCodeBase" (code,"nameKo","nameEn","nameVi","serviceTypeId","isActive")
    VALUES(prefix,CASE WHEN old.code='TRKV' THEN '트러킹' ELSE old."nameKo" END,CASE WHEN old.code='TRKV' THEN 'Trucking' ELSE old."nameEn" END,CASE WHEN old.code='TRKV' THEN 'Vận chuyển' ELSE old."nameVi" END,old."serviceTypeId",old."isActive") RETURNING id INTO base_id;
   -- Explicit VAT codes retain their original default ID and tenant source FKs.
   -- Non-VAT legacy codes keep their identity and unknown tax classification.
   UPDATE "SettingTransactionCodeDefault" SET "baseId"=base_id,"taxTreatmentId"=CASE WHEN old.code=prefix||'V' AND old."vatEnabled" THEN 1 ELSE NULL END WHERE id=old.id;
   FOR treatment IN SELECT * FROM "TaxTreatment" LOOP
    IF EXISTS(SELECT 1 FROM "SettingTransactionCodeDefault" WHERE code=prefix||treatment.suffix AND ("baseId"<>base_id OR "baseId" IS NULL)) THEN RAISE EXCEPTION 'code base collision: %',prefix; END IF;
    INSERT INTO "SettingTransactionCodeDefault" ("baseId","taxTreatmentId","serviceTypeId",code,"nameKo","nameEn","nameVi","vatEnabled","isActive")
     SELECT base_id,treatment.id,old."serviceTypeId",prefix||treatment.suffix,b."nameKo",b."nameEn",b."nameVi",treatment.code='VAT',old."isActive" FROM "TransactionCodeBase" b WHERE b.id=base_id ON CONFLICT(code) DO NOTHING;
   END LOOP;
  END LOOP;
  INSERT INTO "CodeBaseRollout" VALUES(1);
  -- TRKV was explicitly defined as VAT in the original seed, independent of source adoption.
  UPDATE "TransactionCode" SET "taxTreatmentId"=1 WHERE code='TRKV' AND "vatEnabled" AND "taxTreatmentId" IS NULL;
 END IF;
 -- Follow only explicit source FKs; never infer a tenant's source from its code.
 UPDATE "TransactionCode" local SET "taxTreatmentId"=source."taxTreatmentId"
  FROM "SettingTransactionCodeDefault" source WHERE local."systemDefaultId"=source.id AND NOT local."isOverridden" AND local."taxTreatmentId" IS DISTINCT FROM source."taxTreatmentId";
END $$;

CREATE OR REPLACE FUNCTION baro_code_tax_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE treatment "TaxTreatment"; prefix TEXT;
BEGIN
 IF TG_TABLE_NAME='TransactionCode' THEN
  IF NEW."systemDefaultId" IS NOT NULL AND NOT NEW."isOverridden" THEN
   SELECT "taxTreatmentId" INTO NEW."taxTreatmentId" FROM "SettingTransactionCodeDefault" WHERE id=NEW."systemDefaultId";
  END IF;
 END IF;
 IF NEW."taxTreatmentId" IS NOT NULL THEN
  SELECT * INTO STRICT treatment FROM "TaxTreatment" WHERE id=NEW."taxTreatmentId";
  IF NEW.code !~ '^[A-Z]{4}$' OR right(NEW.code,1)<>treatment.suffix OR NEW."vatEnabled"<>(treatment.code='VAT') THEN RAISE EXCEPTION 'code tax mismatch'; END IF;
  IF TG_TABLE_NAME='SettingTransactionCodeDefault' THEN
   SELECT code INTO STRICT prefix FROM "TransactionCodeBase" WHERE id=NEW."baseId" AND "serviceTypeId"=NEW."serviceTypeId";
   IF NEW.code<>prefix||treatment.suffix THEN RAISE EXCEPTION 'code base mismatch'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ZCodeTaxIntegrity" ON "TransactionCode";
CREATE TRIGGER "ZCodeTaxIntegrity" BEFORE INSERT OR UPDATE ON "TransactionCode" FOR EACH ROW EXECUTE FUNCTION baro_code_tax_integrity();
DROP TRIGGER IF EXISTS "ZCodeTaxIntegrity" ON "SettingTransactionCodeDefault";
CREATE TRIGGER "ZCodeTaxIntegrity" BEFORE INSERT OR UPDATE ON "SettingTransactionCodeDefault" FOR EACH ROW EXECUTE FUNCTION baro_code_tax_integrity();
