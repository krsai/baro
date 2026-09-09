const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");
const { assertSafeApplicationDatabaseEnv } = require("../dist/config/databaseTargetGuard");
dotenv.config({ override: false, quiet: true });
assertSafeApplicationDatabaseEnv(process.env);
const prisma = new PrismaClient();

async function inspect(tx) {
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  const count = async sql => Number((await tx.$queryRawUnsafe(sql))[0]?.count || 0);
  const legacyTables = await tx.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('Line','LineAssignment')`
  );
  const legacyColumns = await tx.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name IN ('Employee','AssignmentPlan','WorkRecord','OutsourcedWorkRecord') AND column_name='lineId'`
  );
  const checks = {
    assignmentWithoutFactory: await count(`SELECT COUNT(*)::int AS count FROM "AssignmentPlan" p LEFT JOIN "Factory" f ON f.id=p."factoryId" WHERE f.id IS NULL OR f."orgId"<>p."orgId"`),
    employeeFactoryOrgMismatch: await count(`SELECT COUNT(*)::int AS count FROM "Employee" e JOIN "Factory" f ON f.id=e."factoryId" WHERE f."orgId"<>e."orgId"`),
    workRecordFactoryMismatch: await count(`SELECT COUNT(*)::int AS count FROM "WorkRecord" r JOIN "WorkLog" w ON w.id=r."workLogId" LEFT JOIN "AssignmentPlan" p ON p.id=r."assignmentPlanId" WHERE w."factoryId" IS NULL OR r."orgId"<>w."orgId" OR (p.id IS NOT NULL AND (p."orgId"<>w."orgId" OR p."factoryId" IS DISTINCT FROM w."factoryId"))`),
    outsourcedFactoryMismatch: await count(`SELECT COUNT(*)::int AS count FROM "OutsourcedWorkRecord" r JOIN "WorkLog" w ON w.id=r."workLogId" LEFT JOIN "AssignmentPlan" p ON p.id=r."assignmentPlanId" WHERE w."factoryId" IS NULL OR r."orgId"<>w."orgId" OR (p.id IS NOT NULL AND (p."orgId"<>w."orgId" OR p."factoryId" IS DISTINCT FROM w."factoryId"))`),
  };
  if (legacyTables.some(row => row.table_name === "Line")) {
    checks.legacyLineFactoryConflict = await count(`SELECT COUNT(*)::int AS count FROM "AssignmentPlan" p JOIN "Line" l ON l.id=p."lineId" WHERE p."orgId"<>l."orgId" OR (p."factoryId" IS NOT NULL AND p."factoryId"<>l."factoryId")`);
  }
  const complete = legacyTables.length === 0 && legacyColumns.length === 0;
  const ok = complete && Object.values(checks).every(value => value === 0);
  return { ok, complete, legacyTables, legacyColumns, checks };
}
prisma.$transaction(inspect, { isolationLevel: "RepeatableRead", timeout: 60_000 })
  .then(result => { console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 2; })
  .catch(error => { console.error("[audit:line-removal] audit failed", error?.code || error?.name || "unknown"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
