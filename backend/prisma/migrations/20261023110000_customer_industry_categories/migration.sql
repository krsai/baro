-- Customer industry is stored on the tenant/customer relationship, not on the global entity.
INSERT INTO "SettingServiceDefault"(code,"nameKo","nameEn","nameVi","entryMode","requiredFields","orderInput","styleInput","processInput","isActive","sortOrder","partnerRoleId")
SELECT v.code,v.ko,v.en,v.vi,'GENERAL',ARRAY[]::TEXT[],'OPTIONAL','HIDDEN','HIDDEN',true,v.sort,r.id
FROM (VALUES
 ('CUSTOMER_WOVEN','직물(우븐)','Woven','Dệt thoi',10),
 ('CUSTOMER_KNIT','편물(다이마루)','Knit','Dệt kim',20),
 ('CUSTOMER_MIXED','종합(직물·편물)','Woven & knit','Dệt thoi và dệt kim',30)
) AS v(code,ko,en,vi,sort) CROSS JOIN "PartnerRole" r WHERE r.code='CUSTOMER'
ON CONFLICT(code) DO NOTHING;
