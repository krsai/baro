const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../dist/config/databaseTargetGuard');
const { invalidAssignmentProcessRefIds } = require('../dist/utils/assignmentSnapshotIntegrity');

dotenv.config({ override: false, quiet: true });
process.env.DATABASE_URL ||= process.env.DATABASE_PUBLIC_URL || process.env.DIRECT_URL;
process.env.DIRECT_URL ||= process.env.DATABASE_URL;
assertSafeApplicationDatabaseEnv(process.env);
if (!process.env.DATABASE_URL) throw new Error('Application database connection is not configured. No audit was run.');
const prisma = new PrismaClient();

async function main() {
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const plans = await tx.assignmentPlan.findMany({ select: {
      id: true, orgId: true, styleId: true, styleProcessVersionId: true,
      assignmentCtSnapshot: true, assignmentStSnapshot: true, isCompleted: true,
    } });
    const invalidIds = new Set();
    for (const orgId of new Set(plans.map(plan => plan.orgId))) {
      for (const id of await invalidAssignmentProcessRefIds(tx, orgId, plans.filter(plan => plan.orgId === orgId))) invalidIds.add(id);
    }
    return { totalAssignments: plans.length, invalidAssignments: invalidIds.size,
      affected: plans.filter(plan => invalidIds.has(plan.id)).map(plan => ({ id: plan.id, orgId: plan.orgId, styleId: plan.styleId, isCompleted: plan.isCompleted })) };
  }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
  console.log(JSON.stringify(report, null, 2));
  if (report.invalidAssignments) process.exitCode = 2;
}
main().catch(() => { console.error('Read-only snapshot audit failed; no data was changed. Check application DB connection and schema.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
