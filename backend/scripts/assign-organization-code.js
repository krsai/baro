#!/usr/bin/env node
/**
 * 조직에 4자리 대문자 조직 코드(Organization.code)를 부여하고, 그 조직의 기존 직원
 * 사번(Employee.employeeNo) 전체에 같은 코드를 접두어로 붙입니다. 기존 사번의 숫자
 * 순번 자체는 바꾸지 않습니다 (예: "0024" -> "BRVN0024"). 새 직원 채번은
 * backend/src/employees/employeeNumber.ts의 generateNextEmployeeNo가 조직 코드가
 * 설정된 조직에 대해 자동으로 같은 접두어를 이어 붙입니다 - 이 스크립트를 실행한
 * 뒤에는 별도 조치 없이 다음 신규 직원부터 "{코드}{다음 순번}" 형태로 자동 채번됩니다.
 *
 * 이 스크립트는 관계형 FK(작업기록/출퇴근/배정/급여 스냅샷)를 전혀 건드리지 않습니다.
 * employeeNo는 Employee 테이블의 표시/매칭용 문자열일 뿐 다른 테이블의 조인 키가
 * 아니므로, 값만 UPDATE해도 기존 이력 데이터는 전혀 영향받지 않습니다.
 *
 * 사용법:
 *   확인(기본, 아무것도 쓰지 않음):
 *     node backend/scripts/assign-organization-code.js --org-id=1 --code=BRVN
 *   실제 적용:
 *     node backend/scripts/assign-organization-code.js --org-id=1 --code=BRVN --confirm
 *   이미 다른 코드가 설정된 조직의 코드를 바꾸려면 --force를 추가로 요구합니다.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { confirm: false, force: false };
  for (const raw of argv) {
    if (raw === '--confirm') { args.confirm = true; continue; }
    if (raw === '--force') { args.force = true; continue; }
    const match = raw.match(/^--([a-z-]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = Number(args['org-id']);
  const code = String(args.code || '').trim().toUpperCase();

  if (!Number.isInteger(orgId) || orgId <= 0) {
    console.error('사용법: node backend/scripts/assign-organization-code.js --org-id=<id> --code=<4자리 대문자> [--confirm] [--force]');
    process.exit(1);
  }
  if (!/^[A-Z]{4}$/.test(code)) {
    console.error(`code는 영문 대문자 4자리여야 합니다. 입력값: "${args.code || ''}"`);
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, code: true },
  });
  if (!organization) {
    console.error(`조직을 찾을 수 없습니다: orgId=${orgId}`);
    process.exit(1);
  }

  if (organization.code && organization.code !== code && !args.force) {
    console.error(
      `조직 "${organization.name}"(id=${orgId})에는 이미 코드 "${organization.code}"가 설정되어 있습니다. ` +
      `다른 코드로 바꾸려면 --force를 추가하세요 (이미 배포된 사번/출퇴근·작업기록 매칭에 영향을 줄 수 있으니 신중히 확인하세요).`
    );
    process.exit(1);
  }

  const codeOwnedByOther = await prisma.organization.findFirst({
    where: { code, NOT: { id: orgId } },
    select: { id: true, name: true },
  });
  if (codeOwnedByOther) {
    console.error(`코드 "${code}"는 이미 다른 조직("${codeOwnedByOther.name}", id=${codeOwnedByOther.id})이 사용 중입니다.`);
    process.exit(1);
  }

  const employees = await prisma.employee.findMany({
    where: { orgId },
    select: { id: true, name: true, email: true, employeeNo: true },
    orderBy: { id: 'asc' },
  });

  const plan = [];
  const seenNewNo = new Map();
  let hadUnresolvable = false;

  for (const employee of employees) {
    const current = String(employee.employeeNo || '').trim();
    if (!current) {
      // 사번이 아예 없는 직원(가입 승인 전 draft 등)은 건드리지 않는다. 다음 신규 채번 시
      // generateNextEmployeeNo가 알아서 조직 코드를 붙여 새로 부여한다.
      continue;
    }
    if (current.toUpperCase().startsWith(code)) {
      seenNewNo.set(current.toUpperCase(), `${employee.name || employee.email || employee.id}(변경 없음)`);
      plan.push({ employee, current, next: current, action: 'skip(이미 반영됨)' });
      continue;
    }
    const match = current.match(/(\d+)$/);
    if (!match) {
      // 숫자로 끝나지 않는 사용자 지정 사번(예: OFFICE-A)은 순번 체계 밖이므로 건드리지 않는다.
      plan.push({ employee, current, next: current, action: 'skip(숫자 아님, 수동 확인 필요)' });
      continue;
    }
    const digits = match[1].padStart(4, '0');
    const next = `${code}${digits}`;
    if (seenNewNo.has(next)) {
      hadUnresolvable = true;
      plan.push({ employee, current, next, action: `충돌!! ${seenNewNo.get(next)}와 동일한 새 사번` });
      continue;
    }
    seenNewNo.set(next, `${employee.name || employee.email || employee.id}(${current})`);
    plan.push({ employee, current, next, action: 'update' });
  }

  console.log(`조직: ${organization.name} (id=${orgId}), 기존 코드: ${organization.code || '(없음)'} -> ${code}`);
  console.log(`대상 직원 ${employees.length}명 중 변경 계획:\n`);
  for (const row of plan) {
    console.log(`  ${row.current.padEnd(12)} -> ${row.next.padEnd(12)} [${row.action}]  ${row.employee.name || row.employee.email || ''}`);
  }

  if (hadUnresolvable) {
    console.error('\n충돌하는 사번이 있어 중단합니다. 원본 사번 데이터를 먼저 정리하세요.');
    process.exit(1);
  }

  if (!args.confirm) {
    console.log('\n실제 적용하려면 --confirm 옵션을 추가하세요.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: orgId }, data: { code } });
    for (const row of plan) {
      if (row.action !== 'update') continue;
      await tx.employee.update({
        where: { id: row.employee.id },
        data: { employeeNo: row.next },
      });
    }
  }, { timeout: 30000 });

  console.log('\n완료.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
