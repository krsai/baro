-- Explicitly retire the obsolete customer/service classification, not the
-- logistics category, forwarders, truckers, carriers or accounting fee codes.
LOCK TABLE "SettingServiceDefault", "OutsourcingServiceType", "PartnerClassification",
 "PartnerClassificationIndustry", "OrgRelationship" IN SHARE ROW EXCLUSIVE MODE;
DO $retire$
DECLARE ids INTEGER[]; profiles JSONB; links JSONB; definitions JSONB; copies JSONB; relationships JSONB;
BEGIN
 SELECT array_agg(id ORDER BY id) INTO ids FROM "SettingServiceDefault"
 WHERE code IN ('LOGISTICS_CUSTOMER','CUSTOMER_LOGISTICS')
 OR trim("nameKo") IN ('물류 서비스','물류 서비스 고객')
 OR lower(trim("nameEn")) IN ('logistics service','logistics services');
 IF ids IS NULL THEN RETURN; END IF;

 -- Do not guess replacements for financial/production references. The current
 -- reported blocker is obsolete classification metadata, which is retired below.
 IF EXISTS(SELECT 1 FROM "SettingTransactionCodeDefault" WHERE "serviceTypeId"=ANY(ids))
 OR EXISTS(SELECT 1 FROM "TransactionCodeBase" WHERE "serviceTypeId"=ANY(ids))
 OR EXISTS(SELECT 1 FROM "AccountingCodeIndustry" WHERE "systemIndustryId"=ANY(ids))
 OR EXISTS(SELECT 1 FROM "IndustryProductionPolicy" WHERE "systemIndustryId"=ANY(ids))
 OR EXISTS(SELECT 1 FROM "OutsourcingServiceType" s WHERE s."systemDefaultId"=ANY(ids) AND (
 EXISTS(SELECT 1 FROM "PartnerTransactionCost" c WHERE c."serviceTypeId"=s.id)
 OR EXISTS(SELECT 1 FROM "TransactionCode" c WHERE c."serviceTypeId"=s.id)
 OR EXISTS(SELECT 1 FROM "OrganizationOutsourcingServiceType" a WHERE a."serviceTypeId"=s.id)))
 THEN RAISE EXCEPTION 'LEGACY_LOGISTICS_CUSTOMER_HAS_BUSINESS_USAGE'; END IF;

 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO definitions FROM "SettingServiceDefault" s WHERE id=ANY(ids);
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO copies FROM "OutsourcingServiceType" s WHERE "systemDefaultId"=ANY(ids);
 SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') INTO links FROM "PartnerClassificationIndustry" l WHERE "systemIndustryId"=ANY(ids);
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO profiles FROM "PartnerClassification" p WHERE EXISTS(
 SELECT 1 FROM "PartnerClassificationIndustry" l WHERE l."orgId"=p."orgId" AND l."entityId"=p."entityId" AND l."systemIndustryId"=ANY(ids));
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO relationships FROM "OrgRelationship" r WHERE "systemIndustryId"=ANY(ids);
 INSERT INTO "SystemSetting"(key,value,"updatedBy","createdAt","updatedAt")
 VALUES('LEGACY_LOGISTICS_CUSTOMER_RETIRED:2026-11-06',jsonb_build_object('definitions',definitions,'copies',copies,
 'profiles',profiles,'links',links,'relationships',relationships),'EXPLICIT_LEGACY_RETIREMENT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
 ON CONFLICT(key) DO NOTHING;

 DELETE FROM "PartnerClassificationIndustry" WHERE "systemIndustryId"=ANY(ids);
 DELETE FROM "PartnerClassification" p WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(profiles) old
 WHERE (old->>'orgId')::int=p."orgId" AND (old->>'entityId')::int=p."entityId")
 AND NOT EXISTS(SELECT 1 FROM "PartnerClassificationIndustry" l WHERE l."orgId"=p."orgId" AND l."entityId"=p."entityId");
 UPDATE "PartnerClassification" p SET revision=revision+1,"updatedAt"=CURRENT_TIMESTAMP
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(profiles) old
 WHERE (old->>'orgId')::int=p."orgId" AND (old->>'entityId')::int=p."entityId");
 UPDATE "OrgRelationship" SET "systemIndustryId"=NULL WHERE "systemIndustryId"=ANY(ids);
 DELETE FROM "OutsourcingServiceType" WHERE "systemDefaultId"=ANY(ids);
 DELETE FROM "SettingServiceDefault" WHERE id=ANY(ids);
END $retire$;

-- Old initializers or older clients cannot recreate this retired classification.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='SettingServiceDefault_legacy_logistics_retired') THEN
 ALTER TABLE "SettingServiceDefault" ADD CONSTRAINT "SettingServiceDefault_legacy_logistics_retired" CHECK (
 code NOT IN ('LOGISTICS_CUSTOMER','CUSTOMER_LOGISTICS')
 AND trim("nameKo") NOT IN ('물류 서비스','물류 서비스 고객')
 AND lower(trim("nameEn")) NOT IN ('logistics service','logistics services'));
 END IF;
END $$;
