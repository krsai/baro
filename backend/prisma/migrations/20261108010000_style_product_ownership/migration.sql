-- Additive split only. Style.orgId and every historical production/financial FK stay intact.
LOCK TABLE "Style" IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE style_product_preservation (entity TEXT PRIMARY KEY,digest TEXT) ON COMMIT DROP;
INSERT INTO style_product_preservation SELECT 'Style',md5(COALESCE(string_agg(to_jsonb(s)::text,'' ORDER BY id),'')) FROM "Style" s;
CREATE TABLE "StyleProduct" (
 id SERIAL PRIMARY KEY,
 "ownerOrgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "custodianOrgId" INTEGER REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 "sourceStyleId" INTEGER UNIQUE,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
 fields JSONB NOT NULL CHECK (jsonb_typeof(fields)='object'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StyleProduct_id_owner_key" UNIQUE(id,"ownerOrgId")
);
CREATE INDEX "StyleProduct_ownerOrgId_idx" ON "StyleProduct"("ownerOrgId");
CREATE UNIQUE INDEX "StyleProduct_owner_code_key" ON "StyleProduct"("ownerOrgId",(fields->>'code'));
CREATE TABLE "StyleProductRevision" (
 "productId" INTEGER NOT NULL,
 revision INTEGER NOT NULL,
 "ownerOrgId" INTEGER NOT NULL,
 "actorOrgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 fields JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("productId",revision),
 FOREIGN KEY("productId","ownerOrgId") REFERENCES "StyleProduct"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- This whitelist deliberately excludes manufacturer categories, BOM, revenue
-- memo, packaging, process data, PT/ST/AT and quantity/time buckets.
CREATE FUNCTION baro_style_product_fields(row_data JSONB) RETURNS JSONB AS $$
 SELECT jsonb_build_object('code',row_data->'code','name',row_data->'name',
 'registrationDate',row_data->'registrationDate','designer',row_data->'designer',
 'season',row_data->'season','imageUrls',row_data->'imageUrls');
$$ LANGUAGE SQL IMMUTABLE;

INSERT INTO "StyleProduct"("ownerOrgId","custodianOrgId","sourceStyleId",fields,"createdAt","updatedAt")
 SELECT "customerOrgId","orgId",id,baro_style_product_fields(to_jsonb(s)),"createdAt","updatedAt" FROM "Style" s ORDER BY id;
INSERT INTO "StyleProductRevision"("productId",revision,"ownerOrgId","actorOrgId",fields,"createdAt")
 SELECT id,1,"ownerOrgId","custodianOrgId",fields,"createdAt" FROM "StyleProduct";
ALTER TABLE "Style" ADD COLUMN "productStyleId" INTEGER;
ALTER TABLE "Style" ADD COLUMN "productOwnerOrgId" INTEGER;
ALTER TABLE "Style" ADD COLUMN "appliedProductRevision" INTEGER NOT NULL DEFAULT 1;
UPDATE "Style" s SET "productStyleId"=p.id,"productOwnerOrgId"=p."ownerOrgId" FROM "StyleProduct" p WHERE p."sourceStyleId"=s.id;
ALTER TABLE "Style" ALTER COLUMN "productStyleId" SET NOT NULL;
ALTER TABLE "Style" ALTER COLUMN "productOwnerOrgId" SET NOT NULL;
ALTER TABLE "Style" ADD CONSTRAINT "Style_product_owner_fkey" FOREIGN KEY("productStyleId","productOwnerOrgId")
 REFERENCES "StyleProduct"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Style" ADD CONSTRAINT "Style_product_revision_fkey" FOREIGN KEY("productStyleId","appliedProductRevision")
 REFERENCES "StyleProductRevision"("productId",revision) ON DELETE RESTRICT ON UPDATE RESTRICT;
-- Preserve the deployed local-customer identity indexes for old API writers.
-- Each producer retains its own local customer ID while sharing productStyleId.
CREATE UNIQUE INDEX "Style_manufacturer_product_key" ON "Style"("orgId","productStyleId");

-- A real trading relationship permits catalogue lookup. Company identity alone
-- does not; it only resolves the company on the already-existing relationship.
CREATE FUNCTION baro_style_product_trade_connected(manufacturer INTEGER, brand INTEGER, local_customer INTEGER DEFAULT NULL) RETURNS BOOLEAN AS $$
 SELECT EXISTS(SELECT 1 FROM "OrgRelationship" r
 JOIN "Organization" c ON c.id=r."brandOrgId" AND c."isActive"
 WHERE r."manufacturerOrgId"=manufacturer AND (local_customer IS NULL OR r."brandOrgId"=local_customer)
 AND (r."brandOrgId"=brand
   OR EXISTS(SELECT 1 FROM "CompanyPartnerLink" l WHERE l."orgId"=manufacturer AND l."entityId"=r."brandOrgId" AND l."targetOrgId"=brand)
   OR EXISTS(SELECT 1 FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" i ON i.id=l."identityId"
     WHERE l."orgId"=manufacturer AND l."entityId"=r."brandOrgId" AND i."anchorEntityId"=brand)));
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION baro_style_product_revision_guard() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "StyleProduct" p WHERE p.id=NEW."productId" AND p.revision=NEW.revision
    AND p."ownerOrgId"=NEW."ownerOrgId" AND p.fields=NEW.fields
    AND NEW."actorOrgId" IN (p."ownerOrgId",p."custodianOrgId")) THEN RAISE EXCEPTION 'STYLE_PRODUCT_HISTORY_INVALID'; END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'STYLE_PRODUCT_HISTORY_APPEND_ONLY';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "StyleProductRevision_append_only" BEFORE INSERT OR UPDATE OR DELETE ON "StyleProductRevision"
 FOR EACH ROW EXECUTE FUNCTION baro_style_product_revision_guard();

-- Never delete product originals when a producer removes an unused local style.
-- Legacy producer editing is custody on behalf of a non-subscribed owner. A
-- subscribed owner must edit the original through its own company scope.
CREATE FUNCTION baro_style_product_guard() RETURNS TRIGGER AS $$
DECLARE product "StyleProduct"; data JSONB;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STYLE_PRODUCT_DELETE_REQUIRES_SEPARATE_WORKFLOW'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW."custodianOrgId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=NEW."custodianOrgId" AND type::text='MANUFACTURER')
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_MANUFACTURER_REQUIRED'; END IF;
   IF NEW.revision<>1 THEN RAISE EXCEPTION 'STYLE_PRODUCT_REVISION_CONFLICT'; END IF;
   RETURN NEW;
 END IF;
 IF (NEW.id,NEW."ownerOrgId",NEW."custodianOrgId",NEW."sourceStyleId",NEW."createdAt") IS DISTINCT FROM
    (OLD.id,OLD."ownerOrgId",OLD."custodianOrgId",OLD."sourceStyleId",OLD."createdAt")
   THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_IMMUTABLE'; END IF;
 IF NEW.fields=OLD.fields THEN
   IF NEW.revision<>OLD.revision THEN RAISE EXCEPTION 'STYLE_PRODUCT_REVISION_CONFLICT'; END IF;
   RETURN OLD;
 END IF;
 IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'STYLE_PRODUCT_REVISION_CONFLICT'; END IF;
 IF current_setting('baro.style_product_actor_org',true) IS DISTINCT FROM OLD."ownerOrgId"::text THEN
   IF current_setting('baro.style_product_custody',true) IS DISTINCT FROM OLD.id::text
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM "Organization" o WHERE o.id=OLD."ownerOrgId" AND o."isActive" AND o."ownerOrgId" IS NULL
      AND (o."dataOwnerOrgId" IS NULL OR o."dataOwnerOrgId"=o.id)
      AND EXISTS(SELECT 1 FROM "Employee" e WHERE e."orgId"=o.id AND e.status::text='ACTIVE'))
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_REQUIRED'; END IF;
 END IF;
 IF NEW.fields - ARRAY['code','name','registrationDate','designer','season','imageUrls'] <> '{}'::jsonb
   OR jsonb_typeof(NEW.fields->'code')<>'string' OR jsonb_typeof(NEW.fields->'name')<>'string'
   OR btrim(COALESCE(NEW.fields->>'code',''))='' OR btrim(COALESCE(NEW.fields->>'name',''))=''
   THEN RAISE EXCEPTION 'STYLE_PRODUCT_FIELDS_INVALID'; END IF;
 NEW."updatedAt":=CURRENT_TIMESTAMP;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "StyleProduct_guard" BEFORE INSERT OR UPDATE OR DELETE ON "StyleProduct"
 FOR EACH ROW EXECUTE FUNCTION baro_style_product_guard();

CREATE FUNCTION baro_style_product_record_revision() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.fields=OLD.fields THEN RETURN NEW; END IF;
 INSERT INTO "StyleProductRevision"("productId",revision,"ownerOrgId","actorOrgId",fields)
 VALUES(NEW.id,NEW.revision,NEW."ownerOrgId",
 CASE WHEN current_setting('baro.style_product_actor_org',true)=NEW."ownerOrgId"::text THEN NEW."ownerOrgId" ELSE COALESCE(NEW."custodianOrgId",NEW."ownerOrgId") END,NEW.fields);
 RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "StyleProduct_revision" AFTER INSERT OR UPDATE ON "StyleProduct"
 FOR EACH ROW EXECUTE FUNCTION baro_style_product_record_revision();

CREATE FUNCTION baro_style_production_product_link() RETURNS TRIGGER AS $$
DECLARE product "StyleProduct"; data JSONB;
BEGIN
 data:=baro_style_product_fields(to_jsonb(NEW));
 IF TG_OP='INSERT' AND NEW."productStyleId" IS NULL THEN
   INSERT INTO "StyleProduct"("ownerOrgId","custodianOrgId","sourceStyleId",fields)
    VALUES(NEW."customerOrgId",NEW."orgId",NEW.id,data) RETURNING * INTO product;
   NEW."productStyleId":=product.id;
   NEW."productOwnerOrgId":=product."ownerOrgId";
   NEW."appliedProductRevision":=product.revision;
   RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND (NEW."productStyleId",NEW."productOwnerOrgId",NEW."appliedProductRevision",NEW."customerOrgId",NEW."orgId") IS DISTINCT FROM
   (OLD."productStyleId",OLD."productOwnerOrgId",OLD."appliedProductRevision",OLD."customerOrgId",OLD."orgId") THEN RAISE EXCEPTION 'STYLE_PRODUCT_LINK_IMMUTABLE'; END IF;
 SELECT * INTO product FROM "StyleProduct" WHERE id=NEW."productStyleId" FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STYLE_PRODUCT_LINK_INVALID'; END IF;
 IF TG_OP='INSERT' THEN
   IF NOT baro_style_product_trade_connected(NEW."orgId",product."ownerOrgId",NEW."customerOrgId")
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_TRADING_RELATIONSHIP_REQUIRED'; END IF;
   IF NEW."productOwnerOrgId" IS NOT NULL AND NEW."productOwnerOrgId"<>product."ownerOrgId"
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_LINK_INVALID'; END IF;
   NEW."productOwnerOrgId":=product."ownerOrgId";
   NEW."appliedProductRevision":=product.revision;
 END IF;
 IF TG_OP='INSERT' AND data IS DISTINCT FROM product.fields THEN RAISE EXCEPTION 'STYLE_PRODUCT_SPEC_MISMATCH'; END IF;
 IF TG_OP='UPDATE' AND data IS DISTINCT FROM baro_style_product_fields(to_jsonb(OLD)) THEN
   IF product."sourceStyleId" IS DISTINCT FROM NEW.id OR data IS DISTINCT FROM product.fields AND product.fields IS DISTINCT FROM baro_style_product_fields(to_jsonb(OLD))
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_REVISION_CONFLICT'; END IF;
   PERFORM set_config('baro.style_product_custody',product.id::text,true);
   UPDATE "StyleProduct" SET fields=data,revision=revision+1 WHERE id=product.id AND fields IS DISTINCT FROM data;
   SELECT revision INTO NEW."appliedProductRevision" FROM "StyleProduct" WHERE id=product.id;
   PERFORM set_config('baro.style_product_custody','',true);
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
-- Run after existing manufacturer-owner normalization triggers.
CREATE TRIGGER "zz_Style_product_link" BEFORE INSERT OR UPDATE ON "Style"
 FOR EACH ROW EXECUTE FUNCTION baro_style_production_product_link();

DO $$ BEGIN
 IF (SELECT md5(COALESCE(string_agg((to_jsonb(s)-ARRAY['productStyleId','productOwnerOrgId','appliedProductRevision'])::text,'' ORDER BY id),'')) FROM "Style" s)
   IS DISTINCT FROM (SELECT digest FROM style_product_preservation WHERE entity='Style')
 THEN RAISE EXCEPTION 'STYLE_PRODUCT_PRESERVATION_FAILED'; END IF;
 IF EXISTS(SELECT 1 FROM "Style" s LEFT JOIN "StyleProduct" p ON p.id=s."productStyleId"
   WHERE p.id IS NULL OR p."ownerOrgId"<>s."customerOrgId" OR p."custodianOrgId"<>s."orgId"
     OR p.fields IS DISTINCT FROM baro_style_product_fields(to_jsonb(s)))
 THEN RAISE EXCEPTION 'STYLE_PRODUCT_BACKFILL_FAILED'; END IF;
END $$;
