#!/usr/bin/env node
'use strict';

/**
 * 테스트 초기화 스크립트 — test-initial-state.md baseline v1.4 기준
 *
 * 삭제 대상:
 *   WorkLog (→ WorkRecord 자동 cascade)
 *   Style, WorkOrder, AssignmentPlan, AssignmentBoardState
 *   AttrProcess (P01~P10으로 복원)
 *
 * 유지 대상:
 *   Organization, OrgRelationship, OrgMembership
 *   Employee, Factory, Line, LineAssignment
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MANUFACTURER_CODE = 'TSMF';
const BRAND_CODE = 'TSBR';
const BASELINE_FACTORY_NAME = '샘플 공장';
const BASELINE_LINE_PREFIX = '샘플 라인';
const BASELINE_EMPLOYEE_NAME_BY_EMAIL = {
  'manufacturer-worker@test.local': '테스트 작업자',
  'manufacturer-admin@test.local': '테스트 관리자',
  'manufacturer-operator@test.local': '테스트 운영자',
  'manufacturer-accountant@test.local': '테스트 회계담당',
};

const BASELINE_PROCESSES = [
  { code: 'P01', name: '테스트 공정 01' },
  { code: 'P02', name: '테스트 공정 02' },
  { code: 'P03', name: '테스트 공정 03' },
  { code: 'P04', name: '테스트 공정 04' },
  { code: 'P05', name: '테스트 공정 05' },
  { code: 'P06', name: '테스트 공정 06' },
  { code: 'P07', name: '테스트 공정 07' },
  { code: 'P08', name: '테스트 공정 08' },
  { code: 'P09', name: '테스트 공정 09' },
  { code: 'P10', name: '테스트 공정 10' },
];

// 샘플 스타일 정의
// Style A: 공정 6개, q=1000, PT 합계 5,000초
// Style B: 공정 7개, q=1000, PT 합계 7,000초
const BASELINE_STYLES = [
  {
    styleId: 'S-SAMPLE-A',
    styleCode: 'SA-001',
    name: '샘플 스타일 A',
    registrationDate: '2025-01-01',
    season: '2025SS',
    collection: '샘플 컬렉션',
    processes: [
      { code: 'P01', name: '테스트 공정 01', pt:  950, timeRefQuantity: 1000 },
      { code: 'P02', name: '테스트 공정 02', pt:  900, timeRefQuantity: 1000 },
      { code: 'P03', name: '테스트 공정 03', pt:  850, timeRefQuantity: 1000 },
      { code: 'P04', name: '테스트 공정 04', pt:  800, timeRefQuantity: 1000 },
      { code: 'P05', name: '테스트 공정 05', pt:  750, timeRefQuantity: 1000 },
      { code: 'P06', name: '테스트 공정 06', pt:  750, timeRefQuantity: 1000 },
      // PT 합계: 5,000초 / q=1,000
    ],
  },
  {
    styleId: 'S-SAMPLE-B',
    styleCode: 'SB-001',
    name: '샘플 스타일 B',
    registrationDate: '2025-01-01',
    season: '2025SS',
    collection: '샘플 컬렉션',
    processes: [
      { code: 'P01', name: '테스트 공정 01', pt: 1100, timeRefQuantity: 1000 },
      { code: 'P02', name: '테스트 공정 02', pt: 1050, timeRefQuantity: 1000 },
      { code: 'P03', name: '테스트 공정 03', pt: 1000, timeRefQuantity: 1000 },
      { code: 'P04', name: '테스트 공정 04', pt: 1000, timeRefQuantity: 1000 },
      { code: 'P05', name: '테스트 공정 05', pt: 1000, timeRefQuantity: 1000 },
      { code: 'P06', name: '테스트 공정 06', pt:  950, timeRefQuantity: 1000 },
      { code: 'P07', name: '테스트 공정 07', pt:  900, timeRefQuantity: 1000 },
      // PT 합계: 7,000초 / q=1,000
    ],
  },
];

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

const resolveBaselineLineName = (name, fallbackIndex = 1) => {
  const text = String(name ?? '').trim();
  const legacyMatch = text.match(/^Sample Line(?:\s+(\d+))?$/i);
  const baselineMatch = text.match(/^샘플 라인(?:\s+(\d+))?$/);
  const numberText =
    legacyMatch?.[1] ?? baselineMatch?.[1] ?? String(fallbackIndex);
  const parsed = Number(numberText);
  const lineNumber =
    Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallbackIndex;
  return `${BASELINE_LINE_PREFIX} ${lineNumber}`;
};

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { code: { in: [MANUFACTURER_CODE, BRAND_CODE] } },
    select: { id: true, code: true, name: true },
  });

  const manufacturer = orgs.find((o) => o.code === MANUFACTURER_CODE);
  const brand = orgs.find((o) => o.code === BRAND_CODE);

  if (!manufacturer || !brand) {
    throw new Error(
      `조직을 찾을 수 없습니다. (찾은 org: ${orgs.map((o) => o.code).join(', ')})`
    );
  }

  console.log(`\n대상 조직:`);
  console.log(`  TSMF (제조사) orgId: ${manufacturer.id}`);
  console.log(`  TSBR (브랜드) orgId: ${brand.id}`);
  console.log(`\n초기화 시작...\n`);

  const results = {};

  // 1. WorkLog 삭제 (WorkRecord는 onDelete: Cascade로 자동 삭제)
  const deletedWorkLogs = await prisma.workLog.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.workLog = deletedWorkLogs.count;
  console.log(`[1/8] WorkLog: ${deletedWorkLogs.count}건 삭제 (WorkRecord cascade 포함)`);

  // 2. Style 삭제 (TSMF + TSBR 전체)
  const deletedStyles = await prisma.style.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.style = deletedStyles.count;
  console.log(`[2/8] Style: ${deletedStyles.count}건 삭제`);

  // 3. WorkOrder 삭제
  const deletedOrders = await prisma.workOrder.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.workOrder = deletedOrders.count;
  console.log(`[3/8] WorkOrder: ${deletedOrders.count}건 삭제`);

  // 4. AssignmentPlan 삭제
  const deletedPlans = await prisma.assignmentPlan.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentPlan = deletedPlans.count;
  console.log(`[4/8] AssignmentPlan: ${deletedPlans.count}건 삭제`);

  // 5. AssignmentBoardState 삭제
  const deletedBoardState = await prisma.assignmentBoardState.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentBoardState = deletedBoardState.count;
  console.log(`[5/8] AssignmentBoardState: ${deletedBoardState.count}건 삭제`);

  // 6. AttrProcess: 전체 삭제 후 P01~P10 복원
  await prisma.attrProcess.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrProcess.createMany({
    data: BASELINE_PROCESSES.map((p) => ({ orgId: manufacturer.id, ...p })),
    skipDuplicates: true,
  });
  results.attrProcess = `P01~P10 복원`;
  console.log(`[6/8] AttrProcess: P01~P10 복원 완료`);

  // 7. 유지 데이터의 영문 레거시 명칭을 한글 기준명으로 정규화
  let normalizedFactories = 0;
  let normalizedLines = 0;
  let normalizedEmployees = 0;

  const factories = await prisma.factory.findMany({
    where: { orgId: manufacturer.id },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  for (const factory of factories) {
    const currentName = String(factory.name || '').trim();
    if (!/^sample factory$/i.test(currentName)) continue;
    if (currentName === BASELINE_FACTORY_NAME) continue;
    await prisma.factory.update({
      where: { id: factory.id },
      data: { name: BASELINE_FACTORY_NAME },
    });
    normalizedFactories += 1;
  }

  const lines = await prisma.line.findMany({
    where: { orgId: manufacturer.id },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  for (const [index, line] of lines.entries()) {
    const currentName = String(line.name || '').trim();
    const isLegacyLine = /^sample line(?:\s+\d+)?$/i.test(currentName);
    const isBaselineLine = /^샘플 라인(?:\s+\d+)?$/.test(currentName);
    if (!isLegacyLine && !isBaselineLine) continue;
    const nextName = resolveBaselineLineName(currentName, index + 1);
    if (currentName === nextName) continue;
    await prisma.line.update({
      where: { id: line.id },
      data: { name: nextName },
    });
    normalizedLines += 1;
  }

  const baselineEmails = Object.keys(BASELINE_EMPLOYEE_NAME_BY_EMAIL);
  const employees = await prisma.employee.findMany({
    where: {
      orgId: manufacturer.id,
      membership: { email: { in: baselineEmails } },
    },
    select: {
      id: true,
      name: true,
      membership: { select: { email: true } },
    },
  });

  for (const employee of employees) {
    const emailKey = normalizeEmail(employee.membership?.email);
    const baselineName = BASELINE_EMPLOYEE_NAME_BY_EMAIL[emailKey];
    if (!baselineName) continue;
    if (String(employee.name || '').trim() === baselineName) continue;
    await prisma.employee.update({
      where: { id: employee.id },
      data: { name: baselineName },
    });
    normalizedEmployees += 1;
  }

  results.localizedNames = {
    factory: normalizedFactories,
    line: normalizedLines,
    employee: normalizedEmployees,
  };
  console.log(
    `[7/8] 유지 데이터 명칭 한글화: Factory ${normalizedFactories}건, Line ${normalizedLines}건, Employee ${normalizedEmployees}건`
  );

  // 8. 샘플 스타일 등록
  const createdStyles = [];
  for (const styleDef of BASELINE_STYLES) {
    const created = await prisma.style.create({
      data: {
        orgId: manufacturer.id,
        styleId: styleDef.styleId,
        styleCode: styleDef.styleCode,
        name: styleDef.name,
        customer: brand.name,
        registrationDate: styleDef.registrationDate,
        season: styleDef.season,
        collection: styleDef.collection,
        processes: styleDef.processes,
      },
    });
    createdStyles.push(`${created.name} (${created.styleCode})`);
  }
  results.styles = createdStyles;
  console.log(`[8/8] 샘플 스타일 등록: ${createdStyles.join(', ')}`);

  // 현재 유지된 데이터 확인
  const remaining = await prisma.$transaction([
    prisma.employee.count({ where: { orgId: manufacturer.id } }),
    prisma.line.count({ where: { orgId: manufacturer.id } }),
    prisma.lineAssignment.count(),
    prisma.factory.count({ where: { orgId: manufacturer.id } }),
  ]);

  console.log(`\n=== 초기화 완료 ===`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`\n유지된 데이터:`);
  console.log(`  Employee: ${remaining[0]}명`);
  console.log(`  Factory: ${remaining[3]}개`);
  console.log(`  Line: ${remaining[1]}개`);
  console.log(`  LineAssignment: ${remaining[2]}건`);
}

main()
  .catch((e) => {
    console.error('\n초기화 실패:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
