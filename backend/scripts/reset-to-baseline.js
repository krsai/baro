#!/usr/bin/env node
'use strict';

require('dotenv').config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= 'binary';
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BASELINE_COLORS = [
  { code: 'WHITE', name: 'White', nameEn: 'White', nameKo: '화이트', nameVi: 'Trắng' },
  { code: 'BLACK', name: 'Black', nameEn: 'Black', nameKo: '블랙', nameVi: 'Đen' },
  { code: 'NAVY', name: 'Navy', nameEn: 'Navy', nameKo: '네이비', nameVi: 'Xanh Navy' },
  {
    code: 'DARK-MELANGE',
    name: 'Dark Melange',
    nameEn: 'Dark Melange',
    nameKo: '다크 멜란지',
    nameVi: 'Dark Melange',
  },
  {
    code: 'LT-BLUE',
    name: 'Light Blue',
    nameEn: 'Light Blue',
    nameKo: '라이트 블루',
    nameVi: 'Xanh nhạt',
  },
  {
    code: 'MID-BLUE',
    name: 'Mid Blue',
    nameEn: 'Mid Blue',
    nameKo: '미드 블루',
    nameVi: 'Xanh trung',
  },
  { code: 'INDIGO', name: 'Indigo', nameEn: 'Indigo', nameKo: '인디고', nameVi: 'Indigo' },
];

const BASELINE_CATEGORIES = [
  {
    code: '01-CHEF',
    name: 'Chef Uniform',
    nameKo: '쉐프복',
    nameEn: 'Chef Uniform',
    nameVi: 'Đồng phục đầu bếp',
  },
  {
    code: '02-APRON',
    name: 'Apron',
    nameKo: '앞치마',
    nameEn: 'Apron',
    nameVi: 'Tạp dề',
  },
  {
    code: '03-WINDBREAKER',
    name: 'Windbreaker',
    nameKo: '바람막이',
    nameEn: 'Windbreaker',
    nameVi: 'Áo khoác gió',
  },
  {
    code: '04-SS-TSHIRT',
    name: 'Short Sleeve T-Shirt',
    nameKo: '반팔 티셔츠',
    nameEn: 'Short Sleeve T-Shirt',
    nameVi: 'Áo thun ngắn tay',
  },
  {
    code: '05-LS-TSHIRT',
    name: 'Long Sleeve T-Shirt',
    nameKo: '긴팔 티셔츠',
    nameEn: 'Long Sleeve T-Shirt',
    nameVi: 'Áo thun dài tay',
  },
  {
    code: '06-SCRUB',
    name: 'Scrub',
    nameKo: '스크럽',
    nameEn: 'Scrub',
    nameVi: 'Đồng phục scrub',
  },
];

const BASELINE_PROCESSES = Array.from({ length: 10 }, (_, index) => ({
  code: `P${String(index + 1).padStart(2, '0')}`,
  name: `Test Process ${String(index + 1).padStart(2, '0')}`,
}));

const BASELINE_ROLES = [
  { code: 'WORKER_CUTTING', name: '\uC7AC\uB2E8', defaultPayType: 'FIXED', sortOrder: 1 },
  { code: 'WORKER_SEWING', name: '\uBD09\uC81C', defaultPayType: 'CT', sortOrder: 2 },
  { code: 'WORKER_IRONING', name: '\uB2E4\uB9BC', defaultPayType: 'FIXED', sortOrder: 3 },
  { code: 'WORKER_INSPECTION', name: '\uAC80\uC218', defaultPayType: 'FIXED', sortOrder: 4 },
  { code: 'WORKER_PACKING', name: '\uD3EC\uC7A5', defaultPayType: 'FIXED', sortOrder: 5 },
  { code: 'WORKER_OTHER', name: '\uAE30\uD0C0', defaultPayType: 'FIXED', sortOrder: 6 },
];

const TARGET_MONTHLY_WAGE = 8000000;
const WAGE_PER_SECOND = TARGET_MONTHLY_WAGE / (26 * 8 * 3600);
const SAMPLE_FACTORY_NAME = '샘플 공장';
const SAMPLE_FACTORY_ADDRESS = '샘플 공장 주소';
const SAMPLE_WORKER_COUNT = 15;
const LEGACY_BASELINE_STYLE_IDS = [
  'S-2025SS-T001',
  'S-2025SS-P002',
  'S-2025FW-J003',
];

const BASELINE_STYLES = [];

const STAFF_MEMBERSHIPS = [
  {
    email: 'manufacturer-admin@test.local',
    role: 'ADMIN',
    name: 'Manager',
    payType: 'FIXED',
    position: 'ADMIN',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-ADMIN-0001',
  },
  {
    email: 'manufacturer-operator@test.local',
    role: 'OPERATOR',
    name: 'Operator',
    payType: 'FIXED',
    position: 'OPERATOR',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-OPER-0002',
  },
  {
    email: 'manufacturer-accountant@test.local',
    role: 'ACCOUNTANT',
    name: 'Accountant',
    payType: 'FIXED',
    position: 'ACCOUNTANT',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-ACCT-0003',
  },
];

const BRAND_MEMBERSHIPS = [
  {
    email: 'brand-admin@test.local',
    role: 'ADMIN',
    name: 'Brand Admin',
    payType: 'FIXED',
    position: 'ADMIN',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-ADMIN-0001',
  },
  {
    email: 'brand-operator@test.local',
    role: 'OPERATOR',
    name: 'Brand Operator',
    payType: 'FIXED',
    position: 'OPERATOR',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-OPER-0002',
  },
  {
    email: 'brand-accountant@test.local',
    role: 'ACCOUNTANT',
    name: 'Brand Accountant',
    payType: 'FIXED',
    position: 'ACCOUNTANT',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-ACCT-0003',
  },
];

const LINE_CONFIGS = [
  { key: 'sample-line', lineName: '샘플 라인', workerPrefix: 'sample-worker-', workerLabel: '샘플 작업자' },
];

const SAMPLE_API_BASE = process.env.API_BASE ?? 'http://localhost:4000';
const SAMPLE_MANUFACTURER_CODE = 'TSMF';
const SAMPLE_BRAND_CODE = 'TSBR';
const SAMPLE_MANUFACTURER_ADMIN_EMAIL = 'manufacturer-admin@test.local';
const SAMPLE_BRAND_ADMIN_EMAIL = 'brand-admin@test.local';
const SAMPLE_MANUFACTURER_OPERATOR_EMAIL = 'manufacturer-operator@test.local';
const SAMPLE_LEGACY_ORDER_PREFIX = 'LOAD-26';
const SAMPLE_DEMO_ORDER_ID = 'order-tsbr-po-260322-01';
const SAMPLE_DEMO_ORDER_NUMBER = 'TSBR-PO-260322-01';
const SAMPLE_ORDER_DUE_OFFSET_DAYS = 47;
const SAMPLE_ORDER_STYLE_ITEMS = [
  {
    styleId: 'BL20',
    colorCode: 'BLACK',
    gender: 'U',
    quantity: 1500,
    sizeQuantities: { S: 300, M: 525, L: 450, XL: 225 },
  },
  {
    styleId: 'AM01160',
    colorCode: 'NAVY',
    gender: 'M',
    quantity: 950,
    sizeQuantities: { S: 150, M: 330, L: 280, XL: 190 },
  },
  {
    styleId: 'AM01622',
    colorCode: 'WHITE',
    gender: 'U',
    quantity: 1350,
    sizeQuantities: { S: 200, M: 470, L: 410, XL: 270 },
  },
  {
    styleId: 'AM02053',
    colorCode: 'INDIGO',
    gender: 'U',
    quantity: 1650,
    sizeQuantities: { S: 250, M: 580, L: 500, XL: 320 },
  },
];
const SAMPLE_WORK_LOG_ORG_ID = Number(process.env.ORG_ID ?? 2);
const SAMPLE_WORK_LOG_SHIFT_SECONDS = Number(process.env.SHIFT_SECONDS ?? 8 * 60 * 60);
const SAMPLE_WORK_LOG_TARGET_VARIANCE = Math.max(
  0,
  Math.min(5, Number(process.env.TARGET_VARIANCE ?? 4))
);
const SAMPLE_WORK_LOG_SEED = Number(process.env.SEED ?? 20260306);
const SAMPLE_WORK_LOG_DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
const SAMPLE_WORK_LOG_NOTE_PREFIX = 'AUTO_SAMPLE_WORK_LOG';

const toWorkerEmail = (prefix, index) => `${prefix}${String(index).padStart(2, '0')}@baro.local`;
const toWorkerName = (label, index) => `${label} ${String(index).padStart(2, '0')}`;

async function upsertOrganization(data) {
  const existing = await prisma.organization.findUnique({ where: { code: data.code } });
  if (existing) {
    return prisma.organization.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        type: data.type,
        businessNumber: data.businessNumber ?? null,
        representative: data.representative ?? null,
        industry: data.industry ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
      },
    });
  }
  return prisma.organization.create({ data });
}

async function ensureSubscription(orgId, membershipEmail) {
  return prisma.organizationSubscription.upsert({
    where: { orgId },
    update: {
      status: 'ACTIVE',
      membershipEmail,
      billingEmail: membershipEmail,
      trialStartedAt: null,
      trialEndsAt: null,
      activatedAt: new Date(),
      activeEndsAt: null,
      suspendedAt: null,
    },
    create: {
      orgId,
      membershipEmail,
      billingEmail: membershipEmail,
      status: 'ACTIVE',
      activatedAt: new Date(),
      activeEndsAt: null,
    },
  });
}

async function ensureMembership(orgId, data) {
  return prisma.orgMembership.upsert({
    where: { orgId_email: { orgId, email: data.email } },
    update: {
      role: data.role,
      status: 'ACTIVE',
      approvedBy: 'reset-to-baseline',
      approvedAt: new Date(),
    },
    create: {
      orgId,
      email: data.email,
      role: data.role,
      status: 'ACTIVE',
      approvedBy: 'reset-to-baseline',
      approvedAt: new Date(),
    },
  });
}

async function ensureFactory(orgId) {
  const existing = await prisma.factory.findFirst({
    where: { orgId, name: SAMPLE_FACTORY_NAME },
    orderBy: { id: 'asc' },
  });
  const data = {
    address: SAMPLE_FACTORY_ADDRESS,
    country: 'VN',
    countryCode: '+84',
    phoneNumber: '010-0000-0000',
    manager: 'Manager',
    targetMonthlyWage: TARGET_MONTHLY_WAGE,
    wagePerSecond: WAGE_PER_SECOND,
  };

  if (existing) {
    return prisma.factory.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.factory.create({
    data: {
      orgId,
      name: SAMPLE_FACTORY_NAME,
      ...data,
    },
  });
}

async function ensureLine(orgId, factoryId, name) {
  return prisma.line.upsert({
    where: { factoryId_name: { factoryId, name } },
    update: { orgId, isActive: true },
    create: { orgId, factoryId, name, isActive: true },
  });
}

async function cleanupSampleFactoryData(orgId) {
  const sampleFactories = await prisma.factory.findMany({
    where: {
      orgId,
      name: { in: ['Sample Factory', SAMPLE_FACTORY_NAME] },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const sampleFactoryIds = sampleFactories.map((factory) => factory.id);

  const baselineWorkerMemberships = await prisma.orgMembership.findMany({
    where: {
      orgId,
      OR: [
        { email: { startsWith: 'line1-worker' } },
        { email: { startsWith: 'line2-worker' } },
        { email: { startsWith: 'sample-worker-' } },
      ],
    },
    select: {
      id: true,
      employee: { select: { id: true } },
    },
  });
  const baselineWorkerMembershipIds = baselineWorkerMemberships.map((membership) => membership.id);
  const baselineWorkerIds = baselineWorkerMemberships
    .map((membership) => membership.employee?.id ?? null)
    .filter((id) => Number.isFinite(id));

  if (sampleFactoryIds.length === 0 && baselineWorkerIds.length === 0) {
    return {
      deletedFactories: 0,
      deletedLines: 0,
      deletedWorkers: 0,
      deletedWorkerMemberships: 0,
    };
  }

  const sampleLines = sampleFactoryIds.length
    ? await prisma.line.findMany({
        where: { orgId, factoryId: { in: sampleFactoryIds } },
        select: { id: true },
      })
    : [];
  const sampleLineIds = sampleLines.map((line) => line.id);

  await prisma.$transaction(async (tx) => {
    if (baselineWorkerIds.length > 0) {
      await tx.line.updateMany({
        where: { orgId, managerEmployeeId: { in: baselineWorkerIds } },
        data: { managerEmployeeId: null },
      });
    }

    if (sampleFactoryIds.length > 0) {
      await tx.employee.updateMany({
        where: { orgId, factoryId: { in: sampleFactoryIds } },
        data: { factoryId: null, lineName: null },
      });
    }

    const assignmentDeleteOr = [];
    if (sampleLineIds.length > 0) {
      assignmentDeleteOr.push({ lineId: { in: sampleLineIds } });
      await tx.assignmentPlan.deleteMany({
        where: { orgId, lineId: { in: sampleLineIds } },
      });
    }
    if (baselineWorkerIds.length > 0) {
      assignmentDeleteOr.push({ employeeId: { in: baselineWorkerIds } });
    }
    if (assignmentDeleteOr.length > 0) {
      await tx.lineAssignment.deleteMany({
        where: { OR: assignmentDeleteOr },
      });
    }

    if (sampleLineIds.length > 0) {
      await tx.line.deleteMany({
        where: { orgId, id: { in: sampleLineIds } },
      });
    }

    if (baselineWorkerIds.length > 0) {
      await tx.employee.deleteMany({
        where: { orgId, id: { in: baselineWorkerIds } },
      });
    }

    if (baselineWorkerMembershipIds.length > 0) {
      await tx.orgMembership.deleteMany({
        where: { orgId, id: { in: baselineWorkerMembershipIds } },
      });
    }

    if (sampleFactoryIds.length > 0) {
      await tx.factory.deleteMany({
        where: { orgId, id: { in: sampleFactoryIds } },
      });
    }
  });

  return {
    deletedFactories: sampleFactoryIds.length,
    deletedLines: sampleLineIds.length,
    deletedWorkers: baselineWorkerIds.length,
    deletedWorkerMemberships: baselineWorkerMembershipIds.length,
  };
}

async function syncGlobalColors() {
  for (const color of BASELINE_COLORS) {
    await prisma.attrColor.upsert({
      where: { code: color.code },
      update: {
        name: color.name,
        nameEn: color.nameEn,
        nameKo: color.nameKo,
        nameVi: color.nameVi,
      },
      create: color,
    });
  }
}

async function syncManufacturerAttributes(orgId) {
  for (const category of BASELINE_CATEGORIES) {
    await prisma.attrCategory.upsert({
      where: { orgId_code: { orgId, code: category.code } },
      update: {
        name: category.name,
        nameKo: category.nameKo,
        nameEn: category.nameEn,
        nameVi: category.nameVi,
      },
      create: { orgId, ...category },
    });
  }

  for (const process of BASELINE_PROCESSES) {
    await prisma.attrProcess.upsert({
      where: { orgId_code: { orgId, code: process.code } },
      update: { name: process.name },
      create: { orgId, ...process },
    });
  }

  for (const role of BASELINE_ROLES) {
    await prisma.attrRole.upsert({
      where: { orgId_code: { orgId, code: role.code } },
      update: {
        name: role.name,
        defaultPayType: role.defaultPayType,
        sortOrder: role.sortOrder,
      },
      create: { orgId, ...role },
    });
  }
}

async function ensureEmployee({
  orgId,
  orgMembershipId,
  factoryId,
  roleId,
  payType,
  name,
  lineName,
  position,
  phone,
  bankName,
  bankAccountNumber,
}) {
  const existing = await prisma.employee.findUnique({ where: { orgMembershipId } });
  const data = {
    orgId,
    orgMembershipId,
    factoryId,
    roleId,
    payType,
    name,
    lineName,
    position,
    phone: phone ?? null,
    bankName: bankName ?? null,
    bankAccountNumber: bankAccountNumber ?? null,
  };
  if (existing) {
    return prisma.employee.update({ where: { id: existing.id }, data });
  }
  return prisma.employee.create({ data });
}

async function ensureStyles(orgId) {
  for (const style of BASELINE_STYLES) {
    await prisma.style.upsert({
      where: { orgId_styleId: { orgId, styleId: style.styleId } },
      update: {
        styleCode: style.styleCode,
        name: style.name,
        customer: style.customer,
        registrationDate: style.registrationDate,
        designer: style.designer,
        collection: style.collection,
        season: style.season,
        imageUrls: style.imageUrls,
        processes: style.processes,
        bom: style.bom,
        bomNotes: style.bomNotes,
      },
      create: { orgId, ...style },
    });
  }
}

async function cleanupLegacyBaselineStyles(orgId) {
  if (LEGACY_BASELINE_STYLE_IDS.length === 0) {
    return { deletedStyles: 0 };
  }

  const result = await prisma.style.deleteMany({
    where: {
      orgId,
      styleId: { in: LEGACY_BASELINE_STYLE_IDS },
    },
  });

  return { deletedStyles: result.count };
}

async function clearOrderAndAssignmentData() {
  const detachedRecords = await prisma.workRecord.updateMany({
    where: { assignmentPlanId: { not: null } },
    data: { assignmentPlanId: null },
  });
  const deletedCards = await prisma.assignmentCard.deleteMany();
  const deletedPlans = await prisma.assignmentPlan.deleteMany();
  const deletedBoardStates = await prisma.assignmentBoardState.deleteMany();
  const deletedOrders = await prisma.workOrder.deleteMany();

  return {
    detachedWorkRecords: detachedRecords.count,
    assignmentCards: deletedCards.count,
    assignmentPlans: deletedPlans.count,
    assignmentBoardStates: deletedBoardStates.count,
    workOrders: deletedOrders.count,
  };
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

async function captureAssignmentBoardSnapshot(orgId) {
  const [boardState, assignmentCards] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { assignments: true, cards: true, updatedAt: true },
    }),
    prisma.assignmentCard.findMany({
      where: { orgId },
      select: { cardId: true, sortOrder: true, payload: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const assignments = Array.isArray(boardState?.assignments)
    ? cloneJsonValue(boardState.assignments)
    : [];
  const boardCards = Array.isArray(boardState?.cards) ? cloneJsonValue(boardState.cards) : [];
  const cards = (Array.isArray(assignmentCards) ? assignmentCards : []).map((row) => ({
    cardId: String(row?.cardId || ''),
    sortOrder: sampleToPositiveInt(row?.sortOrder, 0),
    payload: cloneJsonValue(row?.payload ?? {}),
  }));

  return {
    updatedAt: boardState?.updatedAt ?? null,
    assignments,
    boardCards,
    cards,
  };
}

function remapAssignmentExternalIdLineSegment(externalId, previousLineId, nextLineId) {
  const raw = String(externalId || '').trim();
  if (!raw) return raw;

  const prev = sampleToPositiveIntOrNull(previousLineId);
  const next = sampleToPositiveIntOrNull(nextLineId);
  if (!prev || !next || prev === next) return raw;

  const suffixPattern = new RegExp(`-${prev}-(\\d+)$`);
  if (!suffixPattern.test(raw)) return raw;
  return raw.replace(suffixPattern, `-${next}-$1`);
}

function remapAssignmentSnapshotLines(assignments, targetLineId) {
  const nextLineId = sampleToPositiveIntOrNull(targetLineId);
  if (!nextLineId) return [];

  return (Array.isArray(assignments) ? assignments : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const previousLineId = sampleToPositiveIntOrNull(row.lineId);
      const nextRow = { ...row };
      nextRow.lineId = String(nextLineId);
      nextRow.id = remapAssignmentExternalIdLineSegment(
        nextRow.id,
        previousLineId,
        nextLineId
      );
      return nextRow;
    })
    .filter(Boolean);
}

function sampleBuildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function sampleApiRequest(path, { method = 'GET', body, userEmail, orgId } = {}) {
  const headers = new Headers();
  if (userEmail) headers.set('x-user-email', String(userEmail).trim().toLowerCase());
  if (orgId) headers.set('x-org-id', String(orgId));
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${SAMPLE_API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    error.path = path;
    throw error;
  }

  return data;
}

function sampleAssert(condition, message) {
  if (!condition) throw new Error(message);
}

function sampleToDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function sampleAddDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sampleToFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sampleToPositiveIntOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function sampleToPositiveInt(value, fallback = 0) {
  return sampleToPositiveIntOrNull(value) ?? fallback;
}

function sampleClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleCreateRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleRandomInt(random, min, max) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(random() * (upper - lower + 1)) + lower;
}

function sampleRandomFloat(random, min, max) {
  return random() * (max - min) + min;
}

function sampleSumBy(items, selector) {
  return items.reduce((total, item, index) => total + selector(item, index), 0);
}

function sampleAllocateByWeights(total, weights) {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (safeTotal === 0 || weights.length === 0) {
    return Array.from({ length: weights.length }, () => 0);
  }

  const normalized = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const sumWeights = normalized.reduce((acc, weight) => acc + weight, 0);
  const basis = sumWeights > 0 ? normalized : normalized.map(() => 1);
  const denominator = sumWeights > 0 ? sumWeights : basis.length;
  const raw = basis.map((weight) => (safeTotal * weight) / denominator);
  const floorValues = raw.map((value) => Math.floor(value));
  let remaining = safeTotal - floorValues.reduce((acc, value) => acc + value, 0);

  const order = raw
    .map((value, index) => ({
      index,
      fraction: value - floorValues[index],
      weight: basis[index],
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction ||
        right.weight - left.weight ||
        left.index - right.index
    );

  for (let index = 0; index < order.length && remaining > 0; index += 1) {
    floorValues[order[index].index] += 1;
    remaining -= 1;
  }

  return floorValues;
}

function sampleSplitQuantity(total, parts, random) {
  if (parts <= 0) return [];
  if (parts === 1) return [total];
  if (parts > total) {
    throw new Error(`cannot split quantity ${total} into ${parts} positive parts`);
  }

  const weights = Array.from({ length: parts }, () => 0.9 + random() * 0.2);
  const base = Array.from({ length: parts }, () => 1);
  const remaining = sampleAllocateByWeights(total - parts, weights);
  return base.map((value, index) => value + remaining[index]);
}

function sampleSumStylePt(style) {
  return Array.isArray(style?.processes)
    ? style.processes.reduce((sum, process) => {
        const pt = Number(process?.pt || 0);
        const quantity = Number(process?.quantity || 1);
        return sum + pt * Math.max(1, quantity);
      }, 0)
    : 0;
}

async function sampleLoadOrganizations() {
  const organizations = await sampleApiRequest('/organizations');
  const manufacturer = organizations.find(
    (organization) => organization?.code === SAMPLE_MANUFACTURER_CODE
  );
  const brand = organizations.find((organization) => organization?.code === SAMPLE_BRAND_CODE);
  sampleAssert(manufacturer, `organization not found: ${SAMPLE_MANUFACTURER_CODE}`);
  sampleAssert(brand, `organization not found: ${SAMPLE_BRAND_CODE}`);
  return { manufacturer, brand };
}

async function sampleLoadManufacturingContext(manufacturer, brand) {
  const [customers, attributes, factories] = await Promise.all([
    sampleApiRequest(`/customers${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
    sampleApiRequest(`/attributes${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
    sampleApiRequest(`/factories${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
  ]);

  const linkedCustomer = Array.isArray(customers)
    ? customers.find((item) => Number(item?.brandOrgId) === Number(brand.id))
    : null;
  sampleAssert(linkedCustomer, 'manufacturer-brand relationship not found');

  const colors = Array.isArray(attributes?.colors) ? attributes.colors : [];
  sampleAssert(colors.length > 0, 'at least one color is required');
  sampleAssert(Array.isArray(factories) && factories.length > 0, 'no factory found for manufacturer');

  const preferredFactoryName = String(SAMPLE_FACTORY_NAME || '').trim();
  const factory =
    factories.find((item) => String(item?.name || '').trim() === preferredFactoryName) ||
    factories[0];
  const lines = await sampleApiRequest(
    `/lines${sampleBuildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );
  const preferredLineName = String(LINE_CONFIGS[0]?.lineName || '').trim();
  const line =
    (Array.isArray(lines) ? lines : []).find(
      (item) => String(item?.name || '').trim() === preferredLineName
    ) || ((Array.isArray(lines) && lines.length > 0) ? lines[0] : null);
  sampleAssert(line, 'no line found for selected factory');

  const lineWorkers = await sampleApiRequest(
    `/line-workers${sampleBuildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const assignedWorkerCount = Array.isArray(lineWorkers)
    ? lineWorkers.filter((worker) => Number(worker?.currentLineId) === Number(line.id)).length
    : 0;

  return {
    colorByCode: colors.reduce((map, color) => {
      const code = String(color?.code || '').trim().toUpperCase();
      if (code) map.set(code, color);
      return map;
    }, new Map()),
    factory,
    line,
    assignedWorkerCount: assignedWorkerCount || SAMPLE_WORKER_COUNT,
  };
}

async function sampleCleanupLegacyOrders(manufacturer) {
  const existingOrders = await sampleApiRequest(
    `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const legacyOrders = (Array.isArray(existingOrders) ? existingOrders : []).filter((order) => {
    const orderNumber = String(order?.orderNumber || '');
    const orderId = String(order?.id || '');
    return orderNumber.startsWith(SAMPLE_LEGACY_ORDER_PREFIX) || orderId.startsWith('order-load-26');
  });

  for (const order of legacyOrders) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(order.id)}${sampleBuildQuery({ orgId: manufacturer.id })}`,
      {
        method: 'DELETE',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
      }
    );
  }

  return legacyOrders.length;
}

async function sampleCleanupLegacyStyles(organizationId, userEmail) {
  const existingStyles = await sampleApiRequest(
    `/styles${sampleBuildQuery({ orgId: organizationId, compact: 1 })}`,
    {
      userEmail,
      orgId: organizationId,
    }
  );

  const legacyStyles = (Array.isArray(existingStyles) ? existingStyles : []).filter((style) =>
    String(style?.id || '').startsWith(SAMPLE_LEGACY_ORDER_PREFIX)
  );

  for (const style of legacyStyles) {
    await sampleApiRequest(
      `/styles/${encodeURIComponent(style.id)}${sampleBuildQuery({ orgId: organizationId })}`,
      {
        method: 'DELETE',
        userEmail,
        orgId: organizationId,
      }
    );
  }

  return legacyStyles.length;
}

async function sampleLoadRegisteredStyles(manufacturer, colorByCode) {
  const styles = [];
  for (const item of SAMPLE_ORDER_STYLE_ITEMS) {
    const style = await sampleApiRequest(
      `/styles/${encodeURIComponent(item.styleId)}${sampleBuildQuery({ orgId: manufacturer.id })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
      }
    );
    const color = colorByCode.get(item.colorCode);
    sampleAssert(color, `color not found: ${item.colorCode}`);
    styles.push({
      definition: item,
      style,
      color,
      ptPerPiece: sampleSumStylePt(style),
    });
  }
  return styles;
}

async function sampleCreateOrUpdateConsolidatedOrder({ manufacturer, brand, registeredStyles }) {
  const today = new Date();
  const existingOrders = await sampleApiRequest(
    `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const existingOrder = (Array.isArray(existingOrders) ? existingOrders : []).find(
    (order) =>
      String(order?.id || '') === SAMPLE_DEMO_ORDER_ID ||
      String(order?.orderNumber || '') === SAMPLE_DEMO_ORDER_NUMBER
  );

  const payload = {
    id: SAMPLE_DEMO_ORDER_ID,
    orderNumber: SAMPLE_DEMO_ORDER_NUMBER,
    buyerOrgId: brand.id,
    buyerOrgName: brand.name,
    sellerOrgId: manufacturer.id,
    sellerOrgName: manufacturer.name,
    customer: brand.name,
    dueDate: sampleToDateKey(sampleAddDays(today, SAMPLE_ORDER_DUE_OFFSET_DAYS)),
    status: 'ORDER_RECEIVED',
    confirmationStatus: 'PLANNED',
    items: registeredStyles.map(({ definition, style, color }, index) => ({
      id: `item-${String(index + 1).padStart(2, '0')}`,
      styleId: style.id,
      styleCode: style.styleCode,
      styleName: style.name,
      colorId: color.id,
      colorCode: color.code,
      colorName: color.name,
      gender: definition.gender,
      sizeQuantities: definition.sizeQuantities,
      totalQuantity: definition.quantity,
    })),
    totalQuantity: registeredStyles.reduce(
      (sum, item) => sum + Number(item.definition.quantity || 0),
      0
    ),
  };

  if (existingOrder?.isManualModificationLocked) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(existingOrder.id)}/modification-lock${sampleBuildQuery({
        orgId: manufacturer.id,
      })}`,
      {
        method: 'POST',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
        body: {
          locked: false,
          lockedBy: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        },
      }
    );
  }

  const order = await sampleApiRequest(
    existingOrder
      ? `/orders/${encodeURIComponent(existingOrder.id)}${sampleBuildQuery({ orgId: manufacturer.id })}`
      : `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      method: existingOrder ? 'PUT' : 'POST',
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
      body: payload,
    }
  );

  if (existingOrder) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(order.id)}/modification-lock${sampleBuildQuery({
        orgId: manufacturer.id,
      })}`,
      {
        method: 'POST',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
        body: {
          locked: true,
          lockedBy: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        },
      }
    );
  }

  return {
    order,
    mode: existingOrder ? 'updated' : 'created',
  };
}

async function runSampleOrders(options = {}) {
  const silent = Boolean(options?.silent);
  const { manufacturer, brand } = await sampleLoadOrganizations();
  const context = await sampleLoadManufacturingContext(manufacturer, brand);

  const deletedLegacyOrderCount = await sampleCleanupLegacyOrders(manufacturer);
  const deletedLegacyBrandStyleCount = await sampleCleanupLegacyStyles(
    brand.id,
    SAMPLE_BRAND_ADMIN_EMAIL
  );
  const deletedLegacyManufacturerStyleCount = await sampleCleanupLegacyStyles(
    manufacturer.id,
    SAMPLE_MANUFACTURER_ADMIN_EMAIL
  );

  const registeredStyles = await sampleLoadRegisteredStyles(
    manufacturer,
    context.colorByCode
  );
  const consolidatedOrder = await sampleCreateOrUpdateConsolidatedOrder({
    manufacturer,
    brand,
    registeredStyles,
  });

  const assignmentCardsResponse = await sampleApiRequest(
    `/assignment-cards${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const cards = Array.isArray(assignmentCardsResponse?.cards)
    ? assignmentCardsResponse.cards
    : [];
  const orderCards = cards.filter((card) => String(card?.orderNo || '') === SAMPLE_DEMO_ORDER_NUMBER);

  const totalPtSeconds = registeredStyles.reduce(
    (sum, item) => sum + item.ptPerPiece * Number(item.definition.quantity || 0),
    0
  );
  const estimatedLineDays =
    totalPtSeconds / (Math.max(1, context.assignedWorkerCount) * SAMPLE_WORK_LOG_SHIFT_SECONDS);

  const result = {
    ok: true,
    apiBase: SAMPLE_API_BASE,
    cleanup: {
      deletedLegacyOrderCount,
      deletedLegacyBrandStyleCount,
      deletedLegacyManufacturerStyleCount,
    },
    factory: {
      id: context.factory.id,
      name: context.factory.name,
    },
    line: {
      id: context.line.id,
      name: context.line.name,
      assignedWorkerCount: context.assignedWorkerCount,
    },
    summary: {
      orderCount: 1,
      cardCount: orderCards.length,
      totalQuantity: registeredStyles.reduce(
        (sum, item) => sum + Number(item.definition.quantity || 0),
        0
      ),
      totalPtSeconds,
      estimatedLineDays: Number(estimatedLineDays.toFixed(2)),
      orderMode: consolidatedOrder.mode,
    },
    order: {
      orderId: consolidatedOrder.order.id,
      orderNumber: consolidatedOrder.order.orderNumber,
      buyerOrgName: consolidatedOrder.order.buyerOrgName,
      sellerOrgName: consolidatedOrder.order.sellerOrgName,
      dueDate: consolidatedOrder.order.dueDate,
    },
  };

  if (!silent) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

function buildAssignmentPlanWriteDataFromSnapshot(orgId, assignment, timestamp = new Date()) {
  const externalId = String(assignment?.id || '').trim();
  const lineId = sampleToPositiveIntOrNull(assignment?.lineId);
  if (!externalId || !lineId) return null;

  const startIndex = sampleToPositiveInt(assignment?.startIndex, 0);
  const endIndex = sampleToPositiveInt(assignment?.endIndex, startIndex);
  const completedAtRaw = assignment?.completedAt ? new Date(assignment.completedAt) : null;
  const completedAt =
    completedAtRaw && Number.isFinite(completedAtRaw.getTime()) ? completedAtRaw : null;

  return {
    orgId,
    lineId,
    externalId,
    cardId: assignment?.cardId ? String(assignment.cardId) : null,
    orderNo: assignment?.orderNo ? String(assignment.orderNo) : null,
    customer: assignment?.customer ? String(assignment.customer) : null,
    label: assignment?.label ? String(assignment.label) : null,
    colorId: sampleToPositiveIntOrNull(assignment?.colorId),
    colorName: assignment?.colorName ? String(assignment.colorName) : null,
    previewUrl: assignment?.previewUrl ? String(assignment.previewUrl) : null,
    imageUrl: assignment?.imageUrl ? String(assignment.imageUrl) : null,
    thumbnailUrl: assignment?.thumbnailUrl ? String(assignment.thumbnailUrl) : null,
    quantity: sampleToPositiveIntOrNull(assignment?.quantity),
    originOrderId: assignment?.originOrderId ? String(assignment.originOrderId) : null,
    basis: assignment?.basis ? String(assignment.basis) : null,
    contractedSeconds: sampleToPositiveIntOrNull(
      assignment?.contractedSeconds ?? assignment?.totalSeconds
    ),
    ctSnapshot:
      assignment?.ctSnapshot && typeof assignment.ctSnapshot === 'object'
        ? cloneJsonValue(assignment.ctSnapshot)
        : null,
    color: assignment?.color ? String(assignment.color) : null,
    stripeColor: assignment?.stripeColor ? String(assignment.stripeColor) : null,
    totalSeconds: sampleToPositiveIntOrNull(assignment?.totalSeconds),
    startIndex,
    endIndex,
    startDayOffsetPercent: sampleToFiniteNumber(assignment?.startDayOffsetPercent, null),
    startDayPercent: sampleToFiniteNumber(assignment?.startDayPercent, null),
    endDayPercent: sampleToFiniteNumber(assignment?.endDayPercent, null),
    isCompleted: Boolean(assignment?.isCompleted),
    finalQuantity: sampleToPositiveIntOrNull(assignment?.finalQuantity),
    completedAt,
    updatedAt: timestamp,
  };
}

async function restoreAssignmentSnapshotWithPrisma({
  manufacturerId,
  assignments,
  boardCards,
  cards,
  targetLineId,
}) {
  const normalizedAssignments = remapAssignmentSnapshotLines(assignments, targetLineId);
  if (normalizedAssignments.length === 0) {
    return {
      attempted: false,
      method: 'prisma',
      reason: 'empty-snapshot-or-missing-target-line',
      restoredAssignmentCount: 0,
      restoredCardCount: 0,
      restoredPlanCount: 0,
    };
  }

  const now = new Date();
  const planByExternalId = new Map();
  normalizedAssignments.forEach((item) => {
    const row = buildAssignmentPlanWriteDataFromSnapshot(manufacturerId, item, now);
    if (row) planByExternalId.set(row.externalId, row);
  });
  const planRows = Array.from(planByExternalId.values());

  const cardById = new Map();
  (Array.isArray(cards) ? cards : []).forEach((item, index) => {
    const cardId = String(item?.cardId || '').trim();
    if (!cardId) return;
    cardById.set(cardId, {
      orgId: manufacturerId,
      cardId,
      sortOrder: sampleToPositiveInt(item?.sortOrder, index),
      payload: cloneJsonValue(item?.payload ?? {}),
    });
  });
  const cardRows = Array.from(cardById.values());

  await prisma.$transaction(async (tx) => {
    await tx.assignmentPlan.deleteMany({ where: { orgId: manufacturerId } });
    if (planRows.length > 0) {
      await tx.assignmentPlan.createMany({ data: planRows });
    }

    await tx.assignmentCard.deleteMany({ where: { orgId: manufacturerId } });
    if (cardRows.length > 0) {
      await tx.assignmentCard.createMany({ data: cardRows });
    }

    const safeBoardCards = Array.isArray(boardCards) ? cloneJsonValue(boardCards) : [];
    await tx.assignmentBoardState.upsert({
      where: { orgId: manufacturerId },
      update: {
        cards: safeBoardCards,
        assignments: cloneJsonValue(normalizedAssignments),
      },
      create: {
        orgId: manufacturerId,
        cards: safeBoardCards,
        assignments: cloneJsonValue(normalizedAssignments),
      },
    });
  });

  return {
    attempted: true,
    method: 'prisma',
    restoredAssignmentCount: normalizedAssignments.length,
    restoredCardCount: cardRows.length,
    restoredPlanCount: planRows.length,
    targetLineId: sampleToPositiveIntOrNull(targetLineId),
  };
}

async function sampleRestoreAssignmentSnapshot({
  manufacturerId,
  assignments,
  targetLineId,
}) {
  const normalizedAssignments = remapAssignmentSnapshotLines(assignments, targetLineId);
  if (normalizedAssignments.length === 0) {
    return {
      attempted: false,
      reason: 'empty-snapshot-or-missing-target-line',
      restoredAssignmentCount: 0,
    };
  }

  await sampleApiRequest(
    `/assignment-board-state${sampleBuildQuery({ orgId: manufacturerId })}`,
    {
      method: 'PUT',
      userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
      orgId: manufacturerId,
      body: {
        assignments: normalizedAssignments,
      },
    }
  );

  const persistedPlans = await prisma.assignmentPlan.count({
    where: { orgId: manufacturerId },
  });

  return {
    attempted: true,
    restoredAssignmentCount: normalizedAssignments.length,
    persistedPlanCount: persistedPlans,
    targetLineId: sampleToPositiveIntOrNull(targetLineId),
  };
}

function sampleParseDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`);
}

function sampleListDateKeysInclusive(startDateKey, endDateKey) {
  const result = [];
  const start = sampleParseDateKey(startDateKey);
  const end = sampleParseDateKey(endDateKey);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    result.push(sampleToDateKey(cursor));
  }
  return result;
}

function sampleIsSunday(dateKey) {
  return sampleParseDateKey(dateKey).getUTCDay() === 0;
}

function sampleExtractProcessCode(process, index) {
  const rawKey =
    typeof process?.processKey === 'string' && process.processKey.trim()
      ? process.processKey.trim()
      : '';
  if (rawKey) return rawKey.split('-')[0];

  const rawCode =
    typeof process?.code === 'string' && process.code.trim()
      ? process.code.trim()
      : '';
  if (rawCode) return rawCode;

  return `P${String(index + 1).padStart(2, '0')}`;
}

function sampleBuildPlanProcesses(plan) {
  const snapshotProcesses = Array.isArray(plan?.ctSnapshot?.processes)
    ? plan.ctSnapshot.processes
    : [];

  return snapshotProcesses
    .map((process, index) => {
      const ctSeconds = sampleToPositiveInt(
        process?.agreedPerPieceSeconds ??
          process?.agreedSeconds ??
          process?.requestedSeconds ??
          process?.stSeconds,
        0
      );
      if (!ctSeconds) return null;

      return {
        processCode: sampleExtractProcessCode(process, index),
        processName:
          typeof process?.name === 'string' && process.name.trim()
            ? process.name.trim()
            : `Process ${index + 1}`,
        ctSeconds,
        processIndex: index,
      };
    })
    .filter(Boolean);
}

function sampleBuildDailyWeights(plan) {
  const schedule = plan?.ctSnapshot?.schedule;
  if (!schedule?.startDateKey || !schedule?.endDateKey) return [];

  const allDateKeys = sampleListDateKeysInclusive(
    schedule.startDateKey,
    schedule.endDateKey
  );
  const dateKeys = allDateKeys.filter((dateKey) => !sampleIsSunday(dateKey));
  const effectiveDateKeys = dateKeys.length > 0 ? dateKeys : allDateKeys;
  const startShare = sampleClamp(sampleToFiniteNumber(schedule.startDayPercent, 100), 1, 100);
  const endShare = sampleClamp(sampleToFiniteNumber(schedule.endDayPercent, 100), 1, 100);

  return effectiveDateKeys.map((dateKey, index) => {
    if (effectiveDateKeys.length === 1) {
      return { dateKey, weight: Math.max(startShare, endShare) / 100 };
    }
    if (index === 0) {
      return {
        dateKey,
        weight: dateKey === schedule.startDateKey ? startShare / 100 : 1,
      };
    }
    if (index === effectiveDateKeys.length - 1) {
      return {
        dateKey,
        weight: dateKey === schedule.endDateKey ? endShare / 100 : 1,
      };
    }
    return { dateKey, weight: 1 };
  });
}

function sampleNormalizePlan(plan, random) {
  const lineId = sampleToPositiveInt(plan?.lineId, 0);
  const baselineQuantity = sampleToPositiveInt(plan?.finalQuantity ?? plan?.quantity, 0);
  const processes = sampleBuildPlanProcesses(plan);
  const dailyWeights = sampleBuildDailyWeights(plan);

  if (!lineId || !baselineQuantity || processes.length === 0 || dailyWeights.length === 0) {
    return null;
  }

  const varianceLimit = Math.min(
    SAMPLE_WORK_LOG_TARGET_VARIANCE,
    Math.max(0, baselineQuantity - 1)
  );
  const variance =
    varianceLimit > 0 ? sampleRandomInt(random, -varianceLimit, varianceLimit) : 0;
  const targetQuantity = baselineQuantity + variance;
  const dailyQuantities = sampleAllocateByWeights(
    targetQuantity,
    dailyWeights.map((item) => item.weight)
  );

  return {
    dbId: sampleToPositiveInt(plan?.dbId, 0),
    externalId: String(plan?.id || ''),
    lineId,
    styleId: String(plan?.styleId || ''),
    styleName: String(plan?.label || ''),
    orderNo: String(plan?.orderNo || ''),
    customerName: String(plan?.customer || ''),
    colorId: sampleToPositiveIntOrNull(plan?.colorId),
    colorName: String(plan?.colorName || ''),
    baselineQuantity,
    targetQuantity,
    totalPerPieceSeconds: sampleSumBy(processes, (process) => process.ctSeconds),
    processes,
    dailyRows: dailyWeights
      .map((weight, index) => ({
        dateKey: weight.dateKey,
        weight: weight.weight,
        quantity: dailyQuantities[index] ?? 0,
      }))
      .filter((row) => row.quantity > 0),
  };
}

function sampleAllocateWorkerCounts(tasks, workerCount) {
  if (tasks.length === 0 || workerCount <= 0) {
    return Array.from({ length: tasks.length }, () => 0);
  }

  const counts = Array.from({ length: tasks.length }, () => 0);
  let remaining = workerCount;

  if (tasks.length <= workerCount) {
    for (let index = 0; index < tasks.length; index += 1) {
      counts[index] = 1;
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let index = 0; index < tasks.length; index += 1) {
      if (counts[index] >= tasks[index].quantity) continue;
      const score = tasks[index].totalSeconds / (counts[index] + 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;
    counts[bestIndex] += 1;
    remaining -= 1;
  }

  return counts;
}

function sampleBuildLineDayEntries(plans) {
  const entryMap = new Map();

  plans.forEach((plan, planOrder) => {
    plan.dailyRows.forEach((row) => {
      const key = `${plan.lineId}::${row.dateKey}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, {
          lineId: plan.lineId,
          dateKey: row.dateKey,
          items: [],
        });
      }

      entryMap.get(key).items.push({
        plan,
        quantity: row.quantity,
        planOrder,
      });
    });
  });

  return Array.from(entryMap.values()).sort(
    (left, right) =>
      left.lineId - right.lineId || left.dateKey.localeCompare(right.dateKey)
  );
}

function sampleSummarizeProgress(rows, planByExternalId) {
  return rows
    .map((row) => {
      const plan = planByExternalId.get(String(row.id || ''));
      return {
        dbId: row.dbId,
        orderNo: row.orderNo,
        label: row.label,
        colorName: plan?.colorName ?? '',
        plannedQuantity: row.plannedQuantity,
        producedQuantity: row.producedQuantity,
        diff:
          Number.isFinite(row.producedQuantity) && Number.isFinite(plan?.baselineQuantity)
            ? row.producedQuantity - plan.baselineQuantity
            : null,
      };
    })
    .sort((left, right) => left.dbId - right.dbId);
}

async function runSampleWorkLogs() {
  const random = sampleCreateRng(SAMPLE_WORK_LOG_SEED);
  const factoryIdFromEnv = sampleToPositiveIntOrNull(process.env.FACTORY_ID);
  const factories = await sampleApiRequest(
    `/factories${sampleBuildQuery({ orgId: SAMPLE_WORK_LOG_ORG_ID })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
      orgId: SAMPLE_WORK_LOG_ORG_ID,
    }
  );
  const preferredFactoryName = String(SAMPLE_FACTORY_NAME || '').trim();
  const factory =
    (Array.isArray(factories) ? factories : []).find(
      (item) => Number(item?.id) === Number(factoryIdFromEnv)
    ) ||
    (Array.isArray(factories) ? factories : []).find(
      (item) => String(item?.name || '').trim() === preferredFactoryName
    ) ||
    (Array.isArray(factories) ? factories[0] : null);
  sampleAssert(factory, `factory not found for org ${SAMPLE_WORK_LOG_ORG_ID}`);

  const [rawPlans, existingLogs] = await Promise.all([
    sampleApiRequest(
      `/assignment-plans${sampleBuildQuery({
        orgId: SAMPLE_WORK_LOG_ORG_ID,
        factoryId: factory.id,
      })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
        orgId: SAMPLE_WORK_LOG_ORG_ID,
      }
    ),
    sampleApiRequest(
      `/work-logs${sampleBuildQuery({
        orgId: SAMPLE_WORK_LOG_ORG_ID,
        factoryId: factory.id,
      })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
        orgId: SAMPLE_WORK_LOG_ORG_ID,
      }
    ),
  ]);

  const plans = (Array.isArray(rawPlans) ? rawPlans : [])
    .filter((plan) => Number(plan?.contractedSeconds) > 0)
    .map((plan) => sampleNormalizePlan(plan, random))
    .filter(Boolean);

  sampleAssert(plans.length > 0, 'no agreed assignment plans found');

  const existingKeys = new Set(
    (Array.isArray(existingLogs) ? existingLogs : []).map(
      (log) => `${log.lineId ?? '?'}::${log.workDate ?? ''}`
    )
  );

  const workerCache = new Map();
  const getWorkersForLineDate = async (lineId, dateKey) => {
    const cacheKey = `${lineId}::${dateKey}`;
    if (!workerCache.has(cacheKey)) {
      workerCache.set(
        cacheKey,
        sampleApiRequest(
          `/line-workers${sampleBuildQuery({
            orgId: SAMPLE_WORK_LOG_ORG_ID,
            factoryId: factory.id,
            lineId,
            workDate: dateKey,
          })}`,
          {
            userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
            orgId: SAMPLE_WORK_LOG_ORG_ID,
          }
        )
      );
    }
    const rows = await workerCache.get(cacheKey);
    return Array.isArray(rows) ? rows.slice().sort((left, right) => left.id - right.id) : [];
  };

  const entries = sampleBuildLineDayEntries(plans);
  const planByExternalId = new Map(plans.map((plan) => [plan.externalId, plan]));

  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    const logKey = `${entry.lineId}::${entry.dateKey}`;
    if (existingKeys.has(logKey)) {
      skippedCount += 1;
      continue;
    }

    const workers = await getWorkersForLineDate(entry.lineId, entry.dateKey);
    sampleAssert(workers.length > 0, `no line workers for line ${entry.lineId} on ${entry.dateKey}`);

    const tasks = entry.items
      .sort((left, right) => left.planOrder - right.planOrder || left.plan.dbId - right.plan.dbId)
      .flatMap((item) =>
        item.plan.processes.map((process) => ({
          plan: item.plan,
          quantity: item.quantity,
          totalSeconds: item.quantity * process.ctSeconds,
          processCode: process.processCode,
          processName: process.processName,
          ctSeconds: process.ctSeconds,
        }))
      );

    const workerCounts = sampleAllocateWorkerCounts(tasks, workers.length);
    const records = [];
    let workerCursor = 0;

    tasks.forEach((task, taskIndex) => {
      const assignedWorkerCount = workerCounts[taskIndex] ?? 0;
      if (assignedWorkerCount <= 0) return;

      const assignedWorkers = workers.slice(workerCursor, workerCursor + assignedWorkerCount);
      workerCursor += assignedWorkers.length;
      if (assignedWorkers.length === 0) return;

      const splitQuantities = sampleSplitQuantity(task.quantity, assignedWorkers.length, random);
      assignedWorkers.forEach((worker, workerIndex) => {
        records.push({
          workerId: worker.id,
          workerName: worker.name,
          customerName: task.plan.customerName,
          styleId: task.plan.styleId,
          styleName: task.plan.styleName,
          processCode: task.processCode,
          processName: task.processName,
          colorId: task.plan.colorId,
          colorName: task.plan.colorName,
          ctSeconds: task.ctSeconds,
          quantity: splitQuantities[workerIndex],
          assignmentPlanId: task.plan.dbId,
        });
      });
    });

    sampleAssert(
      workerCursor === workers.length,
      `worker allocation mismatch for line ${entry.lineId} on ${entry.dateKey}: ${workerCursor}/${workers.length}`
    );

    const totalContractedSeconds = sampleSumBy(
      records,
      (record) => record.ctSeconds * record.quantity
    );
    const body = {
      workDate: entry.dateKey,
      factoryId: factory.id,
      factoryName: factory.name,
      factoryWagePerSecond: sampleToFiniteNumber(factory.wagePerSecond, null),
      lineId: entry.lineId,
      ctBasis: 'CT',
      workerCount: workers.length,
      itemCount: records.length,
      totalContractedSeconds,
      records,
      note: `${SAMPLE_WORK_LOG_NOTE_PREFIX} seed=${SAMPLE_WORK_LOG_SEED}`,
    };

    if (SAMPLE_WORK_LOG_DRY_RUN) {
      skippedCount += 1;
      continue;
    }

    await sampleApiRequest(`/work-logs${sampleBuildQuery({ orgId: SAMPLE_WORK_LOG_ORG_ID })}`, {
      method: 'POST',
      userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
      orgId: SAMPLE_WORK_LOG_ORG_ID,
      body,
    });

    existingKeys.add(logKey);
    createdCount += 1;
  }

  const ids = plans.map((plan) => plan.externalId).filter(Boolean).join(',');
  const progressRows = SAMPLE_WORK_LOG_DRY_RUN
    ? []
    : await sampleApiRequest(
        `/assignment-plan-progress${sampleBuildQuery({
          orgId: SAMPLE_WORK_LOG_ORG_ID,
          ids,
        })}`,
        {
          userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
          orgId: SAMPLE_WORK_LOG_ORG_ID,
        }
      );
  const summary = sampleSummarizeProgress(
    Array.isArray(progressRows) ? progressRows : [],
    planByExternalId
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: SAMPLE_WORK_LOG_DRY_RUN,
        factory: { id: factory.id, name: factory.name },
        summary: {
          planCount: plans.length,
          lineDayCount: entries.length,
          createdCount,
          skippedCount,
        },
        verification: summary,
      },
      null,
      2
    )
  );
}

async function runBaselineReset() {
  const summary = {};

  await prisma.systemUser.upsert({
    where: { email: 'system-admin@test.local' },
    update: { systemRole: 'SYSTEM_ADMIN' },
    create: { email: 'system-admin@test.local', systemRole: 'SYSTEM_ADMIN' },
  });

  const manufacturer = await upsertOrganization({
    code: 'TSMF',
    name: 'TSMF',
    type: 'MANUFACTURER',
    representative: 'Manager',
    industry: 'Garment Manufacturing',
    address: 'Sample Factory Address',
    email: 'manufacturer-admin@test.local',
  });
  const brand = await upsertOrganization({
    code: 'TSBR',
    name: 'TSBR',
    type: 'BRAND',
    representative: 'Brand Manager',
    industry: 'Fashion Brand',
    address: 'Sample Brand Address',
    email: 'brand-admin@test.local',
  });

  await ensureSubscription(manufacturer.id, 'manufacturer-admin@test.local');
  await ensureSubscription(brand.id, 'brand-admin@test.local');

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
      customerCode: 'TSBR',
    },
  });

  const assignmentSnapshot = await captureAssignmentBoardSnapshot(manufacturer.id);

  await syncGlobalColors();
  await syncManufacturerAttributes(manufacturer.id);
  const sampleCleanup = await cleanupSampleFactoryData(manufacturer.id);
  const legacyStyleCleanup = await cleanupLegacyBaselineStyles(manufacturer.id);
  const sewingRole = await prisma.attrRole.findUnique({
    where: { orgId_code: { orgId: manufacturer.id, code: 'WORKER_SEWING' } },
  });
  const factory = await ensureFactory(manufacturer.id);
  const lineRows = [];
  for (const lineConfig of LINE_CONFIGS) {
    lineRows.push({
      config: lineConfig,
      line: await ensureLine(manufacturer.id, factory.id, lineConfig.lineName),
    });
  }

  for (const membership of STAFF_MEMBERSHIPS) {
    const createdMembership = await ensureMembership(manufacturer.id, membership);
    await ensureEmployee({
      orgId: manufacturer.id,
      orgMembershipId: createdMembership.id,
      factoryId: null,
      roleId: null,
      payType: membership.payType,
      name: membership.name,
      lineName: null,
      position: membership.position ?? membership.role,
      bankName: membership.bankName,
      bankAccountNumber: membership.bankAccountNumber,
    });
  }

  for (const membership of BRAND_MEMBERSHIPS) {
    const createdMembership = await ensureMembership(brand.id, membership);
    await ensureEmployee({
      orgId: brand.id,
      orgMembershipId: createdMembership.id,
      factoryId: null,
      roleId: null,
      payType: membership.payType,
      name: membership.name,
      lineName: null,
      position: membership.position ?? membership.role,
      bankName: membership.bankName,
      bankAccountNumber: membership.bankAccountNumber,
    });
  }

  const workerEmployeeIdsByLine = new Map();
  for (const { config } of lineRows) {
    workerEmployeeIdsByLine.set(config.key, []);
    for (let index = 1; index <= SAMPLE_WORKER_COUNT; index += 1) {
      const email = toWorkerEmail(config.workerPrefix, index);
      const membership = await ensureMembership(manufacturer.id, {
        email,
        role: 'WORKER',
      });
      const employee = await ensureEmployee({
        orgId: manufacturer.id,
        orgMembershipId: membership.id,
        factoryId: factory.id,
        roleId: sewingRole ? sewingRole.id : null,
        payType: 'CT',
        name: toWorkerName(config.workerLabel, index),
        lineName: config.lineName,
        position: index === 1 ? 'LINE_LEADER' : 'WORKER',
      });
      workerEmployeeIdsByLine.get(config.key).push(employee.id);
    }
  }

  const baselineWorkerIds = Array.from(workerEmployeeIdsByLine.values()).flat();
  await prisma.lineAssignment.deleteMany({
    where: { employeeId: { in: baselineWorkerIds } },
  });

  for (const { config, line } of lineRows) {
    const workerIds = workerEmployeeIdsByLine.get(config.key) || [];
    if (workerIds.length === 0) continue;

    await prisma.line.update({
      where: { id: line.id },
      data: { managerEmployeeId: workerIds[0], isActive: true },
    });

    await prisma.lineAssignment.createMany({
      data: workerIds.map((employeeId) => ({
        lineId: line.id,
        employeeId,
      })),
    });
  }

  await ensureStyles(manufacturer.id);
  const cleanup = await clearOrderAndAssignmentData();
  let sampleOrderSeed = null;
  let assignmentRestore = {
    capturedAssignmentCount: Array.isArray(assignmentSnapshot?.assignments)
      ? assignmentSnapshot.assignments.length
      : 0,
    sourceUpdatedAt: assignmentSnapshot?.updatedAt ?? null,
    attempted: false,
    restoredAssignmentCount: 0,
  };

  if (assignmentRestore.capturedAssignmentCount > 0) {
    try {
      sampleOrderSeed = await runSampleOrders({ silent: true });
      assignmentRestore = {
        ...assignmentRestore,
        ...(await sampleRestoreAssignmentSnapshot({
          manufacturerId: manufacturer.id,
          assignments: assignmentSnapshot.assignments,
          targetLineId: lineRows[0]?.line?.id ?? null,
        })),
      };
    } catch (error) {
      assignmentRestore = {
        ...assignmentRestore,
        attempted: false,
        reason: 'restore-through-api-failed',
        error: error?.message || 'failed to restore assignment snapshot through api',
      };

      assignmentRestore = {
        ...assignmentRestore,
        ...(await restoreAssignmentSnapshotWithPrisma({
          manufacturerId: manufacturer.id,
          assignments: assignmentSnapshot.assignments,
          boardCards: assignmentSnapshot.boardCards,
          cards: assignmentSnapshot.cards,
          targetLineId: lineRows[0]?.line?.id ?? null,
        })),
      };
    }
  }

  summary.organizations = [manufacturer.code, brand.code].join(', ');
  summary.globalColors = BASELINE_COLORS.length;
  summary.processes = BASELINE_PROCESSES.length;
  summary.roles = BASELINE_ROLES.length;
  summary.styles = BASELINE_STYLES.length;
  summary.workers = baselineWorkerIds.length;
  summary.sampleFactoryCleanup = sampleCleanup;
  summary.legacyStyleCleanup = legacyStyleCleanup;
  summary.cleanup = cleanup;
  summary.sampleOrderSeed = sampleOrderSeed
    ? {
        orderNumber: sampleOrderSeed?.order?.orderNumber ?? null,
        cardCount: sampleOrderSeed?.summary?.cardCount ?? 0,
      }
    : null;
  summary.assignmentSnapshotRestore = assignmentRestore;

  console.log('Baseline reset completed.');
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const command = String(process.argv[2] || 'baseline').trim().toLowerCase();

  if (command === 'baseline' || command === 'reset') {
    await runBaselineReset();
    return;
  }

  if (command === 'orders') {
    await runSampleOrders();
    return;
  }

  if (command === 'work-logs') {
    await runSampleWorkLogs();
    return;
  }

  if (command === 'sample-all') {
    await runSampleOrders();
    await runSampleWorkLogs();
    return;
  }

  throw new Error(
    `unknown command "${command}". expected one of: baseline, orders, work-logs, sample-all`
  );
}

main()
  .catch((error) => {
    console.error('Baseline reset failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

