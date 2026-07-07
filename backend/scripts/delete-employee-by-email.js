#!/usr/bin/env node
/**
 * Deletes one Employee account by login email.
 *
 * Dry run:
 *   node scripts/delete-employee-by-email.js "user@example.com"
 *
 * Apply:
 *   node scripts/delete-employee-by-email.js "user@example.com" --confirm
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Email is required. Example: node scripts/delete-employee-by-email.js "user@example.com"');
    process.exit(1);
  }

  const employees = await prisma.$queryRawUnsafe(
    `SELECT id, "orgId", "orgRole", status, name, "factoryId" FROM "Employee" WHERE LOWER(email) = $1 LIMIT 1`,
    email
  );

  if (!employees.length) {
    console.error(`No Employee found for email '${email}'.`);
    process.exit(1);
  }

  const employee = employees[0];
  console.log(
    `Employee id=${employee.id}, orgId=${employee.orgId}, role=${employee.orgRole}, status=${employee.status}, name=${employee.name || ''}`
  );

  if (!process.argv.includes('--confirm')) {
    console.log('\nAdd --confirm to delete this Employee account.');
    console.log(`  node scripts/delete-employee-by-email.js "${email}" --confirm`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "Line" SET "managerEmployeeId" = NULL WHERE "orgId" = $1 AND "managerEmployeeId" = $2`,
      employee.orgId,
      employee.id
    );
    await tx.$executeRawUnsafe(`DELETE FROM "LineAssignment" WHERE "employeeId" = $1`, employee.id);
    await tx.$executeRawUnsafe(
      `DELETE FROM "AttendanceEntry" WHERE "workerId" = $1 AND "orgId" = $2`,
      employee.id,
      employee.orgId
    );
    await tx.$executeRawUnsafe(`DELETE FROM "Employee" WHERE id = $1`, employee.id);
  });

  console.log(`Deleted Employee id=${employee.id}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
