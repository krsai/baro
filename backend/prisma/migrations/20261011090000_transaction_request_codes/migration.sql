ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "orderInput" TEXT NOT NULL DEFAULT 'OPTIONAL';
ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "styleInput" TEXT NOT NULL DEFAULT 'HIDDEN';
ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "processInput" TEXT NOT NULL DEFAULT 'HIDDEN';
CREATE TABLE IF NOT EXISTS "TransactionCode" (
 id SERIAL PRIMARY KEY, "ownerOrgId" INTEGER NOT NULL REFERENCES "Organization"(id) ON DELETE RESTRICT,
 "serviceTypeId" INTEGER NOT NULL, code TEXT NOT NULL, "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
 "vatEnabled" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
 FOREIGN KEY ("serviceTypeId","ownerOrgId") REFERENCES "OutsourcingServiceType"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 UNIQUE ("ownerOrgId",code), UNIQUE (id,"ownerOrgId","serviceTypeId")
);
INSERT INTO "TransactionCode" ("ownerOrgId","serviceTypeId",code,"nameKo","nameEn","nameVi")
 SELECT "ownerOrgId",id,code,"nameKo","nameEn","nameVi" FROM "OutsourcingServiceType" ON CONFLICT ("ownerOrgId",code) DO NOTHING;
INSERT INTO "TransactionCode" ("ownerOrgId","serviceTypeId",code,"nameKo","nameEn","nameVi","vatEnabled")
 SELECT "ownerOrgId",id,'TRKV','트러킹 (VAT)','Trucking (VAT)','Vận chuyển (VAT)',true FROM "OutsourcingServiceType" WHERE code='LOGISTICS'
 ON CONFLICT ("ownerOrgId",code) DO NOTHING;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "transactionCodeId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(18,4);
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS quantity DECIMAL(18,4);
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS subtotal DECIMAL(18,2);
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2);
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(18,2);
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "styleId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "styleProcessId" INTEGER;
ALTER TABLE "PartnerTransactionCost" ADD COLUMN IF NOT EXISTS "outsourcedWorkRecordId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "OutsourcedWorkRecord_id_orgId_key" ON "OutsourcedWorkRecord"(id,"orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_outsourcedWorkRecordId_key" ON "PartnerTransactionCost"("outsourcedWorkRecordId");
DO $constraints$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TransactionCost_code_scope_fkey') THEN
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_code_scope_fkey" FOREIGN KEY ("transactionCodeId","orgId","serviceTypeId") REFERENCES "TransactionCode"(id,"ownerOrgId","serviceTypeId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_style_scope_fkey" FOREIGN KEY ("styleId","orgId") REFERENCES "Style"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_process_scope_fkey" FOREIGN KEY ("styleProcessId","styleId","orgId") REFERENCES "StyleProcess"(id,"styleId","orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_work_record_scope_fkey" FOREIGN KEY ("outsourcedWorkRecordId","orgId") REFERENCES "OutsourcedWorkRecord"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $constraints$;
CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT; options RECORD; taxable BOOLEAN; production RECORD; precision INTEGER;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'transaction cost history cannot be changed'; END IF;
 SELECT s."entryMode",s."requiredFields",s."orderInput",s."styleInput",s."processInput" INTO options
 FROM "OutsourcingServiceType" s JOIN "OrganizationOutsourcingServiceType" a ON a."serviceTypeId"=s.id AND a."ownerOrgId"=s."ownerOrgId"
 JOIN "Organization" p ON p.id=a."partnerOrgId" AND p."ownerOrgId"=a."ownerOrgId"
 WHERE s.id=NEW."serviceTypeId" AND s."ownerOrgId"=NEW."orgId" AND a."partnerOrgId"=NEW."partnerOrgId" AND s."isActive" AND p."isActive" AND p.type='PROCESS_OUTSOURCING';
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid partner service'; END IF;
 mode:=options."entryMode"; fields:=options."requiredFields";
 FOREACH field IN ARRAY fields LOOP IF coalesce(length(trim(NEW.details->>field)),0)=0 THEN RAISE EXCEPTION 'required transaction detail: %',field; END IF; END LOOP;
 IF NEW."transactionCodeId" IS NULL THEN
   IF mode NOT IN ('LOGISTICS','GENERAL') THEN RAISE EXCEPTION 'process request code required'; END IF;
   RETURN NEW;
 END IF;
 SELECT "vatEnabled" INTO taxable FROM "TransactionCode" WHERE id=NEW."transactionCodeId" AND "ownerOrgId"=NEW."orgId" AND "serviceTypeId"=NEW."serviceTypeId" AND "isActive";
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid transaction code'; END IF;
 IF NEW."unitPrice" IS NULL OR NEW.quantity IS NULL OR NEW.subtotal IS NULL OR NEW."vatRate" IS NULL OR NEW."vatAmount" IS NULL OR NEW."unitPrice"<=0 OR NEW.quantity<=0 OR NEW."vatRate" NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid accounting inputs'; END IF;
 IF NOT taxable AND NEW."vatRate"<>0 THEN RAISE EXCEPTION 'VAT is disabled'; END IF;
 precision:=CASE WHEN NEW.currency='USD' THEN 2 ELSE 0 END;
 IF NEW.subtotal<>round(NEW."unitPrice"*NEW.quantity,precision) OR NEW."vatAmount"<>round(NEW.subtotal*NEW."vatRate"/100,precision) OR NEW.amount<>NEW.subtotal+NEW."vatAmount" THEN RAISE EXCEPTION 'invalid accounting totals'; END IF;
 IF mode='PROCESS' THEN
   IF NEW."workOrderId" IS NULL OR NEW."styleId" IS NULL OR NEW."styleProcessId" IS NULL OR NEW."outsourcedWorkRecordId" IS NULL OR NEW.quantity<>trunc(NEW.quantity) OR NEW.currency<>'VND' THEN RAISE EXCEPTION 'process references required'; END IF;
   SELECT r.*,a."workOrderId" INTO production FROM "OutsourcedWorkRecord" r JOIN "AssignmentPlan" a ON a.id=r."assignmentPlanId" WHERE r.id=NEW."outsourcedWorkRecordId";
   IF NOT FOUND OR production."orgId"<>NEW."orgId" OR production."outsourcingPartnerId"<>NEW."partnerOrgId" OR production."styleId"<>NEW."styleId" OR production."styleProcessId"<>NEW."styleProcessId" OR production."workOrderId" IS DISTINCT FROM NEW."workOrderId" OR production.quantity<>NEW.quantity OR production."outsourceUnitPrice"<>NEW."unitPrice" THEN RAISE EXCEPTION 'production does not match request'; END IF;
 ELSE
   IF NEW."outsourcedWorkRecordId" IS NOT NULL THEN RAISE EXCEPTION 'service cost cannot create production'; END IF;
   IF (options."orderInput"='REQUIRED' AND NEW."workOrderId" IS NULL) OR (options."styleInput"='REQUIRED' AND NEW."styleId" IS NULL) OR (options."processInput"='REQUIRED' AND NEW."styleProcessId" IS NULL) THEN RAISE EXCEPTION 'required input option'; END IF;
   IF (options."orderInput"='HIDDEN' AND NEW."workOrderId" IS NOT NULL) OR (options."styleInput"='HIDDEN' AND NEW."styleId" IS NOT NULL) OR (options."processInput"='HIDDEN' AND NEW."styleProcessId" IS NOT NULL) THEN RAISE EXCEPTION 'unexpected input option'; END IF;
 END IF;
 RETURN NEW;
END $cost$;
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_outsourcedWorkRecordId_orgId_key" ON "PartnerTransactionCost"("outsourcedWorkRecordId","orgId");
CREATE OR REPLACE FUNCTION baro_request_production_guard() RETURNS trigger LANGUAGE plpgsql AS $production$
BEGIN
 IF EXISTS (SELECT 1 FROM "PartnerTransactionCost" WHERE "outsourcedWorkRecordId"=OLD.id) THEN RAISE EXCEPTION 'request production history cannot be changed'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $production$;
DROP TRIGGER IF EXISTS baro_request_production_guard ON "OutsourcedWorkRecord";
CREATE TRIGGER baro_request_production_guard BEFORE UPDATE OR DELETE ON "OutsourcedWorkRecord" FOR EACH ROW EXECUTE FUNCTION baro_request_production_guard();
