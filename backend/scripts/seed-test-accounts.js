#!/usr/bin/env node
"use strict";

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const MANUFACTURER = {
  code: "TSMF",
  name: "테스트 수주자",
  type: "MANUFACTURER",
};

const BRAND = {
  code: "TSBR",
  name: "테스트 발주자",
  type: "BRAND",
};

const TEST_MEMBERSHIPS = [
  { orgCode: "TSMF", email: "manufacturer-admin@test.local", role: "ADMIN" },
  { orgCode: "TSMF", email: "manufacturer-operator@test.local", role: "OPERATOR" },
  { orgCode: "TSMF", email: "manufacturer-accountant@test.local", role: "ACCOUNTANT" },
  { orgCode: "TSMF", email: "manufacturer-worker@test.local", role: "WORKER" },
  { orgCode: "TSBR", email: "brand-admin@test.local", role: "ADMIN" },
  { orgCode: "TSBR", email: "brand-operator@test.local", role: "OPERATOR" },
  { orgCode: "TSBR", email: "brand-accountant@test.local", role: "ACCOUNTANT" },
];

const EMPLOYEE_NAME_BY_EMAIL = {
  "manufacturer-admin@test.local": "테스트 관리자",
  "manufacturer-operator@test.local": "테스트 운영자",
  "manufacturer-accountant@test.local": "테스트 회계담당",
  "manufacturer-worker@test.local": "테스트 작업자 01",
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

async function upsertOrganization(input) {
  return prisma.organization.upsert({
    where: { code: input.code },
    update: {
      name: input.name,
      type: input.type,
    },
    create: {
      name: input.name,
      code: input.code,
      type: input.type,
    },
  });
}

async function ensureManufacturerDefaults(manufacturerOrgId) {
  const existingFactory = await prisma.factory.findFirst({
    where: {
      orgId: manufacturerOrgId,
      name: "샘플 공장",
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
          name: "샘플 공장",
          targetMonthlyWage: 8000000,
          wagePerSecond: 10.68,
        },
      });

  const line1 = await prisma.line.upsert({
    where: {
      factoryId_name: {
        factoryId: factory.id,
        name: "샘플 라인 1",
      },
    },
    update: {},
    create: {
      orgId: manufacturerOrgId,
      factoryId: factory.id,
      name: "샘플 라인 1",
    },
  });

  await prisma.line.upsert({
    where: {
      factoryId_name: {
        factoryId: factory.id,
        name: "샘플 라인 2",
      },
    },
    update: {},
    create: {
      orgId: manufacturerOrgId,
      factoryId: factory.id,
      name: "샘플 라인 2",
    },
  });

  return { factory, line1 };
}

async function main() {
  const manufacturer = await upsertOrganization(MANUFACTURER);
  const brand = await upsertOrganization(BRAND);
  const orgByCode = {
    TSMF: manufacturer,
    TSBR: brand,
  };

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
      customerCode: "TSBR",
    },
  });

  const { factory, line1 } = await ensureManufacturerDefaults(manufacturer.id);

  let upsertedMemberships = 0;
  let upsertedEmployees = 0;
  let workerEmployeeId = null;

  for (const item of TEST_MEMBERSHIPS) {
    const org = orgByCode[item.orgCode];
    const email = normalizeEmail(item.email);
    const now = new Date();

    const membership = await prisma.orgMembership.upsert({
      where: {
        orgId_email: {
          orgId: org.id,
          email,
        },
      },
      update: {
        role: item.role,
        status: "ACTIVE",
        approvedAt: now,
      },
      create: {
        orgId: org.id,
        email,
        role: item.role,
        status: "ACTIVE",
        approvedAt: now,
      },
    });
    upsertedMemberships += 1;

    if (item.orgCode !== "TSMF") continue;

    const employeeName = EMPLOYEE_NAME_BY_EMAIL[email] || null;
    const isWorker = item.role === "WORKER";

    const employee = await prisma.employee.upsert({
      where: { orgMembershipId: membership.id },
      update: {
        orgId: manufacturer.id,
        factoryId: factory.id,
        name: employeeName,
      },
      create: {
        orgId: manufacturer.id,
        orgMembershipId: membership.id,
        factoryId: factory.id,
        name: employeeName,
      },
    });
    upsertedEmployees += 1;

    if (isWorker) {
      workerEmployeeId = employee.id;
    }
  }

  if (workerEmployeeId) {
    await prisma.line.update({
      where: { id: line1.id },
      data: { managerEmployeeId: workerEmployeeId },
    });
  }

  await prisma.systemUser.upsert({
    where: { email: "system-admin@test.local" },
    update: { systemRole: "SYSTEM_ADMIN" },
    create: { email: "system-admin@test.local", systemRole: "SYSTEM_ADMIN" },
  });

  const activeTestMembershipCount = await prisma.orgMembership.count({
    where: {
      status: "ACTIVE",
      email: { endsWith: "@test.local" },
    },
  });

  console.log("[seed:test-accounts] done");
  console.log(
    JSON.stringify(
      {
        organizations: [manufacturer.code, brand.code],
        upsertedMemberships,
        upsertedEmployees,
        activeTestMembershipCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[seed:test-accounts] failed", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
