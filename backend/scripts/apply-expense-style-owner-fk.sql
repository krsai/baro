-- Expense orgId is the manufacturer, never the style's customer identity.
-- Repair the FK definition only; preserve all existing cost and production rows.
DO $$
DECLARE definition TEXT;
BEGIN
 IF to_regclass('"PartnerTransactionCost"') IS NULL THEN RETURN; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conrelid='"PartnerTransactionCost"'::regclass AND conname='TransactionCost_style_scope_fkey';
 IF definition LIKE '%REFERENCES "Style"(id, "orgId")%' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM "PartnerTransactionCost" c LEFT JOIN "Style" s
   ON s.id=c."styleId" AND s."orgId"=c."orgId"
   WHERE c."styleId" IS NOT NULL AND s.id IS NULL) THEN
   RAISE EXCEPTION 'EXPENSE_STYLE_OWNER_MISMATCH: existing rows require review';
 END IF;
 CREATE UNIQUE INDEX IF NOT EXISTS "Style_id_orgId_key" ON "Style"(id,"orgId");
 ALTER TABLE "PartnerTransactionCost" DROP CONSTRAINT IF EXISTS "TransactionCost_style_scope_fkey";
 ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_style_scope_fkey"
 FOREIGN KEY ("styleId","orgId") REFERENCES "Style"(id,"orgId") ON DELETE RESTRICT ON UPDATE RESTRICT;
END $$;
