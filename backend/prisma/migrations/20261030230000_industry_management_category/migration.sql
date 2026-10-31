-- Keep industry IDs, source links, accounting codes and business history intact.
INSERT INTO "PartnerRole"(code,"nameKo","nameEn","nameVi","sortOrder")
VALUES ('MANAGEMENT','관리','Administration','Quản lý',5)
ON CONFLICT(code) DO NOTHING;
UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='MANAGEMENT')
WHERE "partnerRoleId" IS NULL;
UPDATE "SettingServiceDefault" SET "nameKo"='관리',"nameEn"='Administration',"nameVi"='Quản lý'
WHERE code='GENERAL';
-- Only the old built-in generic label follows the industry rename. Keep custom names.
UPDATE "TransactionCodeBase" b SET "nameKo"='관리',"nameEn"='Administration',"nameVi"='Quản lý'
FROM "SettingServiceDefault" s WHERE b."serviceTypeId"=s.id AND s.code='GENERAL'
AND (b."nameKo"='일반 서비스' OR b."nameEn"='General service');
ALTER TABLE "SettingServiceDefault" ALTER COLUMN "partnerRoleId" SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='SettingServiceDefault_category_required') THEN
 ALTER TABLE "SettingServiceDefault" ADD CONSTRAINT "SettingServiceDefault_category_required" CHECK ("partnerRoleId" IS NOT NULL);
 END IF;
END $$;
