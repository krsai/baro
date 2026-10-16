-- Expense codes own their input behavior; partner industries remain independent.
CREATE TABLE IF NOT EXISTS "ExpenseType" (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  "nameKo" TEXT NOT NULL, "nameEn" TEXT NOT NULL, "nameVi" TEXT NOT NULL,
  "entryMode" TEXT NOT NULL CHECK ("entryMode" IN ('PROCESS','LOGISTICS','PURCHASE','GENERAL')),
  "isActive" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "ExpenseType" (code,"nameKo","nameEn","nameVi","entryMode") VALUES
 ('PRODUCTION','제작 외주','Production outsourcing','Gia công sản xuất','PROCESS'),
 ('LOGISTICS','물류 서비스','Logistics services','Dịch vụ vận chuyển','LOGISTICS'),
 ('MATERIAL','원부자재 구매','Material purchases','Mua nguyên phụ liệu','PURCHASE'),
 ('GENERAL','일반 경비','General expenses','Chi phí chung','GENERAL')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "partnerExpenseTypeId" INTEGER REFERENCES "ExpenseType"(id) ON DELETE RESTRICT;
UPDATE "Organization" p SET "partnerExpenseTypeId"=t.id FROM "ExpenseType" t
WHERE p."partnerExpenseTypeId" IS NULL AND t.code=CASE p.type::text WHEN 'PROCESS_OUTSOURCING' THEN 'PRODUCTION' WHEN 'MATERIAL_SUPPLIER' THEN 'MATERIAL' ELSE NULL END;
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "expenseTypeId" INTEGER REFERENCES "ExpenseType"(id) ON DELETE RESTRICT;
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "entryMode" TEXT;
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "requiredFields" TEXT[];
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "orderInput" TEXT;
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "styleInput" TEXT;
ALTER TABLE "TransactionCodeBase" ADD COLUMN IF NOT EXISTS "processInput" TEXT;
-- Copy only once, by existing FK. Later industry edits never alter expense behavior.
UPDATE "TransactionCodeBase" b SET
 "expenseTypeId"=t.id, "entryMode"=s."entryMode", "requiredFields"=s."requiredFields",
 "orderInput"=s."orderInput", "styleInput"=s."styleInput", "processInput"=s."processInput"
FROM "SettingServiceDefault" s JOIN "ExpenseType" t ON t.code=CASE s."entryMode" WHEN 'PROCESS' THEN 'PRODUCTION' WHEN 'LOGISTICS' THEN 'LOGISTICS' ELSE 'GENERAL' END
WHERE b."serviceTypeId"=s.id AND b."expenseTypeId" IS NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "expenseTypeId" SET NOT NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "entryMode" SET NOT NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "requiredFields" SET DEFAULT '{}';
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "requiredFields" SET NOT NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "orderInput" SET DEFAULT 'OPTIONAL';
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "orderInput" SET NOT NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "styleInput" SET DEFAULT 'HIDDEN';
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "styleInput" SET NOT NULL;
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "processInput" SET DEFAULT 'HIDDEN';
ALTER TABLE "TransactionCodeBase" ALTER COLUMN "processInput" SET NOT NULL;

CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT; options RECORD; taxable BOOLEAN; production RECORD; precision INTEGER;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'transaction cost history cannot be changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id=NEW."partnerOrgId" AND "ownerOrgId"=NEW."orgId" AND "isActive" AND type::text IN ('PROCESS_OUTSOURCING','MATERIAL_SUPPLIER')) THEN RAISE EXCEPTION 'invalid transaction partner'; END IF;
 IF NEW."transactionCodeId" IS NULL THEN
   SELECT s."entryMode",s."requiredFields",s."orderInput",s."styleInput",s."processInput" INTO options
   FROM "OutsourcingServiceType" s WHERE s.id=NEW."serviceTypeId" AND s."ownerOrgId"=NEW."orgId" AND s."isActive";
 ELSE
   SELECT b."entryMode",b."requiredFields",b."orderInput",b."styleInput",b."processInput" INTO options
   FROM "TransactionCode" c JOIN "TransactionCodeBase" b ON b.id=c."baseId" JOIN "ExpenseType" t ON t.id=b."expenseTypeId"
   WHERE c.id=NEW."transactionCodeId" AND c."ownerOrgId"=NEW."orgId" AND c."serviceTypeId"=NEW."serviceTypeId" AND c."isActive" AND b."isActive" AND t."isActive";
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid expense code'; END IF;
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
