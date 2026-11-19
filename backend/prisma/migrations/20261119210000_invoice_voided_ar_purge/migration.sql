-- No bulk cleanup: reversed AR rows are removed only inside an approved invoice deletion.
CREATE OR REPLACE FUNCTION baro_invoice_opening_purgeable(invoice_id TEXT,company_id INTEGER) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM "AccountingOpeningItem" o WHERE o."invoiceId"=invoice_id AND (
  o."orgId"<>company_id OR o.side<>'AR' OR o.kind NOT IN ('SETTLED','EXCLUDED') OR o."voidedAt" IS NULL
  OR o."replacesItemId" IS NOT NULL
  OR EXISTS(SELECT 1 FROM "AccountingOpeningItem" r WHERE r."replacesItemId"=o.id)
  OR EXISTS(SELECT 1 FROM "AccountingOpeningAllocation" a WHERE a."openingItemId"=o.id)
 ));
$$;
CREATE OR REPLACE FUNCTION baro_opening_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bill "Invoice"; cost "PartnerTransactionCost"; current_amount DECIMAL(24,4);
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."invoiceId" IS NOT NULL AND OLD.side='AR' AND OLD.kind IN ('SETTLED','EXCLUDED') AND OLD."voidedAt" IS NOT NULL
   AND baro_invoice_delete_authorized(OLD."invoiceId",OLD."orgId")
   AND baro_invoice_opening_purgeable(OLD."invoiceId",OLD."orgId")
   AND NOT EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=OLD."invoiceId")
   AND NOT EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=OLD."invoiceId")
   AND NOT EXISTS(SELECT 1 FROM "InvoiceCredit" WHERE "invoiceId"=OLD."invoiceId")
  THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'OPENING_HISTORY_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD."voidedAt" IS NOT NULL OR NEW."voidedAt" IS NULL OR (to_jsonb(NEW)-'voidedAt'-'voidReason'-'voidedByEmployeeId') IS DISTINCT FROM (to_jsonb(OLD)-'voidedAt'-'voidReason'-'voidedByEmployeeId') THEN RAISE EXCEPTION 'OPENING_HISTORY_IMMUTABLE'; END IF;
  IF EXISTS(SELECT 1 FROM "AccountingOpeningAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."openingItemId"=OLD.id AND e."voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_ALREADY_MATCHED'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "Employee" WHERE id=CASE WHEN TG_OP='UPDATE' THEN NEW."voidedByEmployeeId" ELSE NEW."createdByEmployeeId" END AND "orgId"=NEW."orgId" AND status='ACTIVE' AND "orgRole"='ADMIN') THEN RAISE EXCEPTION 'LEDGER_ADJUSTMENT_ADMIN_REQUIRED'; END IF;
 IF NEW."partyOrgId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Organization" p WHERE p.id=NEW."partyOrgId" AND p.id<>NEW."orgId" AND (p."ownerOrgId"=NEW."orgId" OR EXISTS(SELECT 1 FROM "OrgRelationship" r WHERE r."manufacturerOrgId"=NEW."orgId" AND r."brandOrgId"=p.id OR r."brandOrgId"=NEW."orgId" AND r."manufacturerOrgId"=p.id))) THEN RAISE EXCEPTION 'LEDGER_COUNTERPARTY_INVALID'; END IF;
 IF TG_OP='INSERT' AND NEW."invoiceId" IS NOT NULL THEN
  SELECT * INTO bill FROM "Invoice" WHERE id=NEW."invoiceId" AND "sellerOrgId"=NEW."orgId" FOR UPDATE;
  SELECT bill."receivableAdded"-coalesce((SELECT sum(amount) FROM "InvoiceCredit" WHERE "invoiceId"=bill.id AND "voidedAt" IS NULL),0)-coalesce((SELECT sum(a.amount) FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND e."voidedAt" IS NULL),0) INTO current_amount;
  IF bill.status<>'ISSUED' OR bill."buyerOrgId" IS DISTINCT FROM NEW."partyOrgId" OR NEW."employeeId" IS NOT NULL OR bill."currencyCode"<>NEW."currencyCode" OR NEW.amount<>current_amount OR coalesce(bill.snapshot->'fields'->>'date',to_char(bill."issuedAt",'YYYY-MM-DD'))>=NEW."balanceDate" OR EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE id=coalesce(bill."rootInvoiceId",bill.id) OR "rootInvoiceId"=coalesce(bill."rootInvoiceId",bill.id)) AND "voidedAt" IS NULL) THEN RAISE EXCEPTION 'OPENING_SOURCE_CHANGED'; END IF;
 END IF;
 IF TG_OP='INSERT' AND NEW."expenseItemId" IS NOT NULL THEN
  SELECT * INTO cost FROM "PartnerTransactionCost" WHERE id=NEW."expenseItemId" AND "orgId"=NEW."orgId" FOR UPDATE;
  SELECT cost.amount-coalesce(sum(a.amount),0) INTO current_amount FROM "BankLedgerEvidenceAllocation" a JOIN "BankLedgerEntry" e ON e.id=a."entryId" WHERE a."expenseItemId"=cost.id AND e."voidedAt" IS NULL;
  IF cost.currency<>NEW."currencyCode" OR cost."partnerOrgId" IS DISTINCT FROM NEW."partyOrgId" OR cost."payeeEmployeeId" IS DISTINCT FROM NEW."employeeId" OR NEW.amount<>current_amount OR NOT EXISTS(SELECT 1 FROM "ExpenseRequest" r WHERE r.id=cost."expenseRequestId" AND r."orgId"=NEW."orgId" AND r.version=NEW."sourceVersion" AND r."deletedAt" IS NULL AND r."requestDate"<NEW."balanceDate") THEN RAISE EXCEPTION 'OPENING_SOURCE_CHANGED'; END IF;
 END IF;
 RETURN NEW;
END $$;
