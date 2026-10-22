ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "systemIndustryId" INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='OrgRelationship_systemIndustryId_fkey') THEN
  ALTER TABLE "OrgRelationship" ADD CONSTRAINT "OrgRelationship_systemIndustryId_fkey" FOREIGN KEY("systemIndustryId") REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS "OrgRelationship_systemIndustryId_idx" ON "OrgRelationship"("systemIndustryId");
CREATE TABLE IF NOT EXISTS "PartnerIndustryMigrationAudit"(version TEXT PRIMARY KEY,mappings JSONB NOT NULL,"appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Preserve every production/cost/code FK and value. Only the partner's current
-- classification bridge changes. Evidence is exclusively existing source FKs.
DO $migration$
DECLARE snapshots JSONB; changed JSONB; item RECORD; digest TEXT;
BEGIN
 IF EXISTS(SELECT 1 FROM "PartnerIndustryMigrationAudit" WHERE version='20261022200000') THEN RETURN; END IF;
 CREATE TEMP TABLE industry_preservation(table_name TEXT PRIMARY KEY,digest TEXT) ON COMMIT DROP;
 FOREACH digest IN ARRAY ARRAY['PartnerTransactionCost','OutsourcedWorkRecord','WorkLog','WorkOrder','Invoice','AssignmentPlan','TransactionCode','SettingServiceDefault','Organization','OrgRelationship'] LOOP
  EXECUTE format('INSERT INTO industry_preservation SELECT %L,md5(coalesce(string_agg(to_jsonb(t)::text, %L ORDER BY to_jsonb(t)::text),%L)) FROM %I t',digest,'','',digest);
 END LOOP;
 CREATE TEMP TABLE industry_evidence ON COMMIT DROP AS
 SELECT "ownerOrgId",local_id,min(source_id) AS source_id,count(DISTINCT source_id) AS candidates FROM (
  SELECT "ownerOrgId",id AS local_id,"systemDefaultId" AS source_id FROM "OutsourcingServiceType" WHERE "systemDefaultId" IS NOT NULL
  UNION ALL SELECT c."ownerOrgId",c."serviceTypeId",b."serviceTypeId" FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId"
  UNION ALL SELECT c."ownerOrgId",c."serviceTypeId",d."serviceTypeId" FROM "TransactionCode" c JOIN "SettingTransactionCodeDefault" d ON d.id=c."systemDefaultId"
 ) evidence GROUP BY "ownerOrgId",local_id;
 IF EXISTS(SELECT 1 FROM "OrganizationOutsourcingServiceType" p LEFT JOIN industry_evidence e ON e."ownerOrgId"=p."ownerOrgId" AND e.local_id=p."serviceTypeId" WHERE e.candidates IS DISTINCT FROM 1) THEN
  RAISE EXCEPTION 'PARTNER_INDUSTRY_MAPPING_REQUIRES_REVIEW';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) INTO snapshots FROM "OrganizationOutsourcingServiceType" p;
 INSERT INTO "OutsourcingServiceType"("ownerOrgId",code,"nameKo","nameEn","nameVi","entryMode","requiredFields","orderInput","styleInput","processInput","isActive","sortOrder","systemDefaultId","isOverridden","updatedAt")
 SELECT DISTINCT p."ownerOrgId",'SYSTEM_'||s.id||'_'||s.code,s."nameKo",s."nameEn",s."nameVi",s."entryMode",s."requiredFields",s."orderInput",s."styleInput",s."processInput",s."isActive",s."sortOrder",s.id,true,CURRENT_TIMESTAMP
 FROM "OrganizationOutsourcingServiceType" p JOIN industry_evidence e ON e.local_id=p."serviceTypeId" AND e."ownerOrgId"=p."ownerOrgId" JOIN "SettingServiceDefault" s ON s.id=e.source_id
 WHERE NOT EXISTS(SELECT 1 FROM "OutsourcingServiceType" bridge WHERE bridge."ownerOrgId"=p."ownerOrgId" AND bridge."systemDefaultId"=s.id)
 ON CONFLICT("ownerOrgId","systemDefaultId") DO NOTHING;
 CREATE TEMP TABLE industry_mapping ON COMMIT DROP AS
 SELECT p.*,bridge.id AS target_id,e.source_id FROM "OrganizationOutsourcingServiceType" p JOIN industry_evidence e ON e.local_id=p."serviceTypeId" AND e."ownerOrgId"=p."ownerOrgId"
 JOIN "OutsourcingServiceType" bridge ON bridge."ownerOrgId"=p."ownerOrgId" AND bridge."systemDefaultId"=e.source_id;
 SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) INTO changed FROM industry_mapping m;
 INSERT INTO "OrganizationOutsourcingServiceType"("partnerOrgId","ownerOrgId","serviceTypeId","createdAt")
 SELECT "partnerOrgId","ownerOrgId",target_id,min("createdAt") FROM industry_mapping GROUP BY "partnerOrgId","ownerOrgId",target_id ON CONFLICT DO NOTHING;
 DELETE FROM "OrganizationOutsourcingServiceType" p USING industry_mapping m WHERE p."partnerOrgId"=m."partnerOrgId" AND p."serviceTypeId"=m."serviceTypeId" AND p."ownerOrgId"=m."ownerOrgId" AND m.target_id<>m."serviceTypeId";
 FOR item IN SELECT * FROM industry_preservation LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text, %L ORDER BY to_jsonb(t)::text),%L)) FROM %I t','','',item.table_name) INTO digest;
  IF digest IS DISTINCT FROM item.digest THEN RAISE EXCEPTION 'BUSINESS_DATA_CHANGED: %',item.table_name; END IF;
 END LOOP;
 INSERT INTO "PartnerIndustryMigrationAudit"(version,mappings) VALUES('20261022200000',jsonb_build_object('before',snapshots,'mapping',changed,'preservedTables',10));
END $migration$;
