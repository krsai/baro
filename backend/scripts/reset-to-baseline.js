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
const BASELINE_CUSTOMER_NAME = 'TSBR';

const buildStyleProcesses = (ptValues) =>
  ptValues.map((pt, index) => ({
    code: `P${String(index + 1).padStart(2, '0')}`,
    name: `Test Process ${String(index + 1).padStart(2, '0')}`,
    pt,
    at: null,
    atParams: null,
    ct: pt,
    stManual: true,
    timeRefQuantity: 100,
    processQuantity: 1,
  }));

const BASELINE_STYLES = [
  {
    styleId: 'S-2025SS-T001',
    styleCode: '25SS-T001',
    name: 'Daily Round T-Shirt',
    customer: BASELINE_CUSTOMER_NAME,
    registrationDate: '2026-03-10',
    designer: 'BARO Design Team',
    collection: 'Basic Line',
    season: '2025SS',
    imageUrls: [],
    processes: buildStyleProcesses([500, 450, 450, 400, 400, 450, 450, 400]),
    bom: [],
    bomNotes: '',
  },
  {
    styleId: 'S-2025SS-P002',
    styleCode: '25SS-P002',
    name: 'Slim Collar Hero Polo',
    customer: BASELINE_CUSTOMER_NAME,
    registrationDate: '2026-03-10',
    designer: 'BARO Design Team',
    collection: 'Sport Casual',
    season: '2025SS',
    imageUrls: [],
    processes: buildStyleProcesses([550, 500, 500, 500, 450, 500, 450, 450, 500]),
    bom: [],
    bomNotes: '',
  },
  {
    styleId: 'S-2025FW-J003',
    styleCode: '25FW-J003',
    name: 'Urban Corduroy Pants',
    customer: BASELINE_CUSTOMER_NAME,
    registrationDate: '2026-03-10',
    designer: 'BARO Design Team',
    collection: 'Urban Premium',
    season: '2025FW',
    imageUrls: [],
    processes: buildStyleProcesses([700, 650, 650, 600, 600, 600, 600, 550, 550, 500]),
    bom: [],
    bomNotes: '',
  },
];

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
  { key: 'line1', lineName: 'Sample Line 1', workerPrefix: 'line1-worker', workerLabel: 'Line1 Worker' },
  { key: 'line2', lineName: 'Sample Line 2', workerPrefix: 'line2-worker', workerLabel: 'Line2 Worker' },
];

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
    where: { orgId, name: 'Sample Factory' },
    orderBy: { id: 'asc' },
  });
  if (existing) {
    return prisma.factory.update({
      where: { id: existing.id },
      data: {
        address: 'Sample Factory Address',
        countryCode: 'VN',
        phoneNumber: '010-0000-0000',
        manager: 'Manager',
        targetMonthlyWage: TARGET_MONTHLY_WAGE,
        wagePerSecond: WAGE_PER_SECOND,
      },
    });
  }
  return prisma.factory.create({
    data: {
      orgId,
      name: 'Sample Factory',
      address: 'Sample Factory Address',
      countryCode: 'VN',
      phoneNumber: '010-0000-0000',
      manager: 'Manager',
      targetMonthlyWage: TARGET_MONTHLY_WAGE,
      wagePerSecond: WAGE_PER_SECOND,
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

async function main() {
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

  await syncGlobalColors();
  await syncManufacturerAttributes(manufacturer.id);

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
      factoryId: factory.id,
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
    for (let index = 1; index <= 20; index += 1) {
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

  summary.organizations = [manufacturer.code, brand.code].join(', ');
  summary.globalColors = BASELINE_COLORS.length;
  summary.processes = BASELINE_PROCESSES.length;
  summary.roles = BASELINE_ROLES.length;
  summary.styles = BASELINE_STYLES.length;
  summary.workers = baselineWorkerIds.length;
  summary.cleanup = cleanup;

  console.log('Baseline reset completed.');
  console.log(JSON.stringify(summary, null, 2));
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

