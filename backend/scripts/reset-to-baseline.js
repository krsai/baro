#!/usr/bin/env node
'use strict';

/**
 * 테스트 초기화 스크립트 — baseline v2.0
 *
 * 삭제 대상:
 *   WorkLog (→ WorkRecord 자동 cascade)
 *   Style, WorkOrder, AssignmentPlan, AssignmentBoardState
 *   AttrProcess (P01~P10으로 복원)
 *
 * 유지 대상:
 *   Organization, OrgRelationship, OrgMembership
 *   Employee, Factory, Line
 *
 * 재설정 대상:
 *   LineAssignment: 전체 해제 후 라인 1(작업자 01~20), 라인 2(작업자 01~20) 재배정
 *   Line.managerEmployeeId: 라인 1 → line1-worker01, 라인 2 → line2-worker01
 *
 * 등록 대상:
 *   Style: 3개 (레귤러핏 라운드넥 티셔츠 / 슬림핏 카라 폴로 셔츠 / 오버핏 데님 재킷)
 *
 *
 * 작업자 구성:
 *   라인 1 (20명): line1-worker01~20@baro.local → 라인1 작업자01~20
 *   라인 2 (20명): line2-worker01~20@baro.local → 라인2 작업자01~20
 *   라인장: 라인 1 → line1-worker01, 라인 2 → line2-worker01
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MANUFACTURER_CODE = 'TSMF';
const BRAND_CODE = 'TSBR';
const BASELINE_FACTORY_NAME = '샘플 공장';

// 비작업자 이름 (admin, operator, accountant)
const BASELINE_EMPLOYEE_NAME_BY_EMAIL = {
  'manufacturer-admin@test.local':      '관리자',
  'manufacturer-operator@test.local':   '운영자',
  'manufacturer-accountant@test.local': '회계담당',
};

// 작업자 이름 (라인 1: 20명, 라인 2: 20명)
const BASELINE_WORKER_NAME_BY_EMAIL = {};
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line1-worker${n}@baro.local`] = `라인1 작업자${n}`;
}
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line2-worker${n}@baro.local`] = `라인2 작업자${n}`;
}

// 라인 배정 기준
const BASELINE_LINE_WORKER_MAP = [
  {
    lineName: '샘플 라인 1',
    managerEmail: 'line1-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line1-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
  {
    lineName: '샘플 라인 2',
    managerEmail: 'line2-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line2-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
];

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

// 스타일 정의 (초기화 후 자동 등록)
const BASELINE_STYLES = [
  {
    styleId: 'S-2025SS-T001',
    styleCode: '25SS-T001',
    name: '레귤러핏 라운드넥 티셔츠',
    registrationDate: '2025-03-10',
    designer: '김수진',
    season: '2025SS',
    collection: '베이직 라인',
    // 8공정, PT 합계 3,500 (q=1,000 기준)
    processes: [
      { code: 'P01', name: '원단 재단',         pt: 500, timeRefQuantity: 1000 },
      { code: 'P02', name: '앞판 봉제',          pt: 460, timeRefQuantity: 1000 },
      { code: 'P03', name: '뒷판 봉제',          pt: 440, timeRefQuantity: 1000 },
      { code: 'P04', name: '소매 봉제',          pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: '넥밴드 부착',        pt: 420, timeRefQuantity: 1000 },
      { code: 'P06', name: '옆솔기 봉제',        pt: 400, timeRefQuantity: 1000 },
      { code: 'P07', name: '밑단 마감',          pt: 400, timeRefQuantity: 1000 },
      { code: 'P08', name: '검사 및 포장',       pt: 400, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025SS-P002',
    styleCode: '25SS-P002',
    name: '슬림핏 카라 폴로 셔츠',
    registrationDate: '2025-03-18',
    designer: '이준혁',
    season: '2025SS',
    collection: '스포츠 캐주얼',
    // 9공정, PT 합계 4,400 (q=1,000 기준)
    processes: [
      { code: 'P01', name: '원단 재단',          pt: 550, timeRefQuantity: 1000 },
      { code: 'P02', name: '앞판 봉제',          pt: 500, timeRefQuantity: 1000 },
      { code: 'P03', name: '뒷판 봉제',          pt: 500, timeRefQuantity: 1000 },
      { code: 'P04', name: '소매 봉제',          pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: '카라 제작',          pt: 500, timeRefQuantity: 1000 },
      { code: 'P06', name: '카라 부착',          pt: 490, timeRefQuantity: 1000 },
      { code: 'P07', name: '단추 가공',          pt: 480, timeRefQuantity: 1000 },
      { code: 'P08', name: '밑단 마감',          pt: 450, timeRefQuantity: 1000 },
      { code: 'P09', name: '검사 및 포장',       pt: 450, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025FW-J003',
    styleCode: '25FW-J003',
    name: '오버핏 데님 재킷',
    registrationDate: '2025-04-02',
    designer: '박지연',
    season: '2025FW',
    collection: '어반 프리미엄',
    // 10공정, PT 합계 6,000 (q=1,000 기준)
    processes: [
      { code: 'P01', name: '원단 재단',          pt: 700, timeRefQuantity: 1000 },
      { code: 'P02', name: '심지 부착',          pt: 650, timeRefQuantity: 1000 },
      { code: 'P03', name: '앞판 봉제',          pt: 650, timeRefQuantity: 1000 },
      { code: 'P04', name: '뒷판 봉제',          pt: 600, timeRefQuantity: 1000 },
      { code: 'P05', name: '소매 봉제',          pt: 600, timeRefQuantity: 1000 },
      { code: 'P06', name: '칼라 부착',          pt: 600, timeRefQuantity: 1000 },
      { code: 'P07', name: '지퍼/단추 가공',     pt: 600, timeRefQuantity: 1000 },
      { code: 'P08', name: '안감 부착',          pt: 550, timeRefQuantity: 1000 },
      { code: 'P09', name: '다림질 및 형태 정리', pt: 550, timeRefQuantity: 1000 },
      { code: 'P10', name: '검사 및 포장',       pt: 500, timeRefQuantity: 1000 },
    ],
  },
];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

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

  console.log('\n대상 조직:');
  console.log(`  TSMF (제조사) orgId: ${manufacturer.id}`);
  console.log(`  TSBR (브랜드) orgId: ${brand.id}`);
  console.log('\n초기화 시작...\n');

  const results = {};

  // 1. WorkLog 삭제 (WorkRecord는 onDelete: Cascade로 자동 삭제)
  const deletedWorkLogs = await prisma.workLog.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.workLog = deletedWorkLogs.count;
  console.log(`[1/9] WorkLog: ${deletedWorkLogs.count}건 삭제 (WorkRecord cascade 포함)`);

  // 2. Style 삭제 (TSMF + TSBR 전체)
  const deletedStyles = await prisma.style.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.style = deletedStyles.count;
  console.log(`[2/9] Style: ${deletedStyles.count}건 삭제`);

  // 3. WorkOrder 삭제
  const deletedOrders = await prisma.workOrder.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.workOrder = deletedOrders.count;
  console.log(`[3/9] WorkOrder: ${deletedOrders.count}건 삭제`);

  // 4. AssignmentPlan 삭제
  const deletedPlans = await prisma.assignmentPlan.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentPlan = deletedPlans.count;
  console.log(`[4/9] AssignmentPlan: ${deletedPlans.count}건 삭제`);

  // 5. AssignmentBoardState 삭제
  const deletedBoardState = await prisma.assignmentBoardState.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentBoardState = deletedBoardState.count;
  console.log(`[5/9] AssignmentBoardState: ${deletedBoardState.count}건 삭제`);

  // 6. AttrProcess: 전체 삭제 후 P01~P10 복원
  await prisma.attrProcess.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrProcess.createMany({
    data: BASELINE_PROCESSES.map((p) => ({ orgId: manufacturer.id, ...p })),
    skipDuplicates: true,
  });
  results.attrProcess = 'P01~P10 복원';
  console.log('[6/9] AttrProcess: P01~P10 복원 완료');

  // 7. 유지 데이터 이름 정규화 (factory, 비작업자 employee)
  let normalizedEmployees = 0;

  const factory = await prisma.factory.findFirst({
    where: { orgId: manufacturer.id },
    select: { id: true, name: true },
  });
  if (factory && factory.name !== BASELINE_FACTORY_NAME) {
    await prisma.factory.update({
      where: { id: factory.id },
      data: { name: BASELINE_FACTORY_NAME },
    });
  }

  // 비작업자 이름 정규화
  const staffEmails = Object.keys(BASELINE_EMPLOYEE_NAME_BY_EMAIL);
  const staffEmployees = await prisma.employee.findMany({
    where: { orgId: manufacturer.id, membership: { email: { in: staffEmails } } },
    select: { id: true, name: true, membership: { select: { email: true } } },
  });
  for (const emp of staffEmployees) {
    const emailKey = normalizeEmail(emp.membership?.email);
    const baselineName = BASELINE_EMPLOYEE_NAME_BY_EMAIL[emailKey];
    if (!baselineName || String(emp.name || '').trim() === baselineName) continue;
    await prisma.employee.update({ where: { id: emp.id }, data: { name: baselineName } });
    normalizedEmployees += 1;
  }

  // 작업자 이름 정규화
  const workerEmailList = Object.keys(BASELINE_WORKER_NAME_BY_EMAIL);
  const workerEmployees = await prisma.employee.findMany({
    where: { orgId: manufacturer.id, membership: { email: { in: workerEmailList } } },
    select: { id: true, name: true, membership: { select: { email: true } } },
  });
  for (const emp of workerEmployees) {
    const emailKey = normalizeEmail(emp.membership?.email);
    const baselineName = BASELINE_WORKER_NAME_BY_EMAIL[emailKey];
    if (!baselineName || String(emp.name || '').trim() === baselineName) continue;
    await prisma.employee.update({ where: { id: emp.id }, data: { name: baselineName } });
    normalizedEmployees += 1;
  }

  results.normalizedEmployees = normalizedEmployees;
  console.log(`[7/9] 이름 정규화: Employee ${normalizedEmployees}건`);

  // 8. 라인 배정 초기화: 전원 해제 → 라인 1 (01~20), 라인 2 (01~20) 재배정 + 라인장 설정
  const allWorkerEmails = Object.keys(BASELINE_WORKER_NAME_BY_EMAIL);
  const workerMemberships = await prisma.orgMembership.findMany({
    where: { orgId: manufacturer.id, email: { in: allWorkerEmails } },
    select: { id: true, email: true, employee: { select: { id: true } } },
  });
  const emailToEmployeeId = {};
  for (const m of workerMemberships) {
    if (m.employee?.id) emailToEmployeeId[normalizeEmail(m.email)] = m.employee.id;
  }

  const workerEmployeeIds = Object.values(emailToEmployeeId);
  const now = new Date();

  // 기존 활성 배정 종료
  const closedAssignments = await prisma.lineAssignment.updateMany({
    where: { employeeId: { in: workerEmployeeIds }, endAt: null },
    data: { endAt: now },
  });
  // lineName 초기화
  await prisma.employee.updateMany({
    where: { id: { in: workerEmployeeIds } },
    data: { lineName: null },
  });

  // 라인 조회
  const lineNames = BASELINE_LINE_WORKER_MAP.map((l) => l.lineName);
  const lineRecords = await prisma.line.findMany({
    where: { orgId: manufacturer.id, name: { in: lineNames } },
    select: { id: true, name: true },
  });
  const lineNameToId = Object.fromEntries(lineRecords.map((l) => [l.name, l.id]));

  // 신규 배정 생성 + lineName 업데이트
  let assignedCount = 0;
  for (const { lineName, emails } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) {
      console.warn(`  경고: 라인 '${lineName}'을 찾을 수 없어 배정을 건너뜁니다.`);
      continue;
    }
    for (const email of emails) {
      const employeeId = emailToEmployeeId[normalizeEmail(email)];
      if (!employeeId) {
        console.warn(`  경고: '${email}' 직원을 찾을 수 없어 건너뜁니다.`);
        continue;
      }
      await prisma.lineAssignment.create({
        data: { lineId, employeeId, startAt: now },
      });
      await prisma.employee.update({
        where: { id: employeeId },
        data: { lineName },
      });
      assignedCount += 1;
    }
  }

  // 라인장 재설정
  let managersSet = 0;
  for (const { lineName, managerEmail } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) continue;
    const managerEmployeeId = emailToEmployeeId[normalizeEmail(managerEmail)];
    if (!managerEmployeeId) {
      console.warn(`  경고: 라인장 계정 '${managerEmail}'을 찾을 수 없습니다.`);
      continue;
    }
    await prisma.line.update({
      where: { id: lineId },
      data: { managerEmployeeId },
    });
    managersSet += 1;
  }

  results.lineAssignment = { closed: closedAssignments.count, assigned: assignedCount, managersSet };
  console.log(`[8/9] 라인 배정 초기화: ${closedAssignments.count}건 해제, ${assignedCount}건 신규 배정, 라인장 ${managersSet}명 설정`);

  // 9. 스타일 등록 (BASELINE_STYLES)
  let createdStyles = 0;
  let skippedStyles = 0;
  for (const style of BASELINE_STYLES) {
    const exists = await prisma.style.findFirst({
      where: { orgId: manufacturer.id, styleId: style.styleId },
    });
    if (exists) {
      skippedStyles += 1;
      continue;
    }
    await prisma.style.create({
      data: {
        orgId: manufacturer.id,
        styleId: style.styleId,
        styleCode: style.styleCode,
        name: style.name,
        customer: brand.name,
        registrationDate: style.registrationDate,
        designer: style.designer,
        season: style.season,
        collection: style.collection,
        processes: style.processes,
      },
    });
    createdStyles += 1;
  }
  results.styles = { created: createdStyles, skipped: skippedStyles };
  console.log(`[9/9] 스타일 등록: ${createdStyles}건 생성, ${skippedStyles}건 이미 존재`);

  // 최종 현황
  const remaining = await prisma.$transaction([
    prisma.employee.count({ where: { orgId: manufacturer.id } }),
    prisma.line.count({ where: { orgId: manufacturer.id } }),
    prisma.lineAssignment.count({ where: { endAt: null } }),
    prisma.factory.count({ where: { orgId: manufacturer.id } }),
    prisma.style.count({ where: { orgId: manufacturer.id } }),
  ]);

  console.log('\n=== 초기화 완료 ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n현재 데이터:');
  console.log(`  Employee: ${remaining[0]}명`);
  console.log(`  Factory: ${remaining[3]}개`);
  console.log(`  Line: ${remaining[1]}개`);
  console.log(`  LineAssignment (활성): ${remaining[2]}건`);
  console.log(`  Style: ${remaining[4]}개`);
}

main()
  .catch((e) => {
    console.error('\n초기화 실패:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
