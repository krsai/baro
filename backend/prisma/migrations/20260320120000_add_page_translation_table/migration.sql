CREATE TABLE "PageTranslation" (
    "id" SERIAL NOT NULL,
    "pageCode" TEXT NOT NULL,
    "translationKey" TEXT NOT NULL,
    "textKo" TEXT,
    "textEn" TEXT,
    "textVi" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageTranslation_pageCode_translationKey_key" ON "PageTranslation"("pageCode", "translationKey");
CREATE INDEX "PageTranslation_pageCode_idx" ON "PageTranslation"("pageCode");
CREATE INDEX "PageTranslation_translationKey_idx" ON "PageTranslation"("translationKey");
