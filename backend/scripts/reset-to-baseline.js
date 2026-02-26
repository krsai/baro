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
 * 생성 대상:
 *   Style: 샘플 스타일 A (공정 6개, 5,000초), 샘플 스타일 B (공정 7개, 7,000초)
 *   WorkOrder: ORD-2025-SA (1,500개), ORD-2025-SB (1,500개), ORD-2025-MIX (1,200개)
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

// 사이즈별 수량 분포
const BASELINE_SIZE_DIST     = { XS: 25, S: 50, M: 100, L: 125, XL: 50, '2XL': 25 };
const BASELINE_SIZE_DIST_250 = { XS: 15, S: 35, M:  70, L:  85, XL: 30, '2XL': 15 };
const BASELINE_SIZE_DIST_350 = { XS: 25, S: 45, M:  90, L: 110, XL: 55, '2XL': 25 };

const BASELINE_ORDERS = [
  {
    orderId: 'order-baseline-sa',
    orderNumber: 'ORD-2025-SA',
    dueDate: '2025-06-30',
    status: '주문접수',
    items: [
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'BLK', colorName: 'Black', gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'WHT', colorName: 'White', gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'BLK', colorName: 'Black', gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'WHT', colorName: 'White', gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST } },
    ],
  },
  {
    orderId: 'order-baseline-sb',
    orderNumber: 'ORD-2025-SB',
    dueDate: '2025-07-31',
    status: '주문접수',
    items: [
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'BLK', colorName: 'Black', gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'RED', colorName: 'Red',   gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'WHT', colorName: 'White', gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST } },
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'BLU', colorName: 'Blue',  gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST } },
    ],
  },
  {
    orderId: 'order-baseline-mix',
    orderNumber: 'ORD-2025-MIX',
    dueDate: '2025-08-31',
    status: '주문접수',
    items: [
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'RED', colorName: 'Red',   gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST_250 } },
      { styleId: 'S-SAMPLE-A', styleCode: 'SA-001', styleName: '샘플 스타일 A', colorCode: 'BLU', colorName: 'Blue',  gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST_250 } },
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'WHT', colorName: 'White', gender: 'M', sizeQuantities: { ...BASELINE_SIZE_DIST_350 } },
      { styleId: 'S-SAMPLE-B', styleCode: 'SB-001', styleName: '샘플 스타일 B', colorCode: 'BLK', colorName: 'Black', gender: 'W', sizeQuantities: { ...BASELINE_SIZE_DIST_350 } },
    ],
  },
];

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
  console.log(`[1/10] WorkLog: ${deletedWorkLogs.count}건 삭제 (WorkRecord cascade 포함)`);

  // 2. Style 삭제 (TSMF + TSBR 전체)
  const deletedStyles = await prisma.style.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.style = deletedStyles.count;
  console.log(`[2/10] Style: ${deletedStyles.count}건 삭제`);

  // 3. WorkOrder 삭제
  const deletedOrders = await prisma.workOrder.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.workOrder = deletedOrders.count;
  console.log(`[3/10] WorkOrder: ${deletedOrders.count}건 삭제`);

  // 4. AssignmentPlan 삭제
  const deletedPlans = await prisma.assignmentPlan.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentPlan = deletedPlans.count;
  console.log(`[4/10] AssignmentPlan: ${deletedPlans.count}건 삭제`);

  // 5. AssignmentBoardState 삭제
  const deletedBoardState = await prisma.assignmentBoardState.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentBoardState = deletedBoardState.count;
  console.log(`[5/10] AssignmentBoardState: ${deletedBoardState.count}건 삭제`);

  // 6. AttrProcess: 전체 삭제 후 P01~P10 복원
  await prisma.attrProcess.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrProcess.createMany({
    data: BASELINE_PROCESSES.map((p) => ({ orgId: manufacturer.id, ...p })),
    skipDuplicates: true,
  });
  results.attrProcess = 'P01~P10 복원';
  console.log('[6/10] AttrProcess: P01~P10 복원 완료');

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
  console.log(`[7/10] 이름 정규화: Employee ${normalizedEmployees}건`);

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
  console.log(`[8/10] 샘플 스타일 등록: ${createdStyles.join(', ')}`);

  // 9. 샘플 주문 등록
  const createdOrders = [];
  for (const orderDef of BASELINE_ORDERS) {
    const itemsWithTotals = orderDef.items.map((item) => {
      const totalQuantity = Object.values(item.sizeQuantities).reduce((s, v) => s + v, 0);
      return { ...item, totalQuantity };
    });
    const totalQuantity = itemsWithTotals.reduce((s, item) => s + item.totalQuantity, 0);
    const created = await prisma.workOrder.create({
      data: {
        orgId: manufacturer.id,
        orderId: orderDef.orderId,
        orderNumber: orderDef.orderNumber,
        buyerOrgId: brand.id,
        buyerOrgName: brand.name,
        sellerOrgId: manufacturer.id,
        sellerOrgName: manufacturer.name,
        customerId: brand.id,
        customerName: brand.name,
        dueDate: orderDef.dueDate,
        status: orderDef.status,
        items: itemsWithTotals,
        totalQuantity,
      },
    });
    createdOrders.push(`${created.orderNumber} (${totalQuantity}개)`);
  }
  results.orders = createdOrders;
  console.log(`[9/10] 샘플 주문 등록: ${createdOrders.join(', ')}`);

  // 10. 라인 배정 초기화: 전원 해제 → 라인 1 (01~20), 라인 2 (01~20) 재배정 + 라인장 설정
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
  console.log(`[10/10] 라인 배정 초기화: ${closedAssignments.count}건 해제, ${assignedCount}건 신규 배정, 라인장 ${managersSet}명 설정`);

  // 최종 현황
  const remaining = await prisma.$transaction([
    prisma.employee.count({ where: { orgId: manufacturer.id } }),
    prisma.line.count({ where: { orgId: manufacturer.id } }),
    prisma.lineAssignment.count({ where: { endAt: null } }),
    prisma.factory.count({ where: { orgId: manufacturer.id } }),
  ]);

  console.log('\n=== 초기화 완료 ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n유지된 데이터:');
  console.log(`  Employee: ${remaining[0]}명`);
  console.log(`  Factory: ${remaining[3]}개`);
  console.log(`  Line: ${remaining[1]}개`);
  console.log(`  LineAssignment (활성): ${remaining[2]}건`);
}

main()
  .catch((e) => {
    console.error('\n초기화 실패:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
