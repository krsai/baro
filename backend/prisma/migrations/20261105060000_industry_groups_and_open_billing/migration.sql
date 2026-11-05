-- Categories describe industries, never the sales/purchase relationship.
-- Keep every industry ID and business FK; only the catalogue grouping changes.
INSERT INTO "PartnerRole"(code,"nameKo","nameEn","nameVi","sortOrder")
VALUES ('APPAREL','의류','Apparel','May mặc',1)
ON CONFLICT(code) DO NOTHING;

UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='APPAREL')
WHERE "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='CUSTOMER')
AND (code IN ('CUSTOMER_WOVEN','CUSTOMER_KNIT','CUSTOMER_MIXED','WOVEN','KNIT','MIXED','GARMENT_CUSTOMER','CUSTOMER_GARMENT')
 OR "nameKo"='의류 생산 고객');

UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='LOGISTICS_PROVIDER')
WHERE "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='CUSTOMER')
AND (code IN ('LOGISTICS_CUSTOMER','CUSTOMER_LOGISTICS') OR "nameKo"='물류 서비스 고객');

-- Do not infer an industry for any custom, previously customer-grouped type.
-- Its remaining parent is a neutral fallback and is hidden when empty.
UPDATE "PartnerRole" SET "nameKo"='기타',"nameEn"='Other',"nameVi"='Khác' WHERE code='CUSTOMER';
UPDATE "SettingServiceDefault" SET "nameKo"='의류',"nameEn"='Apparel',"nameVi"='May mặc'
WHERE "nameKo"='의류 생산 고객';
UPDATE "SettingServiceDefault" SET "nameKo"='물류 서비스',"nameEn"='Logistics services',"nameVi"='Dịch vụ logistics'
WHERE "nameKo"='물류 서비스 고객';

-- canBill is retained as legacy metadata. New billing lookup does not require
-- a whitelist or an industry match, but still validates code cash direction.
CREATE OR REPLACE FUNCTION baro_company_billing_code_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT NEW."canBill" THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."canBill" AND NEW."ownerOrgId"=OLD."ownerOrgId" AND NEW."baseId" IS NOT DISTINCT FROM OLD."baseId" THEN RETURN NEW; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "TransactionCodeBase" b WHERE b.id=NEW."baseId" AND b."isActive" AND b."cashDirection" IN ('IN','BOTH') AND NEW."isActive") THEN RAISE EXCEPTION 'COMPANY_BILLING_CODE_INVALID'; END IF;
 RETURN NEW;
END $$;
