-- CreateTable
CREATE TABLE "StyleProcess" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "styleUid" INTEGER NOT NULL,
    "processCode" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "processDescription" TEXT,
    "processQuantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ptSeconds" DOUBLE PRECISION,
    "atParams" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProcessStandard" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "styleProcessId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stSeconds" DOUBLE PRECISION NOT NULL,
    "setBy" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProcessStandard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StyleProcess_styleUid_processCode_key" ON "StyleProcess"("styleUid", "processCode");

-- CreateIndex
CREATE INDEX "StyleProcess_orgId_idx" ON "StyleProcess"("orgId");

-- CreateIndex
CREATE INDEX "StyleProcess_styleUid_idx" ON "StyleProcess"("styleUid");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProcessStandard_styleProcessId_quantity_key" ON "StyleProcessStandard"("styleProcessId", "quantity");

-- CreateIndex
CREATE INDEX "StyleProcessStandard_orgId_idx" ON "StyleProcessStandard"("orgId");

-- CreateIndex
CREATE INDEX "StyleProcessStandard_styleProcessId_idx" ON "StyleProcessStandard"("styleProcessId");

-- AddForeignKey
ALTER TABLE "StyleProcess" ADD CONSTRAINT "StyleProcess_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProcess" ADD CONSTRAINT "StyleProcess_styleUid_fkey" FOREIGN KEY ("styleUid") REFERENCES "Style"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProcessStandard" ADD CONSTRAINT "StyleProcessStandard_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProcessStandard" ADD CONSTRAINT "StyleProcessStandard_styleProcessId_fkey" FOREIGN KEY ("styleProcessId") REFERENCES "StyleProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
