-- Remove only a provably unreferenced category. Never move or delete GENERAL,
-- customer/vendor classifications, code links or historical business records.
LOCK TABLE "PartnerRole", "SettingServiceDefault" IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM "PartnerRole" r
WHERE r.code='MANAGEMENT'
  AND NOT EXISTS(SELECT 1 FROM "SettingServiceDefault" s WHERE s."partnerRoleId"=r.id);
