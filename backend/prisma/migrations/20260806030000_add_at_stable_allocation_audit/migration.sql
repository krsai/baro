ALTER TABLE "StyleProcessAtObservation"
  ADD COLUMN IF NOT EXISTS "sourceLaborInputSeconds" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "unexplainedLaborInputSeconds" DOUBLE PRECISION;
