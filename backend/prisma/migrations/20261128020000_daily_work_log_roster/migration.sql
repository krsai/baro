CREATE UNIQUE INDEX IF NOT EXISTS "WorkLog_id_orgId_key" ON "WorkLog" (id, "orgId");
CREATE TABLE IF NOT EXISTS "WorkLogWorkerReview" (
  "workLogId" INTEGER NOT NULL,
  "orgId" INTEGER NOT NULL,
  "workerId" INTEGER NOT NULL,
  "noWork" BOOLEAN NOT NULL,
  PRIMARY KEY ("workLogId", "workerId"),
  FOREIGN KEY ("workLogId", "orgId") REFERENCES "WorkLog"(id, "orgId") ON DELETE CASCADE,
  FOREIGN KEY ("workerId", "orgId") REFERENCES "Employee"(id, "orgId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "WorkLogWorkerReview_workerId_orgId_idx" ON "WorkLogWorkerReview" ("workerId", "orgId");
