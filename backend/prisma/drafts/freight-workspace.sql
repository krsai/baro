-- DESIGN DRAFT ONLY. Not a runnable or approved migration.
-- Not registered in the migration runner, preflight or startup checks.
-- Requires service/UI implementation, policy review and database regression tests
-- before promotion to a new migration. Do not apply to any business database.

-- Additive workspace. Preserve all job IDs, original request/document snapshots,
-- legacy monetary rows and audit history. No company ownership reassignment.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightJob_sr_creator_org_fkey') THEN ALTER TABLE "FreightJob" ADD CONSTRAINT "FreightJob_sr_creator_org_fkey" FOREIGN KEY("requestCreatedByOrgId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
END $$;
CREATE TABLE IF NOT EXISTS "FreightRequestControl" (
 "jobId" TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 disposition TEXT NOT NULL DEFAULT 'OPEN',"cancelState" TEXT NOT NULL DEFAULT 'NONE',reason TEXT NOT NULL DEFAULT '',
 "updatedByOrgId" INTEGER NOT NULL,"updatedByEmployeeId" INTEGER NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FreightRequestControl_job_fkey" FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightRequestControl_actor_fkey" FOREIGN KEY("updatedByEmployeeId","updatedByOrgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightRequestControl_values_check" CHECK(version>0 AND disposition IN ('OPEN','WITHDRAWN','REJECTED') AND "cancelState" IN ('NONE','REQUESTED','DECLINED','CONFIRMED') AND length(reason)<=1000)
);
-- Seed only actual recorded creators. No guessed ownership or invented actors.
INSERT INTO "FreightRequestControl"("jobId","orgId","updatedByOrgId","updatedByEmployeeId","updatedAt")
 SELECT j.id,j."orgId",COALESCE(j."requestCreatedByOrgId",j."orgId"),COALESCE(j."requestCreatedByEmployeeId",j."createdByEmployeeId"),j."updatedAt"
 FROM "FreightJob" j JOIN "Employee" e ON e.id=COALESCE(j."requestCreatedByEmployeeId",j."createdByEmployeeId") AND e."orgId"=COALESCE(j."requestCreatedByOrgId",j."orgId") WHERE NOT EXISTS(SELECT 1 FROM "FreightRequestControl" c WHERE c."jobId"=j.id) ON CONFLICT("jobId") DO NOTHING;
CREATE TABLE IF NOT EXISTS "FreightRequestDecision" (
 "clientKey" TEXT PRIMARY KEY,"requestHash" TEXT NOT NULL,"jobId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,version INTEGER NOT NULL,
 "actorOrgId" INTEGER NOT NULL,"actorId" INTEGER NOT NULL,action TEXT NOT NULL,"before" JSONB NOT NULL,"after" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FreightRequestDecision_job_fkey" FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightRequestDecision_actor_fkey" FOREIGN KEY("actorId","actorOrgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightRequestDecision_revision_key" UNIQUE("jobId",version)
);
CREATE OR REPLACE FUNCTION baro_freight_request_control() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE j RECORD; owner_id INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 SELECT * INTO j FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SHIPPING_NOT_FOUND'; END IF;
 owner_id:=COALESCE(j."requestCreatedByOrgId",CASE WHEN j."createdByEmployeeId" IS NOT NULL THEN j."orgId" END);
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."updatedByOrgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) OR (NEW."updatedByOrgId"<>j."orgId" AND NEW."updatedByOrgId" IS DISTINCT FROM owner_id) THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.version<>1 OR NEW.disposition<>'OPEN' OR NEW."cancelState"<>'NONE' OR NEW."updatedByOrgId" IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'SHIPPING_INVALID'; END IF;
 ELSE
  IF (NEW."jobId",NEW."orgId") IS DISTINCT FROM (OLD."jobId",OLD."orgId") OR NEW.version<>OLD.version+1 OR OLD.disposition<>'OPEN' OR OLD."cancelState"='CONFIRMED' THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
  IF NEW.disposition<>OLD.disposition THEN
   IF j."receiptStatus"<>'PENDING' OR (NEW.disposition='WITHDRAWN' AND NEW."updatedByOrgId" IS DISTINCT FROM owner_id) OR (NEW.disposition='REJECTED' AND NEW."updatedByOrgId"<>j."orgId") OR NEW.disposition NOT IN ('WITHDRAWN','REJECTED') OR NEW."cancelState"<>OLD."cancelState" THEN RAISE EXCEPTION 'SHIPPING_ACTION_INVALID'; END IF;
  ELSIF NEW."cancelState"<>OLD."cancelState" THEN
   IF j."receiptStatus"<>'ACCEPTED' OR j.status IN ('CANCELLED','DELIVERED') OR NEW.disposition<>'OPEN' THEN RAISE EXCEPTION 'SHIPPING_ACTION_INVALID'; END IF;
   IF NEW."cancelState"='REQUESTED' THEN
    IF NEW."updatedByOrgId" IS DISTINCT FROM owner_id OR OLD."cancelState" NOT IN ('NONE','DECLINED') THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
   ELSIF NEW."cancelState" IN ('CONFIRMED','DECLINED') THEN
    IF NEW."updatedByOrgId"<>j."orgId" OR OLD."cancelState"<>'REQUESTED' THEN RAISE EXCEPTION 'SHIPPING_ACCESS_DENIED'; END IF;
   ELSE RAISE EXCEPTION 'SHIPPING_ACTION_INVALID'; END IF;
  ELSE RAISE EXCEPTION 'SHIPPING_ACTION_INVALID'; END IF;
  IF length(btrim(NEW.reason))=0 THEN RAISE EXCEPTION 'SHIPPING_REASON_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightRequestControl_guard" ON "FreightRequestControl";
CREATE TRIGGER "FreightRequestControl_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightRequestControl" FOR EACH ROW EXECUTE FUNCTION baro_freight_request_control();
CREATE OR REPLACE FUNCTION baro_freight_request_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FreightRequestControl" c WHERE c."jobId"=NEW."jobId" AND c."orgId"=NEW."orgId" AND c.version=NEW.version AND c."updatedByOrgId"=NEW."actorOrgId" AND c."updatedByEmployeeId"=NEW."actorId" AND (to_jsonb(c)-'updatedAt')=(NEW."after"-'updatedAt')) OR (NEW."before"->>'version')::int<>NEW.version-1 THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_freight_request_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "FreightRequestDecision" WHERE "jobId"=NEW."jobId" AND version=NEW.version AND ("before"-'updatedAt')=(to_jsonb(OLD)-'updatedAt') AND ("after"-'updatedAt')=(to_jsonb(NEW)-'updatedAt')) THEN RAISE EXCEPTION 'SHIPPING_AUDIT_REQUIRED'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightRequestDecision_guard" ON "FreightRequestDecision";
CREATE TRIGGER "FreightRequestDecision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightRequestDecision" FOR EACH ROW EXECUTE FUNCTION baro_freight_request_decision();
DROP TRIGGER IF EXISTS "FreightRequestControl_audit" ON "FreightRequestControl";
CREATE CONSTRAINT TRIGGER "FreightRequestControl_audit" AFTER UPDATE ON "FreightRequestControl" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_freight_request_audit();
CREATE OR REPLACE FUNCTION baro_freight_request_seed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF COALESCE(NEW."requestCreatedByEmployeeId",NEW."createdByEmployeeId") IS NOT NULL THEN
 INSERT INTO "FreightRequestControl"("jobId","orgId","updatedByOrgId","updatedByEmployeeId") VALUES(NEW.id,NEW."orgId",COALESCE(NEW."requestCreatedByOrgId",NEW."orgId"),COALESCE(NEW."requestCreatedByEmployeeId",NEW."createdByEmployeeId")) ON CONFLICT("jobId") DO NOTHING;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightJob_request_seed" ON "FreightJob";
CREATE TRIGGER "FreightJob_request_seed" AFTER INSERT ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_freight_request_seed();
CREATE OR REPLACE FUNCTION baro_freight_source_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id INTEGER; actor_org INTEGER;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  owner_id:=COALESCE(OLD."requestCreatedByOrgId",CASE WHEN OLD."createdByEmployeeId" IS NOT NULL THEN OLD."orgId" END);
  actor_org:=COALESCE(NULLIF(current_setting('baro.shipping_actor_org',true),'')::int,NEW."orgId");
  IF OLD."requestCreatedByOrgId" IS NOT NULL AND (NEW."requestCreatedByOrgId",NEW."requestCreatedByEmployeeId") IS DISTINCT FROM (OLD."requestCreatedByOrgId",OLD."requestCreatedByEmployeeId") THEN RAISE EXCEPTION 'SHIPPING_IDENTITY_IMMUTABLE'; END IF;
  IF OLD."requestSnapshot" IS NOT NULL AND NEW."requestSnapshot" IS DISTINCT FROM OLD."requestSnapshot" AND actor_org IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'SHIPPING_SOURCE_OWNER_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM "FreightRequestControl" WHERE "jobId"=OLD.id AND (disposition<>'OPEN' OR "cancelState"='CONFIRMED')) THEN RAISE EXCEPTION 'SHIPPING_REQUEST_CLOSED'; END IF;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "zz_FreightJob_source_owner" ON "FreightJob";
CREATE TRIGGER "zz_FreightJob_source_owner" BEFORE UPDATE OR DELETE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_freight_source_owner();

-- Retain the original registration job of each bill. Master links now span
-- jobs of the SAME operator company, never another company's records.
CREATE UNIQUE INDEX IF NOT EXISTS "FreightBill_id_orgId_kind_key" ON "FreightBill"(id,"orgId",kind);
CREATE UNIQUE INDEX IF NOT EXISTS "FreightBill_id_orgId_key" ON "FreightBill"(id,"orgId");
ALTER TABLE "FreightBill" DROP CONSTRAINT IF EXISTS "FreightBill_masterId_jobId_orgId_masterKind_fkey";
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightBill_master_company_fkey') THEN ALTER TABLE "FreightBill" ADD CONSTRAINT "FreightBill_master_company_fkey" FOREIGN KEY("masterId","orgId","masterKind") REFERENCES "FreightBill"(id,"orgId",kind) ON DELETE RESTRICT; END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_job_bill_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_mode TEXT; target_mode TEXT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 PERFORM pg_advisory_xact_lock(20261114,NEW."orgId");
 SELECT mode INTO source_mode FROM "FreightJob" WHERE id=NEW."jobId" AND "orgId"=NEW."orgId" FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM "FreightRequestControl" WHERE "jobId"=NEW."jobId" AND (disposition<>'OPEN' OR "cancelState"='CONFIRMED')) THEN RAISE EXCEPTION 'SHIPPING_REQUEST_CLOSED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."updatedByEmployeeId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."jobId"<>OLD."jobId" OR NEW."orgId"<>OLD."orgId" OR NEW.kind<>OLD.kind OR NEW."createdByEmployeeId"<>OLD."createdByEmployeeId" OR NEW."createdAt"<>OLD."createdAt" OR OLD."deletedAt" IS NOT NULL OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'FREIGHT_INVALID_REVISION'; END IF;
 IF NEW."masterId" IS NOT NULL THEN
  SELECT j.mode INTO target_mode FROM "FreightBill" b JOIN "FreightJob" j ON j.id=b."jobId" AND j."orgId"=b."orgId" WHERE b.id=NEW."masterId" AND b."orgId"=NEW."orgId" AND b.kind='MASTER' AND b."deletedAt" IS NULL FOR SHARE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
  IF target_mode<>source_mode THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF;
 END IF;
 IF NEW.kind='MASTER' AND NEW."deletedAt" IS NOT NULL AND EXISTS(SELECT 1 FROM "FreightBill" WHERE "masterId"=NEW.id AND "deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_HAS_HOUSES'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_freight_bill_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.mode<>OLD.mode AND EXISTS(SELECT 1 FROM "FreightBill" h JOIN "FreightBill" m ON m.id=h."masterId" AND m."orgId"=h."orgId" JOIN "FreightJob" j ON j.id=CASE WHEN h."jobId"=NEW.id THEN m."jobId" ELSE h."jobId" END AND j."orgId"=NEW."orgId" WHERE (h."jobId"=NEW.id OR m."jobId"=NEW.id) AND h."deletedAt" IS NULL AND m."deletedAt" IS NULL AND j.mode<>NEW.mode) THEN RAISE EXCEPTION 'FREIGHT_MASTER_MODE'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightJob_bill_mode" ON "FreightJob";
CREATE TRIGGER "FreightJob_bill_mode" BEFORE UPDATE ON "FreightJob" FOR EACH ROW EXECUTE FUNCTION baro_freight_bill_mode();

ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "counterpartyId" INTEGER;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "transactionCodeId" INTEGER;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "billId" TEXT;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "unitPrice" NUMERIC(24,4);
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "vatRate" NUMERIC(9,4) NOT NULL DEFAULT 0;
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS subtotal NUMERIC(24,4);
ALTER TABLE "ShippingChargeDraft" ADD COLUMN IF NOT EXISTS "vatAmount" NUMERIC(24,4);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingCharge_counterparty_fkey') THEN ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingCharge_counterparty_fkey" FOREIGN KEY("counterpartyId") REFERENCES "Organization"(id) ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingCharge_code_fkey') THEN ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingCharge_code_fkey" FOREIGN KEY("transactionCodeId","orgId") REFERENCES "TransactionCode"(id,"ownerOrgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingCharge_bill_fkey') THEN ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingCharge_bill_fkey" FOREIGN KEY("billId","orgId") REFERENCES "FreightBill"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ShippingCharge_values_check') THEN ALTER TABLE "ShippingChargeDraft" ADD CONSTRAINT "ShippingCharge_values_check" CHECK(status IN ('DRAFT','CONFIRMED','VOIDED') AND quantity>0 AND ("unitPrice" IS NULL OR "unitPrice">=0) AND "vatRate" BETWEEN 0 AND 100 AND (subtotal IS NULL OR subtotal>=0) AND ("vatAmount" IS NULL OR "vatAmount">=0) AND (subtotal IS NULL OR "vatAmount" IS NULL OR amount=subtotal+"vatAmount") AND (status<>'CONFIRMED' OR ("counterpartyId" IS NOT NULL AND "transactionCodeId" IS NOT NULL AND "unitPrice" IS NOT NULL AND subtotal IS NOT NULL AND "vatAmount" IS NOT NULL))); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceDraft_id_seller_key" ON "InvoiceDraft"(id,"sellerOrgId");
CREATE TABLE IF NOT EXISTS "FreightInvoiceDraft" (
 "draftId" TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"clientKey" TEXT NOT NULL,"sourceHash" TEXT NOT NULL,"sourceSnapshot" JSONB NOT NULL,"actorId" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FreightInvoiceDraft_request_key" UNIQUE("orgId","clientKey"),
 CONSTRAINT "FreightInvoiceDraft_draft_fkey" FOREIGN KEY("draftId","orgId") REFERENCES "InvoiceDraft"(id,"sellerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightInvoiceDraft_job_fkey" FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightInvoiceDraft_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "FreightInvoiceCharge" (
 "chargeId" TEXT PRIMARY KEY,"draftId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"chargeVersion" INTEGER NOT NULL,
 CONSTRAINT "FreightInvoiceCharge_draft_fkey" FOREIGN KEY("draftId") REFERENCES "FreightInvoiceDraft"("draftId") ON DELETE RESTRICT,
 CONSTRAINT "FreightInvoiceCharge_charge_fkey" FOREIGN KEY("chargeId","orgId","jobId") REFERENCES "ShippingChargeDraft"(id,"orgId","jobId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "FreightIssuedInvoice" (
 "invoiceId" TEXT PRIMARY KEY,"draftId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FreightIssuedInvoice_invoice_fkey" FOREIGN KEY("invoiceId","orgId") REFERENCES "Invoice"(id,"sellerOrgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightIssuedInvoice_draft_fkey" FOREIGN KEY("draftId") REFERENCES "FreightInvoiceDraft"("draftId") ON DELETE RESTRICT,
 CONSTRAINT "FreightIssuedInvoice_job_fkey" FOREIGN KEY("jobId","orgId") REFERENCES "FreightJob"(id,"orgId") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "FreightMasterCost" (
 id TEXT PRIMARY KEY,"orgId" INTEGER NOT NULL,"masterId" TEXT NOT NULL,"actorId" INTEGER NOT NULL,"currencyCode" TEXT NOT NULL,amount NUMERIC(24,4) NOT NULL,description TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FreightMasterCost_master_fkey" FOREIGN KEY("masterId","orgId") REFERENCES "FreightBill"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightMasterCost_actor_fkey" FOREIGN KEY("actorId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "FreightMasterCost_currency_fkey" FOREIGN KEY("currencyCode") REFERENCES "Currency"(code) ON DELETE RESTRICT,
 CONSTRAINT "FreightMasterCost_amount_check" CHECK(amount>=0)
);
CREATE TABLE IF NOT EXISTS "FreightMasterAllocation" (
 "chargeId" TEXT PRIMARY KEY,"costId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,"jobId" TEXT NOT NULL,amount NUMERIC(24,4) NOT NULL,
 CONSTRAINT "FreightMasterAllocation_cost_fkey" FOREIGN KEY("costId") REFERENCES "FreightMasterCost"(id) ON DELETE RESTRICT,
 CONSTRAINT "FreightMasterAllocation_charge_fkey" FOREIGN KEY("chargeId","orgId","jobId") REFERENCES "ShippingChargeDraft"(id,"orgId","jobId") ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION baro_shipping_charge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SHIPPING_HISTORY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "FreightJob" j JOIN "Employee" e ON e."orgId"=j."orgId" AND e.id=NEW."updatedByEmployeeId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','ACCOUNTANT','OPERATOR') WHERE j.id=NEW."jobId" AND j."orgId"=NEW."orgId" AND j."receiptStatus"='ACCEPTED' AND j.status<>'CANCELLED') OR EXISTS(SELECT 1 FROM "FreightRequestControl" WHERE "jobId"=NEW."jobId" AND (disposition<>'OPEN' OR "cancelState"='CONFIRMED')) THEN RAISE EXCEPTION 'SHIPPING_CHARGE_SCOPE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW."orgId",NEW."jobId",NEW."createdByEmployeeId",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."orgId",OLD."jobId",OLD."createdByEmployeeId",OLD."createdAt") OR NEW.version<>OLD.version+1 OR OLD.status='VOIDED' THEN RAISE EXCEPTION 'SHIPPING_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM "FreightInvoiceCharge" WHERE "chargeId"=OLD.id) THEN RAISE EXCEPTION 'FREIGHT_CHARGE_BILLED'; END IF;
  IF EXISTS(SELECT 1 FROM "FreightMasterAllocation" WHERE "chargeId"=OLD.id) AND (NEW.status<>'VOIDED' OR (to_jsonb(NEW)-ARRAY['status','version','updatedAt','updatedByEmployeeId']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updatedAt','updatedByEmployeeId'])) THEN RAISE EXCEPTION 'FREIGHT_ALLOCATION_IMMUTABLE'; END IF;
 END IF;
 IF NEW."counterpartyId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."counterpartyId" AND p.id<>NEW."orgId" AND p."isActive" AND (p."ownerOrgId"=NEW."orgId" OR p."dataOwnerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id))) THEN RAISE EXCEPTION 'FREIGHT_PARTY_SCOPE'; END IF;
 IF NEW."billId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightBill" b WHERE b.id=NEW."billId" AND b."orgId"=NEW."orgId" AND b."deletedAt" IS NULL AND (b."jobId"=NEW."jobId" OR b.kind='MASTER' AND EXISTS(SELECT 1 FROM "FreightBill" h WHERE h."jobId"=NEW."jobId" AND h."masterId"=b.id AND h."deletedAt" IS NULL))) THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_freight_money_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'FREIGHT_HISTORY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='FreightInvoiceCharge' THEN
  IF NOT EXISTS(SELECT 1 FROM "FreightInvoiceDraft" d JOIN "ShippingChargeDraft" c ON c.id=NEW."chargeId" AND c."orgId"=d."orgId" AND c."jobId"=d."jobId" WHERE d."draftId"=NEW."draftId" AND d."orgId"=NEW."orgId" AND d."jobId"=NEW."jobId" AND c.version=NEW."chargeVersion" AND c.status='CONFIRMED' AND c.direction='SALES') THEN RAISE EXCEPTION 'FREIGHT_INVOICE_SCOPE'; END IF;
 ELSIF TG_TABLE_NAME='FreightMasterAllocation' THEN
  IF NOT EXISTS(SELECT 1 FROM "FreightMasterCost" p JOIN "ShippingChargeDraft" c ON c.id=NEW."chargeId" AND c."orgId"=p."orgId" WHERE p.id=NEW."costId" AND p."orgId"=NEW."orgId" AND p."currencyCode"=c."currencyCode" AND c."jobId"=NEW."jobId" AND c.direction='PURCHASE' AND c.amount=NEW.amount AND c.status='CONFIRMED' AND c."billId"=p."masterId") THEN RAISE EXCEPTION 'FREIGHT_ALLOCATION_INVALID'; END IF;
 ELSIF TG_TABLE_NAME='FreightInvoiceDraft' THEN
  IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=NEW."actorId" AND "orgId"=NEW."orgId" AND status::text='ACTIVE' AND "orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT')) THEN RAISE EXCEPTION 'FREIGHT_ACTOR_REQUIRED'; END IF;
 ELSIF TG_TABLE_NAME='FreightIssuedInvoice' THEN
  IF NOT EXISTS(SELECT 1 FROM "FreightInvoiceDraft" d JOIN "Invoice" i ON i.id=NEW."invoiceId" AND i."sellerOrgId"=d."orgId" WHERE d."draftId"=NEW."draftId" AND d."orgId"=NEW."orgId" AND d."jobId"=NEW."jobId") THEN RAISE EXCEPTION 'FREIGHT_INVOICE_SCOPE'; END IF;
 ELSIF TG_TABLE_NAME='FreightMasterCost' THEN
  IF NOT EXISTS(SELECT 1 FROM "FreightBill" b JOIN "Employee" e ON e.id=NEW."actorId" AND e."orgId"=b."orgId" AND e.status::text='ACTIVE' AND e."orgRole"::text IN ('ADMIN','OPERATOR','ACCOUNTANT') WHERE b.id=NEW."masterId" AND b."orgId"=NEW."orgId" AND b.kind='MASTER' AND b."deletedAt" IS NULL) THEN RAISE EXCEPTION 'FREIGHT_MASTER_SCOPE'; END IF;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightInvoiceDraft_guard" ON "FreightInvoiceDraft";
CREATE TRIGGER "FreightInvoiceDraft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightInvoiceDraft" FOR EACH ROW EXECUTE FUNCTION baro_freight_money_link();
DROP TRIGGER IF EXISTS "FreightInvoiceCharge_guard" ON "FreightInvoiceCharge";
CREATE TRIGGER "FreightInvoiceCharge_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightInvoiceCharge" FOR EACH ROW EXECUTE FUNCTION baro_freight_money_link();
DROP TRIGGER IF EXISTS "FreightIssuedInvoice_guard" ON "FreightIssuedInvoice";
CREATE TRIGGER "FreightIssuedInvoice_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightIssuedInvoice" FOR EACH ROW EXECUTE FUNCTION baro_freight_money_link();
DROP TRIGGER IF EXISTS "FreightMasterCost_guard" ON "FreightMasterCost";
CREATE TRIGGER "FreightMasterCost_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightMasterCost" FOR EACH ROW EXECUTE FUNCTION baro_freight_money_link();
DROP TRIGGER IF EXISTS "FreightMasterAllocation_guard" ON "FreightMasterAllocation";
CREATE TRIGGER "FreightMasterAllocation_guard" BEFORE INSERT OR UPDATE OR DELETE ON "FreightMasterAllocation" FOR EACH ROW EXECUTE FUNCTION baro_freight_money_link();
CREATE OR REPLACE FUNCTION baro_freight_allocation_total() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT amount FROM "FreightMasterCost" WHERE id=NEW."costId") IS DISTINCT FROM (SELECT sum(amount) FROM "FreightMasterAllocation" WHERE "costId"=NEW."costId") THEN RAISE EXCEPTION 'FREIGHT_ALLOCATION_TOTAL'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightMasterAllocation_total" ON "FreightMasterAllocation";
CREATE CONSTRAINT TRIGGER "FreightMasterAllocation_total" AFTER INSERT ON "FreightMasterAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_freight_allocation_total();

ALTER TABLE "FreightDocument" ADD COLUMN IF NOT EXISTS "billId" TEXT;
ALTER TABLE "FreightDocument" ADD COLUMN IF NOT EXISTS "documentState" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "FreightDocument" ADD COLUMN IF NOT EXISTS "previousDocumentId" TEXT;
ALTER TABLE "FreightDocument" DROP CONSTRAINT IF EXISTS "FreightDocument_kind_check";
ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_kind_check" CHECK(kind IN ('AN','DO','POD','MANIFEST','HOUSE_DRAFT','HBL'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightDocument_bill_fkey') THEN ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_bill_fkey" FOREIGN KEY("billId","orgId") REFERENCES "FreightBill"(id,"orgId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightDocument_previous_fkey') THEN ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_previous_fkey" FOREIGN KEY("previousDocumentId","orgId","jobId") REFERENCES "FreightDocument"(id,"orgId","jobId") ON DELETE RESTRICT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightDocument_state_check') THEN ALTER TABLE "FreightDocument" ADD CONSTRAINT "FreightDocument_state_check" CHECK("documentState" IN ('DRAFT','ISSUED','CONFIRMED') AND (kind<>'HBL' OR "billId" IS NOT NULL)); END IF;
END $$;
CREATE OR REPLACE FUNCTION baro_freight_workspace_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "FreightRequestControl" WHERE "jobId"=NEW."jobId" AND (disposition<>'OPEN' OR "cancelState"='CONFIRMED')) THEN RAISE EXCEPTION 'SHIPPING_REQUEST_CLOSED'; END IF;
 IF NEW."billId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "FreightBill" b WHERE b.id=NEW."billId" AND b."orgId"=NEW."orgId" AND b."deletedAt" IS NULL AND (b."jobId"=NEW."jobId" OR b.kind='MASTER' AND EXISTS(SELECT 1 FROM "FreightBill" h WHERE h."jobId"=NEW."jobId" AND h."masterId"=b.id AND h."deletedAt" IS NULL)) AND (NEW.kind<>'HBL' OR b.kind='HOUSE')) THEN RAISE EXCEPTION 'FREIGHT_DOCUMENT_SCOPE'; END IF;
 IF NEW."documentState"='CONFIRMED' AND (NEW.kind<>'POD' OR COALESCE(NEW.snapshot->>'deliveryConfirmed','false')<>'true' OR length(btrim(COALESCE(NEW.snapshot->'source'->'data'->>'recipient','')))=0 OR length(COALESCE(NEW.snapshot->'source'->'data'->>'deliveryDate',''))=0) THEN RAISE EXCEPTION 'FREIGHT_DELIVERY_REQUIRED'; END IF;
 IF NEW.kind='HBL' AND NEW."documentState"='CONFIRMED' OR NEW.kind<>'HBL' AND NEW."documentState"='ISSUED' THEN RAISE EXCEPTION 'FREIGHT_DOCUMENT_SCOPE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "FreightDocument_workspace_guard" ON "FreightDocument";
CREATE TRIGGER "FreightDocument_workspace_guard" BEFORE INSERT ON "FreightDocument" FOR EACH ROW EXECUTE FUNCTION baro_freight_workspace_document();
-- Rollback: compatible application deployment. Keep new records, restrictive
-- company FKs, immutable original snapshots and existing financial documents.
