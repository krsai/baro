export async function waitForAtSyncJob(job, fetchStatus, { sleep = ms => new Promise(resolve=>setTimeout(resolve,ms)), timeoutMs = 15*60*1000 } = {}) {
  if (!job?.jobId) return job;
  const startedAt=Date.now();let current=job,failures=0;
  while(current.status==='RUNNING') {
    if(Date.now()-startedAt>timeoutMs)throw new Error('AT_SYNC_WAIT_TIMEOUT');
    await sleep(1500);
    try{current=await fetchStatus(job.jobId);failures=0;}catch(error){if(++failures>=3)throw error;}
  }
  if(current.status!=='SUCCEEDED')throw new Error(current.error || 'AT_SYNC_FAILED');
  return current.result;
}
