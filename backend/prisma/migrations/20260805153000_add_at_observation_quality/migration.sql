ALTER TABLE "StyleProcessAtObservation"
  ADD COLUMN IF NOT EXISTS "attendanceCoverage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "singleProcessLaborShare" DOUBLE PRECISION;
