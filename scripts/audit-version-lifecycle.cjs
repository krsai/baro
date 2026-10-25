// Read-only application DB audit; credentials arrive on stdin and are not logged.
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const {assertSafeApplicationDatabaseEnv}=require('../backend/src/config/databaseTargetGuard');
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);
process.stdin.on('end',async()=>{let db;try{
 const {DATABASE_PUBLIC_URL:url,month}=JSON.parse(input);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('INVALID_MONTH');
 assertSafeApplicationDatabaseEnv({DATABASE_URL:url,DIRECT_URL:url});db=new PrismaClient({datasourceUrl:url});
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const counts=(await tx.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "StyleProcessVersion") AS "processVersions",(SELECT count(*)::int FROM "SalarySystemVersion") AS "salaryVersions",(SELECT count(*)::int FROM "FactoryProductionAllowanceRate") AS "rateVersions",(SELECT count(*)::int FROM "EmployeePayrollManagementVersion") AS "employeeExceptionVersions"`))[0];
  const process=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS "stylesWithVersions",count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM "AssignmentPlan" a WHERE a."styleId"=v."styleId" AND a."orgId"=v."orgId"))::int AS "stylesAwaitingFirstAssignment" FROM (SELECT DISTINCT "styleId","orgId" FROM "StyleProcessVersion") v`))[0];
  const refs=await tx.$queryRawUnsafe(`SELECT v.id AS "versionId",v."styleId", count(*)::int AS "invalidProcessReferences" FROM "StyleProcessVersion" v CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v."processSnapshot")='array' THEN v."processSnapshot" ELSE '[]'::jsonb END) r LEFT JOIN "StyleProcess" p ON p.id=CASE WHEN coalesce(r->>'styleProcessId',r->>'id','') ~ '^[0-9]{1,9}$' THEN coalesce(r->>'styleProcessId',r->>'id')::int ELSE NULL END AND p."styleId"=v."styleId" AND p."orgId"=v."orgId" WHERE p.id IS NULL GROUP BY v.id,v."styleId" ORDER BY v.id`);
  const assignments=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS total,count(*) FILTER(WHERE a."styleProcessVersionId" IS NULL)::int AS "unversioned",count(*) FILTER(WHERE a."styleProcessVersionId" IS NULL AND a."isCompleted")::int AS "unversionedCompleted",count(*) FILTER(WHERE a."styleProcessVersionId" IS NOT NULL AND v.id IS NULL)::int AS "invalidVersionFK" FROM "AssignmentPlan" a LEFT JOIN "StyleProcessVersion" v ON v.id=a."styleProcessVersionId" AND v."styleId"=a."styleId" AND v."orgId"=a."orgId"`))[0];
  const gaps=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS "factoriesWithRatesButNoApplicableRate" FROM (SELECT "factoryId" FROM "FactoryProductionAllowanceRate" GROUP BY "factoryId" HAVING count(*) FILTER(WHERE "effectiveMonth" <= $1)=0) q`,month))[0];
  return {readOnly:true,month,counts,process,invalidSnapshotReferences:refs,assignments,...gaps};
 },{timeout:60000});console.log(JSON.stringify(result,null,2));
}catch(e){console.error('VERSION_LIFECYCLE_AUDIT_FAILED '+(e.code||''));process.exitCode=1;}finally{if(db)await db.$disconnect();}});
