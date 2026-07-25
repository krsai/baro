require("../dist/config/env");
const { PrismaClient } = require("@prisma/client");
const {
  assertSafeApplicationDatabaseEnv,
} = require("../src/config/databaseTargetGuard");

assertSafeApplicationDatabaseEnv(process.env);
const prisma = new PrismaClient();

const checks = [
  ["WorkRecord canonical FK missing", `SELECT COUNT(*)::int AS count FROM "WorkRecord" WHERE "assignmentPlanId" IS NULL OR "styleId" IS NULL OR "styleProcessId" IS NULL`],
  ["WorkRecord org/style mismatch", `SELECT COUNT(*)::int AS count FROM "WorkRecord" wr JOIN "AssignmentPlan" ap ON ap.id=wr."assignmentPlanId" JOIN "Style" s ON s.id=wr."styleId" JOIN "StyleProcess" sp ON sp.id=wr."styleProcessId" WHERE wr."orgId"<>ap."orgId" OR wr."orgId"<>s."orgId" OR wr."orgId"<>sp."orgId" OR sp."styleId"<>wr."styleId" OR s.id<>sp."styleId"`],
  ["AssignmentPlan without AssignmentCard", `SELECT COUNT(*)::int AS count FROM "AssignmentPlan" WHERE "assignmentCardId" IS NULL`],
  ["AssignmentPlan identity mismatch", `SELECT COUNT(*)::int AS count FROM "AssignmentPlan" ap JOIN "AssignmentCard" ac ON ac.id=ap."assignmentCardId" WHERE ap."orgId"<>ac."orgId" OR ap."styleId" IS DISTINCT FROM ac."styleId" OR ap."workOrderId" IS DISTINCT FROM ac."workOrderId" OR ap."buyerOrgId" IS DISTINCT FROM ac."buyerOrgId"`],
  ["Employee factory/line org mismatch", `SELECT COUNT(*)::int AS count FROM "Employee" e LEFT JOIN "Factory" f ON f.id=e."factoryId" LEFT JOIN "Line" l ON l.id=e."lineId" WHERE (f.id IS NOT NULL AND f."orgId"<>e."orgId") OR (l.id IS NOT NULL AND l."orgId"<>e."orgId")`],
  ["StyleProcess org mismatch", `SELECT COUNT(*)::int AS count FROM "StyleProcess" sp JOIN "Style" s ON s.id=sp."styleId" WHERE sp."orgId"<>s."orgId"`],
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
})().finally(() => prisma.$disconnect());
