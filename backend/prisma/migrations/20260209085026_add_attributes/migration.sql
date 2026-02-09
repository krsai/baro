-- CreateTable
CREATE TABLE "AttrColor" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrSize" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrGender" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrGender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrCategory" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrRole" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrProcess" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttrProcess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttrColor_orgId_idx" ON "AttrColor"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrColor_orgId_code_key" ON "AttrColor"("orgId", "code");

-- CreateIndex
CREATE INDEX "AttrSize_orgId_idx" ON "AttrSize"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrSize_orgId_code_key" ON "AttrSize"("orgId", "code");

-- CreateIndex
CREATE INDEX "AttrGender_orgId_idx" ON "AttrGender"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrGender_orgId_code_key" ON "AttrGender"("orgId", "code");

-- CreateIndex
CREATE INDEX "AttrCategory_orgId_idx" ON "AttrCategory"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrCategory_orgId_code_key" ON "AttrCategory"("orgId", "code");

-- CreateIndex
CREATE INDEX "AttrRole_orgId_idx" ON "AttrRole"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrRole_orgId_code_key" ON "AttrRole"("orgId", "code");

-- CreateIndex
CREATE INDEX "AttrProcess_orgId_idx" ON "AttrProcess"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AttrProcess_orgId_code_key" ON "AttrProcess"("orgId", "code");

-- AddForeignKey
ALTER TABLE "AttrColor" ADD CONSTRAINT "AttrColor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttrSize" ADD CONSTRAINT "AttrSize_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttrGender" ADD CONSTRAINT "AttrGender_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttrCategory" ADD CONSTRAINT "AttrCategory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttrRole" ADD CONSTRAINT "AttrRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttrProcess" ADD CONSTRAINT "AttrProcess_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
