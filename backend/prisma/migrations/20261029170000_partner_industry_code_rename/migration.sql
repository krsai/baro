-- Permit industry labels to change through stable source FKs. No data rewrite.
CREATE OR REPLACE FUNCTION baro_propagate_setting_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='SettingServiceDefault' THEN
  IF NEW."entryMode"<>OLD."entryMode" THEN RAISE EXCEPTION 'service entry mode immutable'; END IF;
  UPDATE "OutsourcingServiceType" SET "isOverridden"=false,"updatedAt"=CURRENT_TIMESTAMP WHERE "systemDefaultId"=NEW.id AND NOT "isOverridden";
 ELSE
  IF NEW."serviceTypeId"<>OLD."serviceTypeId" THEN RAISE EXCEPTION 'default service immutable'; END IF;
  IF NEW.code<>OLD.code AND (
    OLD."baseId" IS NULL OR OLD."taxTreatmentId" IS NULL OR
    NEW."baseId" IS DISTINCT FROM OLD."baseId" OR NEW."taxTreatmentId" IS DISTINCT FROM OLD."taxTreatmentId"
  ) THEN RAISE EXCEPTION 'default code immutable'; END IF;
  -- ZCodeTaxIntegrity checks the new code against its unchanged family and tax.
  UPDATE "TransactionCode" SET "isOverridden"=false WHERE "systemDefaultId"=NEW.id AND NOT "isOverridden";
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "CodeDefaultPropagation" ON "SettingTransactionCodeDefault";
DROP TRIGGER IF EXISTS "CodeDefaultRenamePropagation" ON "SettingTransactionCodeDefault";
CREATE TRIGGER "CodeDefaultRenamePropagation" AFTER UPDATE ON "SettingTransactionCodeDefault" FOR EACH ROW EXECUTE FUNCTION baro_propagate_setting_default();

DROP TRIGGER IF EXISTS "ServiceDefaultPropagation" ON "SettingServiceDefault";
DROP TRIGGER IF EXISTS "ServiceDefaultRenamePropagation" ON "SettingServiceDefault";
CREATE TRIGGER "ServiceDefaultRenamePropagation" AFTER UPDATE ON "SettingServiceDefault" FOR EACH ROW EXECUTE FUNCTION baro_propagate_setting_default();
