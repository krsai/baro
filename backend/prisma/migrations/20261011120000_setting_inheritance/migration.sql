-- Global templates have their own identity; local business FKs remain unchanged.
CREATE TABLE IF NOT EXISTS "SettingServiceDefault" (
 id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
 "entryMode" TEXT NOT NULL CHECK ("entryMode" IN ('PROCESS','LOGISTICS','GENERAL')), "requiredFields" TEXT[] NOT NULL DEFAULT '{}',
 "orderInput" TEXT NOT NULL DEFAULT 'OPTIONAL', "styleInput" TEXT NOT NULL DEFAULT 'HIDDEN', "processInput" TEXT NOT NULL DEFAULT 'HIDDEN',
 "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
 CHECK ("orderInput" IN ('REQUIRED','OPTIONAL','HIDDEN') AND "styleInput" IN ('REQUIRED','OPTIONAL','HIDDEN') AND "processInput" IN ('REQUIRED','OPTIONAL','HIDDEN')),
 CHECK ("entryMode" <> 'PROCESS' OR ("orderInput"='REQUIRED' AND "styleInput"='REQUIRED' AND "processInput"='REQUIRED')),
 CHECK ("styleInput"='HIDDEN' OR "orderInput"<>'HIDDEN'),
 CHECK ("processInput"='HIDDEN' OR ("orderInput"<>'HIDDEN' AND "styleInput"<>'HIDDEN'))
);
CREATE TABLE IF NOT EXISTS "SettingTransactionCodeDefault" (
 id SERIAL PRIMARY KEY, "serviceTypeId" INTEGER NOT NULL REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT,
 code TEXT NOT NULL UNIQUE, "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
 "vatEnabled" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "systemDefaultId" INTEGER REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT;
ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TransactionCode" ADD COLUMN IF NOT EXISTS "systemDefaultId" INTEGER REFERENCES "SettingTransactionCodeDefault"(id) ON DELETE RESTRICT;
ALTER TABLE "TransactionCode" ADD COLUMN IF NOT EXISTS "isOverridden" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS "OutsourcingServiceType_ownerOrgId_systemDefaultId_key" ON "OutsourcingServiceType"("ownerOrgId","systemDefaultId");
CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCode_ownerOrgId_systemDefaultId_key" ON "TransactionCode"("ownerOrgId","systemDefaultId");
-- Seed only the template catalogue. Do not infer relationships for existing tenant rows.
INSERT INTO "SettingServiceDefault" (code,"nameKo","nameEn","nameVi","entryMode","orderInput","styleInput","processInput","sortOrder") VALUES
 ('BUTTONHOLE','단춧구멍','Buttonhole','Thùa khuy','PROCESS','REQUIRED','REQUIRED','REQUIRED',10),
 ('CUTTING','재단','Cutting','Cắt','PROCESS','REQUIRED','REQUIRED','REQUIRED',20),
 ('EMBROIDERY','자수','Embroidery','Thêu','PROCESS','REQUIRED','REQUIRED','REQUIRED',30),
 ('PRINTING','나염/인쇄','Printing','In','PROCESS','REQUIRED','REQUIRED','REQUIRED',40),
 ('WASHING','워싱','Washing','Giặt','PROCESS','REQUIRED','REQUIRED','REQUIRED',50),
 ('PLEATING','주름','Pleating','Xếp ly','PROCESS','REQUIRED','REQUIRED','REQUIRED',60),
 ('SEWING','봉제','Sewing','May','PROCESS','REQUIRED','REQUIRED','REQUIRED',70),
 ('FINISHING','마감','Finishing','Hoàn thiện','PROCESS','REQUIRED','REQUIRED','REQUIRED',80),
 ('GENERAL','일반 서비스','General service','Dịch vụ khác','GENERAL','OPTIONAL','HIDDEN','HIDDEN',110)
 ON CONFLICT(code) DO NOTHING;
INSERT INTO "SettingServiceDefault" (code,"nameKo","nameEn","nameVi","entryMode","requiredFields","sortOrder") VALUES
 ('LOGISTICS','물류·운송','Logistics','Vận chuyển','LOGISTICS',ARRAY['transportDate','origin','destination'],100) ON CONFLICT(code) DO NOTHING;
INSERT INTO "SettingTransactionCodeDefault" ("serviceTypeId",code,"nameKo","nameEn","nameVi")
 SELECT id,code,"nameKo","nameEn","nameVi" FROM "SettingServiceDefault" ON CONFLICT(code) DO NOTHING;
INSERT INTO "SettingTransactionCodeDefault" ("serviceTypeId",code,"nameKo","nameEn","nameVi","vatEnabled")
 SELECT id,'TRKV','트러킹 (VAT)','Trucking (VAT)','Vận chuyển (VAT)',true FROM "SettingServiceDefault" WHERE code='LOGISTICS' ON CONFLICT(code) DO NOTHING;

CREATE OR REPLACE FUNCTION baro_inherit_service_setting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source "SettingServiceDefault";
BEGIN
 IF TG_OP='UPDATE' AND OLD."systemDefaultId" IS NOT NULL AND NEW."systemDefaultId" IS DISTINCT FROM OLD."systemDefaultId" THEN RAISE EXCEPTION 'setting source immutable'; END IF;
 IF NEW."systemDefaultId" IS NOT NULL THEN
  SELECT * INTO STRICT source FROM "SettingServiceDefault" WHERE id=NEW."systemDefaultId";
  IF NEW."entryMode"<>source."entryMode" THEN RAISE EXCEPTION 'service entry mode immutable'; END IF;
  IF NOT NEW."isOverridden" THEN
   NEW.code=source.code; NEW."nameKo"=source."nameKo"; NEW."nameEn"=source."nameEn"; NEW."nameVi"=source."nameVi";
   NEW."requiredFields"=source."requiredFields"; NEW."orderInput"=source."orderInput"; NEW."styleInput"=source."styleInput"; NEW."processInput"=source."processInput";
   NEW."isActive"=source."isActive"; NEW."sortOrder"=source."sortOrder";
  END IF;
 ELSIF NOT NEW."isOverridden" THEN RAISE EXCEPTION 'setting source required'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ServiceSettingInheritance" ON "OutsourcingServiceType";
CREATE TRIGGER "ServiceSettingInheritance" BEFORE INSERT OR UPDATE ON "OutsourcingServiceType" FOR EACH ROW EXECUTE FUNCTION baro_inherit_service_setting();
CREATE OR REPLACE FUNCTION baro_inherit_code_setting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source "SettingTransactionCodeDefault";
BEGIN
 IF TG_OP='UPDATE' AND OLD."systemDefaultId" IS NOT NULL AND NEW."systemDefaultId" IS DISTINCT FROM OLD."systemDefaultId" THEN RAISE EXCEPTION 'setting source immutable'; END IF;
 IF NEW."systemDefaultId" IS NOT NULL THEN
  SELECT * INTO STRICT source FROM "SettingTransactionCodeDefault" WHERE id=NEW."systemDefaultId";
  IF NOT EXISTS (SELECT 1 FROM "OutsourcingServiceType" WHERE id=NEW."serviceTypeId" AND "ownerOrgId"=NEW."ownerOrgId" AND "systemDefaultId"=source."serviceTypeId") THEN RAISE EXCEPTION 'code default service mismatch'; END IF;
  IF NOT NEW."isOverridden" THEN
   NEW.code=source.code; NEW."nameKo"=source."nameKo"; NEW."nameEn"=source."nameEn"; NEW."nameVi"=source."nameVi";
   NEW."vatEnabled"=source."vatEnabled"; NEW."isActive"=source."isActive";
  END IF;
 ELSIF NOT NEW."isOverridden" THEN RAISE EXCEPTION 'setting source required'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CodeSettingInheritance" ON "TransactionCode";
CREATE TRIGGER "CodeSettingInheritance" BEFORE INSERT OR UPDATE ON "TransactionCode" FOR EACH ROW EXECUTE FUNCTION baro_inherit_code_setting();
CREATE OR REPLACE FUNCTION baro_propagate_setting_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.code<>OLD.code THEN RAISE EXCEPTION 'default code immutable'; END IF;
 IF TG_TABLE_NAME='SettingServiceDefault' THEN
  IF NEW."entryMode"<>OLD."entryMode" THEN RAISE EXCEPTION 'service entry mode immutable'; END IF;
  UPDATE "OutsourcingServiceType" SET "isOverridden"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "systemDefaultId"=NEW.id AND NOT "isOverridden";
 ELSE
  IF NEW."serviceTypeId"<>OLD."serviceTypeId" THEN RAISE EXCEPTION 'default service immutable'; END IF;
  UPDATE "TransactionCode" SET "isOverridden"=false WHERE "systemDefaultId"=NEW.id AND NOT "isOverridden";
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "ServiceDefaultPropagation" ON "SettingServiceDefault";
CREATE TRIGGER "ServiceDefaultPropagation" AFTER UPDATE ON "SettingServiceDefault" FOR EACH ROW EXECUTE FUNCTION baro_propagate_setting_default();
DROP TRIGGER IF EXISTS "CodeDefaultPropagation" ON "SettingTransactionCodeDefault";
CREATE TRIGGER "CodeDefaultPropagation" AFTER UPDATE ON "SettingTransactionCodeDefault" FOR EACH ROW EXECUTE FUNCTION baro_propagate_setting_default();
