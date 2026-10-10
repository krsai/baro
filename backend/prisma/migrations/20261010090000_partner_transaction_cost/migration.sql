ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "entryMode" TEXT NOT NULL DEFAULT 'PROCESS';
ALTER TABLE "OutsourcingServiceType" ADD COLUMN IF NOT EXISTS "requiredFields" TEXT[] NOT NULL DEFAULT '{}';
INSERT INTO "OutsourcingServiceType" ("ownerOrgId", code, "nameKo", "nameEn", "nameVi", "entryMode", "requiredFields", "sortOrder")
SELECT id, 'LOGISTICS', '물류·운송', 'Logistics', 'Vận chuyển', 'LOGISTICS', ARRAY['transportDate','origin','destination'], 100
FROM "Organization" WHERE type IN ('MANUFACTURER','BRAND')
ON CONFLICT ("ownerOrgId",code) DO NOTHING;
CREATE TABLE IF NOT EXISTS "PartnerTransactionCost" (
  id TEXT PRIMARY KEY, "orgId" INTEGER NOT NULL, "partnerOrgId" INTEGER NOT NULL,
  "serviceTypeId" INTEGER NOT NULL, "workOrderId" INTEGER,
  "transactionDate" TEXT NOT NULL CHECK ("transactionDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "transactionDate"::date::text = "transactionDate"),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('VND','KRW','USD')),
  details JSONB NOT NULL CHECK (jsonb_typeof(details)='object'),
  "clientKey" TEXT NOT NULL, "createdByEmployeeId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (currency='USD' OR amount=trunc(amount)),
  FOREIGN KEY ("orgId") REFERENCES "Organization"(id) ON DELETE RESTRICT,
  FOREIGN KEY ("partnerOrgId","orgId") REFERENCES "Organization"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("serviceTypeId","orgId") REFERENCES "OutsourcingServiceType"(id,"ownerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("workOrderId","orgId") REFERENCES "WorkOrder"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("createdByEmployeeId","orgId") REFERENCES "Employee"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerTransactionCost_orgId_clientKey_key" ON "PartnerTransactionCost"("orgId","clientKey");
CREATE INDEX IF NOT EXISTS "PartnerTransactionCost_orgId_transactionDate_idx" ON "PartnerTransactionCost"("orgId","transactionDate");
CREATE INDEX IF NOT EXISTS "PartnerTransactionCost_orgId_partnerOrgId_idx" ON "PartnerTransactionCost"("orgId","partnerOrgId");
CREATE OR REPLACE FUNCTION baro_transaction_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $cost$
DECLARE mode TEXT; fields TEXT[]; field TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'transaction cost history cannot be changed'; END IF;
  SELECT s."entryMode",s."requiredFields" INTO mode,fields FROM "OutsourcingServiceType" s
  JOIN "OrganizationOutsourcingServiceType" a ON a."serviceTypeId"=s.id AND a."ownerOrgId"=s."ownerOrgId"
  JOIN "Organization" p ON p.id=a."partnerOrgId" AND p."ownerOrgId"=a."ownerOrgId"
  WHERE s.id=NEW."serviceTypeId" AND s."ownerOrgId"=NEW."orgId" AND a."partnerOrgId"=NEW."partnerOrgId"
    AND s."isActive" AND p."isActive" AND p.type='PROCESS_OUTSOURCING';
  IF mode IS NULL OR mode NOT IN ('LOGISTICS','GENERAL') THEN RAISE EXCEPTION 'valid non-process partner service required'; END IF;
  FOREACH field IN ARRAY fields LOOP
    IF coalesce(length(trim(NEW.details->>field)),0)=0 THEN RAISE EXCEPTION 'required transaction detail: %',field; END IF;
  END LOOP;
  RETURN NEW;
END $cost$;
DROP TRIGGER IF EXISTS baro_transaction_cost_guard ON "PartnerTransactionCost";
CREATE TRIGGER baro_transaction_cost_guard BEFORE INSERT OR UPDATE OR DELETE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_transaction_cost_guard();
