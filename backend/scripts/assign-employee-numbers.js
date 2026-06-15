#!/usr/bin/env node
/**
 * 전체 직원에게 HN-0001부터 오름차순으로 사번을 부여합니다.
 * baro.garment@gmail.com → HN-0001, 나머지는 membership.id 오름차순으로 HN-0002, HN-0003, ...
 *
 * 사용법:
 *   확인:  node scripts/assign-employee-numbers.js
 *   적용:  node scripts/assign-employee-numbers.js --confirm
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FIRST_EMAIL = 'baro.garment@gmail.com';
const PREFIX = 'HN';

async function main() {
  const confirm = process.argv.includes('--confirm');

  // employeeNo 컬럼이 없으면 먼저 생성
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeNo" TEXT`
  );

  // Factory factoryCode 컬럼도 없으면 생성
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Factory" ADD COLUMN IF NOT EXISTS "factoryCode" TEXT`
  );

  // 전체 멤버십 + 직원 조회 (raw SQL로 employeeNo 상태 확인)
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      m.id AS "membershipId",
      m.email,
      m.role,
      e.id AS "employeeId",
      e."employeeNo"
    FROM "OrgMembership" m
    LEFT JOIN "Employee" e ON e."orgMembershipId" = m.id
    WHERE m.status NOT IN ('PENDING', 'REJECTED')
    ORDER BY m.id ASC
  `);

  if (!rows.length) {
    console.log('직원 없음.');
    return;
  }

  // baro.garment@gmail.com 맨 앞, 나머지 id 오름차순
  const first = rows.find((r) => r.email === FIRST_EMAIL);
  const rest = rows.filter((r) => r.email !== FIRST_EMAIL);
  const ordered = first ? [first, ...rest] : rows;

  console.log(`총 ${ordered.length}명 사번 부여 예정:\n`);
  const assignments = ordered.map((r, i) => ({
    ...r,
    newNo: `${PREFIX}-${String(i + 1).padStart(4, '0')}`,
  }));

  for (const a of assignments) {
    const current = a.employeeNo || '(없음)';
    const empTag = a.employeeId ? '' : ' [Employee 없음, SKIP]';
    console.log(`  ${a.newNo}  ←  ${a.email || '(내부)'}  현재: ${current}${empTag}`);
  }

  if (!confirm) {
    console.log('\n실제 적용하려면 --confirm 옵션을 추가하세요:');
    console.log('  node scripts/assign-employee-numbers.js --confirm');
    return;
  }

  for (const a of assignments) {
    if (!a.employeeId) {
      console.log(`  SKIP (Employee 없음): ${a.email}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "Employee" SET "employeeNo" = $1 WHERE id = $2`,
      a.newNo, a.employeeId
    );
    console.log(`  저장: ${a.newNo} → ${a.email || '(내부)'}`);
  }

  // Factory 코드가 없으면 HN으로 세팅
  const factories = await prisma.$queryRawUnsafe(
    `SELECT id, name, "factoryCode" FROM "Factory"`
  );
  for (const f of factories) {
    if (!f.factoryCode) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Factory" SET "factoryCode" = $1 WHERE id = $2`,
        PREFIX, f.id
      );
      console.log(`  공장 코드 설정: ${f.name} → ${PREFIX}`);
    }
  }

  console.log('\n완료.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
