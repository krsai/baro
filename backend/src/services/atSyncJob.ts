import { randomUUID } from 'node:crypto';
import { createHttpError } from '../utils/http';
const keyFor = (orgId: number) => `AT_SYNC_JOB:${orgId}`;
const fresh = (job: any) => job?.status === 'RUNNING' && Date.now()-Date.parse(job.heartbeatAt || job.startedAt)<120000;

export async function getAtSyncJob(db: any, orgId: number, jobId?: string) {
  const value = (await db.systemSetting.findUnique({where:{key:keyFor(orgId)}}))?.value as any;
  if (!value || jobId && value.jobId!==jobId) throw createHttpError(404,'AT_SYNC_JOB_NOT_FOUND');
  return value.status==='RUNNING' && !fresh(value) ? {...value,status:'FAILED',error:'AT_SYNC_JOB_INTERRUPTED'} : value;
}

export async function startAtSyncJob(db: any, orgId: number, task: () => Promise<any>) {
  const claim = await db.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(20261019,$1::int)::text AS lock',orgId);
    const previous = (await tx.systemSetting.findUnique({where:{key:keyFor(orgId)}}))?.value;
    if (fresh(previous)) return {job:previous,claimed:false};
    const job = {jobId:randomUUID(),status:'RUNNING',startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString()};
    await tx.systemSetting.upsert({where:{key:keyFor(orgId)},create:{key:keyFor(orgId),value:job},update:{value:job}});
    return {job,claimed:true};
  });
  if (!claim.claimed) return claim.job;
  const job = claim.job;
  const persist = (patch: any) => db.$executeRawUnsafe(`UPDATE "SystemSetting" SET value=value || $1::jsonb,"updatedAt"=NOW()
    WHERE key=$2 AND value->>'jobId'=$3 AND value->>'status'='RUNNING'`,JSON.stringify(patch),keyFor(orgId),job.jobId);
  setImmediate(() => { void (async () => {
    const heartbeat = setInterval(() => { void persist({heartbeatAt:new Date().toISOString()}).catch((error: any)=>console.error('[AT sync] heartbeat failed',error)); },15000);
    heartbeat.unref();
    try { const result=await task(); await persist({status:'SUCCEEDED',result,finishedAt:new Date().toISOString()}); }
    catch(error) { console.error('[AT sync] job failed',{orgId,jobId:job.jobId,error});await persist({status:'FAILED',error:'AT_SYNC_FAILED',finishedAt:new Date().toISOString()}); }
    finally { clearInterval(heartbeat); }
  })().catch(error=>console.error('[AT sync] job state write failed',{orgId,error})); });
  return job;
}

export async function assertNoAtSyncJob(db: any, orgId: number) {
  const value=(await db.systemSetting.findUnique({where:{key:keyFor(orgId)}}))?.value;
  if (fresh(value)) throw createHttpError(409,'AT_SYNC_ALREADY_RUNNING');
}
