INSERT INTO "PartnerRole"(code,"nameKo","nameEn","nameVi","sortOrder")
VALUES ('LOGISTICS_PROVIDER','물류 업체','Logistics provider','Đơn vị logistics',4)
ON CONFLICT(code) DO NOTHING;
-- Only the explicit standard catalogue entry moves; keep all industry and business IDs.
UPDATE "SettingServiceDefault" SET "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='LOGISTICS_PROVIDER')
WHERE code='LOGISTICS' AND "partnerRoleId"=(SELECT id FROM "PartnerRole" WHERE code='PROCESS_OUTSOURCING');
-- Existing organizations are not inferred/retyped: mixed production/logistics relationships and histories remain intact.
