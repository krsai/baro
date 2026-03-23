CREATE TABLE "AtTrainingBucket" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "monthKey" TEXT NOT NULL,
  "sourceWorkLogId" INTEGER NOT NULL,
  "workDate" TEXT NOT NULL,
  "factoryId" INTEGER,
  "totalSeconds" INTEGER NOT NULL,
  "attendanceCoverage" DOUBLE PRECISION,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "AtTrainingBucket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AtTrainingBucketProcess" (
  "id" SERIAL NOT NULL,
  "orgId" INTEGER NOT NULL,
  "bucketId" INTEGER NOT NULL,
  "styleUid" INTEGER NOT NULL,
  "styleProcessId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "AtTrainingBucketProcess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtTrainingBucket_orgId_sourceWorkLogId_key"
ON "AtTrainingBucket"("orgId", "sourceWorkLogId");

CREATE INDEX "AtTrainingBucket_orgId_monthKey_workDate_idx"
ON "AtTrainingBucket"("orgId", "monthKey", "workDate");

CREATE INDEX "AtTrainingBucket_orgId_workDate_idx"
ON "AtTrainingBucket"("orgId", "workDate");

CREATE UNIQUE INDEX "AtTrainingBucketProcess_bucketId_styleProcessId_key"
ON "AtTrainingBucketProcess"("bucketId", "styleProcessId");

CREATE INDEX "AtTrainingBucketProcess_orgId_styleProcessId_idx"
ON "AtTrainingBucketProcess"("orgId", "styleProcessId");

CREATE INDEX "AtTrainingBucketProcess_orgId_styleUid_idx"
ON "AtTrainingBucketProcess"("orgId", "styleUid");

ALTER TABLE "AtTrainingBucket"
ADD CONSTRAINT "AtTrainingBucket_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AtTrainingBucketProcess"
ADD CONSTRAINT "AtTrainingBucketProcess_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AtTrainingBucketProcess"
ADD CONSTRAINT "AtTrainingBucketProcess_bucketId_fkey"
FOREIGN KEY ("bucketId") REFERENCES "AtTrainingBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AtTrainingBucketProcess"
ADD CONSTRAINT "AtTrainingBucketProcess_styleProcessId_fkey"
FOREIGN KEY ("styleProcessId") REFERENCES "StyleProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
