-- All active code families offer V/Z/E; no financial rows or tax snapshots change.
INSERT INTO "SettingTransactionCodeDefault"("baseId","taxTreatmentId","serviceTypeId",code,"nameKo","nameEn","nameVi","vatEnabled","isActive","isEnabled")
SELECT b.id,t.id,b."serviceTypeId",b.code||t.suffix,b."nameKo",b."nameEn",b."nameVi",t.code='VAT',true,true
FROM "TransactionCodeBase" b JOIN "ExpenseType" category ON category.id=b."expenseTypeId"
CROSS JOIN "TaxTreatment" t
WHERE b."isActive" AND category."isActive" AND category.code<>'OTHER' AND t.id IN (1,2,3)
ON CONFLICT("baseId","taxTreatmentId") DO UPDATE SET "isEnabled"=true,"isActive"=true;
