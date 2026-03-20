ALTER TABLE "PageTranslation"
ADD COLUMN "sourceText" TEXT,
ADD COLUMN "sourceHash" TEXT,
ADD COLUMN "sourceFile" TEXT,
ADD COLUMN "sourceLine" INTEGER,
ADD COLUMN "autoCollectedAt" TIMESTAMP(3),
ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;
