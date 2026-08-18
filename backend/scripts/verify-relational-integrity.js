require("../dist/config/env");
const { PrismaClient } = require("@prisma/client");
const {
  assertSafeApplicationDatabaseEnv,
} = require("../src/config/databaseTargetGuard");

assertSafeApplicationDatabaseEnv(process.env);
const prisma = new PrismaClient();

const checks = [
  ["WorkRecord canonical FK missing", `SELECT COUNT(*)::int AS count FROM "WorkRecord" WHERE "assignmentPlanId" IS NULL OR "styleId" IS NULL OR "styleProcessId" IS NULL`],
  ["WorkRecord canonical relation mismatch", `SELECT COUNT(*)::int AS count FROM "WorkRecord" wr JOIN "AssignmentPlan" ap ON ap.id=wr."assignmentPlanId" JOIN "Style" s ON s.id=wr."styleId" JOIN "StyleProcess" sp ON sp.id=wr."styleProcessId" WHERE wr."orgId"<>ap."orgId" OR wr."orgId"<>sp."orgId" OR sp."styleId"<>wr."styleId" OR s.id<>sp."styleId"`],
  ["Cross-org Style without OrgRelationship", `SELECT COUNT(*)::int AS count FROM "WorkRecord" wr JOIN "Style" s ON s.id=wr."styleId" LEFT JOIN "OrgRelationship" rel ON rel."manufacturerOrgId"=wr."orgId" AND rel."brandOrgId"=s."orgId" WHERE wr."orgId"<>s."orgId" AND rel.id IS NULL`],
  ["OutsourcedWorkRecord canonical FK missing", `SELECT COUNT(*)::int AS count FROM "OutsourcedWorkRecord" WHERE "assignmentPlanId" IS NULL OR "styleId" IS NULL OR "styleProcessId" IS NULL OR "outsourcingPartnerId" IS NULL`],
  ["OutsourcedWorkRecord canonical relation mismatch", `SELECT COUNT(*)::int AS count FROM "OutsourcedWorkRecord" owr JOIN "AssignmentPlan" ap ON ap.id=owr."assignmentPlanId" JOIN "Style" s ON s.id=owr."styleId" JOIN "StyleProcess" sp ON sp.id=owr."styleProcessId" JOIN "BusinessPartner" bp ON bp.id=owr."outsourcingPartnerId" WHERE owr."orgId"<>ap."orgId" OR owr."orgId"<>sp."orgId" OR sp."styleId"<>owr."styleId" OR s.id<>sp."styleId" OR owr."orgId"<>bp."orgId"`],
  ["WorkLog recordKind mismatch", `SELECT COUNT(*)::int AS count FROM "WorkLog" wl WHERE ("recordKind"='EMPLOYEE' AND EXISTS (SELECT 1 FROM "OutsourcedWorkRecord" owr WHERE owr."workLogId"=wl.id)) OR ("recordKind"='OUTSOURCING' AND EXISTS (SELECT 1 FROM "WorkRecord" wr WHERE wr."workLogId"=wl.id))`],
  ["AssignmentPlan without AssignmentCard", `SELECT COUNT(*)::int AS count FROM "AssignmentPlan" WHERE "assignmentCardId" IS NULL`],
  ["AssignmentPlan identity mismatch", `SELECT COUNT(*)::int AS count FROM "AssignmentPlan" ap JOIN "AssignmentCard" ac ON ac.id=ap."assignmentCardId" WHERE ap."orgId"<>ac."orgId" OR ap."styleId" IS DISTINCT FROM ac."styleId" OR ap."workOrderId" IS DISTINCT FROM ac."workOrderId" OR ap."buyerOrgId" IS DISTINCT FROM ac."buyerOrgId"`],
  ["Employee factory/line org mismatch", `SELECT COUNT(*)::int AS count FROM "Employee" e LEFT JOIN "Factory" f ON f.id=e."factoryId" LEFT JOIN "Line" l ON l.id=e."lineId" WHERE (f.id IS NOT NULL AND f."orgId"<>e."orgId") OR (l.id IS NOT NULL AND l."orgId"<>e."orgId")`],
  ["Warehouse factory org mismatch", `SELECT COUNT(*)::int AS count FROM "Warehouse" w JOIN "Factory" f ON f.id=w."factoryId" WHERE w."orgId"<>f."orgId"`],
  ["Factory production allowance rate org mismatch", `SELECT COUNT(*)::int AS count FROM "FactoryProductionAllowanceRate" r JOIN "Factory" f ON f.id=r."factoryId" WHERE r."orgId"<>f."orgId"`],
];

(async () => {
  let total = 0;
  for (const [name, sql] of checks) {
    const rows = await prisma.$queryRawUnsafe(sql);
    const count = Number(rows[0]?.count || 0);
    total += count;
    console.log(`${name}: ${count}`);
  }
  if (total > 0) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
