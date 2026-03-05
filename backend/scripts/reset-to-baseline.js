#!/usr/bin/env node
'use strict';

/**
 * ???獒???縕?猿녿뎨?????袁⑹뵫?繹?????baseline v2.0
 *
 * ????????
 *   Style, WorkOrder, AssignmentPlan, AssignmentBoardState
 *   AttrProcess (P01~P10???⑥???怨뚮옖甕??
 *
 * ??? ????
 *   Organization, OrgRelationship, OrgMembership
 *   Employee, Factory, Line
 *
 * ?????????
 *   LineAssignment: ??ш끽維?????⑤챷??????繹먮끏??1(???????01~20), ??繹먮끏??2(???????01~20) ?????
 *   Line.managerEmployeeId: ??繹먮끏??1 ??line1-worker01, ??繹먮끏??2 ??line2-worker01
 *
 * ?濚밸Ŧ援욃ㅇ?????
 *   Style: 3??(???戮곗궀??????繹먮끏裕??筌?留????Β?궰??λ읂?/ ??????怨멸텭??????繞???釉먯뒮??/ ????곷츉?????ㅻ쿋筌???雅?
 *   WorkOrder: 2??(ORD-2025SS-001 5,000??/ ORD-2025FW-001 2,500??
 *   癲ル슢??猿눫?? ???袁⑹뵫?繹???????덈틖 ??筌믨퀣????れ삀?????⑥??????깆뱾 ??節뚮쳮雅?(??筌?鍮?癲ル슪?ｇ몭?? ??ш끽維??????彛??癲ル슢??씙??
 *
 *
 * ???????????늄??
 *   ??繹먮끏??1 (20癲?: line1-worker01~20@baro.local ????繹먮끏?? ???????1~20
 *   ??繹먮끏??2 (20癲?: line2-worker01~20@baro.local ????繹먮끏?? ???????1~20
 *   ??繹먮끏??? ??繹먮끏??1 ??line1-worker01, ??繹먮끏??2 ??line2-worker01
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const BASELINE_ASSIGNMENT_AGREEMENTS = require('./reset-to-baseline.assignment-agreements.json');

const prisma = new PrismaClient();

const MANUFACTURER_CODE = 'TSMF';
const BRAND_CODE = 'TSBR';
const BASELINE_FACTORY_NAME = 'Sample Factory';

const BASELINE_EMPLOYEE_NAME_BY_EMAIL = {
  'manufacturer-admin@test.local': 'Manager',
  'manufacturer-operator@test.local': 'Operator',
  'manufacturer-accountant@test.local': 'Accountant',
};

const BASELINE_WORKER_NAME_BY_EMAIL = {};
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line1-worker${n}@baro.local`] = `Line1 Worker ${n}`;
}
for (let i = 1; i <= 20; i++) {
  const n = String(i).padStart(2, '0');
  BASELINE_WORKER_NAME_BY_EMAIL[`line2-worker${n}@baro.local`] = `Line2 Worker ${n}`;
}

const BASELINE_LINE_WORKER_MAP = [
  {
    lineName: 'Sample Line 1',
    managerEmail: 'line1-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line1-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
  {
    lineName: 'Sample Line 2',
    managerEmail: 'line2-worker01@baro.local',
    emails: Array.from({ length: 20 }, (_, i) => `line2-worker${String(i + 1).padStart(2, '0')}@baro.local`),
  },
];

const BASELINE_STAFF_MEMBERSHIPS = [
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-admin@test.local', role: 'ADMIN' },
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-operator@test.local', role: 'OPERATOR' },
  { orgCode: MANUFACTURER_CODE, email: 'manufacturer-accountant@test.local', role: 'ACCOUNTANT' },
  { orgCode: BRAND_CODE, email: 'brand-admin@test.local', role: 'ADMIN' },
  { orgCode: BRAND_CODE, email: 'brand-operator@test.local', role: 'OPERATOR' },
  { orgCode: BRAND_CODE, email: 'brand-accountant@test.local', role: 'ACCOUNTANT' },
];

const BASELINE_WORKER_MEMBERSHIPS = BASELINE_LINE_WORKER_MAP.flatMap((line) =>
  line.emails.map((email) => ({
    orgCode: MANUFACTURER_CODE,
    email,
    role: 'WORKER',
  }))
);

const BASELINE_TEST_MEMBERSHIPS = [
  ...BASELINE_STAFF_MEMBERSHIPS,
  ...BASELINE_WORKER_MEMBERSHIPS,
];

const BASELINE_COLORS = [
  { code: 'WHITE', name: 'White' },
  { code: 'BLACK', name: 'Black' },
  { code: 'NAVY', name: 'Navy' },
  { code: 'GRAY-MEL', name: 'Gray Melange' },
  { code: 'LT-BLUE', name: 'Light Blue' },
  { code: 'MID-BLUE', name: 'Mid Blue' },
  { code: 'INDIGO', name: 'Indigo' },
];

const BASELINE_PROCESSES = [
  { code: 'P01', name: 'Test Process 01' },
  { code: 'P02', name: 'Test Process 02' },
  { code: 'P03', name: 'Test Process 03' },
  { code: 'P04', name: 'Test Process 04' },
  { code: 'P05', name: 'Test Process 05' },
  { code: 'P06', name: 'Test Process 06' },
  { code: 'P07', name: 'Test Process 07' },
  { code: 'P08', name: 'Test Process 08' },
  { code: 'P09', name: 'Test Process 09' },
  { code: 'P10', name: 'Test Process 10' },
];

const BASELINE_STYLES = [
  {
    styleId: 'S-2025SS-T001',
    styleCode: '25SS-T001',
    name: 'Daily Round T-Shirt',
    registrationDate: '2025-03-10',
    designer: 'Designer Kim',
    season: '2025SS',
    collection: 'Basic Line',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 500, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Sew Front', pt: 460, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Back', pt: 440, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Sleeve', pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Neck Label Attach', pt: 420, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Hem', pt: 400, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Finish Neck', pt: 400, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Inspect Pack', pt: 400, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025SS-P002',
    styleCode: '25SS-P002',
    name: 'Slim Collar Hero Polo',
    registrationDate: '2025-03-18',
    designer: 'Designer Lee',
    season: '2025SS',
    collection: 'Sport Casual',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 550, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Sew Front', pt: 500, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Back', pt: 500, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Sleeve', pt: 480, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Collar Start', pt: 500, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Collar Attach', pt: 490, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Sleeve Process', pt: 480, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Finish Hem', pt: 450, timeRefQuantity: 1000 },
      { code: 'P09', name: 'Inspect Pack', pt: 450, timeRefQuantity: 1000 },
    ],
  },
  {
    styleId: 'S-2025FW-J003',
    styleCode: '25FW-J003',
    name: 'Urban Corduroy Pants',
    registrationDate: '2025-04-02',
    designer: 'Designer Park',
    season: '2025FW',
    collection: 'Urban Premium',
    processes: [
      { code: 'P01', name: 'Cut Front', pt: 700, timeRefQuantity: 1000 },
      { code: 'P02', name: 'Pocket Attach', pt: 650, timeRefQuantity: 1000 },
      { code: 'P03', name: 'Sew Front', pt: 650, timeRefQuantity: 1000 },
      { code: 'P04', name: 'Sew Back', pt: 600, timeRefQuantity: 1000 },
      { code: 'P05', name: 'Sew Sleeve', pt: 600, timeRefQuantity: 1000 },
      { code: 'P06', name: 'Collar Attach', pt: 600, timeRefQuantity: 1000 },
      { code: 'P07', name: 'Waistband Process', pt: 600, timeRefQuantity: 1000 },
      { code: 'P08', name: 'Lining Attach', pt: 550, timeRefQuantity: 1000 },
      { code: 'P09', name: 'Shape Finish', pt: 550, timeRefQuantity: 1000 },
      { code: 'P10', name: 'Inspect Pack', pt: 500, timeRefQuantity: 1000 },
    ],
  },
];

const BASELINE_ORDERS = [
  {
    orderId: 'ORD-2025SS-001',
    orderNumber: 'ORD-2025SS-001',
    status: 'ORDER_RECEIVED',
    items: [
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'WHITE', colorName: 'White', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'WHITE', colorName: 'White', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'BLACK', colorName: 'Black', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'BLACK', colorName: 'Black', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'NAVY', colorName: 'Navy', gender: 'M', sizeQuantities: { S: 90, M: 210, L: 210, XL: 90 } },
      { styleId: 'S-2025SS-T001', styleCode: '25SS-T001', colorCode: 'NAVY', colorName: 'Navy', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 130, XL: 70 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'WHITE', colorName: 'White', gender: 'M', sizeQuantities: { S: 100, M: 225, L: 225, XL: 100 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'WHITE', colorName: 'White', gender: 'W', sizeQuantities: { S: 55, M: 120, L: 120, XL: 55 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'GRAY-MEL', colorName: 'Gray Melange', gender: 'M', sizeQuantities: { S: 100, M: 225, L: 225, XL: 100 } },
      { styleId: 'S-2025SS-P002', styleCode: '25SS-P002', colorCode: 'GRAY-MEL', colorName: 'Gray Melange', gender: 'W', sizeQuantities: { S: 55, M: 120, L: 120, XL: 55 } },
    ],
  },
  {
    orderId: 'ORD-2025FW-001',
    orderNumber: 'ORD-2025FW-001',
    status: 'ORDER_RECEIVED',
    items: [
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'LT-BLUE', colorName: 'Light Blue', gender: 'M', sizeQuantities: { S: 50, M: 130, L: 160, XL: 100, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'LT-BLUE', colorName: 'Light Blue', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 120, XL: 60 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'MID-BLUE', colorName: 'Mid Blue', gender: 'M', sizeQuantities: { S: 50, M: 130, L: 160, XL: 100, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'MID-BLUE', colorName: 'Mid Blue', gender: 'W', sizeQuantities: { S: 70, M: 130, L: 120, XL: 60 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'INDIGO', colorName: 'Indigo', gender: 'M', sizeQuantities: { S: 45, M: 120, L: 155, XL: 90, '2XL': 30 } },
      { styleId: 'S-2025FW-J003', styleCode: '25FW-J003', colorCode: 'INDIGO', colorName: 'Indigo', gender: 'W', sizeQuantities: { S: 65, M: 125, L: 115, XL: 55 } },
    ],
  },
];

const sumItemQuantity = (item) =>
  Object.values(item.sizeQuantities || {}).reduce((s, v) => s + Number(v || 0), 0);

const cloneJson = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value));
};

const BASELINE_LINE_NAME_BY_KEY = {
  LINE_1: BASELINE_LINE_WORKER_MAP[0]?.lineName,
  LINE_2: BASELINE_LINE_WORKER_MAP[1]?.lineName,
};

const resolveBaselineLineId = (lineNameToId, lineKey) => {
  const lineName = BASELINE_LINE_NAME_BY_KEY[lineKey];
  if (!lineName) {
    throw new Error(`Unknown baseline line key: ${lineKey}`);
  }
  const lineId = lineNameToId[lineName];
  if (!lineId) {
    throw new Error(`Line not found for baseline seed: ${lineName}`);
  }
  return lineId;
};

function buildBaselineAssignmentBoardCards(orders, styleMap) {
  const cards = [];
  const occurrenceByVariant = new Map();

  for (const order of orders) {
    const orderId = String(order.orderId || order.orderNumber || '');
    const items = Array.isArray(order.items) ? order.items : [];

    for (const item of items) {
      const style = styleMap.get(item.styleId);
      if (!style) continue;

      const variantKey = `${orderId}::${item.styleId}::${item.colorCode || ''}`;
      const occurrence = occurrenceByVariant.get(variantKey) || 0;
      occurrenceByVariant.set(variantKey, occurrence + 1);

      // The reset baseline lists each color bucket in M -> W order.
      const gender = occurrence === 0 ? 'M' : occurrence === 1 ? 'W' : 'U';
      const quantity = Number(item.totalQuantity || sumItemQuantity(item) || 0);
      const processes = Array.isArray(style.processes) ? style.processes : [];
      const processCount = processes.length;
      const totalPtPerPiece = processes.reduce((sum, process) => sum + Number(process?.pt || 0), 0);
      const totalAtPerPiece = processes.reduce((sum, process) => sum + Number(process?.at || 0), 0);
      const totalStPerPiece = processes.reduce((sum, process) => {
        const at = Number(process?.at);
        if (Number.isFinite(at) && at > 0) return sum + at;
        return sum + Number(process?.pt || 0);
      }, 0);
      const totalPt = totalPtPerPiece * quantity;
      const totalAt = totalAtPerPiece * quantity;
      const totalSt = totalStPerPiece * quantity;
      const status = totalSt > 0 ? 'ST' : totalAt > 0 ? 'AT' : 'PT';
      const cardId = `${orderId}::${item.styleId}::${item.colorCode}::${gender}`;

      cards.push({
        id: cardId,
        originOrderId: cardId,
        orderNo: order.orderNumber,
        dueDate: order.dueDate,
        customer: order.customerName || order.customer || '',
        styleId: item.styleId,
        styleName: style.name,
        styleCode: style.styleCode,
        colorId: item.colorCode,
        colorName: item.colorName || '',
        gender,
        quantity,
        processCount,
        status,
        totalSeconds: status === 'ST' ? totalSt : status === 'AT' ? totalAt : totalPt,
        totalPt,
        totalAt,
        totalSt,
        previewUrl: '',
      });
    }
  }

  return cards;
}

function applyBaselineAgreementSnapshots(cards, lineNameToId) {
  const snapshotByCardId = new Map(
    (Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.cards) ? BASELINE_ASSIGNMENT_AGREEMENTS.cards : [])
      .map((entry) => [String(entry.cardId), entry])
  );

  return cards.map((card) => {
    const seed = snapshotByCardId.get(String(card.id));
    if (!seed?.ctAgreedSnapshot) {
      return card;
    }

    return {
      ...card,
      pendingCtProposal: null,
      ctAgreedSnapshot: {
        ...cloneJson(seed.ctAgreedSnapshot),
        lineId: String(resolveBaselineLineId(lineNameToId, seed.lineKey)),
      },
    };
  });
}

function buildBaselineAgreedAssignments(lineNameToId) {
  return (Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.assignments)
    ? BASELINE_ASSIGNMENT_AGREEMENTS.assignments
    : []
  ).map((seed) => {
    const cloned = cloneJson(seed);
    const lineKey = cloned.lineKey;
    delete cloned.lineKey;
    return {
      ...cloned,
      lineId: String(resolveBaselineLineId(lineNameToId, lineKey)),
    };
  });
}

function buildAssignmentPlanSeedRows(orgId, lineNameToId) {
  return buildBaselineAgreedAssignments(lineNameToId).map((seed) => {
    const updatedAt = new Date(seed.updatedAt || seed.ctAgreedAt || new Date().toISOString());
    const createdAt = seed.createdAt ? new Date(seed.createdAt) : updatedAt;
    return {
      orgId,
      lineId: Number(seed.lineId),
      externalId: seed.id,
      cardId: seed.cardId || null,
      orderNo: seed.orderNo || null,
      customer: seed.customer || null,
      label: seed.label || null,
      colorName: seed.colorName || null,
      previewUrl: seed.previewUrl || null,
      imageUrl: seed.imageUrl || null,
      thumbnailUrl: seed.thumbnailUrl || null,
      quantity: seed.quantity ?? null,
      originOrderId: seed.originOrderId || null,
      basis: seed.basis || null,
      proposalBasis: seed.proposalBasis || null,
      proposalSeconds: seed.proposalSeconds ?? null,
      contractedSeconds: seed.contractedSeconds ?? null,
      ctStatus: seed.ctStatus || 'PENDING',
      ctSource: seed.ctSource || null,
      ctAgreedBy: seed.ctAgreedBy || null,
      ctAgreedAt: seed.ctAgreedAt ? new Date(seed.ctAgreedAt) : null,
      ctNote: seed.ctNote || null,
      color: seed.color || null,
      stripeColor: seed.stripeColor || null,
      totalSeconds: seed.totalSeconds ?? null,
      startIndex: seed.startIndex,
      endIndex: seed.endIndex,
      startDayOffsetPercent: seed.startDayOffsetPercent ?? null,
      startDayPercent: seed.startDayPercent ?? null,
      endDayPercent: seed.endDayPercent ?? null,
      createdAt,
      updatedAt,
    };
  });
}

// ???? 癲ル슢??猿눫??????깆뱾 ??節뚮쳮雅?????????????????????????????????????????????????????????????????????????????????????????????????????????
const PROD_SECONDS_PER_DAY = 40 * 8 * 3600; // 40癲???8??癰???= 1,152,000????

// date ??れ삀?????⑥??days ???ㅼ굡????????モ? ?袁⑸즵???
function addWorkingDays(date, days) {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) remaining--;
  }
  return result;
}

// ???????釉먯뒭甕?癲ル슢???癲????袁⑸즵???
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ??낆뒩?戮る즵 ??ш끽維쀩????獄쏅똾????????ш끽維?????????ㅼ굡???????節뚮쳮雅?
function computeOrderWorkingDays(order, styleMap) {
  let totalSeconds = 0;
  for (const item of order.items) {
    const style = styleMap.get(item.styleId);
    if (!style) continue;
    const ptPerPiece = style.processes.reduce((sum, p) => sum + p.pt, 0);
    totalSeconds += ptPerPiece * sumItemQuantity(item);
  }
  return Math.ceil(totalSeconds / PROD_SECONDS_PER_DAY);
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const upsertBaselineOrganization = async ({ code, type }) =>
  prisma.organization.upsert({
    where: { code },
    update: { type },
    create: {
      code,
      name: code,
      type,
    },
  });

async function ensureBaselineFactoryAndLines(manufacturerOrgId) {
  const existingFactory = await prisma.factory.findFirst({
    where: {
      orgId: manufacturerOrgId,
      name: BASELINE_FACTORY_NAME,
    },
    select: { id: true },
  });

  const factory = existingFactory
    ? await prisma.factory.update({
        where: { id: existingFactory.id },
        data: {
          targetMonthlyWage: 8000000,
          wagePerSecond: 10.68,
        },
      })
    : await prisma.factory.create({
        data: {
          orgId: manufacturerOrgId,
          name: BASELINE_FACTORY_NAME,
          targetMonthlyWage: 8000000,
          wagePerSecond: 10.68,
        },
      });

  for (const lineSeed of BASELINE_LINE_WORKER_MAP) {
    await prisma.line.upsert({
      where: {
        factoryId_name: {
          factoryId: factory.id,
          name: lineSeed.lineName,
        },
      },
      update: {
        orgId: manufacturerOrgId,
        isActive: true,
      },
      create: {
        orgId: manufacturerOrgId,
        factoryId: factory.id,
        name: lineSeed.lineName,
        isActive: true,
      },
    });
  }

  return { factory };
}

async function seedBaselineMembershipsAndEmployees({ manufacturer, brand, factory }) {
  const orgIdByCode = {
    [MANUFACTURER_CODE]: manufacturer.id,
    [BRAND_CODE]: brand.id,
  };
  const now = new Date();

  let upsertedMemberships = 0;
  let upsertedEmployees = 0;
  for (const membershipSeed of BASELINE_TEST_MEMBERSHIPS) {
    const orgId = orgIdByCode[membershipSeed.orgCode];
    if (!orgId) continue;
    const email = normalizeEmail(membershipSeed.email);

    const membership = await prisma.orgMembership.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
        role: membershipSeed.role,
        status: 'ACTIVE',
        approvedAt: now,
      },
      create: {
        orgId,
        email,
        role: membershipSeed.role,
        status: 'ACTIVE',
        approvedAt: now,
      },
    });
    upsertedMemberships += 1;

    if (membershipSeed.orgCode !== MANUFACTURER_CODE) {
      continue;
    }

    const baselineName =
      BASELINE_EMPLOYEE_NAME_BY_EMAIL[email] ||
      BASELINE_WORKER_NAME_BY_EMAIL[email] ||
      null;

    await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: {
        orgId: manufacturer.id,
        factoryId: factory.id,
        name: baselineName,
      },
      create: {
        orgId: manufacturer.id,
        orgMembershipId: membership.id,
        factoryId: factory.id,
        name: baselineName,
      },
    });
    upsertedEmployees += 1;
  }

  return { upsertedMemberships, upsertedEmployees };
}

async function ensureBaselineTestAccounts() {
  const manufacturer = await upsertBaselineOrganization({
    code: MANUFACTURER_CODE,
    type: 'MANUFACTURER',
  });
  const brand = await upsertBaselineOrganization({
    code: BRAND_CODE,
    type: 'BRAND',
  });

  await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId: manufacturer.id,
        brandOrgId: brand.id,
      },
    },
    update: {},
    create: {
      manufacturerOrgId: manufacturer.id,
      brandOrgId: brand.id,
      customerCode: BRAND_CODE,
    },
  });

  const { factory } = await ensureBaselineFactoryAndLines(manufacturer.id);
  const membershipSeedResult = await seedBaselineMembershipsAndEmployees({
    manufacturer,
    brand,
    factory,
  });

  await prisma.systemUser.upsert({
    where: { email: 'system-admin@test.local' },
    update: { systemRole: 'SYSTEM_ADMIN' },
    create: { email: 'system-admin@test.local', systemRole: 'SYSTEM_ADMIN' },
  });

  return {
    manufacturer,
    brand,
    membershipSeedResult,
  };
}

async function main() {
  const { manufacturer, brand, membershipSeedResult } =
    await ensureBaselineTestAccounts();

  console.log('\n?????釉뚰?節낇맪?');
  console.log(`  TSMF (??筌믠뵎??? orgId: ${manufacturer.id}`);
  console.log(`  TSBR (??怨쀫뮛??? orgId: ${brand.id}`);
  console.log('\n?縕?猿녿뎨????筌믨퀣援?..\n');

  const results = {
    membershipSeed: membershipSeedResult,
  };

  // 1. Style ????(TSMF + TSBR ??ш끽維??
  const deletedStyles = await prisma.style.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.style = deletedStyles.count;
  console.log(`[1/9] Style deleted: ${deletedStyles.count}`);

  // 2. WorkOrder ????
  const deletedOrders = await prisma.workOrder.deleteMany({
    where: { orgId: { in: [manufacturer.id, brand.id] } },
  });
  results.workOrder = deletedOrders.count;
  console.log(`[2/9] WorkOrder deleted: ${deletedOrders.count}`);

  // 3. AssignmentPlan ????
  const deletedPlans = await prisma.assignmentPlan.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentPlan = deletedPlans.count;
  console.log(`[3/9] AssignmentPlan deleted: ${deletedPlans.count}`);

  // 4. AssignmentBoardState ????
  const deletedBoardState = await prisma.assignmentBoardState.deleteMany({
    where: { orgId: manufacturer.id },
  });
  results.assignmentBoardState = deletedBoardState.count;
  console.log(`[4/9] AssignmentBoardState deleted: ${deletedBoardState.count}`);

  // 5. AttrProcess + AttrColor: ??ш끽維?????????怨뚮옖甕??
  await prisma.attrProcess.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrProcess.createMany({
    data: BASELINE_PROCESSES.map((p) => ({ orgId: manufacturer.id, ...p })),
    skipDuplicates: true,
  });
  await prisma.attrColor.deleteMany({ where: { orgId: manufacturer.id } });
  await prisma.attrColor.createMany({
    data: BASELINE_COLORS.map((c) => ({ orgId: manufacturer.id, ...c })),
    skipDuplicates: true,
  });
  results.attrProcess = 'P01~P10 restored';
  results.attrColor = `${BASELINE_COLORS.length} colors restored`;
  console.log(`[5/9] AttrProcess + AttrColor restored`);

  // 6. ??? ???Β??????????嶺????(factory, ???????怨멸껑 employee)
  let normalizedEmployees = 0;

  let factory = await prisma.factory.findFirst({
    where: { orgId: manufacturer.id },
    select: { id: true, name: true, wagePerSecond: true },
  });
  if (factory && factory.name !== BASELINE_FACTORY_NAME) {
    await prisma.factory.update({
      where: { id: factory.id },
      data: { name: BASELINE_FACTORY_NAME },
    });
    factory = {
      ...factory,
      name: BASELINE_FACTORY_NAME,
    };
  }

  // ???????怨멸껑 ??????嶺????
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

  // ?????????????嶺????
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
  console.log(`[6/9] Employee names normalized: ${normalizedEmployees}`);

  // 7. ??繹먮끏???袁⑸즲????縕?猿녿뎨?? ??ш끽維?????⑤챷??????繹먮끏??1 (01~20), ??繹먮끏??2 (01~20) ?????+ ??繹먮끏??????源놁젳
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
  const baselineLineAssignmentStartAt = now;

  // ??れ삀?????筌????袁⑸즲??????ろ꼤嶺?
  const closedAssignments = await prisma.lineAssignment.updateMany({
    where: { employeeId: { in: workerEmployeeIds }, endAt: null },
    data: { endAt: now },
  });
  // lineName ?縕?猿녿뎨??
  await prisma.employee.updateMany({
    where: { id: { in: workerEmployeeIds } },
    data: { lineName: null },
  });

  // ??繹먮끏???釉뚰???
  const lineNames = BASELINE_LINE_WORKER_MAP.map((l) => l.lineName);
  const lineRecords = await prisma.line.findMany({
    where: { orgId: manufacturer.id, name: { in: lineNames } },
    select: { id: true, name: true },
  });
  const lineNameToId = Object.fromEntries(lineRecords.map((l) => [l.name, l.id]));

  // ???ル㎦???袁⑸즲?????獄쏅똻??+ lineName ????녿ぅ??熬곣뫀肄?
  let assignedCount = 0;
  for (const { lineName, emails } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) {
      console.warn(`  ?濡ろ뜑??? ??繹먮끏??'${lineName}'??癲ル슓??젆???????⑤９苑??袁⑸즲????癲꾧퀗??????ㅿ폍???`);
      continue;
    }
    for (const email of emails) {
      const employeeId = emailToEmployeeId[normalizeEmail(email)];
      if (!employeeId) {
        console.warn(`  ?濡ろ뜑??? '${email}' 癲ル슣?????癲ル슓??젆???????⑤９苑?癲꾧퀗??????ㅿ폍???`);
        continue;
      }
      await prisma.lineAssignment.create({
        data: { lineId, employeeId, startAt: baselineLineAssignmentStartAt },
      });
      await prisma.employee.update({
        where: { id: employeeId },
        data: { lineName },
      });
      assignedCount += 1;
    }
  }

  // ??繹먮끏????????
  let managersSet = 0;
  for (const { lineName, managerEmail } of BASELINE_LINE_WORKER_MAP) {
    const lineId = lineNameToId[lineName];
    if (!lineId) continue;
    const managerEmployeeId = emailToEmployeeId[normalizeEmail(managerEmail)];
    if (!managerEmployeeId) {
      console.warn(`  ?濡ろ뜑??? ??繹먮끏?????節뚮쳮??'${managerEmail}'??癲ル슓??젆???????⑤８?????덊렡.`);
      continue;
    }
    await prisma.line.update({
      where: { id: lineId },
      data: { managerEmployeeId },
    });
    managersSet += 1;
  }

  results.lineAssignment = { closed: closedAssignments.count, assigned: assignedCount, managersSet };
  console.log(`[7/9] ??繹먮끏???袁⑸즲????縕?猿녿뎨?? ${closedAssignments.count}癲????⑤챷?? ${assignedCount}癲????ル㎦???袁⑸즲??? ??繹먮끏???${managersSet}癲????源놁젳`);

  // 8. ??????濚밸Ŧ援욃ㅇ?(BASELINE_STYLES)
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
  console.log(`[8/9] Styles seeded: created=${createdStyles}, skipped=${skippedStyles}`);

  // 9. ??낆뒩?戮る즵 ?濚밸Ŧ援욃ㅇ?(BASELINE_ORDERS) ??癲ル슢??猿눫??????덈틖 ??筌믨퀣????れ삀?? ????깆뱾 ??節뚮쳮雅?
  const styleMap = new Map(BASELINE_STYLES.map((s) => [s.styleId, s]));
  let prevOrderEnd = new Date(); // ????몄툜??딅텑?????筌?鍮???筌믨퀣援?

  let createdOrders = 0;
  let skippedOrders = 0;
  for (const order of BASELINE_ORDERS) {
    const items = order.items.map((item) => ({
      ...item,
      totalQuantity: sumItemQuantity(item),
    }));
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);

    // ???⑤챷????낆뒩?戮る즵 ??ш끽維??????筌?鍮???筌믨퀣援?????ш끽維??????彛??繹먮끏爰???釉먮폏???癲ル슢??猿눫???⑥??
    const workingDays = computeOrderWorkingDays(order, styleMap);
    const productionEnd = addWorkingDays(prevOrderEnd, workingDays);
    const dueDate = toYYYYMMDD(endOfMonth(productionEnd));
    prevOrderEnd = productionEnd;

    const exists = await prisma.workOrder.findFirst({
      where: { buyerOrgId: brand.id, sellerOrgId: manufacturer.id, orderNumber: order.orderNumber },
    });
    if (exists) {
      skippedOrders += 1;
      continue;
    }
    await prisma.workOrder.create({
      data: {
        orgId:         brand.id,
        orderId:       order.orderId,
        orderNumber:   order.orderNumber,
        buyerOrgId:    brand.id,
        buyerOrgName:  brand.name,
        sellerOrgId:   manufacturer.id,
        sellerOrgName: manufacturer.name,
        customerId:    brand.id,
        customerName:  brand.name,
        dueDate,
        status:        order.status,
        items,
        totalQuantity,
      },
    });
    createdOrders += 1;
    console.log(`        ${order.orderNumber}: ${totalQuantity.toLocaleString()}?? ${workingDays}????獄쏅똾??????ш끽維??${toYYYYMMDD(productionEnd)} ??癲ル슢??猿눫?${dueDate}`);
  }
  results.orders = { created: createdOrders, skipped: skippedOrders };
  console.log(`[9/9] Orders seeded: created=${createdOrders}, skipped=${skippedOrders}`);

  const seededOrders = await prisma.workOrder.findMany({
    where: {
      buyerOrgId: brand.id,
      sellerOrgId: manufacturer.id,
      orderNumber: { in: BASELINE_ORDERS.map((order) => order.orderNumber) },
    },
    select: {
      orderId: true,
      orderNumber: true,
      dueDate: true,
      customerName: true,
      customer: true,
      items: true,
    },
    orderBy: { orderNumber: 'asc' },
  });

  const baselineCards = buildBaselineAssignmentBoardCards(seededOrders, styleMap);
  const seededCards = applyBaselineAgreementSnapshots(baselineCards, lineNameToId);
  const seededAssignments = buildBaselineAgreedAssignments(lineNameToId);
  const assignmentPlanSeedRows = buildAssignmentPlanSeedRows(
    manufacturer.id,
    lineNameToId
  );

  if (assignmentPlanSeedRows.length > 0) {
    await prisma.assignmentPlan.createMany({
      data: assignmentPlanSeedRows,
    });
  }

  await prisma.assignmentBoardState.create({
    data: {
      orgId: manufacturer.id,
      cards: seededCards,
      assignments: seededAssignments,
    },
  });

  results.assignmentBoardSeed = {
    cards: seededCards.length,
    agreedCards: (BASELINE_ASSIGNMENT_AGREEMENTS.cards || []).length,
    agreedAssignments: seededAssignments.length,
  };
  console.log(`[post-reset] Assignment board seed: cards=${seededCards.length}, agreedCards=${(BASELINE_ASSIGNMENT_AGREEMENTS.cards || []).length}, agreedAssignments=${seededAssignments.length}`);



  const remaining = await prisma.$transaction([
    prisma.employee.count({ where: { orgId: manufacturer.id } }),
    prisma.line.count({ where: { orgId: manufacturer.id } }),
    prisma.lineAssignment.count({ where: { endAt: null } }),
    prisma.factory.count({ where: { orgId: manufacturer.id } }),
    prisma.style.count({ where: { orgId: manufacturer.id } }),
    prisma.workOrder.count({ where: { OR: [{ buyerOrgId: brand.id }, { sellerOrgId: manufacturer.id }] } }),
    prisma.assignmentPlan.count({ where: { orgId: manufacturer.id } }),
    prisma.assignmentBoardState.count({ where: { orgId: manufacturer.id } }),
  ]);

  console.log('\n=== ?縕?猿녿뎨????ш끽維??===');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n??ш끽維?????Β????');
  console.log(`  Employee: ${remaining[0]}`);
  console.log(`  Factory: ${remaining[3]}`);
  console.log(`  Line: ${remaining[1]}`);
  console.log(`  LineAssignment (active): ${remaining[2]}`);
  console.log(`  Style: ${remaining[4]}`);
  console.log(`  WorkOrder: ${remaining[5]}`);
  console.log(`  AssignmentPlan: ${remaining[6]}`);
  console.log(`  AssignmentBoardState: ${remaining[7]}`);
}

main()
  .catch((e) => {
    console.error('\n?縕?猿녿뎨??????됰꽡:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
