#!/usr/bin/env node
'use strict';

/**
 * 테스트 초기화 스크립트 — test-initial-state.md baseline v1.7 기준
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
 *   LineAssignment: 전체 해제 후 라인 1(작업자 01~10), 라인 2(작업자 11~20) 재배정
 *
 * 생성 대상:
 *   Style: 샘플 스타일 A (공정 6개, 5,000초), 샘플 스타일 B (공정 7개, 7,000초)
 *   WorkOrder: ORD-2025-SA (1,500개), ORD-2025-SB (1,500개), ORD-2025-MIX (1,200개)
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MANUFACTURER_CODE = 'TSMF';
const BRAND_CODE = 'TSBR';
const BASELINE_FACTORY_NAME = '샘플 공장';
const BASELINE_LINE_PREFIX = '샘플 라인';
// 비작업자 4명 이름 정규화 (admin, operator, accountant)
const BASELINE_EMPLOYEE_NAME_BY_EMAIL = {
  'manufacturer-admin@test.local':       '테스트 관리자',
  'manufacturer-operator@test.local':    '테스트 운영자',
  'manufacturer-accountant@test.local':  '테스트 회계담당',
};

// 작업자 20명 이름 정규화
const BASELINE_WORKER_NAME_BY_EMAIL = {
  'manufacturer-worker@test.local':       '테스트 작업자 01',
  'sample-line-worker-01@test.local':     '테스트 작업자 02',
  'sample-line-worker-02@test.local':     '테스트 작업자 03',
  'sample-line-worker-03@test.local':     '테스트 작업자 04',
  'sample-line-worker-04@test.local':     '테스트 작업자 05',
  'sample-line-worker-05@test.local':     '테스트 작업자 06',
  'sample-line-worker-06@test.local':     '테스트 작업자 07',
  'sample-line-worker-07@test.local':     '테스트 작업자 08',
  'sample-line-worker-08@test.local':     '테스트 작업자 09',
  'test-worker-10@test.local':            '테스트 작업자 10',
  'test-worker-11@test.local':            '테스트 작업자 11',
  'test-worker-12@test.local':            '테스트 작업자 12',
  'test-worker-13@test.local':            '테스트 작업자 13',
  'test-worker-14@test.local':            '테스트 작업자 14',
  'test-worker-15@test.local':            '테스트 작업자 15',
  'test-worker-16@test.local':            '테스트 작업자 16',
  'test-worker-17@test.local':            '테스트 작업자 17',
  'test-worker-18@test.local':            '테스트 작업자 18',
  'test-worker-19@test.local':            '테스트 작업자 19',
  'test-worker-20@test.local':            '테스트 작업자 20',
};

// 작업자 10~20: 초기화 실행 시 미존재 시 OrgMembership + Employee 생성
const BASELINE_NEW_WORKERS = [
  { email: 'test-worker-10@test.local', name: '테스트 작업자 10' },
  { email: 'test-worker-11@test.local', name: '테스트 작업자 11' },
  { email: 'test-worker-12@test.local', name: '테스트 작업자 12' },
  { email: 'test-worker-13@test.local', name: '테스트 작업자 13' },
  { email: 'test-worker-14@test.local', name: '테스트 작업자 14' },
  { email: 'test-worker-15@test.local', name: '테스트 작업자 15' },
  { email: 'test-worker-16@test.local', name: '테스트 작업자 16' },
  { email: 'test-worker-17@test.local', name: '테스트 작업자 17' },
  { email: 'test-worker-18@test.local', name: '테스트 작업자 18' },
  { email: 'test-worker-19@test.local', name: '테스트 작업자 19' },
  { email: 'test-worker-20@test.local', name: '테스트 작업자 20' },
];

// 라인 배정 기준: 샘플 라인 1 (01~10), 샘플 라인 2 (11~20)
const BASELINE_LINE_WORKER_MAP = [
  {
    lineName: '샘플 라인 1',
    emails: [
      'manufacturer-worker@test.local',   // 01
      'sample-line-worker-01@test.local', // 02
      'sample-line-worker-02@test.local', // 03
      'sample-line-worker-03@test.local', // 04
      'sample-line-worker-04@test.local', // 05
      'sample-line-worker-05@test.local', // 06
      'sample-line-worker-06@test.local', // 07
      'sample-line-worker-07@test.local', // 08
      'sample-line-worker-08@test.local', // 09
      'test-worker-10@test.local',        // 10
    ],
  },
  {
    lineName: '샘플 라인 2',
    emails: [
      'test-worker-11@test.local', // 11
      'test-worker-12@test.local', // 12
      'test-worker-13@test.local', // 13
      'test-worker-14@test.local', // 14
      'test-worker-15@test.local', // 15
      'test-worker-16@test.local', // 16
      'test-worker-17@test.local', // 17
      'test-worker-18@test.local', // 18
      'test-worker-19@test.local', // 19
      'test-worker-20@test.local', // 20
    ],
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
// 375개: XS:25 S:50 M:100 L:125 XL:50 2XL:25
// 250개: XS:15 S:35 M:70  L:85  XL:30 2XL:15
// 350개: XS:25 S:45 M:90  L:110 XL:55 2XL:25
const BASELINE_SIZE_DIST      = { XS: 25, S: 50, M: 100, L: 125, XL: 50, '2XL': 25 };
const BASELINE_SIZE_DIST_250  = { XS: 15, S: 35, M:  70, L:  85, XL: 30, '2XL': 15 };
const BASELINE_SIZE_DIST_350  = { XS: 25, S: 45, M:  90, L: 110, XL: 55, '2XL': 25 };

// 샘플 주문 정의
// ORD-2025-SA : 스타일 A, M×BLK, M×WHT, W×BLK, W×WHT → 각 375개 = 1,500개
// ORD-2025-SB : 스타일 B, M×BLK, M×RED, W×WHT, W×BLU → 각 375개 = 1,500개
// ORD-2025-MIX: 스타일 A(M×RED, W×BLU) 각 250개 + 스타일 B(M×WHT, W×BLK) 각 350개 = 1,200개
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
  results.attrProcess = `P01~P10 복원`;
  console.log(`[6/10] AttrProcess: P01~P10 복원 완료`);

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

  // 비작업자 이름 정규화 (admin, operator, accountant)
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

  // 작업자 20명 이름 정규화
  const workerEmailList = Object.keys(BASELINE_WORKER_NAME_BY_EMAIL);
  const workerEmployees = await prisma.employee.findMany({
    where: {
      orgId: manufacturer.id,
      membership: { email: { in: workerEmailList } },
    },
    select: {
      id: true,
      name: true,
      membership: { select: { email: true } },
    },
  });

  for (const employee of workerEmployees) {
    const emailKey = normalizeEmail(employee.membership?.email);
    const baselineName = BASELINE_WORKER_NAME_BY_EMAIL[emailKey];
    if (!baselineName) continue;
    if (String(employee.name || '').trim() === baselineName) continue;
    await prisma.employee.update({
      where: { id: employee.id },
      data: { name: baselineName },
    });
    normalizedEmployees += 1;
  }

  // 작업자 10~20 미존재 시 OrgMembership + Employee 생성 (idempotent)
  let createdWorkers = 0;
  const baselineFactory = factories[0]; // 샘플 공장 (최초 factory)
  if (baselineFactory) {
    for (const workerDef of BASELINE_NEW_WORKERS) {
      const membership = await prisma.orgMembership.upsert({
        where: { orgId_email: { orgId: manufacturer.id, email: workerDef.email } },
        update: {},
        create: {
          orgId: manufacturer.id,
          email: workerDef.email,
          role: 'WORKER',
          status: 'ACTIVE',
        },
      });
      const existing = await prisma.employee.findUnique({
        where: { orgMembershipId: membership.id },
      });
      if (!existing) {
        await prisma.employee.create({
          data: {
            orgId: manufacturer.id,
            orgMembershipId: membership.id,
            factoryId: baselineFactory.id,
            name: workerDef.name,
          },
        });
        createdWorkers += 1;
      } else if (String(existing.name || '').trim() !== workerDef.name) {
        await prisma.employee.update({
          where: { id: existing.id },
          data: { name: workerDef.name },
        });
      }
    }
  }

  results.localizedNames = {
    factory: normalizedFactories,
    line: normalizedLines,
    employee: normalizedEmployees,
    workerCreated: createdWorkers,
  };
  console.log(
    `[7/10] 유지 데이터 명칭 한글화: Factory ${normalizedFactories}건, Line ${normalizedLines}건, Employee ${normalizedEmployees}건, Worker 신규 생성 ${createdWorkers}명`
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

  // 10. 라인 배정 초기화: TSMF 작업자 전원 해제 → 라인 1(01~10), 라인 2(11~20) 재배정
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

  // 신규 배정 생성
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

  results.lineAssignment = { closed: closedAssignments.count, assigned: assignedCount };
  console.log(`[10/10] 라인 배정 초기화: ${closedAssignments.count}건 해제, ${assignedCount}건 신규 배정`);

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
