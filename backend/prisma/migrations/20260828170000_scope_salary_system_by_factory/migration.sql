ALTER TABLE "Factory" ADD COLUMN "salaryCurrencyId" INTEGER;
UPDATE "Factory" f SET "salaryCurrencyId" = o."salaryCurrencyId" FROM "Organization" o WHERE o.id = f."orgId" AND f."salaryCurrencyId" IS NULL;

ALTER TABLE "SalaryItem" ADD COLUMN "factoryId" INTEGER;
ALTER TABLE "SalaryItemRate" ADD COLUMN "factoryId" INTEGER;
ALTER TABLE "SalarySystemVersion" ADD COLUMN "factoryId" INTEGER;

UPDATE "SalaryItem" s SET "factoryId" = (SELECT id FROM "Factory" WHERE "orgId" = s."orgId" ORDER BY id LIMIT 1);
UPDATE "SalaryItemRate" s SET "factoryId" = (SELECT id FROM "Factory" WHERE "orgId" = s."orgId" ORDER BY id LIMIT 1);
UPDATE "SalarySystemVersion" s SET "factoryId" = (SELECT id FROM "Factory" WHERE "orgId" = s."orgId" ORDER BY id LIMIT 1);

ALTER TABLE "SalaryItem" DROP CONSTRAINT "SalaryItem_orgId_code_key";
ALTER TABLE "SalaryItemRate" DROP CONSTRAINT "SalaryItemRate_orgId_payType_gradeId_salaryItemId_key";
ALTER TABLE "SalarySystemVersion" DROP CONSTRAINT "SalarySystemVersion_orgId_versionNumber_key";
ALTER TABLE "SalarySystemVersion" DROP CONSTRAINT "SalarySystemVersion_orgId_effectiveMonth_key";

INSERT INTO "SalaryItem" ("orgId", "factoryId", code, name, "nameKo", "nameEn", "nameVi", category, "payTypes", formula, "payCycle", "paymentMonths", "capValue", required, "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT source."orgId", target.id, source.code, source.name, source."nameKo", source."nameEn", source."nameVi", source.category, source."payTypes", source.formula, source."payCycle", source."paymentMonths", source."capValue", source.required, source."sortOrder", source."isActive", source."createdAt", source."updatedAt"
FROM "SalaryItem" source
JOIN "Factory" target ON target."orgId" = source."orgId" AND target.id <> source."factoryId"
WHERE source."factoryId" = (SELECT MIN(first_factory.id) FROM "Factory" first_factory WHERE first_factory."orgId" = source."orgId");

INSERT INTO "SalaryItemRate" ("orgId", "factoryId", "payType", "gradeId", "salaryItemId", amount, "createdAt", "updatedAt")
SELECT source_rate."orgId", target_item."factoryId", source_rate."payType", source_rate."gradeId", target_item.id, source_rate.amount, source_rate."createdAt", source_rate."updatedAt"
FROM "SalaryItemRate" source_rate
JOIN "SalaryItem" source_item ON source_item.id = source_rate."salaryItemId"
JOIN "SalaryItem" target_item ON target_item."orgId" = source_item."orgId" AND target_item.code = source_item.code AND target_item."factoryId" <> source_item."factoryId"
WHERE source_rate."factoryId" = source_item."factoryId";

INSERT INTO "SalarySystemVersion" ("orgId", "factoryId", "versionNumber", "effectiveMonth", snapshot, "confirmedBy", "confirmedDate")
SELECT source."orgId", target.id, source."versionNumber", source."effectiveMonth", source.snapshot, source."confirmedBy", source."confirmedDate"
FROM "SalarySystemVersion" source
JOIN "Factory" target ON target."orgId" = source."orgId" AND target.id <> source."factoryId"
WHERE source."factoryId" = (SELECT MIN(first_factory.id) FROM "Factory" first_factory WHERE first_factory."orgId" = source."orgId");

ALTER TABLE "SalaryItem" ALTER COLUMN "factoryId" SET NOT NULL;
ALTER TABLE "SalaryItemRate" ALTER COLUMN "factoryId" SET NOT NULL;
ALTER TABLE "SalarySystemVersion" ALTER COLUMN "factoryId" SET NOT NULL;

ALTER TABLE "Factory" ADD CONSTRAINT "Factory_salaryCurrencyId_fkey" FOREIGN KEY ("salaryCurrencyId") REFERENCES "Currency"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryItem" ADD CONSTRAINT "SalaryItem_factoryId_orgId_fkey" FOREIGN KEY ("factoryId", "orgId") REFERENCES "Factory"(id, "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryItemRate" ADD CONSTRAINT "SalaryItemRate_factoryId_orgId_fkey" FOREIGN KEY ("factoryId", "orgId") REFERENCES "Factory"(id, "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalarySystemVersion" ADD CONSTRAINT "SalarySystemVersion_factoryId_orgId_fkey" FOREIGN KEY ("factoryId", "orgId") REFERENCES "Factory"(id, "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SalaryItem_factoryId_code_key" ON "SalaryItem"("factoryId", code);
CREATE UNIQUE INDEX "SalaryItemRate_factoryId_payType_gradeId_salaryItemId_key" ON "SalaryItemRate"("factoryId", "payType", "gradeId", "salaryItemId");
CREATE UNIQUE INDEX "SalarySystemVersion_factoryId_versionNumber_key" ON "SalarySystemVersion"("factoryId", "versionNumber");
CREATE UNIQUE INDEX "SalarySystemVersion_factoryId_effectiveMonth_key" ON "SalarySystemVersion"("factoryId", "effectiveMonth");
CREATE INDEX "Factory_salaryCurrencyId_idx" ON "Factory"("salaryCurrencyId");
