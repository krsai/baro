-- Connected manufacturers may register/edit a brand's product without owning it.
-- No business rows or prior revisions are modified by this migration.
CREATE FUNCTION baro_style_product_can_edit(actor_org INTEGER,owner_org INTEGER) RETURNS BOOLEAN AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM "Organization" a JOIN "Organization" o ON o.id=owner_org AND o."isActive"
 WHERE a.id=actor_org AND a."isActive" AND (actor_org=owner_org OR a.type::text='MANUFACTURER' AND baro_style_product_trade_connected(actor_org,owner_org))),false);
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION baro_style_product_resolve_owner(manufacturer INTEGER,customer INTEGER) RETURNS INTEGER AS $$
DECLARE targets INTEGER[]; result INTEGER;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "Organization" WHERE id=manufacturer AND type::text='MANUFACTURER' AND "isActive")
 OR NOT EXISTS(SELECT 1 FROM "OrgRelationship" r JOIN "Organization" c ON c.id=r."brandOrgId" AND c."isActive" WHERE r."manufacturerOrgId"=manufacturer AND r."brandOrgId"=customer)
 THEN RAISE EXCEPTION 'STYLE_PRODUCT_TRADING_RELATIONSHIP_REQUIRED'; END IF;
 SELECT array_agg(DISTINCT id) INTO targets FROM (
  SELECT l."targetOrgId" AS id FROM "CompanyPartnerLink" l WHERE l."orgId"=manufacturer AND l."entityId"=customer
  UNION SELECT i."anchorEntityId" FROM "CompanyIdentityLink" l JOIN "CompanyIdentity" i ON i.id=l."identityId" WHERE l."orgId"=manufacturer AND l."entityId"=customer
 ) t;
 IF COALESCE(cardinality(targets),0)>1 THEN RAISE EXCEPTION 'STYLE_PRODUCT_LINK_INVALID'; END IF;
 result:=COALESCE(targets[1],customer);
 IF NOT baro_style_product_can_edit(manufacturer,result) THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_REQUIRED'; END IF;
 RETURN result;
END $$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION baro_style_product_guard() RETURNS TRIGGER AS $$
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
 IF NOT baro_style_product_can_edit(NULLIF(current_setting('baro.style_product_actor_org',true),'')::INTEGER,NEW."ownerOrgId")
 THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_REQUIRED'; END IF;
 IF NEW.fields - ARRAY['code','name','registrationDate','designer','season','imageUrls'] <> '{}'::jsonb
   OR jsonb_typeof(NEW.fields->'code')<>'string' OR jsonb_typeof(NEW.fields->'name')<>'string'
   OR btrim(COALESCE(NEW.fields->>'code',''))='' OR btrim(COALESCE(NEW.fields->>'name',''))=''
   THEN RAISE EXCEPTION 'STYLE_PRODUCT_FIELDS_INVALID'; END IF;
 NEW."updatedAt":=CURRENT_TIMESTAMP;
 RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION baro_style_product_revision_guard() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "StyleProduct" p WHERE p.id=NEW."productId" AND p.revision=NEW.revision
    AND p."ownerOrgId"=NEW."ownerOrgId" AND p.fields=NEW.fields
    AND baro_style_product_can_edit(NEW."actorOrgId",p."ownerOrgId")) THEN RAISE EXCEPTION 'STYLE_PRODUCT_HISTORY_INVALID'; END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'STYLE_PRODUCT_HISTORY_APPEND_ONLY';
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION baro_style_product_record_revision() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.fields=OLD.fields THEN RETURN NEW; END IF;
 INSERT INTO "StyleProductRevision"("productId",revision,"ownerOrgId","actorOrgId",fields)
 VALUES(NEW.id,NEW.revision,NEW."ownerOrgId",
 COALESCE(NULLIF(current_setting('baro.style_product_actor_org',true),'')::INTEGER,NEW."ownerOrgId"),NEW.fields);
 RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION baro_style_production_product_link() RETURNS TRIGGER AS $$
DECLARE product "StyleProduct"; data JSONB; previous_actor TEXT;
BEGIN
 data:=baro_style_product_fields(to_jsonb(NEW));
 previous_actor:=current_setting('baro.style_product_actor_org',true);
 IF TG_OP='INSERT' AND NEW."productStyleId" IS NULL THEN
   PERFORM set_config('baro.style_product_actor_org',NEW."orgId"::text,true);
   INSERT INTO "StyleProduct"("ownerOrgId","custodianOrgId","sourceStyleId",fields)
    VALUES(baro_style_product_resolve_owner(NEW."orgId",NEW."customerOrgId"),NEW."orgId",NEW.id,data) RETURNING * INTO product;
   PERFORM set_config('baro.style_product_actor_org',COALESCE(previous_actor,''),true);
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
   IF data IS DISTINCT FROM product.fields AND product.fields IS DISTINCT FROM baro_style_product_fields(to_jsonb(OLD))
     THEN RAISE EXCEPTION 'STYLE_PRODUCT_REVISION_CONFLICT'; END IF;
   IF NOT baro_style_product_can_edit(NEW."orgId",product."ownerOrgId") THEN RAISE EXCEPTION 'STYLE_PRODUCT_OWNER_REQUIRED'; END IF;
   PERFORM set_config('baro.style_product_actor_org',NEW."orgId"::text,true);
   UPDATE "StyleProduct" SET fields=data,revision=revision+1 WHERE id=product.id AND fields IS DISTINCT FROM data;
   SELECT revision INTO NEW."appliedProductRevision" FROM "StyleProduct" WHERE id=product.id;
   PERFORM set_config('baro.style_product_actor_org',COALESCE(previous_actor,''),true);
 END IF;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
