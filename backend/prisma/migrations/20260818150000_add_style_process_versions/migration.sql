CREATE TABLE "StyleProcessVersion" (
  "id" SERIAL PRIMARY KEY,
  "orgId" INTEGER NOT NULL,
  "styleId" INTEGER NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "confirmedDate" TEXT NOT NULL,
  "processSnapshot" JSONB NOT NULL,
  "confirmedBy" TEXT NOT NULL DEFAULT 'system@baro.local',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "StyleProcessVersion_styleId_versionNumber_key"
  ON "StyleProcessVersion"("styleId", "versionNumber");
CREATE UNIQUE INDEX "StyleProcessVersion_id_style_org_key"
  ON "StyleProcessVersion"("id", "styleId", "orgId");
CREATE INDEX "StyleProcessVersion_orgId_styleId_idx"
  ON "StyleProcessVersion"("orgId", "styleId");
ALTER TABLE "StyleProcessVersion" ADD CONSTRAINT "StyleProcessVersion_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE;
ALTER TABLE "StyleProcessVersion" ADD CONSTRAINT "StyleProcessVersion_styleId_fkey"
  FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE CASCADE;

ALTER TABLE "AssignmentPlan" ADD COLUMN "styleProcessVersionId" INTEGER;
CREATE INDEX "AssignmentPlan_styleProcessVersionId_idx"
  ON "AssignmentPlan"("styleProcessVersionId");
ALTER TABLE "AssignmentPlan" ADD CONSTRAINT "AssignmentPlan_styleProcessVersionId_fkey"
  FOREIGN KEY ("styleProcessVersionId") REFERENCES "StyleProcessVersion"("id") ON DELETE SET NULL;
