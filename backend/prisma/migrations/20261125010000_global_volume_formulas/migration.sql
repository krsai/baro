-- Preserve every package ID, company/job FK, numeric CBM, revision and audit.
ALTER TABLE "FreightPackage" ADD COLUMN IF NOT EXISTS "cbmFormula" VARCHAR(200) NOT NULL DEFAULT '';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='FreightPackage_volume_formula_check') THEN
  ALTER TABLE "FreightPackage" ADD CONSTRAINT "FreightPackage_volume_formula_check"
   CHECK ("cbmFormula"='' OR (length("cbmFormula") BETWEEN 2 AND 200 AND left("cbmFormula",1)='='));
 END IF;
END $$;
-- Reapplying is read-preserving. Rollback: stop formula writes and deploy a
-- compatible reader/writer; retain this column and all original records/audits.
