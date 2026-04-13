CREATE TYPE "WorkOrderConfirmationStatus" AS ENUM ('PLANNED', 'CONFIRMED');

ALTER TABLE "WorkOrder"
ADD COLUMN "confirmationStatus" "WorkOrderConfirmationStatus" NOT NULL DEFAULT 'PLANNED';

DROP INDEX IF EXISTS "StyleProcess_styleUid_processCode_key";

CREATE UNIQUE INDEX "StyleProcess_styleUid_orgId_processCode_key"
ON "StyleProcess"("styleUid", "orgId", "processCode");
