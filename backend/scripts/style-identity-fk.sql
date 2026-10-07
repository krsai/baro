-- Run only in an explicit transaction; use migrate-style-identity.js for rollback rehearsal.
ALTER TABLE "Style" ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "AttrCategory_id_orgId_key" ON "AttrCategory"("id", "orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessMasterOption_id_type_key" ON "ProcessMasterOption"("id", "type");
CREATE TABLE IF NOT EXISTS "StyleIdentityArchive" (
  "entity" TEXT NOT NULL, "entityId" INTEGER NOT NULL, "original" JSONB NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("entity", "entityId")
);
CREATE TABLE IF NOT EXISTS "StyleProcessComponent" (
  "styleProcessId" INTEGER NOT NULL REFERENCES "StyleProcess"("id") ON DELETE CASCADE,
  "path" TEXT NOT NULL, "type" "ProcessMasterOptionType" NOT NULL, "masterOptionId" INTEGER NOT NULL,
  PRIMARY KEY ("styleProcessId", "path"),
  CONSTRAINT "StyleProcessComponent_master_fkey" FOREIGN KEY ("masterOptionId", "type")
    REFERENCES "ProcessMasterOption"("id", "type") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "StyleProcessComponent_masterOptionId_idx" ON "StyleProcessComponent"("masterOptionId");

-- The existing UI aliases PART to LOCATION and SPEC to TARGET_SPEC. Give those
-- choices current typed copies without changing IDs/types used by history.
DO $$ DECLARE legacy RECORD; current_id INTEGER; matches INTEGER; current_type TEXT; BEGIN
  FOR legacy IN SELECT * FROM "ProcessMasterOption" WHERE type::TEXT IN ('PART','SPEC') LOOP
    IF EXISTS (SELECT 1 FROM "StyleIdentityArchive" WHERE entity='ProcessMasterOptionLegacyCopy' AND "entityId"=legacy.id) THEN CONTINUE; END IF;
    current_type:=CASE legacy.type::TEXT WHEN 'PART' THEN 'LOCATION' ELSE 'TARGET_SPEC' END;
    SELECT count(*),min(id) INTO matches,current_id FROM "ProcessMasterOption"
      WHERE type::TEXT=current_type AND upper(btrim(code))=upper(btrim(legacy.code));
    IF matches>1 THEN RAISE EXCEPTION 'STYLE_IDENTITY_LEGACY_MASTER_AMBIGUOUS: % %',current_type,legacy.code; END IF;
    IF matches=0 THEN
      INSERT INTO "ProcessMasterOption"(type,code,label,"nameKo","nameEn","nameVi","sortOrder","updatedAt")
      VALUES (current_type::"ProcessMasterOptionType",legacy.code,legacy.label,legacy."nameKo",legacy."nameEn",legacy."nameVi",legacy."sortOrder",CURRENT_TIMESTAMP)
      RETURNING id INTO current_id;
    END IF;
    INSERT INTO "StyleIdentityArchive"("entity","entityId","original")
      VALUES ('ProcessMasterOptionLegacyCopy',legacy.id,jsonb_build_object('legacy',to_jsonb(legacy),'currentMasterId',current_id));
  END LOOP;
END $$;

-- Do not infer categories across organizations or customers.
DO $$ DECLARE conflicts JSONB; BEGIN
  SELECT jsonb_agg(to_jsonb(c)) INTO conflicts FROM (
    SELECT s.id, s."orgId", s.collection, count(a.id) AS candidates
    FROM "Style" s LEFT JOIN "AttrCategory" a ON a."orgId"=s."orgId" AND a.name=btrim(s.collection)
    WHERE s."categoryId" IS NULL AND coalesce(btrim(s.collection),'')<>''
    GROUP BY s.id HAVING count(a.id)<>1
  ) c;
  IF conflicts IS NOT NULL THEN RAISE EXCEPTION 'STYLE_IDENTITY_CATEGORY_AMBIGUOUS: %', conflicts; END IF;
END $$;
INSERT INTO "StyleIdentityArchive"("entity","entityId","original")
SELECT 'Style', id, to_jsonb(s) FROM "Style" s ON CONFLICT DO NOTHING;
UPDATE "Style" s SET "categoryId"=a.id FROM "AttrCategory" a
WHERE s."categoryId" IS NULL AND a."orgId"=s."orgId" AND a.name=btrim(s.collection) AND coalesce(btrim(s.collection),'')<>'';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Style_category_manufacturer_fkey') THEN
    ALTER TABLE "Style" ADD CONSTRAINT "Style_category_manufacturer_fkey"
      FOREIGN KEY ("categoryId","orgId") REFERENCES "AttrCategory"("id","orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- Recursive traversal preserves array positions, pair associations and legacy JSON topology.
CREATE OR REPLACE FUNCTION style_identity_entries(j JSONB, p TEXT[] DEFAULT ARRAY[]::TEXT[], t TEXT DEFAULT NULL)
RETURNS TABLE(path TEXT[], entry JSONB, kind TEXT) LANGUAGE plpgsql AS $$
DECLARE k TEXT; v JSONB; i INTEGER; next_kind TEXT;
BEGIN
  IF j IS NULL OR j='null'::jsonb THEN RETURN; END IF;
  IF jsonb_typeof(j)='array' THEN
    i:=0;
    FOR v IN SELECT value FROM jsonb_array_elements(j) LOOP
      RETURN QUERY SELECT * FROM style_identity_entries(v,p||i::TEXT,t); i:=i+1;
    END LOOP;
  ELSIF jsonb_typeof(j)='object' THEN
    IF t IS NOT NULL AND (j ? 'code' OR j ? 'label' OR j ? 'masterOptionId' OR j ? 'nameKo') THEN
      path:=p; entry:=j; kind:=t; RETURN NEXT; RETURN;
    END IF;
    FOR k,v IN SELECT key,value FROM jsonb_each(j) LOOP
      next_kind:=CASE k
        WHEN 'locations' THEN 'LOCATION' WHEN 'location' THEN 'LOCATION' WHEN 'parts' THEN 'PART' WHEN 'part' THEN 'PART'
        WHEN 'targets' THEN 'TARGET' WHEN 'target' THEN 'TARGET'
        WHEN 'targetSpecs' THEN 'TARGET_SPEC' WHEN 'targetSpec' THEN 'TARGET_SPEC' WHEN 'specs' THEN 'SPEC'
        WHEN 'actions' THEN 'ACTION' WHEN 'action' THEN 'ACTION'
        WHEN 'actionSpecs' THEN 'ACTION_SPEC' WHEN 'actionSpec' THEN 'ACTION_SPEC' ELSE t END;
      RETURN QUERY SELECT * FROM style_identity_entries(v,p||k,next_kind);
    END LOOP;
  ELSIF t IS NOT NULL AND jsonb_typeof(j)='string' THEN
    path:=p; entry:=jsonb_build_object('label',j#>>'{}','isCustom',true); kind:=t; RETURN NEXT;
  END IF;
END $$;

DO $$ DECLARE r RECORD; e RECORD; master_id INTEGER; candidate_count INTEGER; j JSONB; code_value TEXT; BEGIN
  FOR r IN SELECT id,"processComposition" FROM "StyleProcess" WHERE "processComposition" IS NOT NULL AND "processComposition"<>'null'::jsonb LOOP
    INSERT INTO "StyleIdentityArchive" VALUES ('StyleProcess',r.id,jsonb_build_object('processComposition',r."processComposition"),CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
    j:=r."processComposition";
    FOR e IN SELECT * FROM style_identity_entries(j) LOOP
      IF coalesce(e.entry->>'masterOptionId','')<>'' THEN CONTINUE; END IF;
      code_value:=upper(btrim(coalesce(e.entry->>'code','')));
      SELECT count(*),min(id) INTO candidate_count,master_id FROM "ProcessMasterOption"
        WHERE type::TEXT=e.kind AND upper(btrim(code))=code_value AND code_value<>'';
      IF candidate_count=0 AND e.kind IN ('PART','SPEC') THEN
        SELECT count(*),min(id) INTO candidate_count,master_id FROM "ProcessMasterOption"
          WHERE type::TEXT=CASE e.kind WHEN 'PART' THEN 'LOCATION' ELSE 'TARGET_SPEC' END
          AND upper(btrim(code))=code_value AND code_value<>'';
      END IF;
      IF candidate_count<>1 THEN
        IF candidate_count=0 AND coalesce((e.entry->>'isCustom')::BOOLEAN,false) THEN
          IF code_value='' THEN code_value:='FK_CUSTOM_'||r.id||'_'||substr(md5(e.path::TEXT),1,12); END IF;
          INSERT INTO "ProcessMasterOption"(type,code,label,"nameKo","nameEn","nameVi","updatedAt")
            VALUES (e.kind::"ProcessMasterOptionType",code_value,coalesce(e.entry->>'label',code_value),
              e.entry->>'nameKo',e.entry->>'nameEn',e.entry->>'nameVi',CURRENT_TIMESTAMP) RETURNING id INTO master_id;
        ELSE RAISE EXCEPTION 'STYLE_IDENTITY_COMPONENT_AMBIGUOUS: process %, path %, type %, code %, candidates %',r.id,e.path,e.kind,code_value,candidate_count;
        END IF;
      END IF;
      j:=jsonb_set(j,e.path,e.entry||jsonb_build_object('masterOptionId',master_id));
    END LOOP;
    IF j IS DISTINCT FROM r."processComposition" THEN UPDATE "StyleProcess" SET "processComposition"=j WHERE id=r.id; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION style_identity_sync_components() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE e RECORD; actual_kind TEXT; BEGIN
  DELETE FROM "StyleProcessComponent" WHERE "styleProcessId"=NEW.id;
  FOR e IN SELECT * FROM style_identity_entries(NEW."processComposition") LOOP
    IF coalesce(e.entry->>'masterOptionId','') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'STYLE_IDENTITY_MASTER_ID_REQUIRED: process %, path %',NEW.id,e.path;
    END IF;
    SELECT type::TEXT INTO actual_kind FROM "ProcessMasterOption" WHERE id=(e.entry->>'masterOptionId')::INTEGER;
    IF actual_kind IS DISTINCT FROM e.kind AND NOT
      (e.kind='PART' AND actual_kind='LOCATION' OR e.kind='SPEC' AND actual_kind='TARGET_SPEC') THEN
      RAISE EXCEPTION 'STYLE_IDENTITY_COMPONENT_WRONG_TYPE: process %, path %',NEW.id,e.path;
    END IF;
    INSERT INTO "StyleProcessComponent" VALUES (NEW.id,array_to_string(e.path,'/'),actual_kind::"ProcessMasterOptionType",(e.entry->>'masterOptionId')::INTEGER);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS style_identity_components ON "StyleProcess";
CREATE TRIGGER style_identity_components AFTER INSERT OR UPDATE OF "processComposition" ON "StyleProcess"
FOR EACH ROW EXECUTE FUNCTION style_identity_sync_components();
UPDATE "StyleProcess" SET "processComposition"="processComposition";

CREATE OR REPLACE FUNCTION style_identity_category_label() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE n TEXT; BEGIN
  IF NEW."categoryId" IS NOT NULL THEN
    SELECT name INTO n FROM "AttrCategory" WHERE id=NEW."categoryId" AND "orgId"=NEW."orgId" FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'STYLE_IDENTITY_CATEGORY_SCOPE'; END IF;
    NEW.collection:=n;
  ELSIF coalesce(btrim(NEW.collection),'')<>'' THEN RAISE EXCEPTION 'STYLE_IDENTITY_CATEGORY_ID_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS style_identity_category ON "Style";
CREATE TRIGGER style_identity_category BEFORE INSERT OR UPDATE OF "categoryId",collection,"orgId" ON "Style"
FOR EACH ROW EXECUTE FUNCTION style_identity_category_label();
CREATE OR REPLACE FUNCTION style_identity_rename_category() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  UPDATE "Style" SET collection=NEW.name WHERE "categoryId"=NEW.id AND "orgId"=NEW."orgId";
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS style_identity_category_rename ON "AttrCategory";
CREATE TRIGGER style_identity_category_rename AFTER UPDATE OF name ON "AttrCategory"
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION style_identity_rename_category();

-- Mark only after every backfill, constraint and trigger has succeeded.
CREATE TABLE IF NOT EXISTS "_BaroMigrationState" (
  "key" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "_BaroMigrationState"("key") VALUES ('20261007_style_identity_fk_v1') ON CONFLICT DO NOTHING;
