ALTER TABLE "PartnerClassification" ALTER COLUMN "updatedByEmployeeId" DROP NOT NULL;
ALTER TABLE "PartnerClassification" ADD COLUMN IF NOT EXISTS "updatedBySystemUserId" INTEGER;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='PartnerClassification_system_editor_fkey') THEN
 ALTER TABLE "PartnerClassification" ADD CONSTRAINT "PartnerClassification_system_editor_fkey"
 FOREIGN KEY("updatedBySystemUserId") REFERENCES "SystemUser"(id) ON DELETE RESTRICT;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_partner_classification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE system_editor BOOLEAN;
BEGIN
 system_editor:=NEW."updatedBySystemUserId" IS NOT NULL AND NEW."updatedByEmployeeId" IS NULL
 AND EXISTS(SELECT 1 FROM "SystemUser" WHERE id=NEW."updatedBySystemUserId" AND "systemRole"::text='SYSTEM_ADMIN');
 IF NEW."orgId"=NEW."entityId" THEN
  IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."orgId" AND "ownerOrgId" IS NULL
   AND type::text IN ('MANUFACTURER','BRAND','SERVICE') AND (system_editor OR "isActive"))
  OR NOT system_editor AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId"
   AND status::text='ACTIVE' AND "orgRole"::text='ADMIN') THEN RAISE EXCEPTION 'COMPANY_INDUSTRY_ADMIN_REQUIRED'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "Organization" e WHERE e.id=NEW."entityId" AND e."ownerOrgId"=NEW."orgId"
   AND e.type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER')
   UNION ALL SELECT 1 FROM "OrgRelationship" r WHERE (r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=NEW."entityId")
   OR (r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=NEW."entityId")) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_SCOPE'; END IF;
  IF NOT system_editor AND NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId"
   AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_ACTOR'; END IF;
 END IF;
 IF NEW."updatedBySystemUserId" IS NOT NULL AND NOT system_editor THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_ACTOR'; END IF;
 IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."entityId"<>OLD."entityId" OR NEW.revision<>OLD.revision+1)
 THEN RAISE EXCEPTION 'PARTNER_CLASSIFICATION_REVISION'; END IF;
 RETURN NEW;
END $$;
