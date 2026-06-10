#!/usr/bin/env node
/**
 * 특정 이메일의 직원 기록을 삭제합니다.
 * 사용법: node scripts/delete-employee-by-email.js "123@gmail.com"
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('이메일 인수가 필요합니다. 예: node scripts/delete-employee-by-email.js "123@gmail.com"');
    process.exit(1);
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { email: email.trim().toLowerCase() },
  });

  if (!membership) {
    console.error(`이메일 '${email}'에 해당하는 멤버십을 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`찾은 멤버십: id=${membership.id}, orgId=${membership.orgId}, role=${membership.role}, status=${membership.status}`);

  const employee = await prisma.employee.findUnique({
    where: { orgMembershipId: membership.id },
  });

  if (employee) {
    console.log(`찾은 직원: id=${employee.id}, name=${employee.name}, factoryId=${employee.factoryId}`);
  } else {
    console.log('연결된 Employee 레코드 없음 (OrgMembership만 삭제)');
  }

  const confirm = process.argv[3];
  if (confirm !== '--confirm') {
    console.log('\n위 레코드를 삭제하려면 --confirm 옵션을 추가하세요:');
    console.log(`  node scripts/delete-employee-by-email.js "${email}" --confirm`);
    process.exit(0);
  }

  await prisma.$transaction(async (tx) => {
    if (employee) {
      await tx.line.updateMany({
        where: { orgId: membership.orgId, managerEmployeeId: employee.id },
        data: { managerEmployeeId: null },
      });
      await tx.lineAssignment.deleteMany({ where: { employeeId: employee.id } });
      await tx.attendanceEntry.deleteMany({ where: { workerId: employee.id, orgId: membership.orgId } });
      await tx.employee.delete({ where: { id: employee.id } });
      console.log(`Employee id=${employee.id} 삭제 완료`);
    }
    await tx.orgMembership.delete({ where: { id: membership.id } });
    console.log(`OrgMembership id=${membership.id} 삭제 완료`);
  });

  console.log('완료.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
