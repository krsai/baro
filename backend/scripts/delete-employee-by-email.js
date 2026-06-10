#!/usr/bin/env node
/**
 * 특정 이메일의 직원 기록을 삭제합니다.
 * 사용법:
 *   확인:  node scripts/delete-employee-by-email.js "123@gmail.com"
 *   적용:  node scripts/delete-employee-by-email.js "123@gmail.com" --confirm
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('이메일 인수가 필요합니다. 예: node scripts/delete-employee-by-email.js "123@gmail.com"');
    process.exit(1);
  }

  const memberships = await prisma.$queryRawUnsafe(
    `SELECT id, "orgId", role, status FROM "OrgMembership" WHERE LOWER(email) = $1 LIMIT 1`,
    email
  );

  if (!memberships.length) {
    console.error(`이메일 '${email}'에 해당하는 멤버십을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const membership = memberships[0];
  console.log(`멤버십: id=${membership.id}, orgId=${membership.orgId}, role=${membership.role}, status=${membership.status}`);

  const employees = await prisma.$queryRawUnsafe(
    `SELECT id, name, "factoryId" FROM "Employee" WHERE "orgMembershipId" = $1 LIMIT 1`,
    membership.id
  );
  const employee = employees[0] || null;

  if (employee) {
    console.log(`직원: id=${employee.id}, name=${employee.name}`);
  } else {
    console.log('연결된 Employee 레코드 없음 (OrgMembership만 삭제)');
  }

  if (!process.argv.includes('--confirm')) {
    console.log('\n실제 삭제하려면 --confirm 옵션을 추가하세요:');
    console.log(`  node scripts/delete-employee-by-email.js "${email}" --confirm`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (employee) {
      await tx.$executeRawUnsafe(
        `UPDATE "Line" SET "managerEmployeeId" = NULL WHERE "orgId" = $1 AND "managerEmployeeId" = $2`,
        membership.orgId, employee.id
      );
      await tx.$executeRawUnsafe(`DELETE FROM "LineAssignment" WHERE "employeeId" = $1`, employee.id);
      await tx.$executeRawUnsafe(
        `DELETE FROM "AttendanceEntry" WHERE "workerId" = $1 AND "orgId" = $2`,
        employee.id, membership.orgId
      );
      await tx.$executeRawUnsafe(`DELETE FROM "Employee" WHERE id = $1`, employee.id);
      console.log(`Employee id=${employee.id} 삭제 완료`);
    }
    await tx.$executeRawUnsafe(`DELETE FROM "OrgMembership" WHERE id = $1`, membership.id);
    console.log(`OrgMembership id=${membership.id} 삭제 완료`);
  });

  console.log('완료.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
