-- CreateEnum
CREATE TYPE "OrgUserRole" AS ENUM ('ADMIN', 'OPERATOR', 'ACCOUNTANT', 'WORKER');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SYSTEM_ADMIN', 'USER');

-- CreateTable
CREATE TABLE "SystemUser" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationUser" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgUserRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "countryCode" TEXT,
    "phoneNumber" TEXT,
    "manager" TEXT,
    "wageStandard" TEXT NOT NULL DEFAULT 'PT',
    "targetMonthlyWage" DOUBLE PRECISION,
    "wagePerSecond" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemUser_email_key" ON "SystemUser"("email");

-- CreateIndex
CREATE INDEX "OrganizationUser_orgId_idx" ON "OrganizationUser"("orgId");

-- CreateIndex
CREATE INDEX "OrganizationUser_email_idx" ON "OrganizationUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUser_orgId_email_key" ON "OrganizationUser"("orgId", "email");

-- CreateIndex
CREATE INDEX "Factory_orgId_idx" ON "Factory"("orgId");

-- AddForeignKey
ALTER TABLE "OrganizationUser" ADD CONSTRAINT "OrganizationUser_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
