const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");
const { assertSafeApplicationDatabaseEnv } = require("../dist/config/databaseTargetGuard");

dotenv.config({ override: false });
assertSafeApplicationDatabaseEnv(process.env);

const prisma = new PrismaClient();

const scalar = async (sql) => {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows?.[0]?.count || 0);
};

const main = async () => {
  const tables = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('Organization','Factory','Line','LineAssignment','Employee','AssignmentPlan','WorkLog','WorkRecord','OutsourcedWorkRecord')
    ORDER BY table_name
  `);
  const tableSet = new Set(tables.map((row) => row.table_name));
  const required = ["Factory", "Line", "Employee", "AssignmentPlan", "WorkLog", "WorkRecord"];
  const missingTables = required.filter((name) => !tableSet.has(name));
  if (missingTables.length > 0) {
    throw new Error(
      `not a BARO application database or schema is incomplete; missing tables: ${missingTables.join(", ")}`
    );
  }

  const checks = {
    factories: await scalar(`SELECT COUNT(*)::int AS count FROM "Factory"`),
    lines: await scalar(`SELECT COUNT(*)::int AS count FROM "Line"`),
    factoriesWithoutExactlyOneLine: await scalar(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT factory.id
        FROM "Factory" factory
        LEFT JOIN "Line" line ON line."factoryId" = factory.id
        GROUP BY factory.id
        HAVING COUNT(line.id) <> 1
      ) invalid_factory
    `),
    assignmentPlansWithoutResolvableFactory: await scalar(`
      SELECT COUNT(*)::int AS count
      FROM "AssignmentPlan" plan
      LEFT JOIN "Line" line ON line.id = plan."lineId"
      WHERE line.id IS NULL OR line."orgId" <> plan."orgId"
    `),
    employeesWhoseLineFactoryDiffers: await scalar(`
      SELECT COUNT(*)::int AS count
      FROM "Employee" employee
      JOIN "Line" line ON line.id = employee."lineId"
      WHERE employee."lineId" IS NOT NULL
        AND (employee."factoryId" IS DISTINCT FROM line."factoryId" OR employee."orgId" <> line."orgId")
    `),
    workRecordsWithFactoryConflict: await scalar(`
      SELECT COUNT(*)::int AS count
      FROM "WorkRecord" record
      JOIN "WorkLog" log ON log.id = record."workLogId"
      JOIN "AssignmentPlan" plan ON plan.id = record."assignmentPlanId"
      JOIN "Line" line ON line.id = plan."lineId"
      WHERE log."factoryId" IS NULL OR log."factoryId" <> line."factoryId"
    `),
    outsourcedRecordsWithFactoryConflict: tableSet.has("OutsourcedWorkRecord")
      ? await scalar(`
          SELECT COUNT(*)::int AS count
          FROM "OutsourcedWorkRecord" record
          JOIN "WorkLog" log ON log.id = record."workLogId"
          JOIN "AssignmentPlan" plan ON plan.id = record."assignmentPlanId"
          JOIN "Line" line ON line.id = plan."lineId"
          WHERE log."factoryId" IS NULL OR log."factoryId" <> line."factoryId"
        `)
      : 0,
  };

  const blockingKeys = [
    "factoriesWithoutExactlyOneLine",
    "assignmentPlansWithoutResolvableFactory",
    "employeesWhoseLineFactoryDiffers",
    "workRecordsWithFactoryConflict",
    "outsourcedRecordsWithFactoryConflict",
  ];
  const blockers = blockingKeys.filter((key) => checks[key] !== 0);
  console.log(JSON.stringify({ ok: blockers.length === 0, checks, blockers }, null, 2));
  if (blockers.length > 0) process.exitCode = 2;
};

main()
  .catch((error) => {
    console.error(`[audit-line-removal] ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
