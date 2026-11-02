// Read-only application-data audit. Supply the Railway DB URL explicitly.
const {buildValidatedSharedAtPrediction}=require('../dist/services/atSharedPrior');
const {loadCompletedAtFactoryMonths,atSourceSignature,AT_SOURCE_POLICY_VERSION}=require('../dist/services/atTrainingEligibility');
async function audit(db,orgId=1,{asOf=new Date()}={}){
 const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(asOf);
 const maxMonthKey=new Date(Date.UTC(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5,7))-1,0)).toISOString().slice(0,7);
 const data=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '25000ms'");
  const work=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS records,
   COUNT(*) FILTER(WHERE wr.quantity<=0)::int AS "nonpositiveQuantity",
   COUNT(*) FILTER(WHERE wr."workerId" IS NULL)::int AS "missingWorker",
   COUNT(*) FILTER(WHERE wr."assignmentPlanId" IS NULL)::int AS "missingAssignment",
   COUNT(*) FILTER(WHERE sp."styleId" IS DISTINCT FROM wr."styleId")::int AS "processStyleMismatch",
   COUNT(*) FILTER(WHERE sp."productionStage"<>'SEWING')::int AS "nonSewingRecords",
   COUNT(*) FILTER(WHERE COALESCE(wr."effectiveCoverageStartDate",wl."coverageStartDate",wl."workDate")>COALESCE(wr."effectiveCoverageEndDate",wl."coverageEndDate",wl."workDate"))::int AS "reversedCoverage"
   FROM "WorkRecord" wr JOIN "WorkLog" wl ON wl.id=wr."workLogId" LEFT JOIN "StyleProcess" sp ON sp.id=wr."styleProcessId"
   WHERE wl."orgId"=$1 AND wl."recordKind"='EMPLOYEE'`,orgId);
  const attendance=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS records,
   COUNT(*) FILTER(WHERE "workedSeconds" IS NULL OR "workedSeconds"<0)::int AS invalid,
   COUNT(*) FILTER(WHERE "workedSeconds">57600)::int AS "over16Hours",
   COUNT(*) FILTER(WHERE "workedSeconds"=0)::int AS "zeroHours"
   FROM "AttendanceEntry" WHERE "orgId"=$1 AND "managementExcluded"=false`,orgId);
  const repeatedAttendance=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "workerDatesWithMultipleAttendanceRows" FROM
   (SELECT "workerId","workDate" FROM "AttendanceEntry" WHERE "orgId"=$1 AND "managementExcluded"=false GROUP BY 1,2 HAVING COUNT(*)>1) x`,orgId);
  const longAttendance=await tx.$queryRawUnsafe(`SELECT a.id,a."workDate",a."workerId",a."workedSeconds",
   (SELECT COUNT(*)::int FROM "WorkRecord" wr JOIN "WorkLog" wl ON wl.id=wr."workLogId" WHERE wl."orgId"=a."orgId" AND wl."recordKind"='EMPLOYEE' AND wr."workerId"=a."workerId"
    AND a."workDate">=COALESCE(wr."effectiveCoverageStartDate",wl."coverageStartDate",wl."workDate") AND a."workDate"<=COALESCE(wr."effectiveCoverageEndDate",wl."coverageEndDate",wl."workDate")) AS "workRecordsInDeclaredPeriod"
   FROM "AttendanceEntry" a WHERE a."orgId"=$1 AND a."managementExcluded"=false AND a."workedSeconds">57600 ORDER BY a."workedSeconds" DESC`,orgId);
  const monthly=await tx.$queryRawUnsafe(`SELECT 'WORK' AS source,wl."factoryId",LEFT(wl."workDate",7) AS month,MAX(COALESCE(wl."coverageEndDate",wl."workDate")) AS "through",COUNT(*)::int AS records
   FROM "WorkLog" wl WHERE wl."orgId"=$1 AND wl."recordKind"='EMPLOYEE' GROUP BY 2,3
   UNION ALL SELECT 'ATTENDANCE',"factoryId",LEFT("workDate",7),MAX("workDate"),COUNT(*)::int FROM "AttendanceEntry" WHERE "orgId"=$1 AND "managementExcluded"=false GROUP BY 2,3 ORDER BY month,source`,orgId);
  const missingLabor=await tx.$queryRawUnsafe(`SELECT LEFT(wl."workDate",7) AS month,COUNT(*)::int AS "workRecordsWithoutPositiveAttendanceInDeclaredPeriod"
   FROM "WorkRecord" wr JOIN "WorkLog" wl ON wl.id=wr."workLogId"
   WHERE wl."orgId"=$1 AND wl."recordKind"='EMPLOYEE' AND NOT EXISTS
   (SELECT 1 FROM "AttendanceEntry" a WHERE a."orgId"=wl."orgId" AND a."workerId"=wr."workerId" AND a."managementExcluded"=false AND a."workedSeconds">0
    AND a."workDate">=COALESCE(wr."effectiveCoverageStartDate",wl."coverageStartDate",wl."workDate") AND a."workDate"<=COALESCE(wr."effectiveCoverageEndDate",wl."coverageEndDate",wl."workDate")) GROUP BY 1 ORDER BY 1`,orgId);
  const quantityReview=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS "processAssignmentTotalsAbove110PercentOfAssignment" FROM
   (SELECT wr."assignmentPlanId",wr."styleProcessId",SUM(wr.quantity) AS quantity FROM "WorkRecord" wr JOIN "WorkLog" wl ON wl.id=wr."workLogId" WHERE wl."orgId"=$1 AND wl."recordKind"='EMPLOYEE' GROUP BY 1,2) x
   JOIN "AssignmentPlan" p ON p.id=x."assignmentPlanId" AND p."orgId"=$1 WHERE p."assignmentQuantity">0 AND x.quantity>p."assignmentQuantity"*1.1`,orgId);
  const observations=await tx.$queryRawUnsafe(`SELECT "modelVersion",COUNT(*)::int AS records,
   COUNT(DISTINCT "assignmentPlanId")::int AS assignments,
   COUNT(*) FILTER(WHERE "attendanceCoverage"<0.95)::int AS "lowAttendanceCoverage",
   COUNT(*) FILTER(WHERE "sourceLaborInputSeconds">0 AND "unexplainedLaborInputSeconds"/"sourceLaborInputSeconds">0.5)::int AS "overHalfUnexplained",
   MIN("computedAt") AS "oldestComputedAt",MAX("computedAt") AS "latestComputedAt"
   FROM "StyleProcessAtObservation" WHERE "orgId"=$1 GROUP BY "modelVersion"`,orgId);
  const rows=await tx.styleProcess.findMany({where:{orgId,isActive:true},include:{style:{select:{id:true,code:true,name:true,categoryId:true,collection:true}},standards:{include:{quantityBucketEntry:true}},atObservations:{where:{modelVersion:'v5-worker-period'}}}});
  const scopes=await loadCompletedAtFactoryMonths(tx,orgId,maxMonthKey,asOf);
  const sourcePolicy=await tx.systemSetting.findUnique({where:{key:`AT_SOURCE_POLICY:${orgId}`}});
  return {work:work[0],attendance:attendance[0],repeatedAttendance:repeatedAttendance[0],missingLaborByMonth:missingLabor,quantityReview:quantityReview[0],longAttendance,monthly,observations,sourceChanged:sourcePolicy?.value?.version!==AT_SOURCE_POLICY_VERSION||sourcePolicy?.value?.sourceSignature!==atSourceSignature(scopes),completedFactoryMonths:scopes.map(s=>({factoryId:s.factoryId,monthKey:s.monthKey})),rows};
 },{timeout:30000,isolationLevel:'RepeatableRead'});
 const {rows,...summary}=data;
 const targets=['AM02053','ULPT001','ULCT001','SAN042','SAN040','SAN102'];
 const sample=targets.flatMap(code=>rows.filter(r=>r.style.code===code).slice(0,8));
 const validations=sample.map(row=>{
  const prediction=buildValidatedSharedAtPrediction(row,rows),v=prediction?.validation;
  return {processId:row.id,style:row.style.code,source:prediction?.source||null,ownAssignments:prediction?.ownAssignmentCount||0,donorStyles:prediction?.donorStyleCount||0,ownObservationCount:row.atObservations.length,
   reliabilityPercent:v?.overall?.reliabilityPercent??null,expectedRelativeError:v?.overall?.predictionRelativeError??null,validationIndependentCount:v?.overall?.independentCount??0,
   reference1000Reliability:v?.reference?.reliabilityPercent??null};
 });
 return {mode:'READ_ONLY',orgId,...summary,processes:{active:rows.length,withoutPT:rows.filter(r=>!(r.ptSeconds>0)).length,withOwnObservations:rows.filter(r=>r.atObservations.length).length,withMultipleOwnAssignments:rows.filter(r=>new Set(r.atObservations.map(o=>o.assignmentPlanId)).size>=2).length,nonSewing:rows.filter(r=>r.productionStage!=='SEWING').length},validationSample:validations};
}
module.exports={audit};
if(require.main===module){
 const url=process.env.DIRECT_URL||process.env.DATABASE_URL;
 if(!url)throw Error('Supply an explicit Railway application database URL.');
 require('../src/config/databaseTargetGuard').assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});
 const db=new(require('@prisma/client').PrismaClient)({datasourceUrl:url});
 audit(db,Number(process.argv[2]||1)).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error('Read-only AT audit failed ('+(error.code||error.name)+').');process.exitCode=1;}).finally(()=>db.$disconnect());
}
