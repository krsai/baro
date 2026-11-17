-- Explicit SYSTEM industry selection only; preserve existing code settings and business rows.
ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "materialManagement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SettingServiceDefault" ADD COLUMN IF NOT EXISTS "materialManagementRevision" INTEGER NOT NULL DEFAULT 0;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='Industry_material_revision_check') THEN
 ALTER TABLE "SettingServiceDefault" ADD CONSTRAINT "Industry_material_revision_check" CHECK("materialManagementRevision">=0);
 END IF;
END $$;
