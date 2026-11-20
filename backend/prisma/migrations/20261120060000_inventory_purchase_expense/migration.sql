ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "purchaseRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "expenseItemId" text;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "expenseRequestId" integer;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "expenseRequestVersion" integer;
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "purchaseSnapshot" jsonb;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_purchase_cost_scope') THEN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchase_cost_scope" FOREIGN KEY ("expenseItemId","orgId") REFERENCES "PartnerTransactionCost"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_purchase_request_scope') THEN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchase_request_scope" FOREIGN KEY ("expenseRequestId","orgId") REFERENCES "ExpenseRequest"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='InventoryMovement_purchase_version_scope') THEN
  ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchase_version_scope" FOREIGN KEY ("expenseRequestId","expenseRequestVersion") REFERENCES "ExpenseRequestAudit"("requestId",version) ON DELETE RESTRICT ON UPDATE RESTRICT;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS "InventoryMovement_purchase_cost_idx" ON "InventoryMovement"("orgId","expenseItemId");
CREATE OR REPLACE FUNCTION baro_inventory_purchase_source(org_id integer,master_id text,cost_id text,request_version integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('expenseItemId',c.id,'requestId',r.id,'version',r.version,'managementNumber',r."managementNumber",'requestDate',r."requestDate",'line',c."expenseRequestLine",'description',c.description,'quantity',c.quantity::text,'unitId',c."unitId")
 FROM "PartnerTransactionCost" c JOIN "ExpenseRequest" r ON r.id=c."expenseRequestId" AND r."orgId"=c."orgId"
 JOIN "MaterialItem" m ON m.id=c."materialItemId" AND m."orgId"=c."orgId"
 JOIN "TransactionCode" code ON code.id=c."transactionCodeId" AND code."ownerOrgId"=c."orgId" AND code."baseId"=m."baseId"
 WHERE c.id=cost_id AND c."orgId"=org_id AND m.id=master_id AND r.version=request_version AND r."deletedAt" IS NULL
 AND c."unitId"=m."unitId" AND c.quantity>0 AND (c."itemOwnerOrgId" IS NULL OR c."itemOwnerOrgId"=org_id)
 AND EXISTS(SELECT 1 FROM "ExpenseRequestAudit" a WHERE a."requestId"=r.id AND a."orgId"=r."orgId" AND a.version=r.version)
 AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d."orgId"=r."orgId" AND d.version=r.version AND d.decision='REJECTED')
 AND (baro_expense_approval_exempt(r.id,r."orgId",r.version) OR
  EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND s."orgId"=r."orgId") AND
  NOT EXISTS(SELECT 1 FROM "ExpenseRequestApprovalStep" s WHERE s."requestId"=r.id AND s."orgId"=r."orgId" AND NOT EXISTS(SELECT 1 FROM "ExpenseApprovalDecision" d WHERE d."requestId"=r.id AND d."orgId"=r."orgId" AND d.version=r.version AND d.position=s.position AND d."employeeId"=s."employeeId" AND d.decision='APPROVED')))
$$;
CREATE OR REPLACE FUNCTION baro_inventory_purchase_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v "InventoryVariant"; expected jsonb; BEGIN
 SELECT * INTO v FROM "InventoryVariant" WHERE id=NEW."variantId" AND "orgId"=NEW."orgId";
 IF TG_OP='INSERT' THEN
  IF NEW."purchaseRequired" IS DISTINCT FROM (v."ownerId"=NEW."orgId" AND NEW.quantity>0) THEN RAISE EXCEPTION 'inventory purchase requirement mismatch'; END IF;
 END IF;
 -- Old rows remain untouched, including previously submitted requests.
 IF NOT NEW."purchaseRequired" THEN
  IF NEW."expenseItemId" IS NOT NULL OR NEW."expenseRequestId" IS NOT NULL OR NEW."expenseRequestVersion" IS NOT NULL OR NEW."purchaseSnapshot" IS NOT NULL THEN RAISE EXCEPTION 'unexpected inventory purchase source'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' OR OLD.status='PENDING' AND NEW.status='APPROVED' THEN
  PERFORM 1 FROM "ExpenseRequest" WHERE id=NEW."expenseRequestId" AND "orgId"=NEW."orgId" FOR SHARE;
  expected:=baro_inventory_purchase_source(NEW."orgId",v."masterId",NEW."expenseItemId",NEW."expenseRequestVersion");
  IF expected IS NULL OR (expected->>'requestId')::integer IS DISTINCT FROM NEW."expenseRequestId" OR expected IS DISTINCT FROM NEW."purchaseSnapshot" THEN RAISE EXCEPTION 'invalid inventory purchase expense'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "InventoryMovement_purchase_guard" ON "InventoryMovement";
CREATE TRIGGER "InventoryMovement_purchase_guard" BEFORE INSERT OR UPDATE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION baro_inventory_purchase_guard();
