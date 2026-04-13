-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('MANUFACTURER', 'BRAND', 'BOTH');

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "businessNumber" TEXT,
    "representative" TEXT,
    "industry" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "type" "OrganizationType" NOT NULL DEFAULT 'MANUFACTURER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
