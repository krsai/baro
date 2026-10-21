CREATE TABLE IF NOT EXISTS "PartnerRole" (
  id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  "nameKo" TEXT NOT NULL,"nameEn" TEXT NOT NULL,"nameVi" TEXT NOT NULL,"sortOrder" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "PartnerRole"(code,"nameKo","nameEn","nameVi","sortOrder") VALUES
 ('CUSTOMER','고객사','Customer','Khách hàng',1),
 ('PROCESS_OUTSOURCING','외주 업체','Outsourcing partner','Đối tác gia công',2),
 ('MATERIAL_SUPPLIER','공급 업체','Supplier','Nhà cung cấp',3)
ON CONFLICT(code) DO NOTHING;
ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "partnerRoleId" INTEGER REFERENCES "PartnerRole"(id) ON DELETE RESTRICT;
-- Explicit standard catalogue assignments. ExpenseType is NOT used to infer a
-- partner role. GENERAL and custom industries remain unassigned for review.
UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='PROCESS_OUTSOURCING')
WHERE "partnerRoleId" IS NULL AND code IN ('BUTTONHOLE','CUTTING','EMBROIDERY','PRINTING','WASHING','PLEATING','SEWING','FINISHING','LOGISTICS');
-- Preserve all expense classifications, industry IDs, business links and history.
