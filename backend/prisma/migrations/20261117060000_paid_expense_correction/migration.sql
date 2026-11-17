-- No existing business rows are rewritten. Paired corrections require an actual
-- approved expense change and deferred, money-preserving replacement receipts.
CREATE TABLE "PaidExpenseCorrection" (
 "changeRequestId" TEXT NOT NULL,"orgId" INTEGER NOT NULL,
 "originalEntryId" TEXT NOT NULL,"replacementEntryId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PaidExpenseCorrection_pkey" PRIMARY KEY("changeRequestId","originalEntryId"),
 CONSTRAINT "PaidExpenseCorrection_replacement_key" UNIQUE("replacementEntryId"),
 CONSTRAINT "PaidExpenseCorrection_change_fkey" FOREIGN KEY("changeRequestId","orgId") REFERENCES "ChangeApprovalRequest"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "PaidExpenseCorrection_original_fkey" FOREIGN KEY("originalEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT,
 CONSTRAINT "PaidExpenseCorrection_replacement_fkey" FOREIGN KEY("replacementEntryId","orgId") REFERENCES "BankLedgerEntry"(id,"orgId") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION baro_paid_expense_authorized(company_id INTEGER,entry_id TEXT) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM "PaidExpenseCorrection" p JOIN "ChangeApprovalRequest" r ON r.id=p."changeRequestId" AND r."orgId"=p."orgId"
 WHERE p."orgId"=company_id AND entry_id IN(p."originalEntryId",p."replacementEntryId") AND r.id=current_setting('baro.change_request_id',true)
 AND r.menu='EXPENSE' AND r.operation='UPDATE' AND r."sourceKind"='request'
 AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
 AND EXISTS(SELECT 1 FROM "ExpenseRequest" d WHERE d.id=r."expenseRequestId" AND d."orgId"=company_id AND d.version IN(r."sourceVersion",r."sourceVersion"+1)));
$$;
CREATE FUNCTION baro_paid_expense_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r JOIN "BankLedgerEvidenceAllocation" a ON a."orgId"=r."orgId" AND a."entryId"=NEW."originalEntryId"
  JOIN "PartnerTransactionCost" c ON c.id=a."expenseItemId" AND c."orgId"=a."orgId"
  JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."orgId"=a."orgId"
  WHERE r.id=NEW."changeRequestId" AND r."orgId"=NEW."orgId" AND r.menu='EXPENSE' AND r.operation='UPDATE' AND c."expenseRequestId"=r."expenseRequestId"
  AND e."voidedAt" IS NULL AND e."evidenceType"='EXPENSE' AND e.direction='OUT' AND e."bankFee"=0 AND e."writeOffAmount"=0
  AND baro_change_authorized(NEW."orgId",'EXPENSE','UPDATE',r."expenseRequestId"::text)) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PaidExpenseCorrection_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PaidExpenseCorrection" FOR EACH ROW EXECUTE FUNCTION baro_paid_expense_receipt_guard();
CREATE FUNCTION baro_paid_expense_complete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_entry "BankLedgerEntry"%ROWTYPE; new_entry "BankLedgerEntry"%ROWTYPE; r "ChangeApprovalRequest"%ROWTYPE; doc "ExpenseRequest"%ROWTYPE; old_rows JSONB; new_rows JSONB;
BEGIN
 SELECT * INTO old_entry FROM "BankLedgerEntry" WHERE id=NEW."originalEntryId" AND "orgId"=NEW."orgId";
 SELECT * INTO new_entry FROM "BankLedgerEntry" WHERE id=NEW."replacementEntryId" AND "orgId"=NEW."orgId";
 SELECT * INTO r FROM "ChangeApprovalRequest" WHERE id=NEW."changeRequestId" AND "orgId"=NEW."orgId";
 SELECT * INTO doc FROM "ExpenseRequest" WHERE id=r."expenseRequestId" AND "orgId"=r."orgId";
 IF (doc."partnerOrgId",doc."payeeEmployeeId",doc."requestDate",doc."scheduledPaymentDate",doc.remark) IS DISTINCT FROM
 ((r."beforeSnapshot"->'document'->>'partnerOrgId')::integer,(r."beforeSnapshot"->'document'->>'payeeEmployeeId')::integer,r."beforeSnapshot"->'document'->>'requestDate',r."beforeSnapshot"->'document'->>'scheduledPaymentDate',r."beforeSnapshot"->'document'->>'remark')
 OR (SELECT count(*) FROM "PartnerTransactionCost" WHERE "expenseRequestId"=doc.id AND "orgId"=doc."orgId")<>jsonb_array_length(r."beforeSnapshot"->'costs')
 THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF new_entry.id IS NULL OR old_entry."voidedAt" IS NULL OR new_entry."voidedAt" IS NOT NULL OR new_entry."revisesEntryId" IS DISTINCT FROM old_entry.id OR doc.version<>r."sourceVersion"+1
 OR (to_jsonb(old_entry)-ARRAY['id','clientKey','createdAt','createdBy','revisesEntryId','voidedAt','voidedBy','voidReason','accountingCodeId']) IS DISTINCT FROM
    (to_jsonb(new_entry)-ARRAY['id','clientKey','createdAt','createdBy','revisesEntryId','voidedAt','voidedBy','voidReason','accountingCodeId']) THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 SELECT jsonb_agg(to_jsonb(a)-ARRAY['id','entryId','requestVersion'] ORDER BY a."expenseItemId") INTO old_rows FROM "BankLedgerEvidenceAllocation" a WHERE a."entryId"=old_entry.id AND a."orgId"=NEW."orgId";
 SELECT jsonb_agg(to_jsonb(a)-ARRAY['id','entryId','requestVersion'] ORDER BY a."expenseItemId") INTO new_rows FROM "BankLedgerEvidenceAllocation" a WHERE a."entryId"=new_entry.id AND a."orgId"=NEW."orgId";
 IF old_rows IS DISTINCT FROM new_rows THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF new_entry."accountingCodeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" a JOIN "PartnerTransactionCost" c ON c.id=a."expenseItemId" AND c."orgId"=a."orgId" WHERE a."entryId"=new_entry.id AND a."orgId"=NEW."orgId" AND c."transactionCodeId"=new_entry."accountingCodeId") THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r."beforeSnapshot"->'costs') b
  LEFT JOIN "PartnerTransactionCost" c ON c.id=b->>'id' AND c."orgId"=r."orgId"
  WHERE c.id IS NULL OR (c.amount,c.quantity,c."unitPrice",c."vatRate",c.currency,c."partnerOrgId",c."payeeEmployeeId",c."unitId") IS DISTINCT FROM
  ((b->>'amount')::numeric,(b->>'quantity')::numeric,(b->>'unitPrice')::numeric,(b->>'vatRate')::numeric,b->>'currency',(b->>'partnerOrgId')::integer,(b->>'payeeEmployeeId')::integer,(b->>'unitId')::integer)
  OR (c."workOrderId",c."styleId",c."styleProcessId",c."outsourcedWorkRecordId",c."transactionDate") IS DISTINCT FROM
  ((b->>'workOrderId')::integer,(b->>'styleId')::integer,(b->>'styleProcessId')::integer,(b->>'outsourcedWorkRecordId')::integer,b->>'transactionDate')
  OR COALESCE(c.details,'{}'::jsonb)-ARRAY['reference','evidenceFile'] IS DISTINCT FROM COALESCE(b->'details','{}'::jsonb)-ARRAY['reference','evidenceFile']
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'items') p WHERE p->>'itemId'=c.id AND (p->>'transactionCodeId')::integer=c."transactionCodeId"
    AND btrim(COALESCE(p->'details'->>'reference',''))=COALESCE(c.details->>'reference','') AND btrim(COALESCE(p->'details'->>'evidenceFile',''))=COALESCE(c.details->>'evidenceFile','')))
 THEN RAISE EXCEPTION 'PAID_EXPENSE_CORRECTION_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "PaidExpenseCorrection_complete" AFTER INSERT ON "PaidExpenseCorrection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_paid_expense_complete_guard();

CREATE OR REPLACE FUNCTION baro_ledger_registration_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."evidenceType"='EXPENSE' AND baro_paid_expense_authorized(NEW."orgId",NEW.id) THEN RETURN NEW; END IF;
 IF NEW."evidenceType"='ADJUSTMENT' THEN RETURN NEW; END IF;
 IF NEW."internalTransferSourceId" IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM "BankLedgerEntry" s JOIN "ChangeApprovalRequest" r ON r.id=current_setting('baro.change_request_id',true)
   WHERE s.id=NEW."internalTransferSourceId" AND s."orgId"=NEW."orgId" AND s."internalTransferSourceId" IS NULL AND s."counterpartyAccountId" IS NOT NULL
   AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true)
   AND (r.operation='UPDATE' AND s."revisesEntryId"=r."ledgerEntryId" OR r.operation IN('CREATE','UPDATE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=s."clientKey"))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."internalTransferAmount" IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM "ChangeApprovalRequest" r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'rows') p
  WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED'
  AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND r.operation IN('CREATE','UPDATE')
  AND p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->'counterparty'->>'kind'='ACCOUNT' AND p->'counterparty'->>'id'=NEW."counterpartyAccountId"
  AND COALESCE(p->>'transferAmount',p->>'amount')::numeric=NEW."internalTransferAmount"
  AND (p->>'accountingCodeId')::integer IS NOT DISTINCT FROM NEW."accountingCodeId"
  AND (p->>'amount')::numeric=NEW.amount AND p->>'direction'=NEW.direction AND p->>'transactionDate'=NEW."transactionDate"
  AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))
 ) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ChangeApprovalRequest" r WHERE r.id=current_setting('baro.change_request_id',true) AND r."orgId"=NEW."orgId" AND r.menu='BANK_LEDGER' AND r.status='APPROVED' AND r."decidedByEmployeeId"::text=current_setting('baro.change_approver',true) AND (r.operation='UPDATE' AND NEW."revisesEntryId"=r."ledgerEntryId" OR r.operation IN('CREATE','UPDATE') AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'rows') p WHERE p->>'entryKind'='BANK' AND p->>'clientKey'=NEW."clientKey" AND p->>'transactionDate'=NEW."transactionDate" AND p->>'direction'=NEW.direction AND (p->>'amount')::numeric=NEW.amount AND (p->>'accountId'=NEW."accountId" OR p->>'accountId'='entity:'||(SELECT "entityAccountId" FROM "BankLedgerAccount" WHERE id=NEW."accountId" AND "orgId"=NEW."orgId"))))) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION baro_ledger_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."internalTransferSourceId" IS DISTINCT FROM OLD."internalTransferSourceId" OR NEW."internalTransferAmount" IS DISTINCT FROM OLD."internalTransferAmount" THEN RAISE EXCEPTION 'LEDGER_TRANSFER_IMMUTABLE'; END IF;
 IF OLD."voidedAt" IS NULL AND NEW."voidedAt" IS NOT NULL AND NOT (
  baro_paid_expense_authorized(OLD."orgId",OLD.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',OLD.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',OLD.id)
  OR EXISTS(SELECT 1 FROM "BankLedgerEntry" p WHERE p."orgId"=OLD."orgId" AND (p.id=OLD."internalTransferSourceId" OR p."internalTransferSourceId"=OLD.id) AND (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',p.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',p.id)))
  OR EXISTS(SELECT 1 FROM "BankLedgerFeeLink" l JOIN "BankLedgerEntry" p ON p.id=l."parentEntryId" AND p."orgId"=l."orgId" WHERE l."feeEntryId"=OLD.id AND l."orgId"=OLD."orgId" AND (
   baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',p.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',p.id)
   OR EXISTS(SELECT 1 FROM "BankLedgerEntry" peer WHERE peer."orgId"=p."orgId" AND (peer.id=p."internalTransferSourceId" OR peer."internalTransferSourceId"=p.id) AND (baro_change_authorized(OLD."orgId",'BANK_LEDGER','UPDATE',peer.id) OR baro_change_authorized(OLD."orgId",'BANK_LEDGER','DELETE',peer.id)))))
 ) THEN RAISE EXCEPTION 'CHANGE_APPROVAL_REQUIRED'; END IF;
 RETURN NEW;
END $$;
