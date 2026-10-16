// Read-only audit. Use an explicitly supplied application DB URL; never load .env.
const fs = require('node:fs');
const vm = require('node:vm');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../backend/src/config/databaseTargetGuard');
const { buildSharedAtPrediction } = require('../backend/dist/services/atSharedPrior');
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error('An explicit application database URL is required');
assertSafeApplicationDatabaseEnv({ DATABASE_URL: url });
const db = new PrismaClient({ datasourceUrl: url });
const ctx = { module: { exports: {} }, formatNumberWithCommas: String };
vm.createContext(ctx);
const source = fs.readFileSync('frontend/src/utils/processTime.js', 'utf8')
  .replace(/import[^\n]+\n/g, '').replace(/export const /g, 'const ')
  .replace(/export \{[^}]+\};?/g, '');
vm.runInContext(source + '\nmodule.exports={resolveProcessAtPerPieceSeconds,resolveProcessStPerPieceSeconds};', ctx);
const ui = ctx.module.exports;
const round = v => v == null ? null : Math.round(v * 1000) / 1000;
const gap = (st, at) => st == null || !(at > 0) ? null : round((st - at) / at * 100);
async function main() {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : ['SAN102', 'AM02058'];
  const data = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20000ms'");
    const targets = await tx.style.findMany({ where: { OR: codes.flatMap(code => [
      { code: { equals: code, mode: 'insensitive' } }, { name: { equals: code, mode: 'insensitive' } },
    ]) }, include: { timeBucketSetVersion: { include: { entries: true } } } });
    const rows = await tx.styleProcess.findMany({
      where: { orgId: { in: [...new Set(targets.map(s => s.orgId))] }, isActive: true },
      include: { style: { select: { id: true, code: true, name: true, categoryId: true,
        collection: true, timeBucketSetVersionId: true } },
        standards: { include: { quantityBucketEntry: true }, orderBy: [
          { quantityBucketEntry: { bucketQuantity: 'asc' } }, { id: 'asc' }] },
        atObservations: { where: { modelVersion: 'v5-worker-period' }, orderBy: { quantity: 'asc' } } },
    });
    return { targets, rows };
  }, { timeout: 30000 });
  for (const style of data.targets) {
    const buckets = style.timeBucketSetVersion?.entries.map(e => e.bucketQuantity).sort((a,b)=>a-b);
    const processes = data.rows.filter(r => r.styleId === style.id).map(row => {
      const standards = row.standards.filter(s => s.quantityBucketSetVersionId === style.timeBucketSetVersionId);
      const target = { ...row, standards };
      const prediction = buildSharedAtPrediction(target, data.rows);
      const input = { pt: row.ptSeconds, atParams: row.atParams, atSharedPrediction: prediction,
        atV2Observations: row.atObservations, atStFallbackApproved: row.atStFallbackApproved,
        stBuckets: standards.map(s => ({ bucketQuantity: s.quantityBucketEntry.bucketQuantity,
          bucketStSeconds: s.bucketStSeconds })) };
      const at = ui.resolveProcessAtPerPieceSeconds(input, 1000);
      const ownAt = ui.resolveProcessAtPerPieceSeconds({ ...input, atSharedPrediction: null }, 1000);
      const st = ui.resolveProcessStPerPieceSeconds(input, 1000);
      const correctSt = ui.resolveProcessStPerPieceSeconds(input, 1000, buckets);
      const observedQuantity = row.atObservations.reduce((s,o)=>s+o.quantity,0);
      const observedSeconds = row.atObservations.reduce((s,o)=>s+o.allocatedLaborInputSeconds,0);
      return { id: row.id, code: row.processCode, name: row.processName, stage: row.productionStage,
        gender: row.genderScope, PT: row.ptSeconds, ST: st, correctST: correctSt,
        AT: round(at), ownAT: round(ownAt), gapPercent: gap(st, at), deltaSeconds: round(at == null || st == null ? null : at-st),
        prediction, observationCount: row.atObservations.length,
        weightedObservedSeconds: round(observedQuantity > 0 ? observedSeconds/observedQuantity : null),
        observations: row.atObservations.map(o => ({ assignmentPlanId: o.assignmentPlanId, quantity: o.quantity,
          seconds: round(o.allocatedLaborInputSeconds/o.quantity), coverage: o.attendanceCoverage,
          unexplained: round(o.unexplainedLaborInputSeconds), sourceSeconds: round(o.sourceLaborInputSeconds),
          period: [o.observationPeriodStartDate,o.observationPeriodEndDate], computedAt: o.computedAt })),
        input };
    });
    const totals = q => {
      const entries = processes.map(p => ({ st: ui.resolveProcessStPerPieceSeconds(p.input,q),
        correctSt: ui.resolveProcessStPerPieceSeconds(p.input,q,buckets),
        at: ui.resolveProcessAtPerPieceSeconds(p.input,q) }));
      const st = entries.reduce((s,p)=>s+(p.st??0),0);
      const at = entries.every(p=>p.at!=null) ? entries.reduce((s,p)=>s+p.at,0) : null;
      return { quantity:q,ST:round(st),AT:round(at),gapPercent:gap(st,at),
        missingST:entries.filter(p=>p.st==null).length,missingAT:entries.filter(p=>p.at==null).length,
        bucketMismatches:entries.filter(p=>p.st!==p.correctSt).length };
    };
    console.log(JSON.stringify({ styleId:style.id,code:style.code,name:style.name,orgId:style.orgId,
      categoryId:style.categoryId,bucketVersionId:style.timeBucketSetVersionId,buckets,
      processCount:processes.length,totals:[50,100,300,1000,3000].map(totals),
      sources:processes.reduce((m,p)=>{const k=p.prediction?.source??'NONE';m[k]=(m[k]??0)+1;return m;},{}),
      processes:processes.sort((a,b)=>Math.abs(b.deltaSeconds??0)-Math.abs(a.deltaSeconds??0))
        .map(({input,...p})=>p) }));
  }
  if (!data.targets.length) console.log(JSON.stringify({ found:false,codes }));
}
main().catch(e=>{console.error(e.name + ': audit failed');process.exitCode=1;}).finally(()=>db.$disconnect());
