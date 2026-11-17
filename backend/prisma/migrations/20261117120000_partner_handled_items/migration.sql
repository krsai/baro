ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "handledItemSelection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "handledItemRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "PartnerHandledPolicy" (
 "orgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "entityId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1,
 "updatedByEmployeeId" INTEGER NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "writeXid" BIGINT NOT NULL DEFAULT txid_current(),
 PRIMARY KEY("orgId","entityId"),
 FOREIGN KEY("updatedByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE IF NOT EXISTS "PartnerHandledSelection" (
 "orgId" INTEGER NOT NULL,"entityId" INTEGER NOT NULL,
 "industryId" INTEGER NOT NULL REFERENCES "SettingServiceDefault"(id) ON DELETE RESTRICT,
 "baseId" INTEGER NOT NULL REFERENCES "TransactionCodeBase"(id) ON DELETE RESTRICT,
 PRIMARY KEY("orgId","entityId","industryId","baseId"),
 FOREIGN KEY("orgId","entityId") REFERENCES "PartnerHandledPolicy"("orgId","entityId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "PartnerHandledAudit" (
 id SERIAL PRIMARY KEY,"orgId" INTEGER NOT NULL,"entityId" INTEGER NOT NULL,revision INTEGER NOT NULL,
 "actorId" INTEGER NOT NULL,"before" JSONB NOT NULL,"after" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("orgId","entityId",revision),
 FOREIGN KEY("orgId","entityId") REFERENCES "PartnerHandledPolicy"("orgId","entityId") ON DELETE RESTRICT,
 FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE OR REPLACE FUNCTION baro_partner_handled_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header "PartnerHandledPolicy"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='PartnerHandledPolicy' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'handled policy history is retained'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'active handled policy actor required'; END IF;
  IF NEW."orgId"=NEW."entityId" OR NOT (EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."entityId" AND "ownerOrgId"=NEW."orgId") OR EXISTS(SELECT 1 FROM "OrgRelationship" WHERE ("manufacturerOrgId"=NEW."orgId" AND "brandOrgId"=NEW."entityId") OR ("brandOrgId"=NEW."orgId" AND "manufacturerOrgId"=NEW."entityId"))) THEN RAISE EXCEPTION 'handled policy relationship required'; END IF;
  IF TG_OP='INSERT' AND NEW.revision<>1 THEN RAISE EXCEPTION 'invalid handled policy revision'; END IF;
  IF TG_OP='UPDATE' AND (NEW."orgId"<>OLD."orgId" OR NEW."entityId"<>OLD."entityId" OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'invalid handled policy revision'; END IF;
  NEW."writeXid":=txid_current();NEW."updatedAt":=CURRENT_TIMESTAMP;RETURN NEW;
 ELSIF TG_TABLE_NAME='PartnerHandledAudit' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'handled audit is immutable'; END IF;
  SELECT * INTO header FROM "PartnerHandledPolicy" WHERE "orgId"=NEW."orgId" AND "entityId"=NEW."entityId";
  IF header."writeXid"<>txid_current() OR header.revision<>NEW.revision OR header."updatedByEmployeeId"<>NEW."actorId" OR jsonb_typeof(NEW."before")<>'array' OR jsonb_typeof(NEW."after")<>'array' THEN RAISE EXCEPTION 'invalid handled audit'; END IF;
  IF NEW."before" IS DISTINCT FROM coalesce((SELECT "after" FROM "PartnerHandledAudit" WHERE "orgId"=NEW."orgId" AND "entityId"=NEW."entityId" AND revision=NEW.revision-1),'[]'::jsonb) THEN RAISE EXCEPTION 'invalid handled audit chain'; END IF;
  RETURN NEW;
 ELSE
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'replace handled selections with a new revision'; END IF;
  SELECT * INTO header FROM "PartnerHandledPolicy" WHERE "orgId"=CASE WHEN TG_OP='DELETE' THEN OLD."orgId" ELSE NEW."orgId" END AND "entityId"=CASE WHEN TG_OP='DELETE' THEN OLD."entityId" ELSE NEW."entityId" END;
  IF header."writeXid" IS DISTINCT FROM txid_current() THEN RAISE EXCEPTION 'handled selection revision required'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NOT EXISTS(SELECT 1 FROM "AccountingCodeIndustry" l JOIN "SettingServiceDefault" s ON s.id=l."systemIndustryId" JOIN "TransactionCodeBase" b ON b.id=l."baseId" WHERE s.id=NEW."industryId" AND b.id=NEW."baseId" AND s."handledItemSelection" AND s."isActive" AND b."isActive") AND NOT EXISTS(SELECT 1 FROM "PartnerHandledAudit" a CROSS JOIN LATERAL jsonb_array_elements(a."after") g WHERE a."orgId"=NEW."orgId" AND a."entityId"=NEW."entityId" AND a.revision=header.revision-1 AND (g->>'industryId')::integer=NEW."industryId" AND g->'baseIds' @> to_jsonb(ARRAY[NEW."baseId"])) THEN RAISE EXCEPTION 'invalid handled code link'; END IF;
  RETURN NEW;
 END IF;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['PartnerHandledPolicy','PartnerHandledSelection','PartnerHandledAudit'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I',tab||'_guard',tab);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION baro_partner_handled_guard()',tab||'_guard',tab);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION baro_partner_handled_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('industryId',s."industryId",'baseIds',s.ids) ORDER BY s."industryId"),'[]'::jsonb) INTO snapshot FROM (SELECT "industryId",jsonb_agg("baseId" ORDER BY "baseId") ids FROM "PartnerHandledSelection" WHERE "orgId"=NEW."orgId" AND "entityId"=NEW."entityId" GROUP BY "industryId") s;
 IF NOT EXISTS(SELECT 1 FROM "PartnerHandledAudit" WHERE "orgId"=NEW."orgId" AND "entityId"=NEW."entityId" AND revision=NEW.revision AND "after"=snapshot) THEN RAISE EXCEPTION 'complete handled policy audit required'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS "PartnerHandledPolicy_complete" ON "PartnerHandledPolicy";
CREATE CONSTRAINT TRIGGER "PartnerHandledPolicy_complete" AFTER INSERT OR UPDATE ON "PartnerHandledPolicy" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_partner_handled_complete();
