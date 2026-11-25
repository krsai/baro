// A revision is acknowledged only after recomputing from current canonical records.
// A dedicated advisory lock serializes workers without blocking record mutations
// on the queue row while recomputation uses the application DB connection.
export async function retryAssignmentProgress(db: any, sync: (orgId: number, planIds: number[]) => Promise<unknown>, limit = 20, scope?: {orgId: number; planIds: number[]}) {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const found = await db.$transaction(async (tx: any) => {
      const candidates = await tx.$queryRawUnsafe(`SELECT "assignmentPlanId", "orgId" FROM "AssignmentProgressSync"
        WHERE "syncedRevision" < revision AND "nextAttemptAt" <= CURRENT_TIMESTAMP
        AND ($1::integer IS NULL OR "orgId"=$1)
        AND ($2::integer[] IS NULL OR "assignmentPlanId"=ANY($2))
        ORDER BY "nextAttemptAt", "orgId", "assignmentPlanId" LIMIT 20`, scope?.orgId ?? null, scope?.planIds ?? null);
      let row: any = null;
      for (const candidate of candidates) {
        // AssignmentPlan IDs are globally unique; the first key is this worker's namespace.
        const [lock] = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(20261126, $1::integer) AS locked', candidate.assignmentPlanId);
        if (!lock?.locked) continue;
        const current = await tx.$queryRawUnsafe(`SELECT "assignmentPlanId", "orgId", revision::text, attempts FROM "AssignmentProgressSync"
          WHERE "assignmentPlanId"=$1 AND "orgId"=$2 AND "syncedRevision" < revision AND "nextAttemptAt" <= CURRENT_TIMESTAMP`, candidate.assignmentPlanId, candidate.orgId);
        if (current[0]) { row = current[0]; break; }
      }
      if (!row) return false;
      try {
        await sync(row.orgId, [row.assignmentPlanId]);
        await tx.$executeRawUnsafe(`UPDATE "AssignmentProgressSync" SET "syncedRevision"=GREATEST("syncedRevision",$3::bigint), attempts=0,
          "lastError"=NULL, "syncedAt"=CURRENT_TIMESTAMP WHERE "assignmentPlanId"=$1 AND "orgId"=$2`, row.assignmentPlanId, row.orgId, row.revision);
      } catch {
        // Store a stable diagnostic code, never raw DB errors with possible private data.
        const seconds = Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7));
        await tx.$executeRawUnsafe(`UPDATE "AssignmentProgressSync" SET attempts=attempts+1,
          "lastError"='ASSIGNMENT_PROGRESS_SYNC_FAILED', "nextAttemptAt"=CURRENT_TIMESTAMP+($3::integer * INTERVAL '1 second')
          WHERE "assignmentPlanId"=$1 AND "orgId"=$2 AND revision=$4::bigint`, row.assignmentPlanId, row.orgId, seconds, row.revision);
      }
      return true;
    }, {timeout: 60000});
    if (!found) break;
    processed++;
  }
  return processed;
}

export function startAssignmentProgressRetry(db: any, sync: (orgId: number, planIds: number[]) => Promise<unknown>) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await retryAssignmentProgress(db, sync); }
    catch { console.warn('[assignment-progress] retry worker unavailable; pending revisions retained'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, 30000);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
