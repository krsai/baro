-- CreateEnum
CREATE TYPE "ProcessMasterOptionType" AS ENUM ('PART', 'TARGET', 'ACTION', 'SPEC');

-- CreateTable
CREATE TABLE "ProcessMasterOption" (
    "id" SERIAL NOT NULL,
    "type" "ProcessMasterOptionType" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessMasterOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessMasterOption_type_code_key" ON "ProcessMasterOption"("type", "code");

-- CreateIndex
CREATE INDEX "ProcessMasterOption_type_sortOrder_id_idx" ON "ProcessMasterOption"("type", "sortOrder", "id");
